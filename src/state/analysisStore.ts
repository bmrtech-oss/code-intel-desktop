import { create } from 'zustand';

export interface BusinessRuleDNA {
  sha: string;
  timestamp: number;
  date: string;
  ruleText: string;
  changeDescription: string;
}

type AnalysisState = {
  selectedNodeId: string | null;
  ruleHistory: BusinessRuleDNA[];
  fetchRuleHistory: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (nodeId: string | null) => void;
};

export const useAnalysisStore = create<AnalysisState>((set) => ({
  selectedNodeId: null,
  ruleHistory: [],
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  fetchRuleHistory: async (nodeId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/analysis/rule-dna/${nodeId}`);
      if (response.ok) {
        const data = await response.json();
        set({ ruleHistory: data });
        return;
      }
    } catch (e) {
      console.warn('Fallback to mock rule DNA history:', e);
    }

    const mockHistory: BusinessRuleDNA[] = [
      {
        sha: "abc1234",
        timestamp: 1682899200000,
        date: "2023-05-01",
        ruleText: "Threshold: 15000",
        changeDescription: "Threshold updated 10000 → 15000"
      },
      {
        sha: "def5678",
        timestamp: 1681516800000,
        date: "2023-04-15",
        ruleText: "Threshold: 10000",
        changeDescription: "Initial setup of transaction limit rule"
      }
    ];
    set({ ruleHistory: mockHistory });
  }
}));
