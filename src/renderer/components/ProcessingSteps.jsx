import React from 'react';

const STEPS = [
  { key: 'stopping', label: 'Stopping recording' },
  { key: 'transcribing', label: 'Transcribing audio' },
  { key: 'summarizing', label: 'Generating MOM with Gemini' },
  { key: 'done', label: 'Done!' },
];

function getStepState(stepKey, currentStep) {
  if (currentStep === 'error') return 'pending';
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const stepIdx = STEPS.findIndex((s) => s.key === stepKey);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return currentStep === 'done' ? 'done' : 'active';
  return 'pending';
}

export default function ProcessingSteps({ currentStep, errorMessage, onDismiss }) {
  if (currentStep === 'error') {
    return (
      <div className="processing" style={{ maxWidth: '460px', margin: '0 auto', textAlign: 'center' }}>
        <div className="processing__title" style={{ color: '#ef4444' }}>Processing Error</div>
        <div style={{ color: '#d1d5db', fontSize: '14px', margin: '16px 0 24px', lineHeight: '1.5', background: 'rgba(239, 68, 68, 0.1)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          {errorMessage || 'An error occurred during meeting processing.'}
        </div>
        {onDismiss && (
          <button
            className="settings__save-btn"
            style={{ width: 'auto', padding: '8px 24px' }}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="processing">
      <div className="processing__title">Processing Meeting</div>
      <div className="processing__steps">
        {STEPS.map((step) => {
          const state = getStepState(step.key, currentStep);
          return (
            <div
              key={step.key}
              className={`processing__step processing__step--${state}`}
            >
              <div className="processing__step-icon">
                {state === 'done' ? '✓' : state === 'active' ? '◌' : '○'}
              </div>
              <div className="processing__step-label">{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
