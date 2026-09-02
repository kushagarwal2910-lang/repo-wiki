export type ResearchSource = {
  title: string;
  url: string;
};

export type ResearchWorkspace = {
  topic: string;
  workspaceId: string;
  brief: string;
  sources: ResearchSource[];
  createdAt: string;
};

export type VisualNode = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  shape: 'circle' | 'rounded' | 'pill';
  color: 'lime' | 'mint' | 'blue' | 'amber' | 'coral' | 'violet';
};

export type VisualEdge = {
  from: string;
  to: string;
  label: string;
  animated: boolean;
};

export type PhysicalPrimitive = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'tube';

export type PhysicalObject = {
  id: string;
  label: string;
  detail: string;
  primitive: PhysicalPrimitive;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  motion: 'none' | 'rotate' | 'pulse' | 'oscillate';
  cutaway: boolean;
};

export type PhysicalFlow = {
  from: string;
  to: string;
  label: string;
  color: string;
  speed: number;
  particleCount: number;
};

export type VisualAsset = {
  url: string;
  description: string;
  sourceUrl?: string;
  fallbackUrls?: string[];
};

export type VisualHotspot = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  color: string;
};

export type ImageFlow = {
  label: string;
  color: string;
  speed: number;
  points: Array<{ x: number; y: number }>;
};

export type VisualScene = {
  id: string;
  title: string;
  narration: string;
  durationSeconds: number;
  camera: { x: number; y: number; zoom: number };
  nodes: VisualNode[];
  edges: VisualEdge[];
  focusNodeIds: string[];
  renderMode: 'reference2d' | 'physical3d' | 'spatial2d' | 'diagram';
  camera3d: {
    position: [number, number, number];
    target: [number, number, number];
    autoRotate: boolean;
  };
  objects: PhysicalObject[];
  flows: PhysicalFlow[];
  visualAsset?: VisualAsset;
  hotspots: VisualHotspot[];
  imageFlows: ImageFlow[];
};

export type VisualLesson = {
  title: string;
  subtitle: string;
  strategy: 'flow' | 'timeline' | 'network' | 'cycle' | 'comparison' | 'layers';
  sourceSummary: string;
  visualMode: 'reference2d' | 'physical3d' | 'spatial2d' | 'diagram';
  scenes: VisualScene[];
};

const nodeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' },
    x: { type: 'number', description: 'Horizontal position from 8 to 92.' },
    y: { type: 'number', description: 'Vertical position from 10 to 90.' },
    shape: { type: 'string', enum: ['circle', 'rounded', 'pill'] },
    color: { type: 'string', enum: ['lime', 'mint', 'blue', 'amber', 'coral', 'violet'] },
  },
  required: ['id', 'label', 'detail', 'x', 'y', 'shape', 'color'],
};

export const visualLessonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' }, subtitle: { type: 'string' },
    strategy: { type: 'string', enum: ['flow', 'timeline', 'network', 'cycle', 'comparison', 'layers'] },
    sourceSummary: { type: 'string', description: 'One sentence describing how retrieved evidence supports the lesson.' },
    scenes: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' }, title: { type: 'string' }, narration: { type: 'string' },
          durationSeconds: { type: 'integer', minimum: 4, maximum: 20 },
          camera: {
            type: 'object',
            additionalProperties: false,
            properties: {
              x: { type: 'number', description: 'Camera target x from 0 to 100.' },
              y: { type: 'number', description: 'Camera target y from 0 to 100.' },
              zoom: { type: 'number', minimum: 0.8, maximum: 2.2 },
            }, required: ['x', 'y', 'zoom'],
          },
          nodes: { type: 'array', minItems: 2, maxItems: 12, items: nodeSchema },
          edges: {
            type: 'array', maxItems: 18,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, animated: { type: 'boolean' },
              }, required: ['from', 'to', 'label', 'animated'],
            },
          },
          focusNodeIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'narration', 'durationSeconds', 'camera', 'nodes', 'edges', 'focusNodeIds'],
      },
    },
  },
  required: ['title', 'subtitle', 'strategy', 'sourceSummary', 'scenes'],
};
