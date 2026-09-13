import React, { useState, useEffect } from 'react';

export default function SettingsPanel() {
  const [settings, setSettings] = useState({
    geminiApiKey: '',
    geminiModel: 'gemini-3.6-flash',
    whisperModel: 'small',
    pythonPath: 'python',
  });
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    window.momAPI.getSettings().then((data) => {
      if (data) {
        setSettings((prev) => ({ ...prev, ...data }));
      }
    });
  }, []);

  const handleSave = async () => {
    await window.momAPI.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  return (
    <div className="settings">
      <h1 className="settings__title">Settings</h1>
      <p className="settings__subtitle">Configure your MOM Agent preferences.</p>

      <div className="settings__group">
        <label className="settings__label">Gemini API Key</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="settings__input"
            type={showKey ? 'text' : 'password'}
            value={settings.geminiApiKey || ''}
            onChange={(e) => update('geminiApiKey', e.target.value)}
            placeholder="AIzaSy... / AQ.Ab8..."
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="titlebar__icon-btn"
            style={{ padding: '0 12px', height: '38px', borderRadius: '6px', border: '1px solid #333' }}
            onClick={() => setShowKey(!showKey)}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <p className="settings__hint">
          Your Google Gemini API Key. Required for transcription and meeting minutes generation.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Gemini Model</label>
        <input
          className="settings__input"
          type="text"
          value={settings.geminiModel || 'gemini-3.6-flash'}
          onChange={(e) => update('geminiModel', e.target.value)}
          placeholder="gemini-3.6-flash"
        />
        <p className="settings__hint">
          Recommended: gemini-3.6-flash for fast and structured summaries.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Whisper Model</label>
        <select
          className="settings__select"
          value={settings.whisperModel || 'small'}
          onChange={(e) => update('whisperModel', e.target.value)}
        >
          <option value="tiny">Tiny — Fastest, least accurate</option>
          <option value="base">Base — Fast, good accuracy</option>
          <option value="small">Small — Balanced (recommended)</option>
          <option value="medium">Medium — High accuracy, slower</option>
        </select>
        <p className="settings__hint">
          Used for local transcription. Automatically falls back to Gemini Audio if unavailable.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Python Path</label>
        <input
          className="settings__input"
          type="text"
          value={settings.pythonPath || ''}
          onChange={(e) => update('pythonPath', e.target.value)}
          placeholder="python"
        />
        <p className="settings__hint">
          Command or full path to the Python executable (e.g. "python" on Windows, "python3" on Linux/macOS).
        </p>
      </div>

      <button className="settings__save-btn" onClick={handleSave}>
        Save Settings
      </button>

      {saved && (
        <div className="settings__toast">
          ✓ Settings saved successfully
        </div>
      )}
    </div>
  );
}
