import React from 'react';

const STEPS = [
  { key: 'stopping', label: 'Stopping recording' },
  { key: 'transcribing', label: 'Transcribing with Whisper' },
  { key: 'summarizing', label: 'Generating MOM with Gemini' },
  { key: 'done', label: 'Done!' },
];

function getStepState(stepKey, currentStep) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const stepIdx = STEPS.findIndex((s) => s.key === stepKey);
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return currentStep === 'done' ? 'done' : 'active';
  return 'pending';
}

export default function ProcessingSteps({ currentStep }) {
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
