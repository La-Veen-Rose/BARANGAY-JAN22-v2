import React from "react";
import "./confirmation-modal.css";

const ConfirmationModal = ({ 
  title = "Confirm Action", 
  message = "Are you sure?", 
  onConfirm = () => {}, 
  onCancel = () => {},
  confirmText = "OK",
  cancelText = "Cancel",
  isDangerous = false
}) => {
  return (
    <div className="confirmation-overlay">
      <div className="confirmation-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirmation-buttons">
          <button 
            className="confirmation-confirm-btn" 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
          <button 
            className="confirmation-cancel-btn" 
            onClick={onCancel}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
