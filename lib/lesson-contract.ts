export type VisualStrategy =
  | 'institutional-flow'
  | 'map-timeline'
  | 'zoomable-structure'
  | 'data-story'
  | 'causal-network'
  | 'simulation';

export type EvidenceSource = {
  id: string;
  title: string;
  url: string;
  authority: 'primary' | 'official' | 'peer-reviewed' | 'reference';
  retrievedAt: string;
};

export type SceneEvent = {
  id: string;
  narration: string;
  evidenceIds: string[];
  visual: {
    operation: 'focus' | 'reveal' | 'highlight' | 'transition' | 'animate' | 'compare';
    target: string;
    parameters?: Record<string, string | number | boolean>;
  };
};

export type LessonSpec = {
  id: string;
  topic: string;
  learningObjective: string;
  visualStrategy: VisualStrategy;
  sources: EvidenceSource[];
  scenes: SceneEvent[];
  accuracy: {
    verifiedClaims: number;
    unresolvedClaims: number;
    simplifications: string[];
  };
};
