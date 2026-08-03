import React, { useEffect } from 'react';
import { useGraphStore } from '../state/graphStore';
import { TimeSlider } from '../components/TimeSlider';

interface GraphViewProps {
  repoId: string;
}

export const GraphView: React.FC<GraphViewProps> = ({ repoId }) => {
  const { timeline, setTimeline, currentCommitSha } = useGraphStore();

  useEffect(() => {
    const fetchTimelineData = async () => {
      try {
        const response = await fetch(`http://localhost:8000/repo/branches-and-commits?repo_path=${encodeURIComponent(repoId)}`);
        if (response.ok) {
          const data = await response.json();
          const formattedTimeline = (data.commits || []).map((c: any) => ({
            sha: c.sha,
            timestamp: c.date ? new Date(c.date).getTime() : Date.now(),
          }));
          setTimeline(formattedTimeline);
        }
      } catch (error) {
        console.error('Failed to fetch timeline:', error);
      }
    };

    fetchTimelineData();
  }, [repoId, setTimeline]);

  const activeCommit = timeline.find((item) => item.sha === currentCommitSha);
  const commitDateStr = activeCommit ? new Date(activeCommit.timestamp).toLocaleString() : 'No commit selected';

  return (
    <div className="graph-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="canvas-container" style={{ flex: 1, minHeight: '300px', background: '#0D1117' }}>
        <div id="cy" style={{ width: '100%', height: '100%' }}></div>
      </div>

      <footer className="graph-view-footer" style={{ borderTop: '1px solid var(--theme-border)', background: 'var(--theme-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--theme-border)' }}>
          <span style={{ fontSize: '12px', color: 'var(--theme-text-secondary)' }}>
            <strong>Commit Date:</strong> {commitDateStr}
          </span>
        </div>
        <TimeSlider />
      </footer>
    </div>
  );
};
