import React from 'react';
import { X, Share2, Users, Play } from 'lucide-react';

const OnboardingModal = ({ onClose }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="modal-header">
                    <h2>Welcome to Muvy! 👋</h2>
                    <p>Watch videos together with friends in perfect sync.</p>
                </div>

                <div className="onboarding-steps">
                    <div className="step">
                        <div className="step-icon">
                            <Users size={24} />
                        </div>
                        <div className="step-text">
                            <h3>1. Create a Room</h3>
                            <p>Start a new room and become the host.</p>
                        </div>
                    </div>

                    <div className="step">
                        <div className="step-icon">
                            <Share2 size={24} />
                        </div>
                        <div className="step-text">
                            <h3>2. Invite Friends</h3>
                            <p>Share the room link so others can join you.</p>
                        </div>
                    </div>

                    <div className="step">
                        <div className="step-icon">
                            <Play size={24} />
                        </div>
                        <div className="step-text">
                            <h3>3. Watch Together</h3>
                            <p>Play, pause, and seek - everyone stays in sync!</p>
                        </div>
                    </div>
                </div>

                <button className="modal-action-btn" onClick={onClose}>
                    Let's Go! 🚀
                </button>
            </div>
        </div>
    );
};

export default OnboardingModal;
