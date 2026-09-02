'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BookOpen, Bot, Check, ChevronDown, CirclePause, CirclePlay,
  Clock3, FileText, Focus, GitBranch, Layers3, Map, Maximize2, Mic2,
  Pause, Play, RotateCcw, Search, ShieldCheck, Sparkles, Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Lesson = {
  eyebrow: string; title: string; subtitle: string; prompt: string;
  steps: { title: string; description: string; narration: string }[];
  sources: { title: string; detail: string }[];
};

const lessons: Record<string, Lesson> = {
  politics: {
    eyebrow: 'Civics · institutional flow', title: 'How India forms a government',
    subtitle: 'From a citizen’s vote to the Council of Ministers', prompt: 'Explain how Indian politics works',
    steps: [
      { title: 'Citizens vote', description: 'Voters elect representatives from 543 parliamentary constituencies.', narration: 'India begins with citizens voting in their constituencies. Each constituency elects one member to the Lok Sabha.' },
      { title: 'Lok Sabha forms', description: 'Elected members take their seats in the lower house of Parliament.', narration: 'The elected representatives together form the Lok Sabha, the house directly chosen by the people.' },
      { title: 'Majority emerges', description: 'A party or coalition demonstrates support of the House.', narration: 'A party or coalition able to command a majority in the Lok Sabha is positioned to form the government.' },
      { title: 'Government is formed', description: 'The Prime Minister leads the Council of Ministers.', narration: 'The President appoints the Prime Minister, who leads the Council of Ministers and is collectively responsible to the Lok Sabha.' },
    ],
    sources: [
      { title: 'Constitution of India', detail: 'Articles 74–75 · primary source' },
      { title: 'Election Commission of India', detail: 'Electoral process · official source' },
      { title: 'Lok Sabha Secretariat', detail: 'House composition · official source' },
    ],
  },
  history: {
    eyebrow: 'History · map + timeline', title: 'The Indus Valley Civilization',
    subtitle: 'Cities, trade and water systems across the Bronze Age', prompt: 'Teach me about the Indus Valley Civilization',
    steps: [
      { title: 'Early settlements', description: 'Communities grow around the Indus river system.', narration: 'We begin with settlements developing across the greater Indus river system.' },
      { title: 'Urban expansion', description: 'Planned cities emerge across a wide geographic region.', narration: 'Urban centres such as Harappa and Mohenjo-daro develop planned streets and monumental structures.' },
      { title: 'Connected cities', description: 'Weights, seals and goods reveal long-distance exchange.', narration: 'Standardized weights and traded goods reveal connections between distant cities and neighbouring regions.' },
      { title: 'Transformation', description: 'Urban life changes over time rather than ending in one instant.', narration: 'The urban system gradually transforms, with settlements and populations shifting over time.' },
    ],
    sources: [
      { title: 'UNESCO World Heritage Centre', detail: 'Mohenjo-daro · institutional source' },
      { title: 'Archaeological Survey of India', detail: 'Harappan sites · primary archive' },
      { title: 'Peer-reviewed archaeology', detail: 'Urban chronology · research synthesis' },
    ],
  },
  science: {
    eyebrow: 'Biology · zoomable structure', title: 'How blood moves through the heart',
    subtitle: 'A guided journey through chambers, valves and circulation', prompt: 'Show me how the human heart pumps blood',
    steps: [
      { title: 'Blood returns', description: 'Deoxygenated blood enters the right atrium.', narration: 'We start as blood returning from the body enters the right atrium.' },
      { title: 'Into the lungs', description: 'The right ventricle pumps blood toward the lungs.', narration: 'The right ventricle contracts, sending blood through the pulmonary artery toward the lungs.' },
      { title: 'Oxygenated blood', description: 'Blood returns from the lungs to the left atrium.', narration: 'After receiving oxygen, blood returns to the left atrium through the pulmonary veins.' },
      { title: 'Back to the body', description: 'The left ventricle drives blood into the aorta.', narration: 'The powerful left ventricle pumps oxygen-rich blood into the aorta and around the body.' },
    ],
    sources: [
      { title: 'OpenStax Anatomy & Physiology', detail: 'Cardiac anatomy · reviewed textbook' },
      { title: 'NIH / NCBI', detail: 'Circulatory physiology · official source' },
      { title: 'Validated anatomy asset', detail: 'Geometry provenance · pending import' },
    ],
  },
};

function selectLesson(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('civil') || normalized.includes('history') || normalized.includes('indus')) return 'history';
  if (normalized.includes('heart') || normalized.includes('blood') || normalized.includes('biology')) return 'science';
  return 'politics';
}

export default function Home() {
  const [query, setQuery] = useState(lessons.politics.prompt);
  const [lessonKey, setLessonKey] = useState('politics');
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lesson = lessons[lessonKey];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActiveStep((current) => {
      if (current >= lesson.steps.length - 1) { setPlaying(false); return current; }
      return current + 1;
    }), 3400);
    return () => window.clearInterval(timer);
  }, [playing, lesson.steps.length]);

  const progress = useMemo(() => ((activeStep + 1) / lesson.steps.length) * 100, [activeStep, lesson.steps.length]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'start_visual_lesson',
      title: 'Start visual lesson',
      description: 'Start a narrated visual lesson for a learning topic in the visible Anima workspace.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string', minLength: 2 } },
        required: ['topic'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input: unknown) {
        const topic = typeof input === 'object' && input !== null && 'topic' in input
          ? String((input as { topic: unknown }).topic).trim()
          : '';
        if (topic.length < 2) throw new Error('A learning topic is required.');
        const selected = selectLesson(topic);
        setQuery(topic); setLessonKey(selected); setActiveStep(0); setPlaying(true);
        return { status: 'started', topic, visualStrategy: lessons[selected].eyebrow };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  function generateLesson(event: FormEvent) {
    event.preventDefault(); setLessonKey(selectLesson(query)); setActiveStep(0); setPlaying(true);
  }

  return (
    <main className="min-h-screen bg-[#07120f] text-[#eff8f1]">
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 md:px-7">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[#d7ff63] text-[#0c1713] shadow-[0_0_32px_rgba(215,255,99,.18)]"><Layers3 className="size-5" /></div>
          <div><div className="font-semibold tracking-[-0.03em]">Anima</div><div className="text-[10px] uppercase tracking-[.2em] text-emerald-100/45">Visual intelligence</div></div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="border-emerald-200/15 bg-emerald-100/5 text-emerald-50/70"><span className="size-1.5 rounded-full bg-[#d7ff63]" /> Research workspace</Badge>
          <Button variant="ghost" size="icon" className="text-emerald-50/60 hover:bg-white/5 hover:text-white" aria-label="Open workspace menu"><ChevronDown /></Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="hidden border-r border-white/10 p-4 lg:flex lg:flex-col">
          <Button className="h-10 justify-start rounded-xl bg-[#d7ff63] px-4 text-[#0b1712] hover:bg-[#caff42]"><Sparkles /> New exploration</Button>
          <div className="mt-7 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-100/35">Recent lessons</div>
          <nav className="mt-3 space-y-1">
            {[
              ['politics', GitBranch, 'Indian government', 'Flowchart'],
              ['history', Map, 'Indus Valley', 'Map + timeline'],
              ['science', Focus, 'Human heart', 'Zoomable model'],
            ].map(([key, Icon, title, kind]) => (
              <button key={key as string} onClick={() => { setLessonKey(key as string); setQuery(lessons[key as string].prompt); setActiveStep(0); setPlaying(false); }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${lessonKey === key ? 'bg-white/8 text-white' : 'text-emerald-50/55 hover:bg-white/5 hover:text-white'}`}>
                <span className={`grid size-8 place-items-center rounded-lg ${lessonKey === key ? 'bg-[#d7ff63]/15 text-[#d7ff63]' : 'bg-white/5'}`}><Icon className="size-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{title as string}</span><span className="block text-[11px] text-emerald-100/35">{kind as string}</span></span>
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-emerald-200/10 bg-[#0d1c17] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-emerald-50/75"><ShieldCheck className="size-4 text-[#d7ff63]" /> Evidence standard</div>
            <p className="text-xs leading-5 text-emerald-50/40">Every visual claim stays linked to its source and confidence level.</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="border-b border-white/10 px-4 py-4 md:px-6">
            <form onSubmit={generateLesson} className="mx-auto flex max-w-4xl items-center gap-2 rounded-2xl border border-white/10 bg-white/[.055] p-2 shadow-[0_18px_60px_rgba(0,0,0,.18)]">
              <Search className="ml-2 size-4 shrink-0 text-emerald-100/35" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="What do you want to learn?" className="h-9 border-0 bg-transparent px-1 text-sm text-white shadow-none placeholder:text-emerald-100/30 focus-visible:ring-0" placeholder="What do you want to understand?" />
              <Button type="submit" className="h-9 rounded-xl bg-[#d7ff63] px-4 text-[#0b1712] hover:bg-[#caff42]"><Bot /> Build lesson</Button>
            </form>
          </div>

          <div className="relative flex flex-1 flex-col overflow-hidden p-4 md:p-6">
            <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_center,rgba(133,255,184,.18),transparent_46%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:auto,32px_32px,32px_32px]" />
            <div className="relative mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
              <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#d7ff63]/70">{lesson.eyebrow}</div><h1 className="text-2xl font-semibold tracking-[-.04em] md:text-3xl">{lesson.title}</h1><p className="mt-1 text-sm text-emerald-50/45">{lesson.subtitle}</p></div>
              <Button variant="outline" size="icon" className="border-white/10 bg-white/5 text-emerald-50/60 hover:bg-white/10 hover:text-white" aria-label="Expand lesson"><Maximize2 /></Button>
            </div>

            <div className="relative mx-auto my-auto w-full max-w-4xl py-10">
              <div className="absolute left-[10%] right-[10%] top-1/2 h-px -translate-y-1/2 bg-white/10" />
              <div className="absolute left-[10%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-[#d7ff63] to-[#62e7ad] transition-all duration-700" style={{ width: `${(activeStep / (lesson.steps.length - 1)) * 80}%` }} />
              <div className="relative grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 md:gap-5">
                {lesson.steps.map((step, index) => {
                  const complete = index < activeStep; const active = index === activeStep;
                  return (
                    <button key={step.title} onClick={() => { setActiveStep(index); setPlaying(false); }} className="group flex flex-col items-center text-center">
                      <span className={`relative z-10 grid size-14 place-items-center rounded-2xl border transition-all duration-500 ${active ? 'scale-110 border-[#d7ff63] bg-[#d7ff63] text-[#0b1712] shadow-[0_0_42px_rgba(215,255,99,.28)]' : complete ? 'border-[#62e7ad]/40 bg-[#17352a] text-[#84efbd]' : 'border-white/10 bg-[#0b1914] text-emerald-50/35 group-hover:border-white/25'}`}>
                        {complete ? <Check className="size-5" /> : <span className="font-mono text-sm">0{index + 1}</span>}
                        {active && <span className="absolute -inset-2 -z-10 animate-ping rounded-[20px] border border-[#d7ff63]/20" />}
                      </span>
                      <span className={`mt-4 text-sm font-semibold transition ${active ? 'text-white' : 'text-emerald-50/55'}`}>{step.title}</span>
                      <span className={`mt-1 max-w-40 text-xs leading-5 transition ${active ? 'text-emerald-50/55' : 'text-emerald-50/25'}`}>{step.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0a1713]/90 p-3 shadow-[0_20px_70px_rgba(0,0,0,.22)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Button onClick={() => setPlaying((value) => !value)} size="icon-lg" className="rounded-xl bg-[#d7ff63] text-[#0b1712] hover:bg-[#caff42]" aria-label={playing ? 'Pause narration' : 'Play narration'}>{playing ? <Pause /> : <Play className="fill-current" />}</Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-emerald-50/45"><Mic2 className="size-3.5 text-[#d7ff63]" /> Narration · Scene {activeStep + 1} of {lesson.steps.length}</div>
                  <p className="mt-1 truncate text-sm text-emerald-50/80">“{lesson.steps[activeStep].narration}”</p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-[#d7ff63] to-[#62e7ad] transition-all duration-700" style={{ width: `${progress}%` }} /></div>
                </div>
                <Button variant="ghost" size="icon" className="text-emerald-50/45 hover:bg-white/5 hover:text-white" aria-label="Restart lesson" onClick={() => { setActiveStep(0); setPlaying(false); }}><RotateCcw /></Button>
                <Button variant="ghost" size="icon" className="hidden text-emerald-50/45 hover:bg-white/5 hover:text-white sm:inline-flex" aria-label="Volume"><Volume2 /></Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-t border-white/10 bg-[#091612] p-4 lg:border-l lg:border-t-0 lg:p-5">
          <div className="flex items-center justify-between"><div><div className="text-sm font-semibold">Lesson intelligence</div><div className="mt-0.5 text-xs text-emerald-50/35">Grounding and visual plan</div></div><span className="flex size-8 items-center justify-center rounded-full border border-[#d7ff63]/20 bg-[#d7ff63]/10 text-[#d7ff63]"><ShieldCheck className="size-4" /></span></div>
          <div className="mt-6 space-y-2">
            {[
              [BookOpen, 'Knowledge RAG', '3 sources retrieved'],
              [GitBranch, 'Visual strategy', lessonKey === 'science' ? 'Zoomable structure' : lessonKey === 'history' ? 'Map + timeline' : 'Institutional flow'],
              [FileText, 'Coding RAG', '4 verified patterns'],
            ].map(([Icon, title, detail]) => (
              <div key={title as string} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.035] p-3"><span className="grid size-8 place-items-center rounded-lg bg-emerald-100/5 text-emerald-100/55"><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-xs font-medium text-emerald-50/75">{title as string}</span><span className="block truncate text-[11px] text-emerald-50/30">{detail as string}</span></span><Check className="ml-auto size-3.5 text-[#7ce5b3]" /></div>
            ))}
          </div>
          <div className="mt-7 flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-100/35">Evidence</div><Badge variant="outline" className="border-emerald-200/10 text-[10px] text-emerald-50/45">Verified today</Badge></div>
          <div className="mt-3 space-y-4">
            {lesson.sources.map((source, index) => <div key={source.title} className="group flex gap-3"><span className="mt-0.5 font-mono text-[10px] text-[#d7ff63]/55">0{index + 1}</span><div className="min-w-0"><div className="text-xs font-medium leading-5 text-emerald-50/70 group-hover:text-white">{source.title}</div><div className="text-[11px] leading-4 text-emerald-50/28">{source.detail}</div></div></div>)}
          </div>
          <div className="mt-7 rounded-2xl border border-[#d7ff63]/10 bg-gradient-to-br from-[#d7ff63]/8 to-transparent p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[#d7ff63]"><Clock3 className="size-4" /> Live lesson state</div>
            <p className="mt-2 text-xs leading-5 text-emerald-50/40">Narration, camera focus and visual events share one semantic timeline.</p>
            <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-emerald-50/30">{playing ? <CirclePlay className="size-3.5 text-[#d7ff63]" /> : <CirclePause className="size-3.5" />}{playing ? 'Scene playing' : 'Scene paused'} <ArrowRight className="ml-auto size-3.5" /></div>
          </div>
        </aside>
      </div>
    </main>
  );
}
