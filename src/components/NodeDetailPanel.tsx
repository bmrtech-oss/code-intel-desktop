import React, { useEffect } from 'react';
import { useAnalysisStore } from '../state/analysisStore';
import { useGraphStore } from '../state/graphStore';

interface DiffToken {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

export function computeSimpleDiff(prev: string, curr: string): DiffToken[] {
  const prevWords = prev.split(/(\s+)/).filter(Boolean);
  const currWords = curr.split(/(\s+)/).filter(Boolean);

  const result: DiffToken[] = [];
  let p = 0;
  let c = 0;

  while (p < prevWords.length || c < currWords.length) {
    if (p < prevWords.length && c < currWords.length && prevWords[p] === currWords[c]) {
      result.push({ type: 'unchanged', value: prevWords[p] });
      p++;
      c++;
    } else if (c < currWords.length && !prevWords.slice(p).includes(currWords[c])) {
      result.push({ type: 'added', value: currWords[c] });
      c++;
    } else if (p < prevWords.length && !currWords.slice(c).includes(prevWords[p])) {
      result.push({ type: 'removed', value: prevWords[p] });
      p++;
    } else {
      if (p < prevWords.length) {
        result.push({ type: 'removed', value: prevWords[p] });
        p++;
      }
      if (c < currWords.length) {
        result.push({ type: 'added', value: currWords[c] });
        c++;
      }
    }
  }
  return result;
}

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
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>📋 Rule Evolution & Diff Viewer</h4>

        {ruleHistory.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--theme-text-dim)' }}>No historical rule DNA found.</div>
        ) : (
          <div className="rule-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {ruleHistory.map((rule, idx) => {
              const isCurrent = rule.sha === currentCommitSha;
              const nextOlderRule = ruleHistory[idx + 1];

              // Calculate visual diff if predecessor exists
              let ruleDiffElement: React.ReactNode = rule.ruleText;
              if (nextOlderRule) {
                const diffTokens = computeSimpleDiff(nextOlderRule.ruleText, rule.ruleText);
                ruleDiffElement = (
                  <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                    {diffTokens.map((t, tIdx) => {
                      if (t.type === 'added') {
                        return (
                          <span key={tIdx} style={{ background: '#1f6feb', color: '#fff', padding: '1px 3px', borderRadius: '3px', fontWeight: 'bold' }}>
                            {t.value}
                          </span>
                        );
                      } else if (t.type === 'removed') {
                        return (
                          <span key={tIdx} style={{ textDecoration: 'line-through', color: '#ff7b72', background: 'rgba(255,123,114,0.15)', padding: '1px 3px', borderRadius: '3px' }}>
                            {t.value}
                          </span>
                        );
                      }
                      return <span key={tIdx}>{t.value}</span>;
                    })}
                  </div>
                );
              } else {
                ruleDiffElement = (
                  <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: '#3fb950', background: 'rgba(63,185,80,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                    ✨ {rule.ruleText} (Initial Setup)
                  </div>
                );
              }

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
                  <div style={{ marginBottom: '4px' }}>
                    {ruleDiffElement}
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
