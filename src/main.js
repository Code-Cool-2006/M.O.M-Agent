const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// Handle Windows Squirrel installer lifecycle events natively
function handleSquirrelEvent() {
  if (process.platform !== 'win32') return false;
  const cmd = process.argv[1];
  const target = path.basename(process.execPath);
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') {
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    spawn(updateExe, ['--createShortcut=' + target], { detached: true }).on('close', () => app.quit());
    return true;
  }
  if (cmd === '--squirrel-uninstall') {
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    spawn(updateExe, ['--removeShortcut=' + target], { detached: true }).on('close', () => app.quit());
    return true;
  }
  if (cmd === '--squirrel-obsolete') {
    app.quit();
    return true;
  }
  return false;
}

const isSquirrelStartup = handleSquirrelEvent();

// ── Paths ──────────────────────────────────────────────────────────────
const STATE_DIR = path.join(require('os').homedir(), '.mom-agent');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json');

// Load .env file only in local development so packaged apps do not bundle secrets
function loadDotEnv() {
  if (app.isPackaged) return;
  const envPath = path.join(app.getAppPath(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key] && val) process.env[key] = val;
  }
}

// ── Window ─────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(app.getAppPath(), 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e1e1e',
    icon: fs.existsSync(iconPath) ? iconPath : path.join(app.getAppPath(), 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Vite dev server in development, built file in production
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
}

if (!isSquirrelStartup) {
  app.whenReady().then(() => {
    loadDotEnv();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// ── Window control IPC ─────────────────────────────────────────────────
ipcMain.on('app:minimize', () => mainWindow?.minimize());
ipcMain.on('app:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('app:close', () => mainWindow?.close());

// ── Desktop Capturer (System Loopback Audio Source ID) ─────────────────
ipcMain.handle('desktop-capturer:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (err) {
    console.error('Failed to get desktop sources:', err);
    return [];
  }
});

// ── Settings IPC ───────────────────────────────────────────────────────
function getSettings() {
  const defaults = {
    geminiModel: 'gemini-3.6-flash',
    geminiApiKey: app.isPackaged ? '' : (process.env.GEMINI_API_KEY || ''),
  };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (
        !saved.geminiModel ||
        saved.geminiModel === 'gemini-2.0-flash' ||
        saved.geminiModel === 'gemini-2.5-flash' ||
        saved.geminiModel === 'gemini-1.5-flash'
      ) {
        saved.geminiModel = 'gemini-3.6-flash';
      }
      return { ...defaults, ...saved };
    }
  } catch { /* use defaults */ }
  return defaults;
}

ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle('settings:save', (_e, settings) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  if (settings.geminiApiKey) {
    process.env.GEMINI_API_KEY = settings.geminiApiKey;
  }
  return { ok: true };
});

// ── Gemini API Helpers (Native Node.js fetch) ──────────────────────────
async function callGemini(model, apiKey, payload) {
  const preferredModel = (model === 'gemini-1.5-flash' || model === 'gemini-2.5-flash')
    ? 'gemini-3.6-flash'
    : (model || 'gemini-3.6-flash');

  const modelsToTry = Array.from(new Set([
    preferredModel,
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest',
  ]));
  let lastError = null;

  for (const m of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return await res.json();
      }

      const errText = await res.text();
      lastError = new Error(`Gemini API error [${m}] (${res.status}): ${errText}`);
      // If 404 (model not found), try next model in fallback list
      if (res.status !== 404) {
        throw lastError;
      }
    } catch (e) {
      lastError = e;
      if (e.message && !e.message.includes('404')) {
        throw e;
      }
    }
  }
  throw lastError || new Error('Gemini API call failed');
}

async function transcribeAudioWithGemini(audioBuffer, mimeType, apiKey, model) {
  const base64Audio = audioBuffer.toString('base64');
  const prompt = `You are an expert meeting transcription assistant.
Listen carefully to the recorded audio of this meeting and transcribe all spoken dialogue word-for-word.
Prepend approximate timestamps formatted as [MM:SS] to each line.
Example format:
[00:04] Alex: Good morning everyone, let's start the sync.
[00:12] Sarah: Thanks Alex, I have updated the release notes.
If there is no audible speech, return "[NO_SPEECH]".
Output only the raw transcript text, with no preamble or code fences.`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: base64Audio,
            },
          },
          { text: prompt },
        ],
      },
    ],
  };

  const data = await callGemini(model, apiKey, payload);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

async function generateMomWithGemini(transcript, title, apiKey, model) {
  const cleanTx = (transcript || '').trim();
  if (!cleanTx || cleanTx === '[NO_SPEECH]') {
    return {
      title: title || 'Meeting',
      attendees: [],
      agenda: [],
      discussion_points: ['No spoken conversation detected in the recording.'],
      decisions: [],
      action_items: [],
      next_steps: [],
    };
  }

  const prompt = `You are an expert executive secretary generating Minutes of Meeting (MOM) from a call transcript.
The transcript may contain filler words or transcription artifacts — ignore them.

Meeting title: ${title || 'Meeting'}

Transcript:
---
${cleanTx}
---

Return ONLY a valid JSON object (no markdown, no backticks, no commentary) adhering strictly to this schema:
{
  "title": string,
  "attendees": [string],
  "agenda": [string],
  "discussion_points": [string],
  "decisions": [string],
  "action_items": [{"task": string, "owner": string}],
  "next_steps": [string]
}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const data = await callGemini(model, apiKey, payload);
  let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse Gemini MOM JSON response.');
  }
}

// ── Session IPC ────────────────────────────────────────────────────────
ipcMain.handle('session:start', async (_e, title) => {
  if (fs.existsSync(STATE_FILE)) {
    return { error: 'A session is already running.' };
  }

  const sessionId = `session_${Math.floor(Date.now() / 1000)}`;
  const sessionDir = path.join(STATE_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const state = {
    title: title || 'Meeting',
    session_dir: sessionDir,
    session_id: sessionId,
    started_at: Date.now() / 1000,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  return { ok: true, ...state };
});

ipcMain.handle('session:save-audio', async (_e, { sessionId, buffer }) => {
  try {
    const sessionDir = path.join(STATE_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const audioPath = path.join(sessionDir, 'audio.webm');
    fs.writeFileSync(audioPath, Buffer.from(buffer));
    return { ok: true, audioPath };
  } catch (err) {
    console.error('Failed to save audio file:', err);
    return { error: err.message };
  }
});

ipcMain.handle('session:stop', async (event) => {
  if (!fs.existsSync(STATE_FILE)) {
    return { error: 'No active session.' };
  }

  const sender = event.sender;
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { error: 'Failed to read active session.' };
  }

  try {
    sender.send('progress', { step: 'stopping', message: 'Finalizing recording...' });

    // Clean up active session state file
    try { fs.unlinkSync(STATE_FILE); } catch {}

    const audioPath = path.join(state.session_dir, 'audio.webm');
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      sender.send('progress', { step: 'error', message: 'No audio was captured.' });
      return { error: 'No audio was captured.' };
    }

    const settings = getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const msg = 'Gemini API Key is missing. Please configure your API key in Settings.';
      sender.send('progress', { step: 'error', message: msg });
      return { error: msg };
    }

    const model = settings.geminiModel || 'gemini-2.5-flash';
    const audioBuffer = fs.readFileSync(audioPath);
    const txFile = path.join(state.session_dir, 'transcript.txt');
    const momFile = path.join(state.session_dir, 'mom.json');

    // 1. Transcribe audio with Gemini
    sender.send('progress', { step: 'transcribing', message: 'Transcribing meeting audio with Gemini...' });
    const transcript = await transcribeAudioWithGemini(audioBuffer, 'audio/webm', apiKey, model);
    fs.writeFileSync(txFile, transcript || '', 'utf-8');

    // 2. Generate structured MOM with Gemini
    sender.send('progress', { step: 'summarizing', message: 'Generating Minutes of Meeting with Gemini...' });
    const mom = await generateMomWithGemini(transcript, state.title, apiKey, model);
    fs.writeFileSync(momFile, JSON.stringify(mom, null, 2), 'utf-8');

    // 3. Save session metadata
    const meta = {
      title: state.title || 'Meeting',
      session_id: state.session_id,
      started_at: state.started_at,
      ended_at: Date.now() / 1000,
    };
    fs.writeFileSync(path.join(state.session_dir, 'meta.json'), JSON.stringify(meta, null, 2));

    sender.send('progress', { step: 'done', message: 'Done!', sessionId: state.session_id });
    return { ok: true, sessionId: state.session_id };
  } catch (err) {
    console.error('Stop session processing failed:', err);
    try { fs.unlinkSync(STATE_FILE); } catch {}
    sender.send('progress', { step: 'error', message: err.message || 'Processing failed.' });
    return { error: err.message || 'Processing failed.' };
  }
});

ipcMain.handle('session:status', () => {
  if (!fs.existsSync(STATE_FILE)) return { recording: false };
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return { recording: true, ...state };
  } catch {
    return { recording: false };
  }
});

ipcMain.handle('session:list', () => {
  if (!fs.existsSync(STATE_DIR)) return [];
  const dirs = fs.readdirSync(STATE_DIR)
    .filter((d) => d.startsWith('session_'))
    .sort()
    .reverse();

  return dirs.map((d) => {
    const dir = path.join(STATE_DIR, d);
    const meta = {};
    const metaFile = path.join(dir, 'meta.json');
    const momFile = path.join(dir, 'mom.json');

    if (fs.existsSync(metaFile)) {
      try {
        Object.assign(meta, JSON.parse(fs.readFileSync(metaFile, 'utf-8')));
      } catch {}
    } else {
      const ts = parseInt(d.replace('session_', ''), 10);
      meta.started_at = ts;
      meta.title = 'Meeting';
      meta.session_id = d;
    }

    meta.hasMom = fs.existsSync(momFile);
    meta.session_id = meta.session_id || d;
    return meta;
  });
});

ipcMain.handle('session:get-mom', (_e, sessionId) => {
  const momFile = path.join(STATE_DIR, sessionId, 'mom.json');
  if (!fs.existsSync(momFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(momFile, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle('session:get-transcript', (_e, sessionId) => {
  const txFile = path.join(STATE_DIR, sessionId, 'transcript.txt');
  if (!fs.existsSync(txFile)) return null;
  try {
    return fs.readFileSync(txFile, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('session:delete', (_e, sessionId) => {
  const sessionDir = path.join(STATE_DIR, sessionId);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  return { ok: true };
});
