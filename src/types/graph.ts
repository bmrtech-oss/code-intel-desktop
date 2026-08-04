export interface GraphNode {
  id: string;
  label: string;
  type: string;
  file?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface HistoricalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  commitSha: string;
  timestamp: number;
}

export interface CommitTimeline {
  sha: string;
  timestamp: number;
}
