import { env } from 'cloudflare:workers';
import { saveWorkspace } from './database';
import type { ResearchSource, ResearchWorkspace } from './visual-schema';

const SOURCE_EXTENSIONS = new Set([
  'c', 'cpp', 'cs', 'css', 'go', 'html', 'java', 'js', 'jsx', 'json', 'kt', 'md',
  'php', 'prisma', 'py', 'rb', 'rs', 'sh', 'sql', 'swift', 'toml', 'ts', 'tsx',
  'vue', 'yaml', 'yml',
]);
const MAX_INDEXED_FILES = 160;
const MAX_FILE_CHARS = 60_000;
const MAX_TOTAL_SOURCE_CHARS = 4_200_000;
const CHUNK_CHARS = 3_200;
const CHUNK_OVERLAP_LINES = 8;
const MAX_UPLOADS = 8;
const MAX_UPLOAD_CHARS = 2_000_000;
const MAX_TOTAL_UPLOAD_CHARS = 4_000_000;

type GitHubBinding = { GITHUB_TOKEN?: string };
type RepoFile = { path: string; size?: number };

function githubToken() {
  return (env as unknown as GitHubBinding).GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
}

function repositoryCoordinates(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a complete public GitHub repository URL.');
  }
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('Only public github.com repository URLs are supported.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('The GitHub URL must include an owner and repository name.');
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('The GitHub owner or repository name is invalid.');
  return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` };
}

function isSourceFile(file: RepoFile) {
  const lower = file.path.toLowerCase();
  const extension = lower.split('.').pop() || '';
  if (!SOURCE_EXTENSIONS.has(extension)) return false;
  if (file.size && file.size > 350_000) return false;
  return !/(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.git|target|__pycache__)(\/|$)/.test(lower)
    && !/(\.min\.(js|css)$|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|\.map$)/.test(lower);
}

function filePriority(path: string) {
  const lower = path.toLowerCase();
  let score = 0;
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|readme\.md|next\.config|vite\.config|tsconfig)/.test(lower)) score += 120;
  if (/(^|\/)(src|app|server|api|routes|controllers|services|lib|core|db)(\/|$)/.test(lower)) score += 70;
  if (/(index|main|app|server|router|schema|database|config)\.[^.]+$/.test(lower)) score += 45;
  if (/(^|\/)(test|tests|spec|fixtures|examples|docs|migrations)(\/|$)/.test(lower)) score -= 35;
  score -= Math.min(30, path.split('/').length * 2);
  return score;
}

function extractImports(source: string) {
  const imports = new Set<string>();
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /from\s+([\w.]+)\s+import\s+/g,
    /import\s+([\w.]+)/g,
    /#include\s*[<"]([^>"]+)[>"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) imports.add(match[1].slice(0, 180));
      if (imports.size >= 60) return [...imports];
    }
  }
  return [...imports];
}

function extractSymbols(source: string) {
  const symbols = new Set<string>();
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bclass\s+([A-Za-z_$][\w$]*)/g,
    /\binterface\s+([A-Za-z_$][\w$]*)/g,
    /\btype\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
    /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,
    /^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) symbols.add(match[1]);
      if (symbols.size >= 80) return [...symbols];
    }
  }
  return [...symbols];
}

function chunkSource(path: string, source: string) {
  const imports = extractImports(source);
  const symbols = extractSymbols(source);
  const lines = source.split(/\r?\n/);
  const chunks: string[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let length = 0;
    while (end < lines.length && (length + lines[end].length + 1 <= CHUNK_CHARS || end === start)) {
      length += lines[end].length + 1;
      end += 1;
    }
    const header = `__SOURCE_CHUNK__\nPath: ${path}\nLines: ${start + 1}-${end}\nSymbols: ${symbols.join(', ') || 'none detected'}\nImports: ${imports.join(', ') || 'none detected'}\nContent:\n`;
    chunks.push(header + lines.slice(start, end).join('\n'));
    if (end >= lines.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP_LINES);
  }
  return chunks;
}

async function fetchTextFile(owner: string, repo: string, branch: string, path: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodedBranch}/${encodedPath}`;
  const response = await fetch(rawUrl, { headers: { Accept: 'text/plain', 'User-Agent': 'Repo-Wiki-Indexer/3.0' } });
  if (!response.ok) return '';
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/(text|json|javascript|typescript|xml|yaml)/i.test(contentType)) return '';
  return (await response.text()).replaceAll('\0', '').slice(0, MAX_FILE_CHARS);
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function processGitHubRepo(rawUrlInput: string, uploadedFiles: { name: string; content: string }[]): Promise<ResearchWorkspace> {
  const { owner, repo, repoUrl } = repositoryCoordinates(rawUrlInput);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'Repo-Wiki-Indexer/3.0' };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const repoInfoResponse = await fetch(apiUrl, { headers });
  if (!repoInfoResponse.ok) {
    if (repoInfoResponse.status === 404) throw new Error('Repository not found. Confirm that it is public and the URL is correct.');
    if (repoInfoResponse.status === 403 || repoInfoResponse.status === 429) throw new Error('GitHub rate limit reached. Configure GITHUB_TOKEN or try again later.');
    throw new Error(`GitHub repository lookup failed (${repoInfoResponse.status}).`);
  }
  const repoInfo = await repoInfoResponse.json() as { default_branch?: string };
  const defaultBranch = repoInfo.default_branch || 'main';

  const treeResponse = await fetch(`${apiUrl}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error(`Could not read the repository file tree (${treeResponse.status}).`);
  const treeData = await treeResponse.json() as { truncated?: boolean; tree?: Array<{ type?: string; path?: string; size?: number }> };
  const files = (treeData.tree || [])
    .filter((entry): entry is { type: string; path: string; size?: number } => entry.type === 'blob' && typeof entry.path === 'string')
    .map((entry) => ({ path: entry.path, size: entry.size }))
    .filter(isSourceFile);
  if (!files.length) throw new Error('No readable source files were found in this repository.');

  const selectedFiles = [...files]
    .sort((left, right) => filePriority(right.path) - filePriority(left.path) || left.path.localeCompare(right.path))
    .slice(0, MAX_INDEXED_FILES);
  const fetched = await mapConcurrent(selectedFiles, 15, async (file) => ({
    file,
    content: await fetchTextFile(owner, repo, defaultBranch, file.path).catch(() => ''),
  }));

  const sourceIds = new Map<string, string>();
  const sources: Array<ResearchSource & { id: string }> = files.slice(0, 200).map((file) => {
    const id = crypto.randomUUID();
    sourceIds.set(file.path, id);
    return { id, title: file.path, url: `${repoUrl}/blob/${encodeURIComponent(defaultBranch)}/${file.path.split('/').map(encodeURIComponent).join('/')}`, type: 'repo' };
  });
  const chunks: Array<{ id: string; sourceId: string | null; content: string }> = [
    { id: crypto.randomUUID(), sourceId: null, content: `__FILE_TREE__\n${JSON.stringify(files.map((file) => file.path))}` },
  ];

  let architectureMap = '__ARCHITECTURE_MAP__\n';
  let indexedCharacters = 0;
  let indexedFiles = 0;
  for (const { file, content } of fetched) {
    if (!content || indexedCharacters >= MAX_TOTAL_SOURCE_CHARS) continue;
    const imports = extractImports(content);
    const symbols = extractSymbols(content);
    if (imports.length > 0 || symbols.length > 0) {
      architectureMap += `[${file.path}]\nImports: ${imports.join(', ')}\nSignatures: ${symbols.join(', ')}\n\n`;
    }

    const bounded = content.slice(0, MAX_TOTAL_SOURCE_CHARS - indexedCharacters);
    indexedCharacters += bounded.length;
    indexedFiles += 1;
    const sourceId = sourceIds.get(file.path) || null;
    for (const contentChunk of chunkSource(file.path, bounded)) {
      chunks.push({ id: crypto.randomUUID(), sourceId, content: contentChunk });
    }
  }

  chunks.push({ id: crypto.randomUUID(), sourceId: null, content: architectureMap.slice(0, CHUNK_CHARS * 15) });

  const validUploads = uploadedFiles.slice(0, MAX_UPLOADS)
    .filter((doc) => typeof doc.name === 'string' && typeof doc.content === 'string' && doc.content.length <= MAX_UPLOAD_CHARS);
  let uploadedCharacters = 0;
  for (const doc of validUploads) {
    if (uploadedCharacters >= MAX_TOTAL_UPLOAD_CHARS) break;
    const content = doc.content.slice(0, MAX_TOTAL_UPLOAD_CHARS - uploadedCharacters);
    uploadedCharacters += content.length;
    const sourceId = crypto.randomUUID();
    sources.push({ id: sourceId, title: doc.name.slice(0, 180), url: `Upload: ${doc.name.slice(0, 180)}`, type: 'file' });
    for (let index = 0; index < content.length; index += CHUNK_CHARS) {
      chunks.push({ id: crypto.randomUUID(), sourceId, content: `__DOCUMENT_CHUNK__\nPath: ${doc.name.slice(0, 180)}\nContent:\n${content.slice(index, index + CHUNK_CHARS)}` });
    }
  }

  const workspaceId = crypto.randomUUID();
  const coverage = treeData.truncated ? 'GitHub returned a truncated tree; indexed available paths' : 'Complete file tree received';
  const brief = `GitHub Repository: ${owner}/${repo}\nBranch: ${defaultBranch}\nSource files discovered: ${files.length}\nSource files content-indexed: ${indexedFiles}\nIndex coverage: ${coverage}`;
  await saveWorkspace({
    id: workspaceId,
    topic: repoUrl,
    brief,
    sources: sources.map(({ id, title, url }) => ({ id, title, url, content: '' })),
    chunks,
  });
  return { topic: repoUrl, workspaceId, brief, sources: sources.map(({ title, url, type }) => ({ title, url, type })), createdAt: new Date().toISOString() };
}
