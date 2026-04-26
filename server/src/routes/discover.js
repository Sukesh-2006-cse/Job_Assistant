const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const Profile = require('../../models/Profile');
const orchestratorAgent = require('../agents/orchestratorAgent');
const { TRIGGERS } = require('../agents/agentConfig');

// API Config (Env variables)
const ADZUNA_ID = process.env.ADZUNA_ID;
const ADZUNA_KEY = process.env.ADZUNA_KEY;
const JSEARCH_KEY = process.env.JSEARCH_KEY;
const MUSE_KEY = process.env.MUSE_KEY;

// GET /api/discover/match/:jobId - Analyse technical fit
router.get('/match/:jobId', authMiddleware, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { job } = req.query; // Expecting basic job info in query or fetch logic here

        // If job info isn't passed, we'd normally fetch it by ID from a job cache or DB
        // For this implementation, we'll assume the frontend passes sufficient context or we fetch it

        const profile = await Profile.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const result = await orchestratorAgent.run({
            trigger: TRIGGERS.JOB_VIEWED,
            userId: req.user._id,
            context: {
                job: JSON.parse(job), // Frontend passes stringified job object
                profile
            }
        });

        res.json(result);
    } catch (error) {
        console.error('[Discover] Match Error:', error);
        res.status(500).json({ error: 'Failed to analyze job match' });
    }
});

// POST /api/discover/generate-cover-letter - AI generate cover letter
router.post('/generate-cover-letter', authMiddleware, async (req, res) => {
    try {
        const { job } = req.body;
        const profile = await Profile.findOne({ userId: req.user.id }).populate('userId', 'name email');

        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const result = await orchestratorAgent.run({
            trigger: TRIGGERS.GENERATE_COVER_LETTER,
            userId: req.user._id,
            context: { job, profile }
        });

        res.json(result);
    } catch (error) {
        console.error('[Discover] Cover Letter Error Details:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ error: 'Failed to generate cover letter: ' + error.message });
    }
});

// --- Existing Discovery Logic (Migrated from server.js) ---

router.get('/jobs', authMiddleware, async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    try {
        const [jSearch, adzuna, remotive, muse] = await Promise.all([
            fetchJSearchJobs(query),
            fetchAdzunaJobs(query),
            fetchRemotiveJobs(query),
            fetchMuseJobs(query)
        ]);

        const allJobs = [...jSearch, ...adzuna, ...remotive, ...muse];

        // Update RAG context with latest discovery results (fire and forget)
        const userId = req.user?.id || req.user?._id;
        if (userId) {
            const topJobs = allJobs.slice(0, 10);
            const { storeDiscoveryChunk } = require('../rag/contextManager');
            storeDiscoveryChunk(userId, topJobs).catch(e => console.error('[Discover] RAG Update Error:', e));
        }

        res.json(allJobs);
    } catch (error) {
        console.error('Aggregator Error:', error);
        res.status(500).json({ error: 'Failed to aggregate jobs' });
    }
});

const fetchJSearchJobs = async (query) => {
    try {
        const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
            params: { query, page: '1', num_pages: '1' },
            headers: {
                'X-RapidAPI-Key': JSEARCH_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            }
        });
        return response.data.data.map(job => {
            let salary = null;
            if (job.job_min_salary && job.job_max_salary) {
                const currency = job.job_salary_currency || 'USD';
                salary = `${currency} ${Number(job.job_min_salary).toLocaleString()} – ${Number(job.job_max_salary).toLocaleString()}`;
                if (job.job_salary_period) salary += ` / ${job.job_salary_period}`;
            } else if (job.job_min_salary) {
                const currency = job.job_salary_currency || 'USD';
                salary = `${currency} ${Number(job.job_min_salary).toLocaleString()}+`;
            }
            return {
                id: job.job_id,
                title: job.job_title,
                company: job.employer_name,
                location: `${job.job_city || ''} ${job.job_country || ''}`,
                type: job.job_employment_type,
                url: job.job_apply_link,
                source: 'JSearch (LinkedIn/Indeed)',
                logo: job.employer_logo,
                salary,
                description: job.job_description || "Professional job opportunity. Click 'View & Apply' to read the full description and requirements on the company website."
            };
        });
    } catch (error) {
        console.error('JSearch Error:', error.message);
        return [];
    }
};

const fetchAdzunaJobs = async (query) => {
    try {
        const response = await axios.get(`https://api.adzuna.com/v1/api/jobs/in/search/1`, {
            params: {
                app_id: ADZUNA_ID,
                app_key: ADZUNA_KEY,
                results_per_page: 10,
                what: query
            }
        });
        return response.data.results.map(job => {
            let salary = null;
            if (job.salary_min && job.salary_max) {
                salary = `£${Number(job.salary_min).toLocaleString()} – £${Number(job.salary_max).toLocaleString()} / year`;
            } else if (job.salary_min) {
                salary = `£${Number(job.salary_min).toLocaleString()}+ / year`;
            }
            return {
                id: job.id,
                title: job.title,
                company: job.company.display_name,
                location: job.location.display_name,
                type: job.contract_type || 'Full-time',
                url: job.redirect_url,
                source: 'Adzuna',
                logo: null,
                salary,
                description: job.description || "Detailed job listing on Adzuna. View the full posting for more information about this role and company."
            };
        });
    } catch (error) {
        console.error('Adzuna Error:', error.message);
        return [];
    }
};

const fetchRemotiveJobs = async (query) => {
    try {
        const response = await axios.get(`https://remotive.com/api/remote-jobs`, {
            params: { search: query, limit: 10 }
        });
        return response.data.jobs.map(job => ({
            id: job.id.toString(),
            title: job.title,
            company: job.company_name,
            location: 'Remote',
            type: job.job_type,
            url: job.url,
            source: 'Remotive',
            logo: job.company_logo,
            description: job.description?.replace(/<[^>]*>/g, '') || "Remote-first position. Click to see the full benefits and role details on Remotive."
        }));
    } catch (error) {
        console.error('Remotive Error:', error.message);
        return [];
    }
};

const fetchMuseJobs = async (query) => {
    try {
        const response = await axios.get(`https://www.themuse.com/api/public/jobs`, {
            params: { category: query, page: 0 }
        });
        return response.data.results.map(job => ({
            id: job.id.toString(),
            title: job.name,
            company: job.company.name,
            location: job.locations[0]?.name || 'On-site',
            type: 'Full-time',
            url: job.refs.landing_page,
            source: 'The Muse',
            logo: null,
            description: "High-growth opportunity featured on The Muse. Explore the company's culture and the full job description via the apply link."
        }));
    } catch (error) {
        console.error('Muse Error:', error.message);
        return [];
    }
};

module.exports = router;
