import React from 'react';

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

      <div className="titlebar__title">M.O.M Agent</div>

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
