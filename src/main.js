const { app, BrowserWindow, ipcMain } = require('electron');

if (require('electron-squirrel-startup')) {
  app.quit();
}
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// ── Paths ──────────────────────────────────────────────────────────────
const STATE_DIR = path.join(require('os').homedir(), '.mom-agent');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const STOP_FLAG = path.join(STATE_DIR, 'stop.flag');
const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json');

function getBackendDir() {
  if (app.isPackaged) {
    const p1 = path.join(process.resourcesPath, 'backend');
    if (fs.existsSync(p1)) return p1;
    return process.resourcesPath;
  }
  return path.join(app.getAppPath(), 'backend');
}

function pyScript(name) {
  const dir = getBackendDir();
  return path.join(dir, name);
}

// Load .env file only in local development so packaged apps do not bundle secrets
function loadDotEnv() {
  if (app.isPackaged) return;
  const envPath = path.join(app.getAppPath(), 'backend', '.env');
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

// ── Window control IPC ─────────────────────────────────────────────────
ipcMain.on('app:minimize', () => mainWindow?.minimize());
ipcMain.on('app:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('app:close', () => mainWindow?.close());

// ── Settings IPC ───────────────────────────────────────────────────────
function getSettings() {
  const defaults = {
    pythonPath: process.platform === 'win32' ? 'python' : 'python3',
    whisperModel: 'small',
    geminiModel: 'gemini-3.6-flash',
    geminiApiKey: app.isPackaged ? '' : (process.env.GEMINI_API_KEY || ''),
  };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (saved.geminiModel === 'gemini-2.0-flash') {
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

// ── Session IPC ────────────────────────────────────────────────────────

// Active child process reference
let captureProc = null;

ipcMain.handle('session:start', async (_e, title) => {
  if (fs.existsSync(STATE_FILE)) {
    return { error: 'A session is already running.' };
  }
  if (fs.existsSync(STOP_FLAG)) fs.unlinkSync(STOP_FLAG);

  const sessionId = `session_${Math.floor(Date.now() / 1000)}`;
  const sessionDir = path.join(STATE_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const wavPath = path.join(sessionDir, 'audio.wav');

  const settings = getSettings();
  const pythonPath = settings.pythonPath || (process.platform === 'win32' ? 'python' : 'python3');

  const env = { ...process.env };
  if (settings.geminiApiKey) env.GEMINI_API_KEY = settings.geminiApiKey;
  if (settings.geminiModel) env.MOM_GEMINI_MODEL = settings.geminiModel;

  captureProc = spawn(pythonPath, [
    pyScript('capture.py'),
    '--out', wavPath,
    '--stop-flag', STOP_FLAG,
  ], {
    detached: false,
    stdio: 'ignore',
    env,
  });

  const state = {
    pid: captureProc.pid,
    title: title || 'Meeting',
    wav_path: wavPath,
    session_dir: sessionDir,
    session_id: sessionId,
    started_at: Date.now() / 1000,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  captureProc.on('exit', () => { captureProc = null; });

  return { ok: true, ...state };
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
    // 1. Signal stop
    sender.send('progress', { step: 'stopping', message: 'Stopping recording...' });
    fs.writeFileSync(STOP_FLAG, '');

    // Wait for capture process to exit
    await new Promise((resolve) => {
      let checks = 0;
      const interval = setInterval(() => {
        checks++;
        if (!captureProc || checks > 100) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
      if (captureProc) {
        captureProc.on('exit', () => { clearInterval(interval); resolve(); });
      } else {
        clearInterval(interval);
        resolve();
      }
    });

    // Cleanup state
    try { fs.unlinkSync(STATE_FILE); } catch {}
    try { fs.unlinkSync(STOP_FLAG); } catch {}

    const wavPath = state.wav_path;
    if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) {
      sender.send('progress', { step: 'error', message: 'No audio was captured.' });
      return { error: 'No audio was captured.' };
    }

    const settings = getSettings();
    const pythonPath = settings.pythonPath || (process.platform === 'win32' ? 'python' : 'python3');
    const env = { ...process.env };
    if (settings.whisperModel) env.MOM_WHISPER_MODEL = settings.whisperModel;
    if (settings.geminiModel) env.MOM_GEMINI_MODEL = settings.geminiModel;
    if (settings.geminiApiKey) env.GEMINI_API_KEY = settings.geminiApiKey;

    const backendDir = getBackendDir();
    const txFile = path.join(state.session_dir, 'transcript.txt');
    const momFile = path.join(state.session_dir, 'mom.json');

    // 2. Transcribe
    sender.send('progress', { step: 'transcribing', message: 'Transcribing audio...' });
    await runPython(pythonPath, ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(backendDir)})
from transcribe import transcribe
t = transcribe(${JSON.stringify(wavPath)})
with open(${JSON.stringify(txFile)}, 'w', encoding='utf-8') as f:
    f.write(t or '')
    `], env);

    // 3. Summarize
    sender.send('progress', { step: 'summarizing', message: 'Generating MOM with Gemini...' });
    await runPython(pythonPath, ['-c', `
import sys, json
sys.path.insert(0, ${JSON.stringify(backendDir)})
from summarize import generate_mom
with open(${JSON.stringify(txFile)}, 'r', encoding='utf-8') as f:
    t = f.read()
mom = generate_mom(t, title=${JSON.stringify(state.title || 'Meeting')})
with open(${JSON.stringify(momFile)}, 'w', encoding='utf-8') as f:
    f.write(json.dumps(mom, indent=2))
    `], env);

    // 4. Save metadata
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
    console.error('Stop session failed:', err);
    try { fs.unlinkSync(STATE_FILE); } catch {}
    try { fs.unlinkSync(STOP_FLAG); } catch {}
    sender.send('progress', { step: 'error', message: err.message || 'Processing failed.' });
    return { error: err.message || 'Processing failed.' };
  }
});

function runPython(pythonPath, args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python exited with ${code}: ${stderr}`));
    });
    proc.on('error', (err) => {
      if (pythonPath !== 'python' && process.platform === 'win32') {
        const retry = spawn('python', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let retryStderr = '';
        retry.stderr.on('data', (d) => { retryStderr += d.toString(); });
        retry.on('exit', (c) => {
          if (c === 0) resolve();
          else reject(new Error(`Python exited with ${c}: ${retryStderr}`));
        });
        retry.on('error', reject);
        return;
      }
      reject(err);
    });
  });
}

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
    const metaPath = path.join(dir, 'meta.json');
    const momPath = path.join(dir, 'mom.json');

    if (fs.existsSync(metaPath)) {
      try {
        Object.assign(meta, JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
      } catch {}
    } else {
      const ts = parseInt(d.replace('session_', ''), 10);
      meta.started_at = ts;
      meta.title = 'Meeting';
      meta.session_id = d;
    }

    meta.hasMom = fs.existsSync(momPath);
    meta.session_id = meta.session_id || d;
    return meta;
  });
});

ipcMain.handle('session:get-mom', (_e, sessionId) => {
  const momPath = path.join(STATE_DIR, sessionId, 'mom.json');
  if (!fs.existsSync(momPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(momPath, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle('session:get-transcript', (_e, sessionId) => {
  const txPath = path.join(STATE_DIR, sessionId, 'transcript.txt');
  if (!fs.existsSync(txPath)) return null;
  try {
    return fs.readFileSync(txPath, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('session:delete', (_e, sessionId) => {
  const dir = path.join(STATE_DIR, sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { ok: true };
});
