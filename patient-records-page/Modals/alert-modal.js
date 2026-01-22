import React from "react";
import "./alert-modal.css";

const AlertModal = ({ 
  title = "localhost:5001 says", 
  message = "", 
  onClose = () => {},
  buttonText = "OK"
}) => {
  return (
    <div className="alert-overlay">
      <div className="alert-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="alert-buttons">
          <button 
            className="alert-btn" 
            onClick={onClose}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
