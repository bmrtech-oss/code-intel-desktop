import { create } from 'zustand';
import { CommitTimeline, HistoricalGraph } from '../types/graph';

type GraphState = {
  currentCommitSha: string | null;
  timeline: CommitTimeline[];
  historicalData: HistoricalGraph | null;
  setCommit: (sha: string) => void;
  setTimeline: (data: CommitTimeline[]) => void;
  fetchHistoricalGraph: (repoId: string, sha: string) => Promise<void>;
};

export const useGraphStore = create<GraphState>((set) => ({
  currentCommitSha: null,
  timeline: [],
  historicalData: null,
  setCommit: (sha: string) => set({ currentCommitSha: sha }),
  setTimeline: (data: CommitTimeline[]) => set({ timeline: data }),
  fetchHistoricalGraph: async (repoId: string, sha: string) => {
    try {
      const response = await fetch(`http://localhost:8000/graph?repoId=${encodeURIComponent(repoId)}&version=${encodeURIComponent(sha)}&level=all`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      set({
        historicalData: {
          nodes: data.nodes || [],
          edges: data.edges || [],
          commitSha: sha,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('Failed to fetch historical graph:', error);
    }
  },
}));
