import { useState, useEffect, useCallback } from 'react';

export function useSession() {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState({ recording: false });
  const [processing, setProcessing] = useState(null); // null | step name
  const [errorMessage, setErrorMessage] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        window.momAPI.listSessions(),
        window.momAPI.getStatus(),
      ]);
      setSessions(list || []);
      setStatus(st || { recording: false });
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = window.momAPI.onProgress((data) => {
      if (data.step === 'error') {
        setProcessing('error');
        setErrorMessage(data.message || 'Processing failed.');
        refresh();
      } else {
        setProcessing(data.step);
        if (data.step === 'done') {
          setTimeout(() => {
            setProcessing(null);
            setErrorMessage(null);
            refresh();
          }, 1200);
        }
      }
    });
    return unsub;
  }, [refresh]);

  const startSession = useCallback(async (title) => {
    const result = await window.momAPI.startSession(title);
    if (result.ok) {
      await refresh();
    }
    return result;
  }, [refresh]);

  const stopSession = useCallback(async () => {
    setProcessing('stopping');
    setErrorMessage(null);
    try {
      const result = await window.momAPI.stopSession();
      if (result && result.error) {
        setProcessing('error');
        setErrorMessage(result.error);
      }
      return result;
    } catch (err) {
      setProcessing('error');
      setErrorMessage(err.message || 'Error stopping session');
      return { error: err.message };
    }
  }, []);

  const dismissError = useCallback(() => {
    setProcessing(null);
    setErrorMessage(null);
    refresh();
  }, [refresh]);

  const deleteSession = useCallback(async (sessionId) => {
    await window.momAPI.deleteSession(sessionId);
    await refresh();
  }, [refresh]);

  return {
    sessions,
    status,
    processing,
    errorMessage,
    dismissError,
    startSession,
    stopSession,
    deleteSession,
    refresh,
  };
}
