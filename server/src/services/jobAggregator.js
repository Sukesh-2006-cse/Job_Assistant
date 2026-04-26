/**
 * Job Aggregator Service
 * Fetches jobs from all 4 external APIs and returns a merged, normalised array.
 * This is extracted from discover.js so the orchestrator can call it without
 * making new API routes or duplicating fetch logic.
 */
const axios = require('axios');

const JSEARCH_KEY = process.env.JSEARCH_KEY;
const ADZUNA_ID = process.env.ADZUNA_ID;
const ADZUNA_KEY = process.env.ADZUNA_KEY;

// ─────────────────────────────────────────────────────────────
// Individual API fetchers (each returns a normalised array)
// ─────────────────────────────────────────────────────────────

async function fetchJSearchJobs(query) {
    try {
        const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
            params: { query, page: '1', num_pages: '1' },
            headers: {
                'X-RapidAPI-Key': JSEARCH_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
            timeout: 8000,
        });
        return (response.data.data || []).map(job => ({
            id: job.job_id,
            title: job.job_title,
            company: job.employer_name,
            location: `${job.job_city || ''} ${job.job_country || ''}`.trim(),
            type: job.job_employment_type,
            url: job.job_apply_link,
            source: 'JSearch',
            logo: job.employer_logo,
            remote: job.job_is_remote || false,
            skills: job.job_required_skills || [],
            description: job.job_description || '',
        }));
    } catch (err) {
        console.error('[JobAggregator] JSearch error:', err.message);
        return [];
    }
}

async function fetchAdzunaJobs(query) {
    try {
        const response = await axios.get('https://api.adzuna.com/v1/api/jobs/in/search/1', {
            params: {
                app_id: ADZUNA_ID,
                app_key: ADZUNA_KEY,
                results_per_page: 10,
                what: query,
            },
            timeout: 8000,
        });
        return (response.data.results || []).map(job => ({
            id: job.id,
            title: job.title,
            company: job.company?.display_name || 'Unknown',
            location: job.location?.display_name || '',
            type: job.contract_type || 'Full-time',
            url: job.redirect_url,
            source: 'Adzuna',
            logo: null,
            remote: false,
            skills: [],
            description: job.description || '',
        }));
    } catch (err) {
        console.error('[JobAggregator] Adzuna error:', err.message);
        return [];
    }
}

async function fetchRemotiveJobs(query) {
    try {
        const response = await axios.get('https://remotive.com/api/remote-jobs', {
            params: { search: query, limit: 10 },
            timeout: 8000,
        });
        return (response.data.jobs || []).map(job => ({
            id: job.id?.toString(),
            title: job.title,
            company: job.company_name,
            location: 'Remote',
            type: job.job_type,
            url: job.url,
            source: 'Remotive',
            logo: job.company_logo,
            remote: true,
            skills: job.tags || [],
            description: (job.description || '').replace(/<[^>]*>/g, ''),
        }));
    } catch (err) {
        console.error('[JobAggregator] Remotive error:', err.message);
        return [];
    }
}

async function fetchMuseJobs(query) {
    try {
        const response = await axios.get('https://www.themuse.com/api/public/jobs', {
            params: { category: query, page: 0 },
            timeout: 8000,
        });
        return (response.data.results || []).map(job => ({
            id: job.id?.toString(),
            title: job.name,
            company: job.company?.name || 'Unknown',
            location: job.locations?.[0]?.name || 'On-site',
            type: 'Full-time',
            url: job.refs?.landing_page,
            source: 'The Muse',
            logo: null,
            remote: false,
            skills: [],
            description: '',
        }));
    } catch (err) {
        console.error('[JobAggregator] The Muse error:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate jobs from all 4 APIs in parallel.
 * @param {string} query - Search keyword (e.g. "software engineer")
 * @returns {Promise<Array>} - Merged, normalised job array
 */
async function aggregateJobs(query = 'software engineer') {
    const [jSearch, adzuna, remotive, muse] = await Promise.allSettled([
        fetchJSearchJobs(query),
        fetchAdzunaJobs(query),
        fetchRemotiveJobs(query),
        fetchMuseJobs(query),
    ]);

    const allJobs = [
        ...(jSearch.status === 'fulfilled' ? jSearch.value : []),
        ...(adzuna.status === 'fulfilled' ? adzuna.value : []),
        ...(remotive.status === 'fulfilled' ? remotive.value : []),
        ...(muse.status === 'fulfilled' ? muse.value : []),
    ];

    return allJobs;
}

module.exports = { aggregateJobs };
