import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import StatsBar from '../../components/StatsBar/StatsBar';
import ButlerCard from '../../components/ButlerCard/ButlerCard';
import Navigation from '../../components/Navigation/Navigation';
import NotificationModal from '../../components/NotificationModal';
import { getButlerToday, markActionDone, getBriefing, generateBriefing, runOrchestrator } from '../../api/butlerApi';
import { TRIGGERS } from '../../constants/triggers';

const Dashboard = () => {
    const navigate = useNavigate();
    const [actions, setActions] = useState([]);
    const [stats, setStats] = useState({
        totalJobs: 0,
        totalApplied: 0,
        totalInterview: 0,
        totalOffer: 0,
        followUpsDue: 0
    });
    const [loading, setLoading] = useState(true);
    const [briefing, setBriefing] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [generatingBriefing, setGeneratingBriefing] = useState(false);
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'success',
        title: '',
        message: '',
        navTo: null
    });

    const fetchDashboard = useCallback(async (isSilent = false) => {
        if (!isSilent) setRefreshing(true);
        try {
            console.log('[Dashboard] Fetching data...');
            const butlerData = await getButlerToday();
            console.log('[Dashboard] Butler Data:', butlerData);

            let briefingData = { briefing: null };
            try {
                briefingData = await getBriefing();
                console.log('[Dashboard] Briefing Data:', briefingData);
            } catch (bErr) {
                console.warn('[Dashboard] Optional Briefing fetch failed:', bErr);
            }

            if (butlerData && butlerData.stats) {
                setActions(butlerData.actions || []);
                setStats(butlerData.stats);

                // Sync briefing counts if available
                if (briefingData && briefingData.briefing) {
                    const synced = {
                        ...briefingData.briefing,
                        followUpCount: butlerData.stats.followUpsDue || 0,
                        interviewCount: butlerData.stats.totalInterview || 0,
                        totalJobs: butlerData.stats.totalJobs || 0,
                        jobMatchesCount: butlerData.jobMatches ? butlerData.jobMatches.length : 0
                    };
                    setBriefing(synced);
                } else {
                    setBriefing(null);
                }
            }

            setError(null);
        } catch (err) {
            console.error('Dashboard Load Error:', err);
            setError("Could not load your dashboard. Please try again.");
        } finally {
            if (!isSilent) setRefreshing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard();

        const handleFocus = () => fetchDashboard(true);
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchDashboard]);

    const handleMarkDone = async (jobId) => {
        try {
            await markActionDone(jobId);
            // Instant UI update
            setActions(prev => prev.filter(a => a._id !== jobId));
            // Update stats locally
            setStats(prev => ({
                ...prev,
                followUpsDue: Math.max(0, prev.followUpsDue - 1)
            }));
        } catch (err) {
            console.error('Action Update Error:', err);
        }
    };

    const handleGenerateBriefing = async () => {
        setGeneratingBriefing(true);
        try {
            await generateBriefing();
            const data = await getBriefing();
            if (data.briefing) {
                setBriefing(data.briefing);
                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: 'Briefing Generated!',
                    message: data.briefing.message,
                    navTo: null
                });
            }
        } catch (err) {
            console.error('Briefing Generation Error:', err);
        } finally {
            setGeneratingBriefing(false);
        }
    };

    const handleActionBrief = async (job) => {
        setRefreshing(true);
        try {
            const data = await runOrchestrator(TRIGGERS.ASK_BUTLER, { job });
            if (data && data.suggestion) {
                setModalConfig({
                    isOpen: true,
                    type: 'success',
                    title: `Butler's Advice: ${job.company}`,
                    message: data.suggestion,
                    navTo: null
                });
            }
        } catch (err) {
            console.error('Action Brief Error:', err);
        } finally {
            setRefreshing(false);
        }
    };

    const handleModalConfirm = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        if (modalConfig.navTo) {
            navigate(modalConfig.navTo);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <Navigation />
                <div className={styles.header}>
                    <div className={styles.skeletonTitle}></div>
                </div>
                <div className={styles.cardList}>
                    {[1, 2, 3].map(i => <div key={i} className={styles.skeleton}></div>)}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <Navigation />

            <div className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Your Butler Today</h1>
                        <p className={styles.subtitle}>Here is what needs your attention</p>
                    </div>
                    <div className={styles.headerActions}>
                        <button
                            className={`${styles.generateBriefingBtn} ${generatingBriefing ? styles.spinning : ''}`}
                            onClick={handleGenerateBriefing}
                            disabled={generatingBriefing}
                            title="Generate Briefing"
                        >
                            {generatingBriefing ? 'Generating...' : '✨ Generate Briefing'}
                        </button>
                        <button
                            className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                            onClick={() => fetchDashboard()}
                            title="Refresh Dashboard"
                        >
                            ↻
                        </button>
                    </div>
                </header>

                {briefing && (
                    <div className={styles.briefingCard}>
                        <div className={styles.briefingLeft}>
                            <span className={styles.briefingIcon}>🌅</span>
                        </div>
                        <div className={styles.briefingCenter}>
                            <p className={styles.briefingMessage}>{briefing.message}</p>
                            <span className={styles.briefingTime}>
                                Generated at {new Date(briefing.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today
                            </span>
                        </div>
                        <div className={styles.briefingRight}>
                            <div className={styles.briefingPills}>
                                {briefing.totalJobs > 0 && (
                                    <span className={`${styles.pill} ${styles.pillSlate}`}>{briefing.totalJobs} total jobs</span>
                                )}
                                {briefing.followUpCount > 0 && (
                                    <span className={`${styles.pill} ${styles.pillRed}`}>{briefing.followUpCount} follow-ups</span>
                                )}
                                {briefing.interviewCount > 0 && (
                                    <span className={`${styles.pill} ${styles.pillAmber}`}>{briefing.interviewCount} interviews</span>
                                )}
                                {briefing.jobMatchesCount > 0 && (
                                    <span className={`${styles.pill} ${styles.pillEmerald}`}>{briefing.jobMatchesCount} matches</span>
                                )}
                                {briefing.newJobsCount > 0 && (
                                    <span className={`${styles.pill} ${styles.pillBlue}`}>new jobs</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <StatsBar stats={stats} />

                <hr className={styles.divider} />

                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Actions for Today</h2>
                    <span className={styles.sectionCount}>({actions.length} items)</span>
                </div>

                {error ? (
                    <div className={styles.errorBox}>
                        <p>{error}</p>
                        <button className={styles.retryBtn} onClick={() => fetchDashboard()}>
                            Retry
                        </button>
                    </div>
                ) : actions.length === 0 ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}>✓</span>
                        <h3 className={styles.emptyTitle}>You are all caught up!</h3>
                        <p className={styles.emptyText}>
                            No follow-ups needed today. Check back tomorrow or add new applications.
                        </p>
                        <Link to="/discover" className={styles.discoverBtn}>
                            Discover New Jobs
                        </Link>
                    </div>
                ) : (
                    <div className={styles.cardList}>
                        {actions.map((action, index) => (
                            <ButlerCard
                                key={action._id}
                                job={action}
                                index={index}
                                onMarkDone={handleMarkDone}
                                onGenerateBrief={handleActionBrief}
                            />
                        ))}
                    </div>
                )}

                <Link to="/applications" className={styles.viewAllLink}>
                    View all applications →
                </Link>
            </div>

            <NotificationModal
                isOpen={modalConfig.isOpen}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={handleModalConfirm}
            />
        </div>
    );
};

export default Dashboard;
