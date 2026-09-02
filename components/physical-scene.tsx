'use client';

import { useEffect, useRef } from 'react';
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
  context.fillStyle = 'rgba(5, 17, 13, .86)';
  context.roundRect(8, 8, 496, 96, 24); context.fill();
  context.strokeStyle = color; context.lineWidth = 3; context.stroke();
  context.fillStyle = '#f0fff6'; context.font = '600 30px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(label.slice(0, 28), 256, 57);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.9, 0.64, 1);
  return sprite;
}

export function PhysicalSceneView({ scene }: { scene: VisualScene }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const world = new THREE.Scene();
    world.background = new THREE.Color('#06110d');
    world.fog = new THREE.FogExp2('#06110d', 0.035);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.fromArray(scene.camera3d.position);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = scene.camera3d.autoRotate;
    controls.autoRotateSpeed = 0.65;
    controls.target.fromArray(scene.camera3d.target);
    controls.minDistance = 3; controls.maxDistance = 20;

    world.add(new THREE.HemisphereLight('#cffff0', '#163026', 2.2));
    const key = new THREE.DirectionalLight('#ffffff', 3.8); key.position.set(5, 8, 6); world.add(key);
    const rim = new THREE.PointLight('#74f7b6', 28, 18); rim.position.set(-5, 2, -3); world.add(rim);
    const floor = new THREE.GridHelper(24, 24, '#214c3b', '#102a21'); floor.position.y = -3.2; world.add(floor);

    const root = new THREE.Group();
    world.add(root);
    const objectMap = new Map<string, THREE.Mesh>();
    const animated: Array<{ mesh: THREE.Mesh; spec: PhysicalObject; phase: number }> = [];
    const disposables: Array<{ dispose(): void }> = [];
    const clipping = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.05);

    scene.objects.forEach((object, index) => {
      const geometry = geometryFor(object); disposables.push(geometry);
      const material = new THREE.MeshPhysicalMaterial({
        color: object.color,
        roughness: object.roughness,
        metalness: object.metalness,
        transparent: object.opacity < 1,
        opacity: object.opacity,
        transmission: object.opacity < 0.72 ? 0.18 : 0,
        clearcoat: 0.45,
        side: THREE.DoubleSide,
        clippingPlanes: object.cutaway ? [clipping] : [],
      });
      disposables.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(object.position);
      mesh.scale.fromArray(object.scale);
      mesh.rotation.set(...object.rotation);
      mesh.castShadow = true;
      root.add(mesh); objectMap.set(object.id, mesh);
      const label = labelSprite(object.label, object.color);
      if (label) { label.position.set(object.position[0], object.position[1] + object.scale[1] + 0.7, object.position[2]); root.add(label); disposables.push(label.material.map!, label.material); }
      animated.push({ mesh, spec: object, phase: index * 0.8 });
    });

    const flowParticles: Array<{ mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; offset: number; speed: number }> = [];
    scene.flows.forEach((flow) => {
      const from = objectMap.get(flow.from); const to = objectMap.get(flow.to);
      if (!from || !to) return;
      const start = from.position.clone(); const end = to.position.clone();
      const middle = start.clone().lerp(end, 0.5); middle.y += Math.max(0.6, start.distanceTo(end) * 0.22);
      const curve = new THREE.CatmullRomCurve3([start, middle, end]);
      const tubeGeometry = new THREE.TubeGeometry(curve, 48, 0.035, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({ color: flow.color, transparent: true, opacity: 0.28 });
      root.add(new THREE.Mesh(tubeGeometry, tubeMaterial)); disposables.push(tubeGeometry, tubeMaterial);
      for (let index = 0; index < flow.particleCount; index++) {
        const geometry = new THREE.SphereGeometry(0.09, 12, 8);
        const material = new THREE.MeshBasicMaterial({ color: flow.color });
        const particle = new THREE.Mesh(geometry, material); root.add(particle); disposables.push(geometry, material);
        flowParticles.push({ mesh: particle, curve, offset: index / flow.particleCount, speed: flow.speed });
      }
    });

    const resize = () => {
      const width = Math.max(1, mount.clientWidth); const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    const clock = new THREE.Clock(); let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      animated.forEach(({ mesh, spec, phase }) => {
        if (spec.motion === 'rotate') mesh.rotation.y += 0.008;
        if (spec.motion === 'pulse') { const pulse = 1 + Math.sin(time * 2.2 + phase) * 0.055; mesh.scale.set(spec.scale[0] * pulse, spec.scale[1] * pulse, spec.scale[2] * pulse); }
        if (spec.motion === 'oscillate') mesh.position.y = spec.position[1] + Math.sin(time * 1.8 + phase) * 0.18;
      });
      flowParticles.forEach((particle) => particle.mesh.position.copy(particle.curve.getPoint((particle.offset + time * particle.speed * 0.12) % 1)));
      controls.update(); renderer.render(world, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      disposables.forEach((item) => item.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [scene]);

  return <div ref={mountRef} className="h-full min-h-[420px] w-full cursor-grab active:cursor-grabbing" role="img" aria-label={`${scene.title}, interactive 3D scene`} />;
}
