'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CircleStop, Database, ExternalLink,
  FileSearch, Globe2, Layers3, LoaderCircle, Mic2, Pause, Play, Plus,
  Search, ShieldCheck, Sparkles, Volume2, WandSparkles, Waypoints,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhysicalSceneView } from '@/components/physical-scene';
import type { ResearchWorkspace, VisualLesson, VisualNode, VisualScene } from '@/lib/visual-schema';

type Phase = 'topic' | 'researching' | 'ready' | 'generating' | 'lesson' | 'error';

const colors: Record<VisualNode['color'], { fill: string; stroke: string; text: string }> = {
  lime: { fill: '#d7ff63', stroke: '#e7ff9a', text: '#0a1611' },
  mint: { fill: '#173a2d', stroke: '#67e8b0', text: '#eafff3' },
  blue: { fill: '#142e3e', stroke: '#61c7ff', text: '#effaff' },
  amber: { fill: '#3a2b12', stroke: '#ffc861', text: '#fff9eb' },
  coral: { fill: '#3b1f20', stroke: '#ff8b7c', text: '#fff2f0' },
  violet: { fill: '#2b2140', stroke: '#b9a0ff', text: '#f7f2ff' },
};

function CameraScene({ scene }: { scene: VisualScene }) {
  const zoom = Math.max(0.8, Math.min(2.2, scene.camera.zoom));
  const translateX = 500 - scene.camera.x * 10 * zoom;
  const translateY = 300 - scene.camera.y * 6 * zoom;
  const nodeMap = new Map(scene.nodes.map((node) => [node.id, node]));

  return (
    <svg className="h-full w-full" viewBox="0 0 1000 600" role="img" aria-label={scene.title}>
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(205,255,222,.055)" strokeWidth="1" /></pattern>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#6f9b85" /></marker>
        <filter id="glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="1000" height="600" fill="url(#grid)" />
      <g className="camera-layer" style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})` }}>
        {scene.edges.map((edge, index) => {
          const from = nodeMap.get(edge.from); const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x * 10; const y1 = from.y * 6; const x2 = to.x * 10; const y2 = to.y * 6;
          const path = `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <path d={path} fill="none" stroke="rgba(132,181,157,.48)" strokeWidth="2" markerEnd="url(#arrow)" />
              {edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fill="#789487" fontSize="11">{edge.label}</text>}
              {edge.animated && <circle r="4" fill="#d7ff63" filter="url(#glow)"><animateMotion dur="2.1s" repeatCount="indefinite" path={path} /></circle>}
            </g>
          );
        })}
        {scene.nodes.map((node) => {
          const palette = colors[node.color] || colors.mint;
          const x = node.x * 10; const y = node.y * 6;
          const focused = scene.focusNodeIds.includes(node.id);
          return (
            <g key={node.id} className={`visual-node ${focused ? 'is-focused' : ''}`} transform={`translate(${x} ${y})`}>
              {focused && <circle r="58" fill="none" stroke={palette.stroke} strokeOpacity=".18" strokeWidth="2"><animate attributeName="r" values="42;62;42" dur="2.8s" repeatCount="indefinite" /><animate attributeName="stroke-opacity" values=".32;.06;.32" dur="2.8s" repeatCount="indefinite" /></circle>}
              {node.shape === 'circle' ? <circle r="34" fill={palette.fill} stroke={palette.stroke} strokeWidth={focused ? 3 : 1.5} /> : <rect x={node.shape === 'pill' ? -72 : -62} y="-30" width={node.shape === 'pill' ? 144 : 124} height="60" rx={node.shape === 'pill' ? 30 : 14} fill={palette.fill} stroke={palette.stroke} strokeWidth={focused ? 3 : 1.5} />}
              <text textAnchor="middle" y="4" fill={palette.text} fontSize="13" fontWeight="650">{node.label.slice(0, 24)}</text>
              <text textAnchor="middle" y="50" fill="#8aa396" fontSize="10">{node.detail.slice(0, 42)}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function ResearchProgress({ topic }: { topic: string }) {
  const steps = ['Planning search angles', 'Searching the open web', 'Comparing authoritative sources', 'Building semantic chunks', 'Indexing the knowledge base'];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => Math.min(value + 1, steps.length - 1)), 2400);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return (
    <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b1a15]/90 p-6 shadow-2xl backdrop-blur-xl md:p-8">
      <div className="flex items-start gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-[#d7ff63] text-[#08130f]"><FileSearch className="size-5" /></span><div><div className="text-xs uppercase tracking-[.18em] text-[#d7ff63]/70">Building knowledge workspace</div><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">{topic}</h2></div></div>
      <div className="mt-7 space-y-4">
        {steps.map((step, index) => <div key={step} className={`flex items-center gap-3 text-sm transition ${index <= active ? 'text-emerald-50/85' : 'text-emerald-50/25'}`}><span className={`grid size-6 place-items-center rounded-full border ${index < active ? 'border-[#68e8ae]/35 bg-[#68e8ae]/10 text-[#68e8ae]' : index === active ? 'border-[#d7ff63]/45 bg-[#d7ff63]/10 text-[#d7ff63]' : 'border-white/10'}`}>{index < active ? <Check className="size-3.5" /> : index === active ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="size-1 rounded-full bg-current" />}</span>{step}</div>)}
      </div>
      <p className="mt-7 text-xs leading-5 text-emerald-50/35">Tavily is searching multiple angles, extracting authoritative sources, and indexing the evidence into a dedicated knowledge workspace.</p>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>('topic');
  const [topic, setTopic] = useState('');
  const [question, setQuestion] = useState('');
  const [workspace, setWorkspace] = useState<ResearchWorkspace | null>(null);
  const [lesson, setLesson] = useState<VisualLesson | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [error, setError] = useState('');
  const scene = lesson?.scenes[sceneIndex];

  useEffect(() => {
    if (!playing || !scene || typeof window === 'undefined') return;
    const duration = Math.max(5, scene.durationSeconds) * 1000;
    const startedAt = performance.now();
    setSceneProgress(0);

    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(scene.narration);
        utterance.rate = 0.96; utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
        setVoiceAvailable(true);
      } catch { setVoiceAvailable(false); }
    } else setVoiceAvailable(false);

    const progressTimer = window.setInterval(() => setSceneProgress(Math.min(100, ((performance.now() - startedAt) / duration) * 100)), 100);
    const sceneTimer = window.setTimeout(() => {
      if (!lesson) return;
      if (sceneIndex < lesson.scenes.length - 1) setSceneIndex((value) => value + 1);
      else { setSceneProgress(100); setPlaying(false); }
    }, duration);

    return () => { window.clearInterval(progressTimer); window.clearTimeout(sceneTimer); window.speechSynthesis?.cancel(); };
  }, [playing, sceneIndex, scene, lesson]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'start_anima_research', title: 'Start Anima research',
      description: 'Enter an arbitrary topic into Anima and begin building its research workspace.',
      inputSchema: { type: 'object', properties: { topic: { type: 'string', minLength: 3 } }, required: ['topic'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input: unknown) {
        const value = typeof input === 'object' && input !== null && 'topic' in input ? String((input as { topic: unknown }).topic).trim() : '';
        if (value.length < 3) throw new Error('A clear topic is required.');
        setTopic(value);
        return { status: 'staged', topic: value, nextAction: 'Submit the visible research form.' };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  async function startResearch(event: FormEvent) {
    event.preventDefault();
    const cleanTopic = topic.trim(); if (cleanTopic.length < 3) return;
    setPhase('researching'); setError(''); setWorkspace(null); setLesson(null);
    try {
      const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: cleanTopic }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Research failed.');
      setWorkspace(data as ResearchWorkspace); setPhase('ready');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Research failed.'); setPhase('error'); }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault(); if (!workspace || question.trim().length < 2) return;
    setPhase('generating'); setError(''); setPlaying(false); setSceneProgress(0);
    try {
      const response = await fetch('/api/lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.workspaceId, question: question.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Animation generation failed.');
      setLesson(data as VisualLesson); setSceneIndex(0); setPhase('lesson');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Animation generation failed.'); setPhase('error'); }
  }

  function reset() {
    window.speechSynthesis?.cancel(); setPlaying(false); setSceneProgress(0); setWorkspace(null); setLesson(null); setQuestion(''); setError(''); setPhase('topic');
  }

  const sourceCount = workspace?.sources.length || 0;
  const progress = lesson ? ((sceneIndex + sceneProgress / 100) / lesson.scenes.length) * 100 : 0;
  const status = useMemo(() => phase === 'researching' ? 'Researching' : phase === 'generating' ? 'Compiling animation' : workspace ? `${sourceCount} sources indexed` : 'Ready for any topic', [phase, workspace, sourceCount]);

  return (
    <main className="min-h-screen bg-[#06110d] text-[#eef8f1]">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 md:px-7">
        <button onClick={reset} className="flex items-center gap-3 text-left"><span className="grid size-9 place-items-center rounded-xl bg-[#d7ff63] text-[#0b1712]"><Layers3 className="size-5" /></span><span><span className="block font-semibold tracking-[-.03em]">Anima</span><span className="block text-[9px] uppercase tracking-[.2em] text-emerald-100/40">Research to animation</span></span></button>
        <div className="flex items-center gap-2"><Badge variant="outline" className="border-white/10 bg-white/[.035] text-emerald-50/55"><span className={`size-1.5 rounded-full ${phase === 'researching' || phase === 'generating' ? 'animate-pulse bg-amber-300' : 'bg-[#d7ff63]'}`} />{status}</Badge>{workspace && <Button variant="outline" className="hidden border-white/10 bg-white/[.035] text-emerald-50/60 hover:bg-white/10 sm:inline-flex" onClick={reset}><Plus /> New topic</Button>}</div>
      </header>

      {phase === 'topic' && (
        <section className="relative grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden px-5 py-16">
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_50%_35%,rgba(118,236,171,.18),transparent_38%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:auto,38px_38px,38px_38px]" />
          <div className="relative w-full max-w-3xl text-center">
            <Badge variant="outline" className="border-[#d7ff63]/20 bg-[#d7ff63]/5 text-[#d7ff63]/80"><Globe2 /> Open-web learning workspace</Badge>
            <h1 className="mt-7 text-4xl font-semibold tracking-[-.055em] md:text-6xl">What do you want<br /><span className="text-[#d7ff63]">to understand?</span></h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-emerald-50/45 md:text-base">Enter anything. Anima researches the web, builds a dedicated knowledge base, then turns your questions into executable narrated animations.</p>
            <form onSubmit={startResearch} className="mx-auto mt-9 flex max-w-2xl items-center gap-2 rounded-2xl border border-white/12 bg-white/[.06] p-2 shadow-[0_24px_90px_rgba(0,0,0,.35)] backdrop-blur-xl">
              <Search className="ml-3 size-5 shrink-0 text-emerald-100/35" />
              <Input autoFocus value={topic} onChange={(event) => setTopic(event.target.value)} className="h-12 border-0 bg-transparent px-1 text-base text-white shadow-none placeholder:text-emerald-100/25 focus-visible:ring-0" placeholder="Type any topic, system, event, idea, or question…" aria-label="Learning topic" />
              <Button type="submit" disabled={topic.trim().length < 3} className="h-11 rounded-xl bg-[#d7ff63] px-5 text-[#08130f] hover:bg-[#caff42]"><Sparkles /> Research</Button>
            </form>
            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-emerald-50/30"><span className="flex items-center gap-2"><Globe2 className="size-3.5" /> 20–25 web sources</span><span className="flex items-center gap-2"><Database className="size-3.5" /> Dedicated semantic RAG</span><span className="flex items-center gap-2"><WandSparkles className="size-3.5" /> Physical 3D + visual fallback</span></div>
          </div>
        </section>
      )}

      {phase === 'researching' && <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16"><ResearchProgress topic={topic} /></section>}

      {phase === 'error' && !workspace && (
        <section className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16">
          <div className="w-full max-w-lg rounded-3xl border border-red-300/15 bg-red-300/5 p-7 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-red-100">Research could not start</h2>
            <p className="mt-3 text-sm leading-6 text-red-100/55">{error}</p>
            <Button onClick={reset} className="mt-6 bg-[#d7ff63] text-[#08130f] hover:bg-[#caff42]">Return to topic</Button>
          </div>
        </section>
      )}

      {(phase === 'ready' || phase === 'generating' || phase === 'lesson' || phase === 'error') && workspace && (
        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 bg-[#081510] p-5 xl:border-b-0 xl:border-r">
            <button onClick={reset} className="flex items-center gap-2 text-xs text-emerald-50/40 hover:text-white"><ArrowLeft className="size-3.5" /> All workspaces</button>
            <div className="mt-6"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#d7ff63]/65">Knowledge workspace</div><h2 className="mt-2 text-lg font-semibold leading-6 tracking-[-.025em]">{workspace.topic}</h2></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/8 bg-white/[.03] p-3"><div className="font-mono text-lg text-[#d7ff63]">{sourceCount}</div><div className="text-[10px] text-emerald-50/30">sources</div></div><div className="rounded-xl border border-white/8 bg-white/[.03] p-3"><div className="font-mono text-lg text-[#6ee7b0]">RAG</div><div className="text-[10px] text-emerald-50/30">indexed</div></div></div>
            <div className="mt-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-50/35"><BookOpen className="size-3.5" /> Research sources</div>
            <div className="mt-3 max-h-[48vh] space-y-3 overflow-y-auto pr-1">
              {workspace.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-xl border border-transparent p-2 hover:border-white/8 hover:bg-white/[.03]"><span className="font-mono text-[10px] text-[#d7ff63]/50">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0"><span className="line-clamp-2 text-xs leading-5 text-emerald-50/60 group-hover:text-white">{source.title}</span><span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-emerald-50/25">{new URL(source.url).hostname}<ExternalLink className="size-2.5" /></span></span></a>)}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col">
            {!lesson && phase !== 'generating' && (
              <div className="grid flex-1 place-items-center px-5 py-14">
                <div className="w-full max-w-2xl text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#d7ff63]/20 bg-[#d7ff63]/8 text-[#d7ff63]"><ShieldCheck className="size-6" /></span><div className="mt-5 text-[10px] uppercase tracking-[.2em] text-[#d7ff63]/65">Knowledge base ready</div><h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Ask what you want to see explained.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-emerald-50/40">The answer will be retrieved from this workspace and compiled into a visual scene—not returned as a chat message.</p>
                  <form onSubmit={askQuestion} className="mt-8 flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[.05] p-2"><Waypoints className="ml-3 size-5 text-emerald-100/35" /><Input value={question} onChange={(event) => setQuestion(event.target.value)} autoFocus className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0" placeholder={`What about ${workspace.topic} should Anima explain?`} aria-label="Question for this knowledge base" /><Button type="submit" className="h-10 rounded-xl bg-[#d7ff63] px-4 text-[#08130f] hover:bg-[#caff42]"><WandSparkles /> Generate animation</Button></form>
                </div>
              </div>
            )}

            {phase === 'generating' && <div className="grid flex-1 place-items-center px-5"><div className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#d7ff63]/20 bg-[#d7ff63]/8 text-[#d7ff63]"><LoaderCircle className="size-7 animate-spin" /></span><h2 className="mt-5 text-xl font-semibold">Compiling a visual explanation</h2><p className="mt-2 text-sm text-emerald-50/35">Selecting a physical, spatial, or diagram representation and generating synchronized scene code…</p></div></div>}

            {phase === 'error' && <div className="grid flex-1 place-items-center px-5"><div className="max-w-lg rounded-2xl border border-red-300/15 bg-red-300/5 p-6 text-center"><h2 className="font-semibold text-red-100">Anima could not continue</h2><p className="mt-2 text-sm leading-6 text-red-100/55">{error}</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => setPhase('ready')} className="border-white/10 bg-white/5">Back to workspace</Button><Button onClick={reset} className="bg-[#d7ff63] text-[#08130f]">Start over</Button></div></div></div>}

            {lesson && scene && phase === 'lesson' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-start justify-between border-b border-white/10 px-5 py-4 md:px-7"><div><div className="text-[10px] uppercase tracking-[.18em] text-[#d7ff63]/65">Generated {scene.renderMode === 'physical3d' ? 'physical 3D' : scene.renderMode === 'spatial2d' ? 'spatial' : lesson.strategy} animation</div><h1 className="mt-1 text-xl font-semibold tracking-[-.03em] md:text-2xl">{lesson.title}</h1><p className="mt-1 text-xs text-emerald-50/35">{lesson.subtitle}</p></div><Button variant="outline" onClick={() => { setLesson(null); setPlaying(false); setPhase('ready'); }} className="border-white/10 bg-white/[.03] text-emerald-50/60"><Plus /> Ask another</Button></div>
                <div className="relative min-h-[420px] flex-1 overflow-hidden bg-[#07130f]">
                  {scene.renderMode === 'physical3d' ? <PhysicalSceneView key={scene.id} scene={scene} /> : <CameraScene key={scene.id} scene={scene} />}
                  <div className="pointer-events-none absolute left-5 top-5 rounded-xl border border-white/10 bg-[#081510]/85 px-3 py-2 backdrop-blur"><div className="text-[9px] uppercase tracking-[.16em] text-emerald-50/35">Scene {sceneIndex + 1} of {lesson.scenes.length}</div><div className="mt-1 text-sm font-medium">{scene.title}</div>{scene.renderMode === 'physical3d' && <div className="mt-1 text-[9px] text-emerald-50/35">Drag to rotate · scroll to zoom</div>}</div>
                  <div className="pointer-events-none absolute right-5 bottom-5 flex items-center gap-2 rounded-full border border-[#d7ff63]/15 bg-[#081510]/85 px-3 py-1.5 text-[9px] uppercase tracking-[.16em] text-[#d7ff63]"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#d7ff63] opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-[#d7ff63]" /></span>Live animation</div>
                </div>
                <div className="border-t border-white/10 bg-[#081510] p-4 md:px-6">
                  <div className="mx-auto flex max-w-5xl items-center gap-3">
                    <Button onClick={() => setPlaying((value) => !value)} className="rounded-xl bg-[#d7ff63] px-4 text-[#08130f] hover:bg-[#caff42]" aria-label={playing ? 'Pause narrated lesson' : 'Play narrated lesson'}>{playing ? <><Pause /> Pause</> : <><Play className="fill-current" /> Play narration</>}</Button>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-emerald-50/35"><Mic2 className="size-3 text-[#d7ff63]" /> {voiceAvailable ? 'Voice + synchronized captions' : 'Synchronized captions'}</div><p className="mt-1 line-clamp-2 text-sm leading-5 text-emerald-50/75">{scene.narration}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8"><div className="h-full bg-gradient-to-r from-[#d7ff63] to-[#64e9ae] transition-[width] duration-100" style={{ width: `${progress}%` }} /></div></div>
                    <Button variant="ghost" size="icon" onClick={() => { window.speechSynthesis.cancel(); setPlaying(false); setSceneProgress(0); setSceneIndex(Math.max(0, sceneIndex - 1)); }} disabled={sceneIndex === 0} className="text-emerald-50/40" aria-label="Previous scene"><ArrowLeft /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { window.speechSynthesis.cancel(); setPlaying(false); setSceneProgress(0); setSceneIndex(Math.min(lesson.scenes.length - 1, sceneIndex + 1)); }} disabled={sceneIndex === lesson.scenes.length - 1} className="text-emerald-50/40" aria-label="Next scene"><ArrowRight /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { window.speechSynthesis.cancel(); setPlaying(false); setSceneProgress(0); }} className="hidden text-emerald-50/40 sm:inline-flex" aria-label="Stop narration"><CircleStop /></Button><Volume2 className="hidden size-4 text-emerald-50/25 md:block" />
                  </div>
                  <p className="mx-auto mt-3 max-w-5xl truncate text-[10px] text-emerald-50/25">{lesson.sourceSummary}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
