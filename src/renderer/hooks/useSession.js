import { useState, useEffect, useCallback, useRef } from 'react';

export function useSession() {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState({ recording: false });
  const [processing, setProcessing] = useState(null); // null | step name
  const [errorMessage, setErrorMessage] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const activeStreamsRef = useRef([]);
  const activeSessionIdRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        window.momAPI.listSessions(),
        window.momAPI.getStatus(),
      ]);
      setSessions(list || []);
      setStatus(st || { recording: false });
      if (st && st.recording && st.session_id) {
        activeSessionIdRef.current = st.session_id;
      }
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

  // Clean up all active audio tracks and contexts
  const cleanupAudio = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {}
    recorderRef.current = null;
    chunksRef.current = [];

    activeStreamsRef.current.forEach((stream) => {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
    });
    activeStreamsRef.current = [];

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
  }, []);

  const startSession = useCallback(async (title) => {
    setErrorMessage(null);
    cleanupAudio();

    // 1. Initialize session in main process
    const result = await window.momAPI.startSession(title);
    if (!result || !result.ok) {
      setErrorMessage(result?.error || 'Failed to start session.');
      return result;
    }

    activeSessionIdRef.current = result.session_id;

    // 2. Acquire audio streams (system loopback + microphone)
    let systemStream = null;
    let micStream = null;

    try {
      // System audio loopback via desktopCapturer
      const sources = await window.momAPI.getDesktopSources();
      const primarySource = sources && sources.length > 0 ? sources[0] : null;

      if (primarySource) {
        systemStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
            },
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
            },
          },
        });
        // Release video track immediately; we only capture audio
        systemStream.getVideoTracks().forEach((track) => track.stop());
        activeStreamsRef.current.push(systemStream);
      }
    } catch (err) {
      console.warn('System loopback audio capture unavailable, falling back to mic:', err);
    }

    try {
      // Microphone capture
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      activeStreamsRef.current.push(micStream);
    } catch (err) {
      console.warn('Microphone capture unavailable:', err);
    }

    // 3. Mix audio streams via Web Audio API
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    audioCtxRef.current = audioCtx;
    const destination = audioCtx.createMediaStreamDestination();

    let hasAudioTrack = false;
    if (systemStream && systemStream.getAudioTracks().length > 0) {
      const sysSource = audioCtx.createMediaStreamSource(new MediaStream(systemStream.getAudioTracks()));
      sysSource.connect(destination);
      hasAudioTrack = true;
    }

    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(destination);
      hasAudioTrack = true;
    }

    if (!hasAudioTrack) {
      cleanupAudio();
      const err = 'No audio stream available. Please check microphone/system audio permissions.';
      setErrorMessage(err);
      return { error: err };
    }

    // 4. Start recording via MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(destination.stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.start(1000); // 1-second chunks
    recorderRef.current = recorder;

    await refresh();
    return { ok: true, session_id: result.session_id };
  }, [cleanupAudio, refresh]);

  const stopSession = useCallback(async () => {
    setProcessing('stopping');
    setErrorMessage(null);

    const sessionId = activeSessionIdRef.current;
    const recorder = recorderRef.current;

    // Collect recorded audio
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
    }

    // Package audio chunks into array buffer and send to main process
    if (chunksRef.current.length > 0 && sessionId) {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      await window.momAPI.saveAudio(sessionId, new Uint8Array(buffer));
    }

    // Clean up streams & audio context
    cleanupAudio();

    // Trigger AI transcription and summarization in main process
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
  }, [cleanupAudio]);

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
