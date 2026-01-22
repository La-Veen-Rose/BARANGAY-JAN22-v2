import React from "react";
import "./terminate-reason-modal.css";

const MAX_REASON_LENGTH = 500;

const TerminateReasonModal = ({
  value = "",
  error = "",
  onChange = () => {},
  onSubmit = () => {},
  onCancel = () => {}
}) => {
  const remaining = Math.max(0, MAX_REASON_LENGTH - (value ? value.length : 0));

  return (
    <div className="terminate-reason-overlay">
      <div className="terminate-reason-modal">
        <h3>Reason for Termination</h3>
        <p className="terminate-reason-description">Please provide the reason for terminating this record.</p>

        <textarea
          className="terminate-reason-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter the reason here"
          rows={4}
          maxLength={MAX_REASON_LENGTH}
        />

        <div className="terminate-reason-meta">
          <span className="terminate-reason-count">{remaining} characters remaining</span>
          {error ? <span className="terminate-reason-error">{error}</span> : null}
        </div>

        <div className="terminate-reason-actions">
          <button className="terminate-reason-submit" type="button" onClick={onSubmit}>Submit Reason</button>
          <button className="terminate-reason-cancel" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default TerminateReasonModal;
