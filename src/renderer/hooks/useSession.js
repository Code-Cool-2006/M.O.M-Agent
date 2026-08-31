import { useState, useEffect, useCallback } from 'react';

export function useSession() {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState({ recording: false });
  const [processing, setProcessing] = useState(null); // null | step name

  const refresh = useCallback(async () => {
    const [list, st] = await Promise.all([
      window.momAPI.listSessions(),
      window.momAPI.getStatus(),
    ]);
    setSessions(list);
    setStatus(st);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = window.momAPI.onProgress((data) => {
      setProcessing(data.step);
      if (data.step === 'done') {
        setTimeout(() => {
          setProcessing(null);
          refresh();
        }, 1200);
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
    const result = await window.momAPI.stopSession();
    if (result.error) {
      setProcessing(null);
    }
    return result;
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    await window.momAPI.deleteSession(sessionId);
    await refresh();
  }, [refresh]);

  return {
    sessions,
    status,
    processing,
    startSession,
    stopSession,
    deleteSession,
    refresh,
  };
}
