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

const api = {
  get: async (url: string) => {
    const response = await fetch(`http://localhost:8000${url}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
};

export const useGraphStore = create<GraphState>((set) => ({
  currentCommitSha: null,
  timeline: [],
  historicalData: null,
  setCommit: (sha: string) => set({ currentCommitSha: sha }),
  setTimeline: (data: CommitTimeline[]) => set({ timeline: data }),
  fetchHistoricalGraph: async (repoId: string, sha: string) => {
    const data = await api.get(`/graph/historical/${repoId}/${sha}`);
    set({ historicalData: data, currentCommitSha: sha });
  },
}));
