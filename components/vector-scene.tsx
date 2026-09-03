'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VectorLayer, VisualScene } from '@/lib/visual-schema';

type Point = { x: number; y: number };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function smoothPath(points: Point[], closed: boolean) {
  if (points.length < 2) return '';
  if (!closed) {
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const next = midpoint(points[index], points[index + 1]);
      path += ` Q ${points[index].x} ${points[index].y} ${next.x} ${next.y}`;
    }
    const last = points[points.length - 1];
    return `${path} T ${last.x} ${last.y}`;
  }

  const start = midpoint(points[points.length - 1], points[0]);
  let path = `M ${start.x} ${start.y}`;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const end = midpoint(points[index], next);
    path += ` Q ${points[index].x} ${points[index].y} ${end.x} ${end.y}`;
  }
  return `${path} Z`;
}

function polylinePath(points: Point[]) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

function centerOf(layer: VectorLayer): Point {
  const sum = layer.points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / layer.points.length, y: sum.y / layer.points.length };
}

function motionClass(motion: VectorLayer['motion']) {
  return motion === 'none' ? '' : `vector-motion-${motion}`;
}

export function VectorSceneView({ scene }: { scene: VisualScene }) {
  const [focused, setFocused] = useState(false);
  const safeId = useMemo(() => scene.id.replace(/[^a-zA-Z0-9_-]/g, '-'), [scene.id]);
  const layers = scene.vectorLayers;

  useEffect(() => {
    setFocused(false);
    const frame = requestAnimationFrame(() => setFocused(true));
    return () => cancelAnimationFrame(frame);
  }, [scene.id]);

  const zoom = Math.max(0.85, Math.min(2.2, scene.camera.zoom));
  const cameraTransform = focused
    ? `translate(${50 - scene.camera.x * zoom} ${50 - scene.camera.y * zoom}) scale(${zoom})`
    : 'translate(0 0) scale(1)';

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#14362a_0%,#07140f_54%,#040c09_100%)]" role="img" aria-label={`${scene.title}, generated executable vector animation`}>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id={`vector-grid-${safeId}`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d7ff63" strokeOpacity=".035" strokeWidth=".16" /></pattern>
          <filter id={`vector-glow-${safeId}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.1" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id={`vector-shadow-${safeId}`} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="1.3" stdDeviation="1.8" floodColor="#000" floodOpacity=".6" /></filter>
          <marker id={`vector-arrow-${safeId}`} markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="#eafff3" /></marker>
          {layers.map((layer, index) => <linearGradient key={layer.id} id={`layer-gradient-${safeId}-${index}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={layer.fill} stopOpacity="1" /><stop offset="1" stopColor={layer.fill} stopOpacity=".55" /></linearGradient>)}
        </defs>
        <style>{`
          .vector-camera { transition: transform 1700ms cubic-bezier(.2,.75,.18,1); }
          .vector-part { transform-box: fill-box; transform-origin: center; }
          .vector-motion-pulse { animation: vPulse 2.1s ease-in-out infinite; }
          .vector-motion-contract { animation: vContract 1.3s ease-in-out infinite; }
          .vector-motion-rotate { animation: vRotate 6s linear infinite; }
          .vector-motion-oscillate { animation: vOscillate 2.4s ease-in-out infinite; }
          .vector-motion-open-close { animation: vOpen 1.8s ease-in-out infinite; }
          @keyframes vPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.045); } }
          @keyframes vContract { 0%,100% { transform:scale(1); } 48% { transform:scale(.9,.82); } }
          @keyframes vRotate { to { transform:rotate(360deg); } }
          @keyframes vOscillate { 0%,100% { transform:translateX(-.8px); } 50% { transform:translateX(.8px); } }
          @keyframes vOpen { 0%,100% { transform:scaleX(1); } 50% { transform:scaleX(.68); } }
        `}</style>
        <rect width="100" height="100" fill={`url(#vector-grid-${safeId})`} />
        <circle cx="50" cy="50" r="39" fill="none" stroke="#d7ff63" strokeOpacity=".045" strokeWidth=".35"><animate attributeName="r" values="36;41;36" dur="8s" repeatCount="indefinite" /></circle>
        <g className="vector-camera" style={{ transform: cameraTransform }}>
          <g filter={`url(#vector-shadow-${safeId})`}>
            {layers.map((layer, index) => (
              <path
                key={layer.id}
                d={smoothPath(layer.points, layer.closed)}
                className={`vector-part ${motionClass(layer.motion)}`}
                fill={layer.closed ? `url(#layer-gradient-${safeId}-${index})` : 'none'}
                fillOpacity={layer.opacity}
                stroke={layer.stroke}
                strokeOpacity={Math.min(1, layer.opacity + .12)}
                strokeWidth={Math.max(.35, .58 * layer.emphasis)}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pathLength="1"
                strokeDasharray="1"
              >
                <animate attributeName="stroke-dashoffset" from="1" to="0" dur={`${.8 + index * .16}s`} fill="freeze" />
              </path>
            ))}
          </g>

          {scene.imageFlows.map((flow, index) => {
            const path = polylinePath(flow.points);
            const duration = Math.max(1.2, 3.8 / flow.speed);
            const middle = flow.points[Math.floor(flow.points.length / 2)];
            return (
              <g key={`${flow.label}-${index}`}>
                <path d={path} fill="none" stroke="#03100b" strokeOpacity=".75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d={path} fill="none" stroke={flow.color} strokeWidth=".72" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 1.2" markerEnd={`url(#vector-arrow-${safeId})`}>
                  <animate attributeName="stroke-dashoffset" values="0;-6.4" dur={`${Math.max(.65, 1.8 / flow.speed)}s`} repeatCount="indefinite" />
                </path>
                {Array.from({ length: 7 }, (_, particle) => <circle key={particle} r=".7" fill={flow.color} filter={`url(#vector-glow-${safeId})`}><animateMotion path={path} begin={`${particle * -duration / 7}s`} dur={`${duration}s`} repeatCount="indefinite" /></circle>)}
                {middle && <text x={middle.x} y={middle.y - 2.4} textAnchor="middle" fill={flow.color} fontSize="2.1" fontWeight="650" paintOrder="stroke" stroke="#06110d" strokeWidth=".8">{flow.label.slice(0, 24)}</text>}
              </g>
            );
          })}

          {scene.hotspots.slice(0, 6).map((hotspot, index) => {
            const right = hotspot.x < 60;
            const labelX = Math.max(13, Math.min(87, hotspot.x + (right ? 15 : -15)));
            const labelY = Math.max(8, Math.min(92, hotspot.y + (index % 2 ? 7 : -7)));
            return (
              <g key={hotspot.id}>
                <path d={`M ${hotspot.x} ${hotspot.y} L ${labelX} ${labelY}`} stroke={hotspot.color} strokeWidth=".35" strokeOpacity=".75" />
                <circle cx={hotspot.x} cy={hotspot.y} r="1.2" fill="#06110d" stroke={hotspot.color} strokeWidth=".55" />
                <circle cx={hotspot.x} cy={hotspot.y} r="1.8" fill="none" stroke={hotspot.color} strokeWidth=".28"><animate attributeName="r" values="1.6;3;1.6" dur={`${1.7 + index * .15}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="1;.12;1" dur={`${1.7 + index * .15}s`} repeatCount="indefinite" /></circle>
                <text x={labelX} y={labelY + .65} textAnchor="middle" fill="#f2fff7" fontSize="2" fontWeight="650" paintOrder="stroke" stroke="#06110d" strokeWidth="1.25">{hotspot.label.slice(0, 22)}</text>
              </g>
            );
          })}

          {layers.slice(0, 5).map((layer, index) => {
            const center = centerOf(layer);
            return <circle key={`${layer.id}-signal`} cx={center.x} cy={center.y} r={Math.max(.2, .3 * layer.emphasis)} fill={layer.stroke} opacity=".8"><animate attributeName="opacity" values=".2;.95;.2" dur={`${1.8 + index * .22}s`} repeatCount="indefinite" /></circle>;
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-2 rounded-full border border-[#d7ff63]/20 bg-[#07130f]/88 px-3 py-1.5 text-[9px] uppercase tracking-[.14em] text-[#d7ff63]"><span className="size-1.5 animate-pulse rounded-full bg-[#d7ff63]" />Executable vector scene</div>
    </div>
  );
}
