import React, { useEffect, useState } from 'react';
import styles from './SignalCard.module.css';

const TYPE_CONFIG = {
    Opportunity: { bg: '#dcfce7', text: '#166534', label: 'Opportunity' },
    Warning: { bg: '#fee2e2', text: '#991b1b', label: 'Warning' },
    Trend: { bg: '#dbeafe', text: '#1e40af', label: 'Trend' },
    Insight: { bg: '#fef3c7', text: '#92400e', label: 'Insight' },
};

const SEVERITY_COLOR = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#9ca3af',
};

const SignalCard = ({ signal, onActionClick, index = 0 }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 50 + index * 100);
        return () => clearTimeout(t);
    }, [index]);

    const typeConfig = TYPE_CONFIG[signal.type] || TYPE_CONFIG.Insight;

    return (
        <div
            className={`${styles.card} ${visible ? styles.visible : ''}`}
            style={{ transitionDelay: `${index * 0.1}s` }}
        >
            {/* Top Row */}
            <div className={styles.topRow}>
                <div className={styles.typeGroup}>
                    <span className={styles.icon} role="img" aria-label={signal.type}>
                        {signal.icon}
                    </span>
                    <span
                        className={styles.typeBadge}
                        style={{ backgroundColor: typeConfig.bg, color: typeConfig.text }}
                    >
                        {typeConfig.label}
                    </span>
                </div>
                <span
                    className={styles.severityDot}
                    style={{ backgroundColor: SEVERITY_COLOR[signal.severity] || SEVERITY_COLOR.low }}
                    title={`Severity: ${signal.severity}`}
                />
            </div>

            {/* Middle */}
            <p className={styles.message}>{signal.message}</p>
            <p className={styles.detail}>{signal.detail}</p>

            {/* Bottom Action */}
            <button
                className={styles.actionBtn}
                onClick={() => onActionClick && onActionClick(signal.actionRoute)}
            >
                {signal.action}
            </button>
        </div>
    );
};

export default SignalCard;
