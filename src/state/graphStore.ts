import { create } from 'zustand';
import { CommitTimeline, HistoricalGraph } from '../types/graph';

export type GraphState = {
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
      // Fetch historical graph data for the given repository and commit SHA.
      // In a complete implementation, this would request the graph at a specific version/commit:
      // const response = await fetch(`/api/repos/${repoId}/graph?version=${encodeURIComponent(sha)}`);
      // const data = await response.json();
      // For now, we update the selected commit SHA.
      set({ currentCommitSha: sha });
    } catch (error) {
      console.error('Failed to fetch historical graph:', error);
    }
  },
}));
