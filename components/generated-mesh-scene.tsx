'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { GeneratedMesh, VisualScene } from '@/lib/visual-schema';

export function GeneratedMeshScene({ scene, mesh }: { scene: VisualScene; mesh: GeneratedMesh }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let observer: ResizeObserver | undefined;
    const disposables: Array<{ dispose(): void }> = [];
    try {
      const world = new THREE.Scene();
      world.background = new THREE.Color('#06110d');
      world.fog = new THREE.FogExp2('#06110d', 0.035);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.domElement.className = 'absolute inset-0 h-full w-full';
      mount.appendChild(renderer.domElement);

      const model = new OBJLoader().parse(mesh.obj);
      let visibleMeshes = 0;
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        visibleMeshes += 1;
        child.geometry.computeVertexNormals();
        const material = new THREE.MeshPhysicalMaterial({ color: '#75dca9', roughness: 0.48, metalness: 0.06, clearcoat: 0.28, side: THREE.DoubleSide });
        child.material = material;
        disposables.push(child.geometry, material);
      });
      if (!visibleMeshes) throw new Error('Generated OBJ has no renderable surface.');
      const initialBounds = new THREE.Box3().setFromObject(model);
      const initialSize = initialBounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) throw new Error('Generated OBJ bounds are invalid.');
      model.position.sub(initialBounds.getCenter(new THREE.Vector3()));
      model.scale.setScalar(4.8 / maxDimension);
      world.add(model);

      world.add(new THREE.HemisphereLight('#eafff4', '#10271e', 3.1));
      const key = new THREE.DirectionalLight('#ffffff', 5); key.position.set(5, 7, 8); world.add(key);
      const rim = new THREE.PointLight('#61c7ff', 26, 25); rim.position.set(-5, 1, -4); world.add(rim);
      const accent = new THREE.PointLight('#d7ff63', 20, 22); accent.position.set(3, -3, 4); world.add(accent);
      const grid = new THREE.GridHelper(14, 28, '#38775d', '#15382b'); grid.position.y = -3; world.add(grid);

      const direction = new THREE.Vector3().fromArray(scene.camera3d.position);
      if (direction.lengthSq() < .1) direction.set(6, 4, 8);
      camera.position.copy(direction.normalize().multiplyScalar(9));
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0); controls.enableDamping = true;
      controls.autoRotate = scene.camera3d.autoRotate; controls.autoRotateSpeed = .7;
      controls.minDistance = 3; controls.maxDistance = 20;

      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, mount.clientWidth); const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize); observer.observe(mount); resize();
      const animate = () => { frame = requestAnimationFrame(animate); controls?.update(); renderer?.render(world, camera); };
      animate();
    } catch (error) {
      console.warn('Unable to render generated mesh.', error);
      setFailed(true);
    }
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose();
      disposables.forEach((item) => item.dispose()); renderer?.dispose(); renderer?.domElement.remove();
    };
  }, [mesh.obj, scene.camera3d]);

  return <div ref={mountRef} className="relative h-full min-h-[420px] w-full cursor-grab overflow-hidden active:cursor-grabbing" role="img" aria-label={`${scene.title}, AI-generated interactive 3D mesh`}>
    {failed && <div className="absolute inset-0 grid place-items-center bg-[#06110d] text-sm text-emerald-50/60">This generated mesh could not be rendered safely.</div>}
    <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-white/10 bg-[#081510]/85 px-3 py-1.5 text-[9px] uppercase tracking-[.14em] text-emerald-50/55">Drag to rotate · scroll to zoom · {mesh.vertexCount} vertices</div>
  </div>;
}
