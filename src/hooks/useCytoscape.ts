import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { useGraphStore } from '../state/graphStore';

export const useCytoscape = (containerId: string, repoId: string) => {
  const { currentCommitSha, historicalData, fetchHistoricalGraph } = useGraphStore();
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (currentCommitSha && repoId) {
      fetchHistoricalGraph(repoId, currentCommitSha).catch((err) => {
        console.error('Failed to fetch historical graph inside hook:', err);
      });
    }
  }, [currentCommitSha, repoId, fetchHistoricalGraph]);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cyInstance = cytoscape({
      container,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#666',
            'label': 'data(label)'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 3,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        }
      ],
      layout: {
        name: 'grid'
      }
    });

    cyRef.current = cyInstance;

    return () => {
      cyInstance.destroy();
    };
  }, [containerId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !historicalData) return;

    cy.elements().remove();

    const newElements = [
      ...historicalData.nodes.map(n => ({
        group: 'nodes' as const,
        data: { id: n.id, label: n.label, type: n.type }
      })),
      ...historicalData.edges.map(e => ({
        group: 'edges' as const,
        data: { id: `${e.source}-${e.target}`, source: e.source, target: e.target, type: e.type }
      }))
    ];

    cy.add(newElements);

    cy.layout({
      name: 'cose',
      animate: false
    }).run();

  }, [historicalData]);

  return cyRef;
};
