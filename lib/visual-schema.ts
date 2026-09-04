export type ResearchSource = {
  title: string;
  url: string;
  type?: 'file' | 'repo';
};

export type ResearchWorkspace = {
  topic: string; // For us, this will be the GitHub repo URL
  workspaceId: string;
  brief: string;
  sources: ResearchSource[];
  createdAt: string;
};

export type VisualNode = {
  id: string;
  label: string;
  labelArchitecture?: string;
  labelFile?: string;
  labelAnatomy?: string;
  detail: string;
  architectureDetail?: string;
  anatomyDetail?: string;
  category: 'database' | 'api' | 'frontend' | 'utility' | 'core' | 'danger';
  type: 'default' | 'input' | 'output';
  filePath?: string;
  codeSnippet?: string;
};

export type VisualEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
};

export type VisualLesson = {
  title: string;
  subtitle: string;
  type: 'text' | 'flowchart' | 'diagram';
  sourceSummary?: string;
  textualContent?: string;
  nodes?: VisualNode[];
  edges?: VisualEdge[];
};
