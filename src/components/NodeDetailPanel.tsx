import React, { useEffect } from 'react';
import { useAnalysisStore } from '../state/analysisStore';
import { useGraphStore } from '../state/graphStore';

export const NodeDetailPanel: React.FC = () => {
  const { selectedNodeId, ruleHistory, fetchRuleHistory } = useAnalysisStore();
  const { currentCommitSha } = useGraphStore();

  useEffect(() => {
    if (selectedNodeId) {
      fetchRuleHistory(selectedNodeId);
    }
  }, [selectedNodeId, fetchRuleHistory]);

  if (!selectedNodeId) {
    return (
      <div className="detail-panel-empty" style={{ padding: '16px', color: 'var(--theme-text-dim)' }}>
        Select a node in the graph to view details
      </div>
    );
  }

  return (
    <div className="node-detail-panel" style={{ padding: '16px', color: 'var(--theme-text-primary)' }}>
      <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Node Analysis</h3>
      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
        <strong>ID:</strong> {selectedNodeId}
      </div>

      <div className="rule-evolution-section" style={{ marginTop: '24px', borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>📋 Rule Evolution</h4>

        {ruleHistory.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--theme-text-dim)' }}>No historical rule DNA found.</div>
        ) : (
          <div className="rule-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {ruleHistory.map((rule, idx) => {
              const isCurrent = rule.sha === currentCommitSha;
              return (
                <div
                  key={idx}
                  className={`rule-timeline-item ${isCurrent ? 'active' : ''}`}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: isCurrent ? '4px solid var(--theme-primary)' : '2px solid var(--theme-border)',
                    background: isCurrent ? 'var(--theme-surface-elevated)' : 'transparent',
                    opacity: isCurrent ? 1 : 0.7,
                    transition: 'all 200ms ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--theme-text-dim)', marginBottom: '4px' }}>
                    <span>📅 {rule.date}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{rule.sha.substring(0, 7)}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                    {rule.ruleText}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
                    {rule.changeDescription}
                  </div>
                  {isCurrent && (
                    <span style={{ display: 'inline-block', fontSize: '10px', background: 'var(--theme-primary)', color: '#fff', padding: '2px 6px', borderRadius: 'var(--radius-full)', marginTop: '6px', fontWeight: 600 }}>
                      📍 CURRENT SLIDER POSITION
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
