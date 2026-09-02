'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PhysicalObject, VisualScene } from '@/lib/visual-schema';

function geometryFor(object: PhysicalObject) {
  switch (object.primitive) {
    case 'sphere': return new THREE.SphereGeometry(1, 48, 32);
    case 'cylinder': return new THREE.CylinderGeometry(0.72, 0.72, 2, 40);
    case 'cone': return new THREE.ConeGeometry(0.9, 2, 40);
    case 'torus': return new THREE.TorusGeometry(0.82, 0.25, 24, 64);
    case 'capsule': return new THREE.CapsuleGeometry(0.65, 1.2, 12, 32);
    case 'tube': return new THREE.CylinderGeometry(0.38, 0.38, 2.2, 32);
    default: return new THREE.BoxGeometry(1.7, 1.7, 1.7, 3, 3, 3);
  }
}

function labelSprite(label: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 112;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(5, 17, 13, .9)';
  context.beginPath();
  if ('roundRect' in context) context.roundRect(8, 8, 496, 96, 24);
  else context.rect(8, 8, 496, 96);
  context.fill();
  context.strokeStyle = color; context.lineWidth = 3; context.stroke();
  context.fillStyle = '#f0fff6'; context.font = '600 30px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(label.slice(0, 28), 256, 57);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.9, 0.64, 1);
  return sprite;
}

function project(object: PhysicalObject) {
  return {
    x: Math.max(10, Math.min(90, 50 + object.position[0] * 6.2 + object.position[2] * 1.2)),
    y: Math.max(16, Math.min(84, 52 - object.position[1] * 7)),
    rx: Math.max(3.8, Math.min(12, object.scale[0] * 5.2)),
    ry: Math.max(4.5, Math.min(14, object.scale[1] * 5.8)),
  };
}

function PhysicalFallback({ scene, visible }: { scene: VisualScene; visible: boolean }) {
  const points = useMemo(() => new Map(scene.objects.map((object) => [object.id, project(object)])), [scene]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden="true">
      <defs>
        <radialGradient id={`glow-${scene.id}`}><stop offset="0" stopColor="#143b2d" /><stop offset="1" stopColor="#06110d" /></radialGradient>
        <filter id={`soft-${scene.id}`}><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      <rect width="100" height="100" fill={`url(#glow-${scene.id})`} />
      <g opacity=".2" stroke="#65e9ae" strokeWidth=".12">
        {Array.from({ length: 12 }, (_, index) => <line key={`v-${index}`} x1={index * 9} x2={index * 9} y1="0" y2="100" />)}
        {Array.from({ length: 10 }, (_, index) => <line key={`h-${index}`} x1="0" x2="100" y1={index * 11} y2={index * 11} />)}
      </g>
      {scene.flows.map((flow, index) => {
        const from = points.get(flow.from); const to = points.get(flow.to);
        if (!from || !to) return null;
        const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 8} ${to.x} ${to.y}`;
        return <g key={`${flow.from}-${flow.to}-${index}`}>
          <path d={path} fill="none" stroke={flow.color} strokeWidth=".75" strokeOpacity=".42" strokeDasharray="2 1.5">
            <animate attributeName="stroke-dashoffset" values="0;-7" dur={`${Math.max(.8, 2.2 / flow.speed)}s`} repeatCount="indefinite" />
          </path>
          {Array.from({ length: Math.min(5, flow.particleCount) }, (_, particleIndex) => <circle key={particleIndex} r=".75" fill={flow.color} filter={`url(#soft-${scene.id})`}>
            <animateMotion path={path} begin={`${particleIndex * -.42}s`} dur={`${Math.max(1.2, 3.6 / flow.speed)}s`} repeatCount="indefinite" />
          </circle>)}
        </g>;
      })}
      {scene.objects.map((object, index) => {
        const point = points.get(object.id)!;
        const animate = object.motion !== 'none';
        return <g key={object.id}>
          <ellipse cx={point.x} cy={point.y} rx={point.rx * 1.35} ry={point.ry * 1.35} fill={object.color} opacity=".12" filter={`url(#soft-${scene.id})`} />
          {object.primitive === 'box' ?
            <rect x={point.x - point.rx} y={point.y - point.ry} width={point.rx * 2} height={point.ry * 2} rx="2" fill={object.color} fillOpacity={Math.max(.32, object.opacity * .72)} stroke={object.color} strokeWidth=".7" /> :
            <ellipse cx={point.x} cy={point.y} rx={point.rx} ry={point.ry} fill={object.color} fillOpacity={Math.max(.32, object.opacity * .72)} stroke="#effff6" strokeOpacity=".55" strokeWidth=".45">
              {animate && <animate attributeName="ry" values={`${point.ry};${point.ry * 1.08};${point.ry}`} dur={`${1.6 + index * .13}s`} repeatCount="indefinite" />}
            </ellipse>}
          {object.cutaway && <path d={`M ${point.x} ${point.y - point.ry} A ${point.rx} ${point.ry} 0 0 1 ${point.x} ${point.y + point.ry} Z`} fill="#06110d" fillOpacity=".7" stroke={object.color} strokeWidth=".35" />}
          <text x={point.x} y={point.y + point.ry + 4.2} textAnchor="middle" fill="#effff6" fontSize="2.6" fontWeight="600">{object.label.slice(0, 22)}</text>
        </g>;
      })}
      <g transform="translate(50 93)"><circle r="1.2" fill="#d7ff63"><animate attributeName="opacity" values=".25;1;.25" dur="1.4s" repeatCount="indefinite" /></circle><text x="3" y="1" fill="#dff7e8" fontSize="2.4">Live coded animation</text></g>
    </svg>
  );
}

export function PhysicalSceneView({ scene }: { scene: VisualScene }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererState, setRendererState] = useState<'starting' | 'ready' | 'fallback'>('starting');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setRendererState('starting');
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let disposed = false;
    const disposables: Array<{ dispose(): void }> = [];

    try {
      const world = new THREE.Scene();
      world.background = new THREE.Color('#06110d');
      world.fog = new THREE.FogExp2('#06110d', 0.026);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.localClippingEnabled = true;
      renderer.domElement.className = 'absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500';
      renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setRendererState('fallback'); });
      mount.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = scene.camera3d.autoRotate;
      controls.autoRotateSpeed = 0.65;
      controls.minDistance = 2; controls.maxDistance = 40;

      world.add(new THREE.HemisphereLight('#d8fff0', '#163026', 3));
      const key = new THREE.DirectionalLight('#ffffff', 4.8); key.position.set(5, 8, 6); world.add(key);
      const rim = new THREE.PointLight('#74f7b6', 36, 30); rim.position.set(-5, 2, -3); world.add(rim);
      const fill = new THREE.PointLight('#61c7ff', 22, 25); fill.position.set(4, -2, 5); world.add(fill);

      const root = new THREE.Group();
      world.add(root);
      const objectMap = new Map<string, THREE.Mesh>();
      const animated: Array<{ mesh: THREE.Mesh; spec: PhysicalObject; phase: number }> = [];
      const clipping = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.05);

      scene.objects.forEach((object, index) => {
        const geometry = geometryFor(object); disposables.push(geometry);
        const material = new THREE.MeshPhysicalMaterial({ color: object.color, emissive: object.color, emissiveIntensity: .06, roughness: object.roughness, metalness: object.metalness, transparent: object.opacity < 1, opacity: object.opacity, transmission: object.opacity < 0.72 ? 0.12 : 0, clearcoat: 0.5, side: THREE.DoubleSide, clippingPlanes: object.cutaway ? [clipping] : [] });
        disposables.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.fromArray(object.position); mesh.scale.fromArray(object.scale); mesh.rotation.set(...object.rotation);
        root.add(mesh); objectMap.set(object.id, mesh);
        const label = labelSprite(object.label, object.color);
        if (label) { label.position.set(object.position[0], object.position[1] + object.scale[1] + 0.7, object.position[2]); root.add(label); if (label.material.map) disposables.push(label.material.map); disposables.push(label.material); }
        animated.push({ mesh, spec: object, phase: index * 0.8 });
      });

      const flowParticles: Array<{ mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number; speed: number }> = [];
      scene.flows.forEach((flow) => {
        const from = objectMap.get(flow.from); const to = objectMap.get(flow.to);
        if (!from || !to) return;
        const start = from.position.clone(); const end = to.position.clone();
        const middle = start.clone().lerp(end, 0.5); middle.y += Math.max(0.6, start.distanceTo(end) * 0.22);
        const curve = new THREE.CatmullRomCurve3([start, middle, end]);
        const tubeGeometry = new THREE.TubeGeometry(curve, 48, 0.045, 8, false);
        const tubeMaterial = new THREE.MeshBasicMaterial({ color: flow.color, transparent: true, opacity: 0.4 });
        root.add(new THREE.Mesh(tubeGeometry, tubeMaterial)); disposables.push(tubeGeometry, tubeMaterial);
        for (let index = 0; index < flow.particleCount; index++) {
          const geometry = new THREE.SphereGeometry(0.11, 12, 8); const material = new THREE.MeshBasicMaterial({ color: flow.color });
          const particle = new THREE.Mesh(geometry, material); root.add(particle); disposables.push(geometry, material);
          flowParticles.push({ mesh: particle, curve, offset: index / flow.particleCount, speed: flow.speed });
        }
      });

      const bounds = new THREE.Box3().setFromObject(root);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(2.5, size.length() * .58);
      const requestedDirection = new THREE.Vector3().fromArray(scene.camera3d.position).sub(new THREE.Vector3().fromArray(scene.camera3d.target));
      if (requestedDirection.lengthSq() < .01) requestedDirection.set(1, .65, 1);
      requestedDirection.normalize();
      camera.position.copy(center).add(requestedDirection.multiplyScalar(radius * 2.25));
      camera.near = Math.max(.05, radius / 100); camera.far = Math.max(80, radius * 20); camera.updateProjectionMatrix();
      controls.target.copy(center); camera.lookAt(center);
      const floor = new THREE.GridHelper(Math.max(24, radius * 5), 24, '#2f7657', '#153628'); floor.position.y = bounds.min.y - .8; world.add(floor);

      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, mount.clientWidth); const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize); observer.observe(mount); resize();
      const clock = new THREE.Clock(); let rendered = false;
      const animate = () => {
        if (disposed || !renderer || !controls) return;
        frame = requestAnimationFrame(animate);
        const time = clock.getElapsedTime();
        animated.forEach(({ mesh, spec, phase }) => {
          if (spec.motion === 'rotate') mesh.rotation.y += 0.008;
          if (spec.motion === 'pulse') { const pulse = 1 + Math.sin(time * 2.2 + phase) * 0.055; mesh.scale.set(spec.scale[0] * pulse, spec.scale[1] * pulse, spec.scale[2] * pulse); }
          if (spec.motion === 'oscillate') mesh.position.y = spec.position[1] + Math.sin(time * 1.8 + phase) * 0.18;
        });
        flowParticles.forEach((particle) => particle.mesh.position.copy(particle.curve.getPoint((particle.offset + time * particle.speed * 0.12) % 1)));
        controls.update(); renderer.render(world, camera);
        if (!rendered) { rendered = true; renderer.domElement.classList.remove('opacity-0'); setRendererState('ready'); }
      };
      animate();
    } catch {
      setRendererState('fallback');
    }

    return () => {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose();
      disposables.forEach((item) => item.dispose()); renderer?.dispose(); renderer?.domElement.remove();
    };
  }, [scene]);

  return <div ref={mountRef} className="relative h-full min-h-[420px] w-full cursor-grab overflow-hidden active:cursor-grabbing" role="img" aria-label={`${scene.title}, interactive 3D scene`}>
    <PhysicalFallback scene={scene} visible={rendererState !== 'ready'} />
    {rendererState === 'fallback' && <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-[#d7ff63]/20 bg-[#081510]/85 px-3 py-1 text-[9px] uppercase tracking-[.14em] text-[#d7ff63]">Compatible live view</div>}
  </div>;
}
