import React, { useState } from 'react';
import { useTimer } from '../hooks/useTimer';

export default function RecordingView({ status, onStart, onStop }) {
  const [title, setTitle] = useState('');
  const isRecording = status.recording;
  const { display } = useTimer(isRecording, status.started_at);

  const handleToggle = async () => {
    if (isRecording) {
      onStop();
    } else {
      await onStart(title || 'Meeting');
      setTitle('');
    }
  };

  return (
    <div className="recording">
      <input
        className="recording__title-input"
        type="text"
        placeholder="Meeting title..."
        value={isRecording ? (status.title || '') : title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isRecording}
        onKeyDown={(e) => e.key === 'Enter' && !isRecording && handleToggle()}
      />

      <div className="recording__btn-wrap">
        <button
          className={`recording__btn ${isRecording ? 'recording__btn--recording' : ''}`}
          onClick={handleToggle}
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? '⏹' : '⏵'}
        </button>
        {isRecording && <div className="recording__btn-ring" />}
      </div>

      {isRecording ? (
        <>
          <div className="recording__timer">{display}</div>
          <div className="recording__status">
            <div className="recording__status-dot" />
            <span className="recording__status-text">Recording...</span>
          </div>
        </>
      ) : (
        <div className="recording__idle-text">
          Enter a meeting title and hit the button to start recording system audio.
          Works with Teams, Meet, Zoom — anything.
        </div>
      )}
    </div>
  );
}
