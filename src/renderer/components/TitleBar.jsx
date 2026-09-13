import React from 'react';
import appIcon from '../assets/icon.png';

export default function TitleBar({ onSettingsClick }) {
  return (
    <div className="titlebar">
      <div className="titlebar__traffic-lights">
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.momAPI.close()}
          title="Close"
        />
        <button
          className="titlebar__btn titlebar__btn--minimize"
          onClick={() => window.momAPI.minimize()}
          title="Minimize"
        />
        <button
          className="titlebar__btn titlebar__btn--maximize"
          onClick={() => window.momAPI.maximize()}
          title="Maximize"
        />
      </div>

      <div className="titlebar__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src={appIcon} alt="M.O.M Agent" style={{ width: '16px', height: '16px', borderRadius: '3px' }} />
        <span>M.O.M Agent</span>
      </div>

      <div className="titlebar__actions">
        <button
          className="titlebar__icon-btn"
          onClick={onSettingsClick}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
