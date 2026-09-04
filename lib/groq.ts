import { env } from 'cloudflare:workers';
import { retrieveWorkspace } from './database';
import type { VisualLesson } from './visual-schema';

let currentKeyIndex = 0;

function groqKeys() {
  const bindings = env as any;
  const keyStr = bindings.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!keyStr) throw new Error('GROQ_API_KEY is not configured in the .env file.');

  const keys = keyStr.split(',').map((k: string) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error('No valid GROQ_API_KEY found.');

  return keys;
}

async function groqRequest(body: Record<string, unknown>) {
  const keys = groqKeys();
  let lastError: Error | null = null;
  const targetModels = Array.isArray(body.models)
    ? body.models
    : [String(body.model || 'openai/gpt-oss-120b'), 'qwen/qwen3.6-27b'];

  for (const model of targetModels) {
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[currentKeyIndex];

      const endpoint = `https://api.groq.com/openai/v1/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          ...body,
          model: model,
          models: undefined // Groq doesn't accept array
        }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok) {
        return data;
      }

      const message = (data.error as { message?: string } | undefined)?.message || `Groq request failed (${response.status}).`;

      if (response.status === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('limit')) {
        console.warn(`Key #${currentKeyIndex + 1} exhausted for ${model}. Shifting to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        lastError = new Error(message);
        continue;
      }

      if (response.status === 503 || response.status === 404 || message.toLowerCase().includes('demand') || message.toLowerCase().includes('available')) {
        console.warn(`${model} is overloaded or missing. Rotating API key as fallback...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        lastError = new Error(message);
        continue;
      }

      throw new Error(message);
    }
  }

  throw new Error(`All models and API keys exhausted. Last error: ${lastError?.message}`);
}

export async function generateVisualLesson(workspaceId: string, question: string, analysisMode: 'default' | 'failure' | 'blast_radius' = 'default'): Promise<VisualLesson> {
  let targetLabel = '';

  if (analysisMode === 'blast_radius') {
    const match = question.match(/Calculate blast radius for: (.*?) \(/);
    if (match) targetLabel = match[1];
  }

  const { workspace, chunks, fileTree } = await retrieveWorkspace(workspaceId, question, analysisMode === 'blast_radius', targetLabel);

  const [owner, repo] = workspace.brief.match(/GitHub Repository: ([^\n]+)/)?.[1]?.split('/') || [];
  const defaultBranch = workspace.brief.match(/Branch: ([^\n]+)/)?.[1] || 'main';

  const plannerPrompt = `You are a codebase discovery agent. The user is asking a question about a GitHub repository.
REPOSITORY: ${owner}/${repo}
QUESTION: ${question}

Here is the file tree of the repository (truncated if large):
${(fileTree || []).slice(0, 300).join('\n')}

Analyze the file tree and identify the absolute most critical 3 to 5 files needed to answer the question accurately based on their paths/names.
Return ONLY JSON in this format exactly:
{ "files": ["path/to/file1.ts", "path/to/file2.ts"] }
Do NOT include any extra text.`;

  let filesToFetch: string[] = [];
  try {
    const plannerData = await groqRequest({
      models: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'],
      messages: [{ role: 'user', content: plannerPrompt }],
      temperature: 0.1,
      max_completion_tokens: 1500,
      response_format: { type: 'json_object' },
    });
    let plannerContent = (plannerData.choices as any)?.[0]?.message?.content || '{}';
    plannerContent = typeof plannerContent === 'string' ? plannerContent.replace(/```json/g, '').replace(/```/g, '').trim() : plannerContent;
    const parsedPlanner = JSON.parse(plannerContent);
    const availableFiles = new Set(fileTree || []);
    filesToFetch = Array.isArray(parsedPlanner.files)
      ? parsedPlanner.files
        .filter((file: unknown): file is string => typeof file === 'string' && availableFiles.has(file))
        .slice(0, 5)
      : [];
  } catch (e) {
    console.warn('Planner step failed', e);
  }

  const liveChunks: string[] = [];
  const headers: Record<string, string> = { 'User-Agent': 'Anima-Parser' };
  const token = (env as any).GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  await Promise.all(filesToFetch.map(async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file}`;
    try {
      const res = await fetch(rawUrl, { headers });
      if (res.ok) {
        const text = await res.text();
        // Massively restricted to 2000 chars for Groq Context Limits!
        liveChunks.push(`[File: ${file}]\n${text.slice(0, 2000)}`);
      }
    } catch (e) { }
  }));

  const evidence = liveChunks.join('\n\n') || 'No matching source contents were available. Use the repository file tree and clearly state any uncertainty.';
  const basePrompt = `You are a strict, hyper-literal codebase architect AI. Your ONLY job is to map and explain the exact code chunks provided to you.
CRITICAL GROUNDING DIRECTIVES:
1. DO NOT HALLUCINATE. Do not assume, invent, or describe any component, feature, or database that is not explicitly visible in the provided code chunks.
2. If the user's request involves something that isn't in the chunks, explicitly state in your explanation that the provided snippets lack that context.
3. For flowcharts and diagrams, your nodes MUST represent literal, mechanical reality (e.g. exact file paths, exact class names, exact function calls). Do not create vague or abstract conceptual nodes.

REPOSITORY: ${workspace.topic}
USER REQUEST: ${question}`;

  const failurePrompt = `DIRECTIVE: The user requested a System Vulnerability and Failure Analysis. You must analyze the chunks for single points of failure, unhandled exception paths, database bottlenecks. Flowchart nodes must show highest failure probability. IF A COMPONENT IS A HIGH-RISK FAILURE POINT, USE THE "danger" category.`;
  const blastRadiusPrompt = `CRITICAL DIRECTIVE: The user has activated BLAST RADIUS IMPACT ANALYSIS. The user's question specifies a single target component/file. You must aggressively scan the codebase chunks to find EVERYTHING that imports, calls, or relies downstream on that EXACT target component. Provide standard flowchart with affected downstream components radiating outwards ("danger" category).`;

  const finalPrompt = analysisMode === 'failure' ? `${basePrompt}\n\n${failurePrompt}` : (analysisMode === 'blast_radius' ? `${basePrompt}\n\n${blastRadiusPrompt}` : basePrompt);

  const prompt = `${finalPrompt}

RETRIEVED CODE & DOCS:
${evidence}

Return ONLY valid JSON matching this schema exactly:
{
  "title": "Short descriptive title of the subsystem",
  "subtitle": "Subtitle",
  "sourceSummary": "Brief sentence explaining what this shows based on the repo",
  "type": "text | flowchart | diagram",
  "textualContent": "If type is text, put a highly detailed Markdown explanation here. Do NOT hallucinate things outside the chunks.",
  "nodes": [
    {
      "id": "node-1",
      "label": "Short name (e.g. function or file)",
      "labelArchitecture": "High tier concept string (e.g. Database, Auth Pipeline, AI Parser)",
      "labelFile": "Literal file path string (e.g. src/auth/db.ts)",
      "labelAnatomy": "Direct function/class string (e.g. validateJWT() or class Auth)",
      "detail": "Deep explanation of the mechanical logic in this node. ONLY based on the code provided.",
      "architectureDetail": "Broad contextual explanation of what this component fundamentally achieves for the repository structurally.",
      "anatomyDetail": "A detailed markdown list isolating explicitly every function, class, or API signature present in this file indicating precisely what it governs.",
      "category": "database | api | frontend | utility | core | danger",
      "type": "default",
      "filePath": "Exact file path (e.g. src/app.py) where this logic lives, if applicable",
      "codeSnippet": "Required: Max 20 lines of verbatim raw code from the provided chunks representing the core logic."
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "label": "calls", 
      "animated": true 
    }
  ]
}

Ensure the graph forms a cohesive structure answering the user request. Keep "label" short (1-3 words) and "detail" deeply descriptive. NO HALLUCINATION. IF THE CODE DOESN'T PROVE IT, DO NOT INVENT IT.
`;

  try {
    const data = await groqRequest({
      models: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'],
      messages: [
        { role: 'system', content: 'Return a JSON object matching the requested schema. You are intelligent: if the user\'s query is best answered by a flowchart (to show architecture), set "type": "flowchart". If it is best answered by dense code-explanation paragraphs, set "type": "text". Never include markdown fences outside the JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 8000,
      response_format: { type: 'json_object' },
    });

    let content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || '';
    content = typeof content === 'string' ? content.replace(/```json/g, '').replace(/```/g, '').trim() : content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    return {
      title: parsed.title || 'Architecture Breakdown',
      subtitle: parsed.subtitle || workspace.topic,
      sourceSummary: parsed.sourceSummary || 'Generated from repository structure.',
      type: parsed.type === 'text' || parsed.type === 'diagram' ? parsed.type : 'flowchart',
      textualContent: parsed.textualContent || '',
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes.map((n: any) => ({
        id: String(n.id || crypto.randomUUID()),
        label: String(n.label || 'Node'),
        labelArchitecture: n.labelArchitecture ? String(n.labelArchitecture) : undefined,
        labelFile: n.labelFile ? String(n.labelFile) : undefined,
        labelAnatomy: n.labelAnatomy ? String(n.labelAnatomy) : undefined,
        detail: String(n.detail || ''),
        architectureDetail: n.architectureDetail ? String(n.architectureDetail) : undefined,
        anatomyDetail: n.anatomyDetail ? String(n.anatomyDetail) : undefined,
        category: n.category || 'core',
        type: n.type === 'input' || n.type === 'output' ? n.type : 'default',
        filePath: n.filePath ? String(n.filePath) : undefined,
        codeSnippet: n.codeSnippet ? String(n.codeSnippet) : undefined
      })) : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges.map((e: any) => ({
        id: String(e.id || crypto.randomUUID()),
        source: String(e.source || ''),
        target: String(e.target || ''),
        label: e.label ? String(e.label) : undefined,
        animated: Boolean(e.animated)
      })) : []
    };
  } catch (error) {
    console.error('Explanation generation failed', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to generate explanation from the repository data. Ensure GROQ_API_KEY is correct.');
  }
}
