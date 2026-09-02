'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VisualScene } from '@/lib/visual-schema';
import { PhysicalSceneView } from '@/components/physical-scene';

function flowPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

export function ReferenceSceneView({ scene }: { scene: VisualScene }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeUrl, setActiveUrl] = useState(0);
  const [focused, setFocused] = useState(false);
  const visual = scene.visualAsset;
  const urls = useMemo(() => visual ? [visual.url, ...(visual.fallbackUrls || [])] : [], [visual]);
  const safeId = useMemo(() => scene.id.replace(/[^a-zA-Z0-9_-]/g, '-'), [scene.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFocused(true));
    return () => cancelAnimationFrame(frame);
  }, [scene.id]);

  if (!visual) return <PhysicalSceneView scene={scene} />;
  if (failed) return <div className="relative grid h-full min-h-[420px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,#15362a_0%,#06110d_72%)]" role="img" aria-label={`${scene.title}, visual reference temporarily unavailable`}><div className="max-w-lg px-8 text-center"><div className="mx-auto size-12 animate-pulse rounded-full border border-[#d7ff63]/40 bg-[#d7ff63]/10" /><h3 className="mt-5 text-lg font-semibold">Accurate visual temporarily unavailable</h3><p className="mt-2 text-sm leading-6 text-emerald-50/55">{scene.narration}</p></div></div>;

  const transform = focused
    ? `translate(${50 - scene.camera.x}%, ${50 - scene.camera.y}%) scale(${Math.max(1, scene.camera.zoom)})`
    : 'translate(0%, 0%) scale(1)';

  return (
    <div className="relative flex h-full min-h-[420px] w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#15362a_0%,#06110d_72%)]" role="img" aria-label={`${scene.title}, animated accurate visual reference`}>
      {!loaded && <div className="absolute inset-0 grid place-items-center"><div className="flex items-center gap-2 text-xs uppercase tracking-[.16em] text-emerald-50/35"><span className="size-2 animate-pulse rounded-full bg-[#d7ff63]" />Loading accurate visual reference</div></div>}
      <div className="absolute inset-7 flex items-center justify-center overflow-visible">
        <div className="relative inline-grid max-h-full max-w-full transition-transform duration-[1800ms] ease-out" style={{ transform, transformOrigin: `${scene.camera.x}% ${scene.camera.y}%` }}>
          <img src={urls[activeUrl]} alt={visual.description || scene.title} referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); if (activeUrl < urls.length - 1) setActiveUrl((value) => value + 1); else setFailed(true); }} className={`col-start-1 row-start-1 block max-h-[calc(100vh-300px)] min-h-72 max-w-full rounded-2xl object-contain shadow-[0_28px_90px_rgba(0,0,0,.45)] transition-opacity duration-500 ${loaded ? 'opacity-95' : 'opacity-0'}`} />
          {loaded && <svg className="pointer-events-none col-start-1 row-start-1 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id={`image-glow-${safeId}`}><feGaussianBlur stdDeviation=".8" /></filter>
              <marker id={`image-arrow-${safeId}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="#eafff3" /></marker>
            </defs>
            {scene.imageFlows.map((flow, index) => {
              const path = flowPath(flow.points);
              return <g key={`${flow.label}-${index}`}>
                <path d={path} fill="none" stroke="#06110d" strokeOpacity=".7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d={path} fill="none" stroke={flow.color} strokeWidth=".75" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 1.25" markerEnd={`url(#image-arrow-${safeId})`}>
                  <animate attributeName="stroke-dashoffset" values="0;-6.5" dur={`${Math.max(.8, 2.3 / flow.speed)}s`} repeatCount="indefinite" />
                </path>
                {Array.from({ length: 5 }, (_, particle) => <circle key={particle} r=".8" fill={flow.color} filter={`url(#image-glow-${safeId})`}><animateMotion path={path} begin={`${particle * -.48}s`} dur={`${Math.max(1.3, 3.8 / flow.speed)}s`} repeatCount="indefinite" /></circle>)}
              </g>;
            })}
            {scene.hotspots.map((hotspot, index) => {
              const right = hotspot.x < 65;
              const labelX = Math.max(12, Math.min(88, hotspot.x + (right ? 13 : -13)));
              const labelY = Math.max(7, Math.min(93, hotspot.y + (index % 2 ? 6 : -6)));
              return <g key={hotspot.id}>
                <line x1={hotspot.x} y1={hotspot.y} x2={labelX} y2={labelY} stroke={hotspot.color} strokeWidth=".38" strokeOpacity=".9" />
                <circle cx={hotspot.x} cy={hotspot.y} r="1.5" fill="#06110d" stroke={hotspot.color} strokeWidth=".65" />
                <circle cx={hotspot.x} cy={hotspot.y} r="2.4" fill="none" stroke={hotspot.color} strokeWidth=".35"><animate attributeName="r" values="1.8;3.2;1.8" dur={`${1.8 + index * .12}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="1;.18;1" dur={`${1.8 + index * .12}s`} repeatCount="indefinite" /></circle>
                <rect x={labelX - 8.5} y={labelY - 2.6} width="17" height="5.2" rx="1.2" fill="#06110d" fillOpacity=".88" stroke={hotspot.color} strokeWidth=".28" />
                <text x={labelX} y={labelY + .7} textAnchor="middle" fill="#f3fff7" fontSize="2.1" fontWeight="650">{hotspot.label.slice(0, 18)}</text>
              </g>;
            })}
          </svg>}
        </div>
      </div>
      <div className="pointer-events-none absolute right-5 top-5 rounded-full border border-[#d7ff63]/20 bg-[#07130f]/90 px-3 py-1.5 text-[9px] uppercase tracking-[.14em] text-[#d7ff63]">Reference-accurate view</div>
    </div>
  );
}
