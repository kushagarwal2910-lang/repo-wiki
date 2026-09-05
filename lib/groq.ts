import { env } from 'cloudflare:workers';
import { retrieveWorkspace } from './database';
import type { VisualLesson } from './visual-schema';

let currentKeyIndex = 0;

function openRouterKeys() {
  const bindings = env as any;
  const keyStr = bindings.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!keyStr) throw new Error('OPENROUTER_API_KEY is not configured in the .env file.');

  const keys = keyStr.split(',').map((k: string) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error('No valid OPENROUTER_API_KEY found.');

  return keys;
}

async function llmRequest(body: Record<string, unknown>) {
  const keys = openRouterKeys();
  let lastError: Error | null = null;
  const targetModels = Array.isArray(body.models)
    ? body.models
    : [String(body.model || 'nvidia/nemotron-3-ultra-550b-a55b:free')];

  for (const model of targetModels) {
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[currentKeyIndex];

      const endpoint = `https://openrouter.ai/api/v1/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Anima Parser'
        },
        body: JSON.stringify({
          ...body,
          model: model,
          models: undefined
        }),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok) {
        return data;
      }

      const message = (data.error as { message?: string } | undefined)?.message || `OpenRouter request failed (${response.status}).`;

      if (response.status === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('limit')) {
        console.warn(`Key #${currentKeyIndex + 1} exhausted for ${model}. Shifting to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        lastError = new Error(message);
        continue;
      }

      if (response.status === 503 || response.status === 404 || message.toLowerCase().includes('demand') || message.toLowerCase().includes('available')) {
        console.warn(`${model} is overloaded or missing. Rotating API key...`);
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

  const plannerPrompt = `You are an elite codebase discovery agent. The user is asking a question about a GitHub repository.
REPOSITORY: ${owner}/${repo}
QUESTION: ${question}

Here is the file tree of the repository:
${(fileTree || []).slice(0, 300).join('\n')}

INSTRUCTIONS:
1. Understand the user's natural query deeply. What specific feature, module, or mechanism are they asking about?
2. Scan the file tree. Identify the absolute most critical 10 files that contain the actual logic to answer their query.
3. Be incredibly smart. Do NOT be foolish and miss obvious files (e.g. if they ask for backend logic, grab the backend router).
4. Do NOT hallucinate files. Only select paths that exactly exist in the tree above.

Return ONLY JSON in this format exactly:
{ "files": ["path/to/file1.ts", "path/to/file2.ts"] }
Do NOT include any extra text.`;

  let filesToFetch: string[] = [];
  try {
    const plannerData = await llmRequest({
      models: ['nvidia/nemotron-3-ultra-550b-a55b:free'],
      messages: [{ role: 'user', content: plannerPrompt }],
      temperature: 0.1,
      max_completion_tokens: 1500,
      response_format: { type: 'json_object' }
    });

    let plannerContent = (plannerData.choices as any)?.[0]?.message?.content || '{}';
    if (typeof plannerContent === 'string') {
      plannerContent = plannerContent.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
      const start = plannerContent.indexOf('{');
      const end = plannerContent.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        plannerContent = plannerContent.slice(start, end + 1);
        plannerContent = plannerContent.replace(/,\s*([}\]])/g, '$1');
        plannerContent = plannerContent.replace(/}\s*{/g, '},{');
        plannerContent = plannerContent.trim();
      }
    }
    const parsedPlanner = JSON.parse(plannerContent);

    filesToFetch = Array.isArray(parsedPlanner.files)
      ? parsedPlanner.files
        .map((file: unknown) => {
          if (typeof file !== 'string') return null;
          const target = file.replace(/^\.?\//, '').trim();
          return (fileTree || []).find(f => f.endsWith(target) || f === target) || null;
        })
        .filter((file: string | null): file is string => file !== null)
        .slice(0, 10)
      : [];
    if (filesToFetch.length === 0 && fileTree && fileTree.length > 0) {
      filesToFetch = fileTree.slice(0, 10);
    }
  } catch (e) {
    console.warn('Planner step failed', e);
    // Ultimate Fallback: Never starve the LLM architect of evidence.
    if (fileTree && fileTree.length > 0) {
      filesToFetch = fileTree.slice(0, 10);
    }
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
        liveChunks.push(`[File: ${file}]\n${text.slice(0, 15000)}`);
      }
    } catch (e) { }
  }));

  const evidence = liveChunks.join('\n\n') || 'No matching source contents were available. Use the repository file tree and clearly state any uncertainty.';
  const basePrompt = `You are a strict, hyper-literal codebase analysis AI. Your ONLY job is to map and explain the exact code chunks provided to you.
CRITICAL GROUNDING DIRECTIVES:
1. DO NOT HALLUCINATE. Do not assume, invent, or describe any component, feature, or database that is not explicitly visible in the provided code chunks. Do not create anything of your own.
2. If the user's query asks something that exists in the repo but is missing from these chunks, state exactly what you found and explicitly declare that the specific logic wasn't in the fetched files. NEVER guess the missing logic.
3. For flowcharts, your nodes MUST represent literal, mechanical reality (e.g. exact file paths, class names, function calls).
4. Be brilliantly accurate. Give highly correct, structured explanations answering the user's exact query without fail.
5. STRICT FORMAT RULE: Your required baseline format is always 'text'. You MUST set "type": "text" and output ZERO nodes UNLESS the user's query clearly implies a desire for a visual representation, such as a flowchart, diagram, architecture map, visual graph, or structural flow. If they just ask "explain X" or "how does Y work", default to 'text'. Only orchestrate a "flowchart" if they ask to "map", "draw", "visualize", "diagram", or ask for systemic "architecture" or similar semantic visual mapping intents.

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
  "textualContent": "REQUIRED. You MUST provide a beautiful, extensive Markdown explanation here. Use hierarchical headers, bullet points, **bold keywords**, and numbered lists to structure your answer. CRITICAL RULE: If you draw any ASCII diagrams, pipeline mappings, or literal text graphs (like tables made of | and -), you MUST absolutely wrap them perfectly inside a Markdown code block (triple backticks) to preserve spacing. Failure to wrap ASCII art in code blocks will result in severe visual corruption.",
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
    const data = await llmRequest({
      models: ['nvidia/nemotron-3-ultra-550b-a55b:free'],
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON matching the requested schema. CRITICAL DEFAULT: Your default output format is ALWAYS JSON with "type": "text". You must set "type": "text" UNLESS the user\'s query implies a visual representation, such as a flowchart, diagram, architecture map, or structural graphing. For all routine questions ("how does this work", "explain X"), forcefully default to "type": "text", but if they ask to visualize, draw, or map the architecture, switch to "type": "flowchart". Do NOT respond in raw text; ALWAYS output the exact JSON schema requested.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 12000
    });

    let content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || '';
    if (typeof content === 'string') {
      let c = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
      const start = c.indexOf('{');
      const end = c.lastIndexOf('}');
      if (start !== -1 && end !== -1 && start < end) {
        c = c.slice(start, end + 1);
        c = c.replace(/,\s*([}\]])/g, '$1');
        c = c.replace(/}\s*{/g, '},{');
        c = c.trim();
        content = c;
      }
    }

    console.log('====== RAW LLM CONTENT ======');
    console.log(content);
    console.log('=============================');

    let parsed: any;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      console.warn('JSON parsing failed due to truncation natively. Soft-fallback to Text Mode.');
      parsed = { type: 'text', textualContent: content };
    }

    return {
      title: String(parsed.title || 'Architecture Breakdown'),
      subtitle: String(parsed.subtitle || workspace.topic),
      sourceSummary: String(parsed.sourceSummary || 'Generated from repository structure.'),
      type: parsed.type === 'text' || parsed.type === 'diagram' ? parsed.type : 'flowchart',
      textualContent: String(parsed.textualContent || ''),
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
    throw new Error(error instanceof Error ? error.message : 'Failed to generate explanation from the repository data. Ensure OPENROUTER_API_KEY is correct.');
  }
}
