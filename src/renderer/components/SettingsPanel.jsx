import React, { useState, useEffect } from 'react';

export default function SettingsPanel() {
  const [settings, setSettings] = useState({
    pythonPath: 'python3',
    whisperModel: 'small',
    geminiModel: 'gemini-2.0-flash',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.momAPI.getSettings().then(setSettings);
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
        <label className="settings__label">Whisper Model</label>
        <select
          className="settings__select"
          value={settings.whisperModel}
          onChange={(e) => update('whisperModel', e.target.value)}
        >
          <option value="tiny">Tiny — Fastest, least accurate</option>
          <option value="base">Base — Fast, decent accuracy</option>
          <option value="small">Small — Balanced (recommended)</option>
          <option value="medium">Medium — Best accuracy, slower</option>
        </select>
        <p className="settings__hint">
          Larger models are more accurate but take longer to transcribe.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Gemini Model</label>
        <input
          className="settings__input"
          type="text"
          value={settings.geminiModel}
          onChange={(e) => update('geminiModel', e.target.value)}
          placeholder="gemini-2.0-flash"
        />
        <p className="settings__hint">
          The Gemini model used for generating meeting minutes.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Python Path</label>
        <input
          className="settings__input"
          type="text"
          value={settings.pythonPath}
          onChange={(e) => update('pythonPath', e.target.value)}
          placeholder="python3"
        />
        <p className="settings__hint">
          Path to the Python executable. Use a full path if using a virtual environment.
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
