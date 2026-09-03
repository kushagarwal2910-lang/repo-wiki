import { retrieveWorkspace } from './database';
import type { VisualReferenceCandidate } from './tavily';
import { generateLlamaMesh } from './llama-mesh';
import type { ImageFlow, PhysicalFlow, PhysicalObject, VectorLayer, VisualEdge, VisualHotspot, VisualLesson, VisualNode, VisualScene } from './visual-schema';

const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured for this deployment.');
  return key;
}

async function groqRequest(body: Record<string, unknown>) {
  const response = await fetch(GROQ_CHAT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || `Groq request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

export async function generateVisualLesson(workspaceId: string, question: string): Promise<VisualLesson> {
  const { workspace, chunks } = await retrieveWorkspace(workspaceId, question);
  const evidenceSentences = extractEvidenceSentences(chunks.map((chunk) => chunk.content));
  const evidence = chunks.slice(0, 6).map((chunk, index) => `[E${index + 1}] ${chunk.content.slice(0, 700)}`).join('\n\n');
  const prompt = `You are Anima's grounded lesson director. Use only the retrieved evidence.\n\nTOPIC: ${workspace.topic}\nQUESTION: ${question}\n\nRETRIEVED EVIDENCE:\n${evidence}\n\nChoose visualMode mesh3d only when the central subject is a concrete physical object, organism, anatomical structure, machine, material, or spatial structure whose shape genuinely helps explain it. Choose diagram for politics, history, arguments, timelines, systems, comparisons, processes without a single meaningful physical form, and vague concepts. Never force an abstract subject into a 3D object.\n\nReturn JSON: {"title":"...","subtitle":"...","visualMode":"mesh3d|diagram","meshDescription":"one concise physically accurate description of the object to generate","strategy":"flow|timeline|network|cycle|comparison|layers","sourceSummary":"...","scenes":[{"id":"scene-1","title":"...","narration":"under 55 words","durationSeconds":10,"renderMode":"mesh3d|diagram","camera":{"x":50,"y":50,"zoom":1.1},"camera3d":{"position":[6,4,8],"target":[0,0,0],"autoRotate":true},"nodes":[{"id":"n1","label":"...","detail":"...","x":20,"y":50,"shape":"rounded","color":"lime"}],"edges":[{"from":"n1","to":"n2","label":"...","animated":true}],"focusNodeIds":["n1"]}]} Produce exactly 3 progressive scenes. Narration must match the visible explanation and preserve uncertainty. Output JSON only.`;

  try {
    const data = await groqRequest({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'Return a grounded, accurate JSON visual program. Never include markdown fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 3400,
      response_format: { type: 'json_object' },
    });
    const content = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content || '';
    const parsed = parseModelJson(content);
    const lesson = normalizeVisualLesson(parsed, workspace.topic, question, evidenceSentences, []);
    return finalizeExecutableLesson(lesson, stringValue(record(parsed).meshDescription, `${workspace.topic}: ${question}`));
  } catch (error) {
    console.warn('Text compiler unavailable; using grounded fallback.', error instanceof Error ? error.message : 'unknown error');
    return buildGroundedFallback(workspace.topic, question, evidenceSentences);
  }
}

type JsonRecord = Record<string, unknown>;

const strategies = ['flow', 'timeline', 'network', 'cycle', 'comparison', 'layers'] as const;
const visualModes = ['mesh3d', 'vector2d', 'reference2d', 'physical3d', 'spatial2d', 'diagram'] as const;
const shapes = ['circle', 'rounded', 'pill'] as const;
const colors = ['lime', 'mint', 'blue', 'amber', 'coral', 'violet'] as const;
const primitives = ['sphere', 'box', 'cylinder', 'cone', 'torus', 'capsule', 'tube'] as const;
const motions = ['none', 'rotate', 'pulse', 'oscillate'] as const;
const vectorMotions = ['none', 'pulse', 'contract', 'rotate', 'oscillate', 'open-close'] as const;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 700) : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function vector3(value: unknown, fallback: [number, number, number], min: number, max: number): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    numberValue(value[0], fallback[0], min, max),
    numberValue(value[1], fallback[1], min, max),
    numberValue(value[2], fallback[2], min, max),
  ];
}

function colorValue(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && options.includes(value) ? value as T[number] : fallback;
}

function cleanSentence(value: string) {
  return value.replace(/https?:\/\/\S+/g, '').replace(/[#*_`>|]/g, ' ').replaceAll('[', ' ').replaceAll(']', ' ').replace(/\s+/g, ' ').trim();
}

function extractEvidenceSentences(contents: string[]) {
  const seen = new Set<string>();
  const sentences: string[] = [];
  for (const content of contents) {
    for (const raw of content.split(/(?<=[.!?])\s+|\n+/)) {
      const sentence = cleanSentence(raw);
      if (sentence.length < 35 || sentence.length > 320) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push(sentence);
      if (sentences.length === 24) return sentences;
    }
  }
  return sentences;
}

function shortLabel(value: string, fallback: string) {
  const cleaned = cleanSentence(value).replace(/^Source:\s*/i, '');
  if (!cleaned) return fallback;
  return cleaned.split(/\s+/).slice(0, 6).join(' ').replace(/[,:;.!?]+$/, '').slice(0, 54);
}

function parseModelJson(content: string): unknown {
  if (!content.trim()) return {};
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    const first = content.indexOf('{');
    const last = content.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(content.slice(first, last + 1)); } catch { return {}; }
    }
    return {};
  }
}

function groundedSentence(sentences: string[], index: number, fallback: string) {
  return sentences.length ? sentences[index % sentences.length] : fallback;
}

function fallbackNodes(sceneIndex: number, sentences: string[]): VisualNode[] {
  return [0, 1, 2].map((offset) => {
    const detail = groundedSentence(sentences, sceneIndex * 3 + offset, 'This point follows from the retrieved material for the learner’s question.');
    return {
      id: `scene-${sceneIndex + 1}-node-${offset + 1}`,
      label: shortLabel(detail, `Evidence point ${offset + 1}`),
      detail,
      x: [18, 50, 82][offset],
      y: [42, 58, 42][offset],
      shape: shapes[offset % shapes.length],
      color: colors[(sceneIndex * 2 + offset) % colors.length],
    };
  });
}

function objectsFromNodes(nodes: VisualNode[], sceneIndex: number): PhysicalObject[] {
  return nodes.map((node, index) => ({
    id: node.id,
    label: node.label,
    detail: node.detail,
    primitive: (['sphere', 'capsule', 'box'] as const)[index % 3],
    position: [(node.x - 50) / 11, (50 - node.y) / 13, (index % 2 ? -0.6 : 0.6) + sceneIndex * 0.05],
    scale: [0.9, 0.9, 0.9],
    rotation: [0, 0, 0],
    color: ['#d7ff63', '#61c7ff', '#ff8b7c', '#b9a0ff'][index % 4],
    opacity: 0.92,
    roughness: 0.5,
    metalness: 0.05,
    motion: index === 0 ? 'pulse' : 'none',
    cutaway: false,
  }));
}

function normalizePhysicalObjects(value: unknown, sceneIndex: number, sentences: string[], fallback: VisualNode[]) {
  const rawObjects = Array.isArray(value) ? value.slice(0, 14) : [];
  const usedIds = new Set<string>();
  const objects = rawObjects.map((entry, index): PhysicalObject => {
    const raw = record(entry);
    let id = stringValue(raw.id, `part-${sceneIndex + 1}-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    return {
      id,
      label: stringValue(raw.label, `Part ${index + 1}`).slice(0, 80),
      detail: stringValue(raw.detail, groundedSentence(sentences, sceneIndex * 3 + index, 'Grounded physical component.')),
      primitive: oneOf(raw.primitive, primitives, 'sphere'),
      position: vector3(raw.position, [(index - (rawObjects.length - 1) / 2) * 1.8, 0, 0], -8, 8),
      scale: vector3(raw.scale, [1, 1, 1], 0.12, 5),
      rotation: vector3(raw.rotation, [0, 0, 0], -Math.PI * 2, Math.PI * 2),
      color: colorValue(raw.color, ['#d7ff63', '#61c7ff', '#ff8b7c', '#b9a0ff'][index % 4]),
      opacity: numberValue(raw.opacity, 0.95, 0.15, 1),
      roughness: numberValue(raw.roughness, 0.55, 0, 1),
      metalness: numberValue(raw.metalness, 0.05, 0, 1),
      motion: oneOf(raw.motion, motions, 'none'),
      cutaway: raw.cutaway === true,
    };
  });
  return objects.length >= 2 ? objects : objectsFromNodes(fallback, sceneIndex);
}

function normalizeFlows(value: unknown, objects: PhysicalObject[]): PhysicalFlow[] {
  const ids = new Set(objects.map((object) => object.id));
  const rawFlows = Array.isArray(value) ? value : [];
  const flows = rawFlows.flatMap((entry): PhysicalFlow[] => {
    const raw = record(entry); const from = stringValue(raw.from, ''); const to = stringValue(raw.to, '');
    if (!ids.has(from) || !ids.has(to) || from === to) return [];
    return [{
      from, to,
      label: stringValue(raw.label, 'flow').slice(0, 80),
      color: colorValue(raw.color, '#61c7ff'),
      speed: numberValue(raw.speed, 1, 0.2, 4),
      particleCount: Math.round(numberValue(raw.particleCount, 7, 2, 18)),
    }];
  }).slice(0, 18);
  if (flows.length) return flows;
  return objects.slice(0, -1).map((object, index) => ({ from: object.id, to: objects[index + 1].id, label: 'flow', color: '#61c7ff', speed: 1, particleCount: 7 }));
}

function normalizeHotspots(value: unknown, fallback: VisualNode[]): VisualHotspot[] {
  const rawHotspots = Array.isArray(value) ? value.slice(0, 10) : [];
  const hotspots = rawHotspots.map((entry, index): VisualHotspot => {
    const raw = record(entry);
    return {
      id: stringValue(raw.id, `hotspot-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64),
      label: stringValue(raw.label, `Feature ${index + 1}`).slice(0, 80),
      detail: stringValue(raw.detail, 'Visible feature identified from the reference.').slice(0, 300),
      x: numberValue(raw.x, fallback[index % fallback.length]?.x || 50, 2, 98),
      y: numberValue(raw.y, fallback[index % fallback.length]?.y || 50, 2, 98),
      color: colorValue(raw.color, ['#d7ff63', '#61c7ff', '#ff8b7c', '#b9a0ff'][index % 4]),
    };
  });
  return hotspots.length ? hotspots : fallback.slice(0, 4).map((node, index) => ({ id: `hotspot-${index + 1}`, label: node.label, detail: node.detail, x: node.x, y: node.y, color: ['#d7ff63', '#61c7ff', '#ff8b7c', '#b9a0ff'][index % 4] }));
}

function normalizeImageFlows(value: unknown, hotspots: VisualHotspot[]): ImageFlow[] {
  const rawFlows = Array.isArray(value) ? value.slice(0, 8) : [];
  const flows = rawFlows.flatMap((entry, flowIndex): ImageFlow[] => {
    const raw = record(entry);
    const rawPoints = Array.isArray(raw.points) ? raw.points.slice(0, 12) : [];
    const points = rawPoints.map((point) => record(point)).map((point) => ({ x: numberValue(point.x, 50, 1, 99), y: numberValue(point.y, 50, 1, 99) }));
    if (points.length < 2) return [];
    return [{ label: stringValue(raw.label, `Flow ${flowIndex + 1}`).slice(0, 80), color: colorValue(raw.color, '#61c7ff'), speed: numberValue(raw.speed, 1, 0.2, 4), points }];
  });
  if (flows.length || hotspots.length < 2) return flows;
  return [{ label: 'movement', color: '#61c7ff', speed: 1, points: hotspots.map(({ x, y }) => ({ x, y })) }];
}

function normalizeVectorLayers(value: unknown): VectorLayer[] {
  const rawLayers = Array.isArray(value) ? value.slice(0, 14) : [];
  const usedIds = new Set<string>();
  return rawLayers.flatMap((entry, layerIndex): VectorLayer[] => {
    const raw = record(entry);
    const rawPoints = Array.isArray(raw.points) ? raw.points.slice(0, 30) : [];
    const points = rawPoints.map((point) => record(point)).map((point) => ({ x: numberValue(point.x, 50, 1, 99), y: numberValue(point.y, 50, 1, 99) }));
    const closed = raw.closed !== false;
    if (points.length < (closed ? 3 : 2)) return [];
    let id = stringValue(raw.id, `layer-${layerIndex + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
    if (usedIds.has(id)) id = `${id}-${layerIndex + 1}`;
    usedIds.add(id);
    return [{
      id,
      label: stringValue(raw.label, `Layer ${layerIndex + 1}`).slice(0, 80),
      detail: stringValue(raw.detail, 'Generated visible component.').slice(0, 300),
      points,
      closed,
      fill: colorValue(raw.fill, ['#d94b64', '#4d8fd8', '#d7ff63', '#bd82ef', '#f29b54'][layerIndex % 5]),
      stroke: colorValue(raw.stroke, '#ecfff4'),
      opacity: numberValue(raw.opacity, 0.86, 0.12, 1),
      motion: oneOf(raw.motion, vectorMotions, 'none'),
      emphasis: numberValue(raw.emphasis, 1, 0.35, 2),
    }];
  });
}

function usefulHotspotLabel(label: string) {
  const words = label.split(/\s+/).filter(Boolean);
  return words.length <= 5 && !/^(the|this|that|these|those|during|when|first|second|third|it|there|here)\b/i.test(label);
}

function hotspotsFromVectorLayers(layers: VectorLayer[]): VisualHotspot[] {
  return layers.slice(0, 5).map((layer, index) => {
    const center = layer.points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return {
      id: `traced-${layer.id}`,
      label: layer.label,
      detail: layer.detail,
      x: center.x / layer.points.length,
      y: center.y / layer.points.length,
      color: ['#d7ff63', '#61c7ff', '#ff8b7c', '#b9a0ff', '#ffc861'][index % 5],
    };
  });
}

function normalizeScene(value: unknown, sceneIndex: number, sentences: string[], references: VisualReferenceCandidate[] = [], defaultAssetIndex = -1): VisualScene {
  const raw = record(value);
  const sceneId = stringValue(raw.id, `scene-${sceneIndex + 1}`);
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes.slice(0, 10) : [];
  const usedIds = new Set<string>();
  const nodes = rawNodes.map((entry, nodeIndex): VisualNode => {
    const node = record(entry);
    let id = stringValue(node.id, `${sceneId}-node-${nodeIndex + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
    if (usedIds.has(id)) id = `${id}-${nodeIndex + 1}`;
    usedIds.add(id);
    const detail = stringValue(node.detail, groundedSentence(sentences, sceneIndex * 3 + nodeIndex, 'Grounded evidence point.'));
    return {
      id,
      label: stringValue(node.label, shortLabel(detail, `Point ${nodeIndex + 1}`)).slice(0, 80),
      detail,
      x: numberValue(node.x, 18 + nodeIndex * 26, 8, 92),
      y: numberValue(node.y, nodeIndex % 2 ? 62 : 38, 10, 90),
      shape: oneOf(node.shape, shapes, 'rounded'),
      color: oneOf(node.color, colors, colors[(sceneIndex + nodeIndex) % colors.length]),
    };
  });
  const completeNodes = nodes.length >= 2 ? nodes : fallbackNodes(sceneIndex, sentences);
  const validIds = new Set(completeNodes.map((node) => node.id));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = rawEdges.flatMap((entry): VisualEdge[] => {
    const edge = record(entry);
    const from = stringValue(edge.from, '');
    const to = stringValue(edge.to, '');
    if (!validIds.has(from) || !validIds.has(to) || from === to) return [];
    return [{ from, to, label: stringValue(edge.label, 'leads to').slice(0, 80), animated: edge.animated !== false }];
  }).slice(0, 18);
  const completeEdges = edges.length ? edges : completeNodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: completeNodes[index + 1].id,
    label: 'leads to',
    animated: true,
  }));
  const fallbackNarration = [0, 1].map((offset) => groundedSentence(sentences, sceneIndex * 2 + offset, '')).filter(Boolean).join(' ');
  const narration = stringValue(raw.narration, fallbackNarration || `This scene explains ${shortLabel(groundedSentence(sentences, sceneIndex, 'the retrieved evidence'), 'the key mechanism')}.`);
  const camera = record(raw.camera);
  const camera3d = record(raw.camera3d);
  const firstNode = completeNodes[0];
  const requestedRenderMode = oneOf(raw.renderMode, visualModes, 'diagram');
  const requestedAssetIndex = Math.round(numberValue(raw.visualAssetIndex, defaultAssetIndex, -1, Math.max(-1, references.length - 1)));
  const visualAsset = requestedAssetIndex >= 0 ? references[requestedAssetIndex] : undefined;
  const renderMode = requestedRenderMode === 'reference2d' && !visualAsset ? 'physical3d' : requestedRenderMode;
  const objects = normalizePhysicalObjects(raw.objects, sceneIndex, sentences, completeNodes);
  const flows = normalizeFlows(raw.flows, objects);
  const vectorLayers = normalizeVectorLayers(raw.vectorLayers);
  const requestedHotspots = normalizeHotspots(raw.hotspots, completeNodes).filter((hotspot) => usefulHotspotLabel(hotspot.label));
  const hotspots = requestedHotspots.length >= 2 ? requestedHotspots : hotspotsFromVectorLayers(vectorLayers);
  const imageFlows = normalizeImageFlows(raw.imageFlows, hotspots);
  const requestedFocus = Array.isArray(raw.focusNodeIds) ? raw.focusNodeIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : [];
  return {
    id: sceneId,
    title: stringValue(raw.title, shortLabel(narration, `Scene ${sceneIndex + 1}`)).slice(0, 100),
    narration,
    durationSeconds: Math.round(numberValue(raw.durationSeconds, 10, 5, 20)),
    camera: {
      x: numberValue(camera.x, firstNode.x, 0, 100),
      y: numberValue(camera.y, firstNode.y, 0, 100),
      zoom: numberValue(camera.zoom, 1.1, 0.8, 2.2),
    },
    nodes: completeNodes,
    edges: completeEdges,
    focusNodeIds: requestedFocus.length ? requestedFocus : [firstNode.id],
    renderMode,
    camera3d: {
      position: vector3(camera3d.position, [6, 4, 8], -20, 20),
      target: vector3(camera3d.target, [0, 0, 0], -8, 8),
      autoRotate: camera3d.autoRotate !== false,
    },
    objects,
    flows,
    visualAsset,
    hotspots,
    imageFlows,
    vectorLayers,
  };
}

function buildGroundedFallback(topic: string, question: string, sentences: string[]): VisualLesson {
  const grounded = sentences.length ? sentences : [`The available workspace is about ${topic}.`, `The learner asked: ${question}.`];
  return {
    title: shortLabel(question, topic),
    subtitle: `A grounded visual explanation of ${topic}`,
    strategy: 'flow',
    visualMode: 'diagram',
    sourceSummary: 'This fallback animation is assembled directly from retrieved evidence while the AI compiler is unavailable.',
    scenes: [0, 1, 2].map((index) => normalizeScene({}, index, grounded, [], -1)),
  };
}

function normalizeVisualLesson(value: unknown, topic: string, question: string, sentences: string[], references: VisualReferenceCandidate[]): VisualLesson {
  const raw = record(value);
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes.slice(0, 3) : [];
  if (!rawScenes.length) return buildGroundedFallback(topic, question, sentences);
  const sharedVectorLayers = normalizeVectorLayers(raw.vectorLayers);
  const requestedVisualMode = oneOf(raw.visualMode, visualModes, 'diagram');
  const defaultAssetIndex = Math.round(numberValue(raw.visualAssetIndex, references.length ? 0 : -1, -1, Math.max(-1, references.length - 1)));
  const visualMode = requestedVisualMode === 'reference2d' && defaultAssetIndex < 0 ? 'physical3d' : requestedVisualMode;
  const scenes = rawScenes.map((scene, index) => normalizeScene(scene, index, sentences, references, defaultAssetIndex)).map((scene) => {
    const vectorLayers = scene.vectorLayers.length >= 3 ? scene.vectorLayers : sharedVectorLayers;
    return {
      ...scene,
      vectorLayers,
      hotspots: scene.hotspots.length >= 2 ? scene.hotspots : hotspotsFromVectorLayers(vectorLayers),
      renderMode: scene.renderMode === 'diagram' && visualMode !== 'diagram' ? visualMode : scene.renderMode,
    };
  });
  return {
    title: stringValue(raw.title, shortLabel(question, topic)).slice(0, 120),
    subtitle: stringValue(raw.subtitle, `A visual explanation of ${topic}`).slice(0, 180),
    strategy: oneOf(raw.strategy, strategies, 'flow'),
    sourceSummary: stringValue(raw.sourceSummary, 'The lesson is grounded in the retrieved workspace evidence.'),
    visualMode,
    scenes,
  };
}

function hasDetailedVectorModel(layers: VectorLayer[]) {
  const closed = layers.filter((layer) => layer.closed);
  const totalPoints = layers.reduce((sum, layer) => sum + layer.points.length, 0);
  const detailedContours = closed.filter((layer) => layer.points.length >= 8).length;
  const mainContourPoints = Math.max(0, ...closed.map((layer) => layer.points.length));
  const uniquePoints = new Set(layers.flatMap((layer) => layer.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`))).size;
  return layers.length >= 5 && closed.length >= 3 && detailedContours >= 2 && mainContourPoints >= 10 && totalPoints >= 42 && uniquePoints >= 34;
}

async function finalizeExecutableLesson(lesson: VisualLesson, meshDescription: string): Promise<VisualLesson> {
  if (lesson.visualMode !== 'mesh3d') {
    return { ...lesson, visualMode: 'diagram', scenes: lesson.scenes.map((scene) => ({ ...scene, renderMode: 'diagram' })) };
  }
  const generatedMesh = await generateLlamaMesh(meshDescription);
  if (!generatedMesh) {
    return { ...lesson, visualMode: 'diagram', sourceSummary: `${lesson.sourceSummary} The 3D generator was unavailable, so this run uses the animated diagram fallback.`, scenes: lesson.scenes.map((scene) => ({ ...scene, renderMode: 'diagram' })) };
  }
  return { ...lesson, visualMode: 'mesh3d', generatedMesh, scenes: lesson.scenes.map((scene) => ({ ...scene, renderMode: 'mesh3d' })) };
}
