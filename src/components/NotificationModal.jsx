import React from 'react';
import './NotificationModal.css';

const NotificationModal = ({ isOpen, type, title, message, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className={`modal-content ${type}`}>
                <div className="modal-icon">
                    {type === 'success' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    )}
                </div>
                <h2>{title}</h2>
                <p>{message}</p>
                <button className="modal-button" onClick={onConfirm}>
                    {type === 'success' ? 'Let\'s Get Started' : 'Try Again'}
                </button>
            </div>
        </div>
    );
};

export default NotificationModal;
