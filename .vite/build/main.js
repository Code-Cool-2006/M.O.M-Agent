"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const STATE_DIR = path.join(require("os").homedir(), ".mom-agent");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const STOP_FLAG = path.join(STATE_DIR, "stop.flag");
const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
function pyScript(name) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, name);
  }
  return path.join(app.getAppPath(), name);
}
function loadDotEnv() {
  const envPath = path.join(app.getAppPath(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#1e1e1e",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  mainWindow.once("ready-to-show", () => mainWindow.show());
}
app.whenReady().then(() => {
  loadDotEnv();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
ipcMain.on("app:minimize", () => mainWindow == null ? void 0 : mainWindow.minimize());
ipcMain.on("app:maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow == null ? void 0 : mainWindow.maximize();
});
ipcMain.on("app:close", () => mainWindow == null ? void 0 : mainWindow.close());
function getSettings() {
  const defaults = {
    pythonPath: "python3",
    whisperModel: "small",
    geminiModel: "gemini-2.0-flash"
  };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) };
    }
  } catch {
  }
  return defaults;
}
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:save", (_e, settings) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return { ok: true };
});
let captureProc = null;
ipcMain.handle("session:start", async (_e, title) => {
  if (fs.existsSync(STATE_FILE)) {
    return { error: "A session is already running." };
  }
  if (fs.existsSync(STOP_FLAG)) fs.unlinkSync(STOP_FLAG);
  const sessionId = `session_${Math.floor(Date.now() / 1e3)}`;
  const sessionDir = path.join(STATE_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const wavPath = path.join(sessionDir, "audio.wav");
  const settings = getSettings();
  const pythonPath = settings.pythonPath || "python3";
  captureProc = spawn(pythonPath, [
    pyScript("capture.py"),
    "--out",
    wavPath,
    "--stop-flag",
    STOP_FLAG
  ], {
    detached: false,
    stdio: "ignore",
    env: { ...process.env }
  });
  const state = {
    pid: captureProc.pid,
    title: title || "Meeting",
    wav_path: wavPath,
    session_dir: sessionDir,
    session_id: sessionId,
    started_at: Date.now() / 1e3
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  captureProc.on("exit", () => {
    captureProc = null;
  });
  return { ok: true, ...state };
});
ipcMain.handle("session:stop", async (event) => {
  if (!fs.existsSync(STATE_FILE)) {
    return { error: "No active session." };
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  const sender = event.sender;
  sender.send("progress", { step: "stopping", message: "Stopping recording..." });
  fs.writeFileSync(STOP_FLAG, "");
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
      captureProc.on("exit", () => {
        clearInterval(interval);
        resolve();
      });
    } else {
      clearInterval(interval);
      resolve();
    }
  });
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
  }
  try {
    fs.unlinkSync(STOP_FLAG);
  } catch {
  }
  const wavPath = state.wav_path;
  if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) {
    return { error: "No audio was captured." };
  }
  const settings = getSettings();
  const pythonPath = settings.pythonPath || "python3";
  const env = { ...process.env };
  if (settings.whisperModel) env.MOM_WHISPER_MODEL = settings.whisperModel;
  if (settings.geminiModel) env.MOM_GEMINI_MODEL = settings.geminiModel;
  sender.send("progress", { step: "transcribing", message: "Transcribing with Whisper..." });
  await runPython(pythonPath, ["-c", `
import sys; sys.path.insert(0, ${JSON.stringify(app.isPackaged ? process.resourcesPath : app.getAppPath())})
from transcribe import transcribe
t = transcribe(${JSON.stringify(wavPath)})
open(${JSON.stringify(path.join(state.session_dir, "transcript.txt"))}, 'w').write(t)
  `], env);
  sender.send("progress", { step: "summarizing", message: "Generating MOM with Gemini..." });
  await runPython(pythonPath, ["-c", `
import sys, json; sys.path.insert(0, ${JSON.stringify(app.isPackaged ? process.resourcesPath : app.getAppPath())})
from transcribe import transcribe
from summarize import generate_mom
t = open(${JSON.stringify(path.join(state.session_dir, "transcript.txt"))}).read()
mom = generate_mom(t, title=${JSON.stringify(state.title)})
open(${JSON.stringify(path.join(state.session_dir, "mom.json"))}, 'w').write(json.dumps(mom, indent=2))
  `], env);
  const meta = {
    title: state.title,
    session_id: state.session_id,
    started_at: state.started_at,
    ended_at: Date.now() / 1e3
  };
  fs.writeFileSync(path.join(state.session_dir, "meta.json"), JSON.stringify(meta, null, 2));
  sender.send("progress", { step: "done", message: "Done!", sessionId: state.session_id });
  return { ok: true, sessionId: state.session_id };
});
function runPython(pythonPath, args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python exited with ${code}: ${stderr}`));
    });
    proc.on("error", reject);
  });
}
ipcMain.handle("session:status", () => {
  if (!fs.existsSync(STATE_FILE)) return { recording: false };
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return { recording: true, ...state };
  } catch {
    return { recording: false };
  }
});
ipcMain.handle("session:list", () => {
  if (!fs.existsSync(STATE_DIR)) return [];
  const dirs = fs.readdirSync(STATE_DIR).filter((d) => d.startsWith("session_")).sort().reverse();
  return dirs.map((d) => {
    const dir = path.join(STATE_DIR, d);
    const meta = {};
    const metaPath = path.join(dir, "meta.json");
    const momPath = path.join(dir, "mom.json");
    if (fs.existsSync(metaPath)) {
      Object.assign(meta, JSON.parse(fs.readFileSync(metaPath, "utf-8")));
    } else {
      const ts = parseInt(d.replace("session_", ""), 10);
      meta.started_at = ts;
      meta.title = "Meeting";
      meta.session_id = d;
    }
    meta.hasMom = fs.existsSync(momPath);
    meta.session_id = meta.session_id || d;
    return meta;
  });
});
ipcMain.handle("session:get-mom", (_e, sessionId) => {
  const momPath = path.join(STATE_DIR, sessionId, "mom.json");
  if (!fs.existsSync(momPath)) return null;
  return JSON.parse(fs.readFileSync(momPath, "utf-8"));
});
ipcMain.handle("session:get-transcript", (_e, sessionId) => {
  const txPath = path.join(STATE_DIR, sessionId, "transcript.txt");
  if (!fs.existsSync(txPath)) return null;
  return fs.readFileSync(txPath, "utf-8");
});
ipcMain.handle("session:delete", (_e, sessionId) => {
  const dir = path.join(STATE_DIR, sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { ok: true };
});
