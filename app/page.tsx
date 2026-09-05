'use client';

import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowLeft, BookOpen, Layers3Icon, LoaderCircle, Plus,
  Search, ShieldCheck, Sparkles, WandSparkles, Waypoints, Upload, Menu,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ReactFlow, Background, Controls, Node, Edge, useNodesState, useEdgesState, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ResearchWorkspace, VisualNode, VisualLesson } from '@/lib/visual-schema';

type Phase = 'repo' | 'cloning' | 'ready' | 'generating' | 'lesson' | 'error';

function CloningProgress({ repoUrl }: { repoUrl: string }) {
  const steps = ['Reading repository metadata', 'Discovering codebase files', 'Saving searchable file map', 'Preparing source workspace', 'Ready for architecture questions'];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => Math.min(value + 1, steps.length - 1)), 1800);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[.04] p-7 shadow-2xl backdrop-blur-md">
      <div className="mb-6 flex justify-between items-center text-xs text-neutral-50/60 uppercase tracking-widest font-bold">
        <span>Repository setup</span><span className="text-[#ffffff]">{Math.round((active / (steps.length - 1)) * 100)}%</span>
      </div>
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step} className={`flex items-center gap-3 transition-opacity duration-300 ${index > active ? 'opacity-20' : index === active ? 'opacity-100' : 'opacity-60'}`}>
            <span className={`grid size-6 place-items-center rounded-full text-[10px] ${index > active ? 'bg-white/10 text-white/50' : index === active ? 'bg-neutral-300/20 text-neutral-300 animate-pulse' : 'bg-[#ffffff]/20 text-[#ffffff]'}`}>
              {index < active ? '✓' : index + 1}
            </span>
            <span className={`text-sm ${index === active ? 'text-neutral-100 font-medium' : 'text-neutral-50/80'}`}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function FlowchartScene({ lesson, analysisMode, onBlastRadius }: { lesson: VisualLesson; analysisMode?: 'default' | 'failure' | 'blast_radius'; onBlastRadius?: (label: string, filePath: string) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeData, setSelectedNodeData] = useState<(VisualNode & { architectureDetail?: string, anatomyDetail?: string }) | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'architecture' | 'file' | 'anatomy'>('architecture');

  useEffect(() => {
    if (!lesson || !lesson.nodes) return;

    const isDiagram = lesson.type === 'diagram';
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: isDiagram ? 'LR' : 'TB', nodesep: 100, ranksep: 120 });

    // Setup colors based on new API schema
    const categoryColors = {
      database: { bg: '#111111', border: '#dddddd' },
      api: { bg: '#0a0a0a', border: '#bbbbbb' },
      frontend: { bg: '#1a1a1a', border: '#dddddd' },
      utility: { bg: '#222222', border: '#aaaaaa' },
      core: { bg: '#000000', border: '#ffffff' },
      danger: { bg: '#2a0808', border: '#ff3333' }
    };

    // Pre-calculate dimensions and apply to DAG
    const initialNodes: Node[] = lesson.nodes.map((node) => {
      // Resolve hierarchical string explicitly with deep fallbacks for legacy cached layouts
      let resolvedLabel = node.label;
      if (zoomLevel === 'architecture') resolvedLabel = node.labelArchitecture || node.label;
      else if (zoomLevel === 'file') resolvedLabel = node.labelFile || node.filePath || `${node.label} (File Unknown)`;
      else if (zoomLevel === 'anatomy') resolvedLabel = node.labelAnatomy || `func ${node.label}()`;

      // @ts-ignore category is a custom extension
      const cat = node.category as keyof typeof categoryColors;
      const colors = categoryColors[cat] || (isDiagram ? categoryColors.core : { bg: '#000000', border: '#ffffff' });

      return {
        id: node.id,
        position: { x: 0, y: 0 },
        data: { label: resolvedLabel, detail: node.detail, architectureDetail: node.architectureDetail, anatomyDetail: node.anatomyDetail, filePath: node.filePath, codeSnippet: node.codeSnippet },
        type: node.type,
        sourcePosition: isDiagram ? Position.Right : Position.Bottom,
        targetPosition: isDiagram ? Position.Left : Position.Top,
        style: {
          background: colors.bg,
          color: '#eef8f1',
          border: `2px solid ${colors.border}`,
          borderRadius: isDiagram ? '12px' : '8px',
          padding: isDiagram ? '20px' : '12px',
          fontWeight: '600',
          width: isDiagram ? 250 : 200,
          boxShadow: isDiagram ? '0 8px 32px rgba(0,0,0,0.5)' : 'none'
        }
      };
    });

    const initialEdges: Edge[] = (lesson.edges || []).map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.animated !== false,
      style: { stroke: isDiagram ? '#ffffff' : '#ffffff', strokeWidth: 2 }
    }));

    // Pass to DAG
    initialNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: Number(node.style?.width) || 200, height: 80 });
    });
    initialEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    // Apply layout positions
    const layoutedNodes = initialNodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.position = {
        x: nodeWithPosition.x - (Number(node.style?.width) || 200) / 2,
        y: nodeWithPosition.y - 40,
      };
      return node;
    });

    setNodes(layoutedNodes);
    setEdges(initialEdges);
  }, [lesson, setNodes, setEdges, zoomLevel]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeData(node.data as any);
  }, []);

  if (lesson.type === 'text') {
    return (
      <div className={`h-full w-full overflow-y-auto p-12 text-white ${analysisMode === 'failure' ? 'bg-[#000000]' : 'bg-black'}`}>
        <div className="prose prose-invert max-w-4xl mx-auto font-sans leading-relaxed text-lg prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:bg-white/10 prose-th:p-3 prose-td:border prose-td:border-white/10 prose-td:p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.textualContent || ''}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row relative h-full w-full overflow-hidden bg-transparent">
      {lesson.textualContent && (
        <div className="w-1/2 h-full border-r border-white/10 bg-[#000000] p-6 overflow-y-auto shrink-0 z-30 relative">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#ffffff]/60 mb-2">Architectural Synthesis</h3>
          <div className="prose prose-invert prose-sm max-w-none prose-table:w-full prose-th:border py-2 text-neutral-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.textualContent}</ReactMarkdown>
          </div>
        </div>
      )}
      <div className="flex-1 relative min-w-0 bg-transparent overflow-hidden">
        {/* Abstraction Layer Zoom Control */}
        <div className="absolute top-4 left-4 z-20 flex gap-2 bg-black border border-white/20 rounded-md p-1 shadow-2xl">
          <button
            onClick={() => setZoomLevel('architecture')}
            className={`transition-all ${zoomLevel === 'architecture' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >Architecture</button>
          <button
            onClick={() => setZoomLevel('file')}
            className={`transition-all ${zoomLevel === 'file' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >File System</button>
          <button
            onClick={() => setZoomLevel('anatomy')}
            className={`transition-all ${zoomLevel === 'anatomy' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >Code Anatomy</button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="rgba(255,255,255,0.05)" />
          <Controls showInteractive={false} position="bottom-left" className="!bg-transparent !m-4" />
        </ReactFlow>

        {/* Slide-out Code Inspector */}
        <div className={`absolute top-0 right-0 z-10 h-full w-[450px] border-l border-white/10 bg-black/60 shadow-[0_0_90px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-transform duration-300 ${selectedNodeData ? 'translate-x-0' : 'translate-x-[500px]'}`}>
          {selectedNodeData && (
            <div className="flex h-full flex-col p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold text-[#ffffff] uppercase tracking-wider">Node Inspector</h3>
                  {selectedNodeData.filePath && (
                    <p className="mt-1 text-[11px] text-neutral-50/50 font-mono break-all line-clamp-1">{selectedNodeData.filePath}</p>
                  )}
                </div>
                <button onClick={() => setSelectedNodeData(null)} className="text-white/50 hover:text-white bg-white/5 size-8 rounded-full flex items-center justify-center shrink-0">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pb-12 pr-2">

                {zoomLevel === 'architecture' && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-[#ffffff] mb-2">Architectural Logic</h4>
                    <div className="text-sm text-neutral-50/90 leading-relaxed font-medium prose prose-invert prose-invert prose-sm max-w-none prose-table:w-full prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:bg-white/10 prose-th:p-2 prose-td:border prose-td:border-white/10 prose-td:p-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNodeData.architectureDetail || selectedNodeData.detail || 'Context unavailable.'}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {zoomLevel === 'file' && (
                  <>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-[#ffffff] mb-2">Architectural Mapping</h4>
                      <div className="text-sm text-neutral-50/90 leading-relaxed font-medium prose prose-invert prose-invert prose-sm max-w-none prose-table:w-full prose-th:border prose-th:border-white/20 prose-th:bg-white/10 prose-th:p-2 prose-td:border prose-td:border-white/10 prose-td:p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNodeData.architectureDetail || 'Context unavailable.'}</ReactMarkdown>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-neutral-50/40 mb-2">Mechanical Details</h4>
                      <div className="text-sm text-neutral-50/90 leading-relaxed font-medium prose prose-invert prose-invert prose-sm max-w-none prose-table:w-full prose-th:border prose-th:border-white/20 prose-th:bg-white/10 prose-th:p-2 prose-td:border prose-td:border-white/10 prose-td:p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNodeData.detail || 'Context unavailable.'}</ReactMarkdown>
                      </div>
                    </div>
                  </>
                )}

                {zoomLevel === 'anatomy' && (
                  <>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Functional Anatomy</h4>
                      <div className="text-sm text-neutral-50/90 leading-relaxed font-medium prose prose-invert prose-invert prose-sm max-w-none prose-table:w-full prose-th:border prose-th:border-white/20 prose-th:bg-white/10 prose-th:p-2 prose-td:border prose-td:border-white/10 prose-td:p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNodeData.anatomyDetail || 'Specific structural API elements unavailable.'}</ReactMarkdown>
                      </div>
                    </div>

                    {selectedNodeData.codeSnippet && (
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest text-neutral-50/40 mb-2">Raw Logic Snippet</h4>
                        <div className="rounded-xl overflow-hidden text-[11px] border border-white/10 bg-black/40">
                          <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent', padding: '16px' }}>
                            {selectedNodeData.codeSnippet}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="pt-4 mt-6 border-t border-white/10">
                  <button
                    onClick={() => {
                      if (onBlastRadius) {
                        onBlastRadius(selectedNodeData.label, selectedNodeData.filePath || 'Unknown path');
                        setSelectedNodeData(null);
                      }
                    }}
                    className="w-full flex items-center justify-center p-3 mt-4 bg-neutral-500 text-black hover:bg-neutral-600 transition-colors rounded-xl text-xs font-bold"
                  >
                    <Waypoints className="mr-2 size-4" /> Calculate Blast Radius
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>('repo');
  const [repoUrl, setRepoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<{ name: string, content: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [workspace, setWorkspace] = useState<ResearchWorkspace | null>(null);
  const [lesson, setLesson] = useState<VisualLesson | null>(null);
  const [lessonMap, setLessonMap] = useState<Record<string, VisualLesson>>({});
  const [error, setError] = useState('');
  const [analysisMode, setAnalysisMode] = useState<'default' | 'failure' | 'blast_radius'>('default');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Persistence hooks
  useEffect(() => {
    const savedState = sessionStorage.getItem('repoArchState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.phase) setPhase(parsed.phase);
        if (parsed.workspace) setWorkspace(parsed.workspace);
        if (parsed.lesson) setLesson(parsed.lesson);
        if (parsed.lessonMap) setLessonMap(parsed.lessonMap);
        if (parsed.analysisMode) setAnalysisMode(parsed.analysisMode);
        if (parsed.repoUrl) setRepoUrl(parsed.repoUrl);
        if (parsed.question) setQuestion(parsed.question);
        if (parsed.lastQuestion) setLastQuestion(parsed.lastQuestion);
      } catch (e) {
        console.warn('Could not restore session state', e);
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('repoArchState', JSON.stringify({ phase, workspace, lesson, lessonMap, analysisMode, repoUrl, question, lastQuestion }));
  }, [phase, workspace, lesson, lessonMap, analysisMode, repoUrl, question, lastQuestion]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setIsUploading(true);
    const files = Array.from(e.target.files);
    const newDocs: { name: string, content: string }[] = [];

    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) continue;
      try {
        const content = await file.text();
        newDocs.push({ name: file.name, content });
      } catch (err) {
        console.warn('Failed to read file', file.name);
      }
    }

    setUploadedDocs(prev => [...prev, ...newDocs]);
    setIsUploading(false);
  };

  const removeDoc = (name: string) => {
    setUploadedDocs(prev => prev.filter(d => d.name !== name));
  };

  async function startClone(event: FormEvent) {
    event.preventDefault();
    const cleanUrl = repoUrl.trim();
    if (cleanUrl.length < 5) return;
    setPhase('cloning');
    setError('');
    setWorkspace(null);
    setLesson(null);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleanUrl, documents: uploadedDocs })
      });
      const data = await response.json() as { error?: string } & ResearchWorkspace;
      if (!response.ok) throw new Error(data.error || 'Parsing failed.');
      setWorkspace(data);
      setPhase('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Parsing failed.');
      setPhase('error');
    }
  }

  async function performGeneration(overrideMode?: 'default' | 'failure' | 'blast_radius', overrideQuestion?: string) {
    const targetMode = overrideMode || analysisMode;
    const q = overrideQuestion || question.trim() || lastQuestion;
    if (!workspace || q.length < 2) return;

    // Only cache overarching global queries to lastQuestion, not targetted node lookups
    if (!overrideQuestion) {
      setLastQuestion(q);
    }

    // Cache check to instantly resolve toggles
    const cacheKey = `${q}-${targetMode}`;
    if (lessonMap[cacheKey]) {
      setLesson(lessonMap[cacheKey]);
      setPhase('lesson');
      return;
    }

    setPhase('generating');
    setError('');

    try {
      const response = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.workspaceId, question: q, analysisMode: targetMode })
      });
      const data = await response.json() as { error?: string } & VisualLesson;
      if (!response.ok) throw new Error(data.error || 'Generation failed.');

      setLesson(data);
      setLessonMap(prev => ({ ...prev, [cacheKey]: data }));
      setPhase('lesson');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Generation failed.');
      setPhase(lesson ? 'lesson' : 'error');
    }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    await performGeneration();
  }

  const toggleAnalysisMode = (newMode: 'default' | 'failure' | 'blast_radius') => {
    if (newMode === analysisMode) return;
    setAnalysisMode(newMode);

    // Aggressive fallback if session storage stripped the last query
    const qFall = lastQuestion || question.trim() || `Analyze architecture and flow for ${workspace?.topic?.split('/').pop() || 'the codebase'}.`;

    if (lesson) {
      performGeneration(newMode, qFall);
    }
  };

  function reset() {
    setWorkspace(null); setLesson(null); setLessonMap({}); setQuestion(''); setLastQuestion(''); setError(''); setPhase('repo'); setUploadedDocs([]); setAnalysisMode('default');
    sessionStorage.removeItem('repoArchState');
  }

  const sourceCount = workspace?.sources.length || 0;
  const status = useMemo(() => phase === 'cloning' ? 'Parsing Repository' : phase === 'generating' ? 'Compiling Explanation' : workspace ? `${sourceCount} sources indexed` : 'Awaiting Github URL', [phase, workspace, sourceCount]);

  return (
    <main className={`min-h-screen text-[#eef8f1] transition-colors duration-500 ${analysisMode === 'failure' ? 'bg-[#000000]' : 'bg-black'}`}>
      <header className={`flex h-16 items-center justify-between border-b px-4 md:px-7 ${analysisMode === 'failure' ? 'border-neutral-500/20' : 'border-white/10'} bg-black`}>
        <div className="flex items-center">
          <button onClick={reset} className="flex items-center gap-3 text-left">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-black shadow-lg">
              <Layers3Icon className="size-4" />
            </span>
            <span className="font-semibold tracking-[-.03em] text-white">Repo-Wiki</span>
          </button>

          {workspace && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="ml-6 p-1.5 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md border border-white/10 flex items-center justify-center transition-all">
              {isSidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden md:inline-flex border-white/10 bg-white/[.035] text-neutral-50/55">
            <span className={`mr-2 size-1.5 rounded-full ${phase === 'cloning' || phase === 'generating' ? 'animate-pulse bg-neutral-300' : 'bg-[#ffffff]'}`} />
            {status}
          </Badge>
          {workspace && lesson && (
            <Button variant="outline" className="border-white/10 bg-white/[.035] text-neutral-50/80 hover:text-white hover:bg-white/10 ml-2" onClick={() => { setLesson(null); setPhase('ready'); }}>
              <Plus className="size-3 mr-1" /> New Query
            </Button>
          )}
          {workspace && (
            <Button variant="outline" className="hidden border-white/10 bg-white/[.035] text-neutral-50/60 hover:bg-white/10 sm:inline-flex" onClick={reset}>
              <Plus className="mr-1" /> New Repo
            </Button>
          )}
        </div>
      </header>

      {phase === 'repo' && (
        <section className="relative grid h-[calc(100vh-4rem)] place-items-center overflow-hidden px-5 pb-16">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-white/[0.03] rounded-full blur-[100px] pointer-events-none" />
          <div className="relative w-full max-w-3xl text-center flex flex-col items-center">
            <h1 className="text-6xl font-bold tracking-[-.04em] text-white">Repo-Wiki</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#9ba1a6]">
              A new perspective on codebase understanding.<br />
              AI-generated architectural flowcharts, instantly mapped.
            </p>

            <form onSubmit={startClone} className="mt-12 w-full max-w-2xl relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-white/0 via-white/10 to-white/0 rounded-full blur opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative flex items-center rounded-full border border-white/10 bg-[#0a0a0a] shadow-2xl transition-all duration-300 focus-within:border-white/20 focus-within:bg-[#0f0f0f]">
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="h-16 w-full border-0 bg-transparent px-8 text-neutral-200 shadow-none placeholder:text-neutral-500 focus-visible:ring-0 text-lg rounded-full"
                  placeholder="Find open source repos..."
                  aria-label="GitHub URL"
                />
                <button type="submit" disabled={repoUrl.trim().length < 5} className="mr-3 p-3 text-neutral-400 hover:text-white transition rounded-full disabled:opacity-50">
                  <Search className="size-5 shrink-0" />
                </button>
              </div>

              {/* Keep the hidden upload logic for backwards compat, though invisible from hero */}
              <input type="file" multiple accept=".txt,.md,.json" className="hidden" onChange={handleFileUpload} id="hiddenFileInput" />
            </form>
          </div>
        </section>
      )}

      {phase === 'cloning' && <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16"><CloningProgress repoUrl={repoUrl} /></section>}

      {phase === 'error' && !workspace && (
        <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-300/15 bg-neutral-300/5 p-7 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100">Parsing Failed</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-100/55">{error}</p>
            <Button onClick={reset} className="mt-6 bg-[#ffffff] text-[#08130f] hover:bg-[#e0e0e0]">Return to Form</Button>
          </div>
        </section>
      )}

      {(phase === 'ready' || phase === 'generating' || phase === 'lesson' || phase === 'error') && workspace && (
        <div className={`grid h-[calc(100vh-4rem)] overflow-hidden transition-[grid-template-columns] duration-300 ease-in-out ${isSidebarOpen ? 'grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)]' : 'grid-cols-1 xl:grid-cols-[0px_minmax(0,1fr)]'}`}>
          <aside className={`flex flex-col h-[calc(100vh-4rem)] bg-black/40 backdrop-blur-3xl border-white/10 transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'p-5 border-b xl:border-b-0 xl:border-r opacity-100' : 'p-0 border-none opacity-0'}`}>
            <div className="flex flex-col h-full min-w-[240px]">
              <button onClick={reset} className="flex items-center gap-2 text-xs text-neutral-50/40 hover:text-white shrink-0"><ArrowLeft className="size-3.5" /> Back to Search</button>
              <div className="mt-6 shrink-0">
                <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#ffffff]/65">Repository Workspace</div>
                <h2 className="mt-2 text-lg font-semibold leading-6 tracking-[-.025em] break-all">{workspace.topic.replace('https://github.com/', '')}</h2>
              </div>

              <div className="mt-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-neutral-50/35 shrink-0"><BookOpen className="size-3.5" /> Indexed Files</div>
              <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1 pb-10">
                {workspace.sources.map((source, index) => (
                  <div key={`${source.title}-${index}`} className="flex gap-3 rounded-xl border border-transparent p-2 hover:bg-white/[.03]">
                    <span className="font-mono text-[10px] text-[#ffffff]/50 mt-0.5">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs leading-5 text-neutral-50/80 break-all">{source.title}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex h-[calc(100vh-4rem)] min-w-0 flex-col overflow-y-auto relative">
            {!lesson && phase !== 'generating' && (
              <div className="grid flex-1 place-items-center px-5 py-14">
                <div className="w-full max-w-2xl text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#ffffff]/20 bg-[#ffffff]/8 text-[#ffffff]"><ShieldCheck className="size-6" /></span>
                  <div className="mt-5 text-[10px] uppercase tracking-[.2em] text-[#ffffff]/65">Repository map ready</div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">What part of the codebase should I explain?</h2>

                  <div className="flex items-center w-full max-w-2xl mx-auto rounded-3xl border border-white/12 bg-white/[.05] p-2 mt-8">
                    <button type="button" onClick={() => document.getElementById('chatFileInput')?.click()} className="ml-1 p-2 rounded-full hover:bg-white/10 text-neutral-400 transition" title="Add reference documents">
                      <Plus className="size-5" />
                    </button>
                    <input type="file" multiple accept=".txt,.md,.json" className="hidden" onChange={handleFileUpload} id="chatFileInput" />

                    <form onSubmit={askQuestion} className="flex flex-1 items-center gap-2">
                      <Input value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus className="h-11 border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0 w-full" placeholder="Ask a question or explain a module..." aria-label="Question" />
                      <Button type="submit" className="h-10 rounded-2xl bg-white px-5 text-sm font-semibold text-black hover:bg-neutral-200 transition"><WandSparkles className="size-4 mr-2" /> Ask</Button>
                    </form>
                  </div>

                  {uploadedDocs.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs mt-4 justify-center">
                      {uploadedDocs.map(doc => (
                        <span key={doc.name} className="bg-white/10 border border-white/20 text-neutral-200 px-3 py-1.5 rounded-full flex items-center gap-2">
                          {doc.name} <button type="button" onClick={() => removeDoc(doc.name)} className="hover:text-white flex items-center justify-center p-0.5 rounded-full">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === 'generating' && (
              <div className="grid flex-1 place-items-center px-5">
                <div className="text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#ffffff]/20 bg-[#ffffff]/8 text-[#ffffff]"><LoaderCircle className="size-7 animate-spin" /></span>
                  <h2 className="mt-5 text-xl font-semibold">Generating Explanation</h2>
                  <p className="mt-2 text-sm text-neutral-50/35">Reading the most relevant source files and choosing the best format: text, diagram, or flowchart...</p>
                </div>
              </div>
            )}

            {phase === 'lesson' && lesson && (
              <div className="flex flex-1 flex-col overflow-hidden h-full">
                <div className={`flex-1 relative overflow-hidden w-full min-h-0 transition-colors duration-500 ${analysisMode === 'failure' ? 'bg-[#000000]' : 'bg-transparent'}`}>
                  <FlowchartScene
                    lesson={lesson}
                    analysisMode={analysisMode}
                    onBlastRadius={(label, path) => {
                      const strictQ = `Calculate blast radius for: ${label} (${path})`;
                      setAnalysisMode('blast_radius');
                      performGeneration('blast_radius', strictQ);
                    }}
                  />

                  {/* Non-destructive Error Popup for Token Limits */}
                  {error && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-neutral-500/30 bg-neutral-950/80 px-4 py-3 text-neutral-200 text-xs shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 flex items-center justify-between gap-4 max-w-lg">
                      <p>{error}</p>
                      <button onClick={() => setError('')} className="bg-neutral-500/20 hover:bg-neutral-500/40 p-1.5 rounded-full">✕</button>
                    </div>
                  )}

                  {/* Toggles */}
                  {lesson.type !== 'text' && (
                    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-md border border-white/20 bg-black p-1 shadow-2xl">
                      <button
                        onClick={() => toggleAnalysisMode('default')}
                        className={`transition-all flex items-center justify-center ${analysisMode === 'default' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
                        style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                      >Architecture</button>
                      <button
                        onClick={() => toggleAnalysisMode('failure')}
                        className={`transition-all flex items-center gap-1.5 justify-center ${analysisMode === 'failure' ? 'bg-neutral-800 text-white border border-neutral-600' : 'text-neutral-500 hover:text-white'}`}
                        style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                      >
                        <span className={`size-1.5 rounded-full ${analysisMode === 'failure' ? 'bg-white animate-pulse' : 'bg-neutral-600'}`}></span> System Failure
                      </button>
                      {analysisMode === 'blast_radius' && (
                        <button
                          className={`transition-all flex items-center gap-1.5 justify-center bg-neutral-800 text-white border border-neutral-600 cursor-default`}
                          style={{ fontSize: '9px', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                        >
                          <span className="size-1.5 rounded-full bg-white animate-pulse"></span> Blast Radius
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === 'error' && (
              <div className="grid flex-1 place-items-center px-5">
                <div className="max-w-lg rounded-2xl border border-neutral-300/15 bg-neutral-300/5 p-6 text-center">
                  <h2 className="font-semibold text-neutral-100">Generation Failed</h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-100/55">{error}</p>
                  <Button variant="outline" onClick={() => setPhase('ready')} className="mt-4 border-white/10 bg-white/5">Back to workspace</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
