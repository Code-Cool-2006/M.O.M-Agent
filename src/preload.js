const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('momAPI', {
  // Session
  startSession: (title) => ipcRenderer.invoke('session:start', title),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  saveAudio: (sessionId, arrayBuffer) => ipcRenderer.invoke('session:save-audio', { sessionId, buffer: arrayBuffer }),
  getStatus: () => ipcRenderer.invoke('session:status'),
  listSessions: () => ipcRenderer.invoke('session:list'),
  getMom: (sessionId) => ipcRenderer.invoke('session:get-mom', sessionId),
  getTranscript: (sessionId) => ipcRenderer.invoke('session:get-transcript', sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke('session:delete', sessionId),

  // Audio capture sources
  getDesktopSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Window controls
  minimize: () => ipcRenderer.send('app:minimize'),
  maximize: () => ipcRenderer.send('app:maximize'),
  close: () => ipcRenderer.send('app:close'),

  // Progress events from main process during stop
  onProgress: (callback) => {
    const handler = (_e, data) => callback(data);
    ipcRenderer.on('progress', handler);
    return () => ipcRenderer.removeListener('progress', handler);
  },
});
