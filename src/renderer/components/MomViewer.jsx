import React, { useState, useEffect } from 'react';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function momToMarkdown(mom) {
  const lines = [];
  lines.push(`# ${mom.title || 'Meeting Minutes'}\n`);
  if (mom.attendees?.length) {
    lines.push(`## Attendees\n${mom.attendees.map((a) => `- ${a}`).join('\n')}\n`);
  }
  if (mom.agenda?.length) {
    lines.push(`## Agenda\n${mom.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`);
  }
  if (mom.discussion_points?.length) {
    lines.push(`## Discussion Points\n${mom.discussion_points.map((d) => `- ${d}`).join('\n')}\n`);
  }
  if (mom.decisions?.length) {
    lines.push(`## Decisions\n${mom.decisions.map((d) => `- ${d}`).join('\n')}\n`);
  }
  if (mom.action_items?.length) {
    lines.push(
      `## Action Items\n${mom.action_items.map((a) => `- [ ] ${a.task} — *${a.owner}*`).join('\n')}\n`
    );
  }
  if (mom.next_steps?.length) {
    lines.push(`## Next Steps\n${mom.next_steps.map((n) => `- ${n}`).join('\n')}\n`);
  }
  return lines.join('\n');
}

export default function MomViewer({ sessionId }) {
  const [mom, setMom] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setShowTranscript(false);
    window.momAPI.getMom(sessionId).then((data) => {
      setMom(data);
      setLoading(false);
    });
  }, [sessionId]);

  const handleShowTranscript = async () => {
    if (!showTranscript && !transcript) {
      const t = await window.momAPI.getTranscript(sessionId);
      setTranscript(t);
    }
    setShowTranscript(!showTranscript);
  };

  const handleExport = () => {
    if (!mom) return;
    const md = momToMarkdown(mom);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(mom.title || 'MOM').replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="mom-viewer__empty">
        <div className="processing__step-icon" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>
          ◌
        </div>
        <div>Loading...</div>
      </div>
    );
  }

  if (!mom) {
    return (
      <div className="mom-viewer__empty">
        <div className="mom-viewer__empty-icon">📄</div>
        <div>No MOM data found for this session.</div>
      </div>
    );
  }

  return (
    <div className="mom-viewer">
      {/* Header */}
      <div className="mom-viewer__header">
        <h1 className="mom-viewer__title">{mom.title || 'Meeting Minutes'}</h1>
        <div className="mom-viewer__meta">{formatDate(mom.started_at)}</div>

        {mom.attendees?.length > 0 && (
          <div className="mom-viewer__attendees">
            {mom.attendees.map((name, i) => (
              <span key={i} className="mom-viewer__badge">
                👤 {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Agenda */}
      {mom.agenda?.length > 0 && (
        <div className="mom-viewer__section">
          <h2 className="mom-viewer__section-title">Agenda</h2>
          <ol className="mom-viewer__numbered-list">
            {mom.agenda.map((item, i) => (
              <li key={i} className="mom-viewer__numbered-item">{item}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Discussion Points */}
      {mom.discussion_points?.length > 0 && (
        <div className="mom-viewer__section">
          <h2 className="mom-viewer__section-title">Discussion Points</h2>
          {mom.discussion_points.map((point, i) => (
            <div key={i} className="mom-viewer__card">{point}</div>
          ))}
        </div>
      )}

      {/* Decisions */}
      {mom.decisions?.length > 0 && (
        <div className="mom-viewer__section">
          <h2 className="mom-viewer__section-title">Decisions</h2>
          {mom.decisions.map((d, i) => (
            <div key={i} className="mom-viewer__card mom-viewer__card--decision">
              ✓ {d}
            </div>
          ))}
        </div>
      )}

      {/* Action Items */}
      {mom.action_items?.length > 0 && (
        <div className="mom-viewer__section">
          <h2 className="mom-viewer__section-title">Action Items</h2>
          {mom.action_items.map((item, i) => (
            <div key={i} className="mom-viewer__action-item">
              <div className="mom-viewer__action-task">{item.task}</div>
              <div className="mom-viewer__action-owner">{item.owner}</div>
            </div>
          ))}
        </div>
      )}

      {/* Next Steps */}
      {mom.next_steps?.length > 0 && (
        <div className="mom-viewer__section">
          <h2 className="mom-viewer__section-title">Next Steps</h2>
          {mom.next_steps.map((step, i) => (
            <div key={i} className="mom-viewer__card">{step}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mom-viewer__actions-bar">
        <button className="mom-viewer__export-btn" onClick={handleExport}>
          📥 Export as Markdown
        </button>
        <button className="mom-viewer__transcript-toggle" onClick={handleShowTranscript}>
          {showTranscript ? '▾ Hide Transcript' : '▸ View Transcript'}
        </button>
      </div>

      {showTranscript && transcript && (
        <div className="mom-viewer__transcript">{transcript}</div>
      )}
    </div>
  );
}
