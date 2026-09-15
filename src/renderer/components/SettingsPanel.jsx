import React, { useState, useEffect } from 'react';

export default function SettingsPanel() {
  const [settings, setSettings] = useState({
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
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
      <p className="settings__subtitle">Configure your MOM Agent AI preferences.</p>

      <div className="settings__group">
        <label className="settings__label">Gemini API Key</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="settings__input"
            type={showKey ? 'text' : 'password'}
            value={settings.geminiApiKey || ''}
            onChange={(e) => update('geminiApiKey', e.target.value)}
            placeholder="AIzaSy..."
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
          Your Google Gemini API Key from Google AI Studio. Required for audio transcription and meeting minutes generation.
        </p>
      </div>

      <div className="settings__group">
        <label className="settings__label">Gemini Model</label>
        <select
          className="settings__select"
          value={settings.geminiModel || 'gemini-3.6-flash'}
          onChange={(e) => update('geminiModel', e.target.value)}
        >
          <option value="gemini-3.6-flash">Gemini 3.6 Flash (Recommended — Fast & Accurate)</option>
          <option value="gemini-3.7-flash">Gemini 3.7 Flash (Latest 3.7)</option>
          <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
          <option value="gemini-flash-latest">Gemini Flash Latest</option>
        </select>
        <p className="settings__hint">
          Model used for audio listening, transcription, and MOM structuring.
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
