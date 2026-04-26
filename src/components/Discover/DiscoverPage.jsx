import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DiscoverPage.css';
import Navigation from '../Navigation/Navigation';
import CoverLetterModal from './CoverLetterModal';
import { Target, MapPin, Briefcase, FileText, ExternalLink, RefreshCw, AlertCircle, DollarSign } from 'lucide-react';

const JobCard = ({ job, onGenerateCL }) => (
    <div className="job-card">
        <div className="job-card-header">
            {job.logo ? (
                <img src={job.logo} alt={job.company} className="company-logo" />
            ) : (
                <div className="company-logo-placeholder">{job.company.charAt(0)}</div>
            )}
            <div className="job-info">
                <h3>{job.title}</h3>
                <div className="company-row">
                    <p className="company-name">{job.company}</p>
                    {job.matchScore && (
                        <span className="match-badge">
                            <Target size={14} style={{ marginRight: '4px' }} />
                            {job.matchScore}%
                        </span>
                    )}
                </div>
            </div>
            <span className="source-tag">{job.source}</span>
        </div>
        <div className="job-card-body">
            <div className="job-meta">
                <span><MapPin size={16} /> {job.location}</span>
                <span><Briefcase size={16} /> {job.type}</span>
            </div>
            {job.salary && (
                <div className="salary-badge">
                    <DollarSign size={14} />
                    {job.salary}
                </div>
            )}
            <p className="job-description">{job.description}</p>
        </div>
        <div className="job-card-footer">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="apply-btn">
                <ExternalLink size={20} style={{ marginRight: '8px' }} />
                View & Apply
            </a>
            <button className="cover-letter-btn" onClick={() => onGenerateCL(job)}>
                <FileText size={20} style={{ marginRight: '8px' }} />
                Cover Letter
            </button>
        </div>
    </div>
);

const DiscoverPage = () => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal State
    const [isclModalOpen, setIsCLModalOpen] = useState(false);
    const [currentCLContent, setCurrentCLContent] = useState('');
    const [selectedJob, setSelectedJob] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        const fetchUserAndJobs = async (forceRefresh = false) => {
            try {
                setLoading(true);
                if (!user) {
                    navigate('/');
                    return;
                }

                const token = localStorage.getItem('token');

                // Check Cache first if not force refreshing
                if (!forceRefresh) {
                    const cachedJobs = sessionStorage.getItem('discovered_jobs');
                    const cachedProfile = sessionStorage.getItem('user_profile');

                    if (cachedJobs && cachedProfile) {
                        console.log('[Discover] Using cached session data');
                        setJobs(JSON.parse(cachedJobs));
                        setProfile(JSON.parse(cachedProfile));
                        setLoading(false);
                        return;
                    }
                }

                // Support both id and _id
                const userId = user.id || user._id;

                if (!userId) {
                    console.error('No User ID found in localStorage', user);
                    throw new Error('User ID missing. Please login again.');
                }

                // 1. Fetch the user's detailed profile (using unified /api/profile)
                const profileRes = await fetch(`http://127.0.0.1:5000/api/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (profileRes.status === 404) {
                    console.log('Profile not found, redirecting to onboarding');
                    navigate('/onboarding');
                    return;
                }

                if (!profileRes.ok) {
                    throw new Error('Failed to fetch profile info');
                }

                const profileData = await profileRes.json();
                setProfile(profileData);
                sessionStorage.setItem('user_profile', JSON.stringify(profileData));

                // 2. Determine search query (prioritize preferredRoles)
                const roleQuery = profileData.preferences?.preferredRoles?.[0];
                const skillQuery = profileData.experience?.skills?.slice(0, 2).join(' ');
                const searchQuery = roleQuery || skillQuery || 'Software Engineer';

                // 3. Fetch jobs using that personalized query (use /api/discover/jobs)
                const jobsRes = await fetch(`http://127.0.0.1:5000/api/discover/jobs?query=${encodeURIComponent(searchQuery)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!jobsRes.ok) throw new Error('Failed to fetch recommended jobs');

                const jobData = await jobsRes.json();
                setJobs(jobData);
                sessionStorage.setItem('discovered_jobs', JSON.stringify(jobData));
            } catch (err) {
                console.error('Discover Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchUserAndJobs();

        // Listen for force refresh trigger from Navigation or other sources if needed
        const handleRefresh = () => fetchUserAndJobs(true);
        window.addEventListener('refresh-discover', handleRefresh);
        return () => window.removeEventListener('refresh-discover', handleRefresh);
    }, [navigate]);

    const handleRefreshManual = () => {
        sessionStorage.removeItem('discovered_jobs');
        sessionStorage.removeItem('user_profile');
        window.location.reload(); // Simplest way to trigger the useEffect properly
    };

    const handleGenerateCL = async (job) => {
        setSelectedJob(job);
        setIsGenerating(true);
        const token = localStorage.getItem('token');

        try {
            const res = await fetch('http://127.0.0.1:5000/api/discover/generate-cover-letter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ job })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to generate cover letter');
            }

            const data = await res.json();
            setCurrentCLContent(data.content);
            setIsCLModalOpen(true);
        } catch (err) {
            console.error('CL Generation Error:', err);
            alert(`Error: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        window.location.href = '/';
    };

    return (
        <div className="discover-container">
            <Navigation />

            <main className="discover-main">
                <header className="discover-header">
                    <div className="discover-header-top">
                        <h1>Recommended for You</h1>
                        <button className="refresh-discover-btn" onClick={handleRefreshManual} title="Refresh Jobs">
                            <RefreshCw size={20} />
                        </button>
                    </div>
                    <p>Based on your profile and interest in <strong>{profile?.preferences?.preferredRoles?.join(', ') || 'Tech Roles'}</strong></p>
                    {profile?.experience?.skills?.length > 0 && (
                        <div className="user-skills-badges">
                            {profile.experience.skills.map(skill => (
                                <span key={skill} className="skill-badge">{skill}</span>
                            ))}
                        </div>
                    )}
                </header>

                {isGenerating && (
                    <div className="gen-overlay">
                        <div className="gen-loader">
                            <div className="gen-spinner"></div>
                            <p>AI is crafting your professional cover letter...</p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="loader-container">
                        <div className="skeleton-grid">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="skeleton-card"></div>
                            ))}
                        </div>
                        <p className="loading-text">Aggregating jobs from multiple sources...</p>
                    </div>
                ) : error ? (
                    <div className="error-message">
                        <p><AlertCircle size={24} color="#ef4444" /> {error}</p>
                        <button onClick={() => window.location.reload()}>
                            <RefreshCw size={16} style={{ marginRight: '8px' }} />
                            Try Again
                        </button>
                    </div>
                ) : (
                    <div className="jobs-grid">
                        {jobs.length > 0 ? (
                            jobs.map(job => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    onGenerateCL={handleGenerateCL}
                                />
                            ))
                        ) : (
                            <p className="no-jobs">No jobs found matching your profile. Try updating your skills!</p>
                        )}
                    </div>
                )}
            </main>

            <CoverLetterModal
                isOpen={isclModalOpen}
                onClose={() => setIsCLModalOpen(false)}
                content={currentCLContent}
                job={selectedJob}
                userProfile={profile}
            />
        </div>
    );
};

export default DiscoverPage;
