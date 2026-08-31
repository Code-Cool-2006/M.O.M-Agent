import React, { useState } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import RecordingView from './components/RecordingView';
import ProcessingSteps from './components/ProcessingSteps';
import MomViewer from './components/MomViewer';
import SettingsPanel from './components/SettingsPanel';
import { useSession } from './hooks/useSession';

export default function App() {
  const {
    sessions,
    status,
    processing,
    startSession,
    stopSession,
    deleteSession,
  } = useSession();

  // 'recording' | 'mom' | 'settings'
  const [view, setView] = useState('recording');
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const handleSelectSession = (sessionId) => {
    setSelectedSessionId(sessionId);
    setView('mom');
  };

  const handleNewMeeting = () => {
    setSelectedSessionId(null);
    setView('recording');
  };

  const handleSettingsClick = () => {
    setView(view === 'settings' ? 'recording' : 'settings');
  };

  const handleDeleteSession = async (sessionId) => {
    await deleteSession(sessionId);
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
      setView('recording');
    }
  };

  const renderContent = () => {
    // Show processing overlay when stopping
    if (processing) {
      return <ProcessingSteps currentStep={processing} />;
    }

    switch (view) {
      case 'settings':
        return <SettingsPanel />;
      case 'mom':
        return selectedSessionId ? (
          <MomViewer sessionId={selectedSessionId} />
        ) : (
          <RecordingView status={status} onStart={startSession} onStop={stopSession} />
        );
      case 'recording':
      default:
        return (
          <RecordingView status={status} onStart={startSession} onStop={stopSession} />
        );
    }
  };

  return (
    <div className="app-layout">
      <TitleBar onSettingsClick={handleSettingsClick} />
      <div className="app-body">
        <Sidebar
          sessions={sessions}
          isRecording={status.recording}
          activeSessionId={
            status.recording ? status.session_id : selectedSessionId
          }
          onSelectSession={handleSelectSession}
          onNewMeeting={handleNewMeeting}
          onDeleteSession={handleDeleteSession}
        />
        <div className="main-content">{renderContent()}</div>
      </div>
    </div>
  );
}
