import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ButlerCard.module.css';

const ButlerCard = ({ job, onMarkDone, onGenerateBrief, index }) => {
    const navigate = useNavigate();
    const [isVisible, setIsVisible] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    const handleMarkDone = async () => {
        setIsProcessing(true);
        setIsDone(true);

        // Wait 500ms as per requirements before fading out
        setTimeout(async () => {
            await onMarkDone(job._id);
        }, 500);
    };

    const getPriorityClass = () => {
        return styles[job.priority.toLowerCase()] || '';
    };

    const getDaysText = () => {
        if (job.daysSince === 0) return 'today';
        if (job.daysSince === 1) return 'yesterday';
        return `${job.daysSince} days ago`;
    };

    return (
        <div
            className={`${styles.card} ${isVisible ? styles.visible : ''} ${isDone ? styles.done : ''}`}
            style={{ transitionDelay: `${index * 0.08}s` }}
        >
            <div className={styles.topRow}>
                <div className={styles.info}>
                    <h3 className={styles.company}>{job.company}</h3>
                    <p className={styles.role}>{job.role}</p>
                </div>
                <span className={`${styles.priorityBadge} ${getPriorityClass()}`}>
                    {job.priority}
                </span>
            </div>

            <div className={`${styles.actionRow} ${styles[`tint${job.priority}`]}`}>
                <span className={styles.icon}>🤵</span>
                <p className={styles.actionMessage}>{job.action}</p>
            </div>

            <div className={styles.metaRow}>
                <span className={styles.metaItem}>{getDaysText()}</span>
                {job.platform && <span className={styles.platformPill}>{job.platform}</span>}
            </div>

            <div className={styles.buttonsRow}>
                <button
                    className={styles.markDoneBtn}
                    onClick={handleMarkDone}
                    disabled={isProcessing}
                >
                    {isDone ? 'Done ✓' : 'Mark as Done'}
                </button>
                <button
                    className={styles.viewDetailsBtn}
                    onClick={() => navigate('/jobs/' + job._id)}
                >
                    View Details
                </button>
                <button
                    className={styles.briefBtn}
                    onClick={() => onGenerateBrief(job)}
                    title="Generate AI Brief for this action"
                >
                    ✨ Brief
                </button>
            </div>
        </div>
    );
};

export default ButlerCard;
