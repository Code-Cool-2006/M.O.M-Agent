import React from 'react';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Sidebar({
  sessions,
  isRecording,
  activeSessionId,
  onSelectSession,
  onNewMeeting,
  onDeleteSession,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <button className="sidebar__new-btn" onClick={onNewMeeting}>
          <span>＋</span>
          New Meeting
        </button>
        <span className="sidebar__label">Session History</span>
      </div>

      <div className="sidebar__list">
        {sessions.length === 0 && (
          <div className="sidebar__empty">
            <div className="sidebar__empty-icon">📋</div>
            <div>No sessions yet.<br />Start a meeting to begin.</div>
          </div>
        )}

        {sessions.map((s) => (
          <div
            key={s.session_id}
            className={`sidebar__item ${
              activeSessionId === s.session_id ? 'sidebar__item--active' : ''
            }`}
            onClick={() => onSelectSession(s.session_id)}
          >
            <div
              className={`sidebar__item-dot ${
                isRecording && s.session_id === activeSessionId
                  ? 'sidebar__item-dot--recording'
                  : 'sidebar__item-dot--completed'
              }`}
            />
            <div className="sidebar__item-info">
              <div className="sidebar__item-title">{s.title || 'Meeting'}</div>
              <div className="sidebar__item-date">{formatDate(s.started_at)}</div>
            </div>
            <button
              className="sidebar__item-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(s.session_id);
              }}
              title="Delete session"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
