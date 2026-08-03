import React from 'react';
import { useGraphStore } from '../state/graphStore';

export const TimeSlider: React.FC = () => {
  const { timeline, currentCommitSha, setCommit } = useGraphStore();

  if (!timeline || timeline.length === 0) {
    return <div className="time-slider-placeholder" style={{ padding: '8px', color: 'var(--theme-text-dim)', fontSize: '12px' }}>No commits in timeline</div>;
  }

  const currentIndex = timeline.findIndex((item) => item.sha === currentCommitSha);
  const activeIndex = currentIndex !== -1 ? currentIndex : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    const selected = timeline[idx];
    if (selected) {
      setCommit(selected.sha);
      console.log(`Selected commit SHA: ${selected.sha}`);
    }
  };

  const activeCommit = timeline[activeIndex];

  return (
    <div className="time-slider-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--theme-text-primary)' }}>
        <span><strong>Current Commit:</strong> {currentCommitSha?.substring(0, 7) || 'None'}</span>
        {activeCommit && (
          <span><strong>Timestamp:</strong> {new Date(activeCommit.timestamp).toLocaleString()}</span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={timeline.length - 1}
        value={activeIndex}
        onChange={handleChange}
        style={{ width: '100%', cursor: 'pointer' }}
      />
    </div>
  );
};
