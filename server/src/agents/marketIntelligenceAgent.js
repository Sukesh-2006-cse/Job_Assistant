const BaseAgent = require('./baseAgent');
const { groq } = require('@ai-sdk/groq');
const { generateText } = require('ai');
const { GROQ_MODEL } = require('./agentConfig');
const { cacheGet, cacheSet } = require('../utils/redisClient');

class MarketIntelligenceAgent extends BaseAgent {
    constructor() {
        super('marketIntelligenceAgent');
    }

    async run({ userId, profile, rawJobs = [] }) {
        if (!userId || !profile) return null;

        const startTime = Date.now();

        // ── Step 1: Build cache key & check Redis ────────────────────────────
        const skills = (profile?.experience?.skills || []).join(',');
        const roles = (profile?.preferences?.preferredRoles || []).join(',');
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const cacheKey = `market_intel_${userId}_${Buffer.from(skills + roles + dateStr).toString('base64').slice(0, 32)}`;

        const cached = await cacheGet(cacheKey);
        if (cached) {
            console.log('[MarketIntelligenceAgent] Cache hit for user:', userId);
            return {
                signals: cached.signals,
                source: 'cache',
                generationMs: null,
            };
        }

        // ── Step 2: Compute JS statistics ────────────────────────────────────
        const stats = this._computeStats(rawJobs, profile);

        // ── Step 3 & 4: Build Groq prompt and call ───────────────────────────
        let signals;
        let generationMs;
        try {
            if (!process.env.GROQ_API_KEY) {
                throw new Error('GROQ_API_KEY not configured');
            }

            const prompt = this._buildPrompt(profile, stats);

            const { text } = await generateText({
                model: groq(GROQ_MODEL),
                prompt,
                maxTokens: 1200,
            });

            generationMs = Date.now() - startTime;

            // Strip markdown fences if Groq adds them
            const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            signals = JSON.parse(jsonStr);

            if (!Array.isArray(signals)) throw new Error('Response is not an array');
        } catch (err) {
            console.error('[MarketIntelligenceAgent] Groq error, using fallback:', err.message);
            generationMs = Date.now() - startTime;
            signals = this._fallbackSignals(rawJobs, profile);
        }

        // ── Step 5: Cache the result (TTL 2 hours) ───────────────────────────
        await cacheSet(cacheKey, { signals }, 7200);

        // ── Step 6: Return ───────────────────────────────────────────────────
        return { signals, source: 'generated', generationMs };
    }

    // ── Statistics computation (pure JS, no AI) ──────────────────────────────

    _computeStats(rawJobs, profile) {
        const userSkills = (profile?.experience?.skills || []).map(s => s.toLowerCase());

        // Top skills in market (from title + skills array)
        const skillFreq = {};
        const COMMON_WORDS = new Set(['the', 'and', 'for', 'with', 'our', 'you', 'are', 'this', 'that', 'from', 'have', 'will', 'your', 'use', 'all', 'but', 'not', 'can', 'job', 'work', 'team']);
        rawJobs.forEach(job => {
            const words = (job.title + ' ' + (job.description || '')).toLowerCase()
                .replace(/[^a-z0-9\s+#.]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !COMMON_WORDS.has(w));

            const jobSkills = Array.isArray(job.skills) ? job.skills.map(s => s.toLowerCase()) : [];
            [...words, ...jobSkills].forEach(skill => {
                skillFreq[skill] = (skillFreq[skill] || 0) + 1;
            });
        });
        const topSkillsInMarket = Object.entries(skillFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([skill, count]) => ({ skill, count }));

        // Platform counts
        const platformMap = {};
        rawJobs.forEach(job => {
            const src = job.source || 'Unknown';
            platformMap[src] = (platformMap[src] || 0) + 1;
        });
        const platformJobCounts = Object.entries(platformMap)
            .map(([source, count]) => ({ source, count }))
            .sort((a, b) => b.count - a.count);

        // Remote vs on-site
        const remoteCount = rawJobs.filter(j => j.remote === true || (j.location || '').toLowerCase().includes('remote')).length;
        const onsiteCount = rawJobs.length - remoteCount;
        const remoteVsOnsiteRatio = {
            remoteCount,
            onsiteCount,
            remotePercentage: rawJobs.length > 0 ? Math.round((remoteCount / rawJobs.length) * 100) : 0,
        };

        // Top hiring companies
        const companyMap = {};
        rawJobs.forEach(job => {
            if (job.company) companyMap[job.company] = (companyMap[job.company] || 0) + 1;
        });
        const topHiringCompanies = Object.entries(companyMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([company, count]) => ({ company, count }));

        // User skills in market
        const userSkillsInMarket = userSkills.map(skill => {
            const jobCount = rawJobs.filter(j =>
                (j.description || '').toLowerCase().includes(skill) ||
                (Array.isArray(j.skills) && j.skills.map(s => s.toLowerCase()).includes(skill))
            ).length;
            return {
                skill,
                jobCount,
                percentage: rawJobs.length > 0 ? Math.round((jobCount / rawJobs.length) * 100) : 0,
            };
        });

        // Missing skills opportunity
        const topSkillNames = topSkillsInMarket.map(s => s.skill);
        const missingSkillsOpportunity = topSkillNames
            .filter(skill => !userSkills.includes(skill))
            .slice(0, 3);

        return {
            topSkillsInMarket,
            platformJobCounts,
            remoteVsOnsiteRatio,
            topHiringCompanies,
            userSkillsInMarket,
            missingSkillsOpportunity,
            totalJobs: rawJobs.length,
        };
    }

    _buildPrompt(profile, stats) {
        const userSkills = profile?.experience?.skills || [];
        const userRoles = profile?.preferences?.preferredRoles || [];
        const expLevel = profile?.experience?.experienceLevel || 'mid-level';
        const location = profile?.preferences?.locationPref || 'flexible';

        return `You are a job market analyst AI providing personalised market intelligence signals.

## User Profile
- Skills: ${userSkills.join(', ') || 'Not specified'}
- Preferred Roles: ${userRoles.join(', ') || 'Software Engineer'}
- Experience Level: ${expLevel}
- Location Preference: ${location}

## Live Market Data (${stats.totalJobs} jobs analysed)
Top Skills In Market: ${JSON.stringify(stats.topSkillsInMarket.slice(0, 5))}
Platform Job Counts: ${JSON.stringify(stats.platformJobCounts)}
Remote vs On-site: ${JSON.stringify(stats.remoteVsOnsiteRatio)}
Top Hiring Companies: ${JSON.stringify(stats.topHiringCompanies)}
User Skills Match: ${JSON.stringify(stats.userSkillsInMarket.slice(0, 5))}
Missing Skills Opportunity: ${JSON.stringify(stats.missingSkillsOpportunity)}

## Task
Generate exactly 4 market intelligence signals personalised to this specific user.

Signal variety rules (strictly follow all 4):
1. One signal must be type "Opportunity"
2. One signal must be type "Warning" OR "Trend"
3. One signal must reference a specific company name from the Top Hiring Companies list
4. One signal must reference a specific missing skill from the Missing Skills Opportunity list

Each signal must be a JSON object with EXACTLY these fields:
{
  "type": "Opportunity" | "Warning" | "Trend" | "Insight",
  "icon": "<one relevant emoji>",
  "message": "<signal message under 25 words — specific, data-driven, mention numbers/company names>",
  "detail": "<one sentence of additional context under 20 words>",
  "action": "<short action label under 5 words, e.g. Search These Jobs>",
  "actionRoute": "/discover" | "/profile" | "/career" | "/applications",
  "severity": "high" | "medium" | "low"
}

Respond ONLY with a valid JSON array of exactly 4 signal objects.
No explanation. No markdown. No code fences. Raw JSON array only.`;
    }

    _fallbackSignals(rawJobs, profile) {
        const roles = profile?.preferences?.preferredRoles || ['Software Engineer'];
        return [
            {
                type: 'Insight',
                icon: '📊',
                message: `${rawJobs.length} live job listings found matching your role preferences today.`,
                detail: 'Market volume is active. Check back regularly for new postings.',
                action: 'Search These Jobs',
                actionRoute: '/discover',
                severity: 'medium',
            },
            {
                type: 'Opportunity',
                icon: '🌍',
                message: 'Remote positions are available for your target roles across multiple platforms.',
                detail: 'Remote work continues to expand access to global opportunities.',
                action: 'Search These Jobs',
                actionRoute: '/discover',
                severity: 'medium',
            },
        ];
    }
}

module.exports = new MarketIntelligenceAgent();
