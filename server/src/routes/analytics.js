const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Job = require('../../models/Job');
const Profile = require('../../models/Profile');
const { aggregateJobs } = require('../services/jobAggregator');
const marketIntelligenceAgent = require('../agents/marketIntelligenceAgent');

// GET /api/analytics/summary
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const jobs = await Job.find({ userId });

        const now = new Date();
        const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected'];
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // ── Dataset 1: Applications Over Time (last 12 weeks) ──────────────────
        const weekBuckets = {};
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            const weekStart = getWeekStart(d);
            const key = weekStartToLabel(weekStart);
            if (!weekBuckets[key]) weekBuckets[key] = { week: key, count: 0, _ts: weekStart.getTime() };
        }
        jobs.forEach(job => {
            const ws = getWeekStart(new Date(job.appliedDate));
            const key = weekStartToLabel(ws);
            if (weekBuckets[key]) weekBuckets[key].count++;
        });
        const applicationsOverTime = Object.values(weekBuckets)
            .sort((a, b) => a._ts - b._ts)
            .map(({ week, count }) => ({ week, count }));

        // ── Dataset 2: Status Distribution ─────────────────────────────────────
        const statusCounts = {};
        STATUSES.forEach(s => { statusCounts[s] = 0; });
        jobs.forEach(j => { if (statusCounts[j.status] !== undefined) statusCounts[j.status]++; });
        const total = jobs.length || 1;
        const statusDistribution = STATUSES.map(status => ({
            status,
            count: statusCounts[status],
            percentage: parseFloat((statusCounts[status] / total * 100).toFixed(1))
        }));

        // ── Dataset 3: Platform Performance ────────────────────────────────────
        const platformMap = {};
        jobs.forEach(j => {
            const p = j.platform || 'Other';
            if (!platformMap[p]) platformMap[p] = { applied: 0, interviews: 0 };
            platformMap[p].applied++;
            if (j.status === 'Interview' || j.status === 'Offer') platformMap[p].interviews++;
        });
        const platformPerformance = Object.entries(platformMap)
            .filter(([, v]) => v.applied > 0)
            .map(([platform, v]) => ({
                platform,
                applied: v.applied,
                interviews: v.interviews,
                rate: v.applied > 0 ? parseFloat((v.interviews / v.applied * 100).toFixed(1)) : 0
            }))
            .sort((a, b) => b.rate - a.rate);

        // ── Dataset 4: Weekday Heatmap ──────────────────────────────────────────
        const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        jobs.forEach(j => {
            const d = new Date(j.appliedDate);
            const dayIndex = d.getDay(); // 0 = Sun
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex];
            if (dayCounts[dayName] !== undefined) dayCounts[dayName]++;
        });
        const weekdayHeatmap = DAYS.map(day => ({ day, count: dayCounts[day] }));

        // ── Dataset 5: Key Metrics ──────────────────────────────────────────────
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
        const activeApplications = jobs.filter(j => j.status === 'Applied').length;
        const interviewOrOffer = jobs.filter(j => j.status === 'Interview' || j.status === 'Offer').length;
        const offersReceived = jobs.filter(j => j.status === 'Offer').length;
        const thisWeekCount = jobs.filter(j => new Date(j.appliedDate) >= sevenDaysAgo).length;

        // avgResponseDays: days between appliedDate and updatedAt for non-Applied jobs
        const respondedJobs = jobs.filter(j => j.status !== 'Applied' && j.appliedDate && j.updatedAt);
        const avgResponseDays = respondedJobs.length > 0
            ? parseFloat((respondedJobs.reduce((sum, j) => {
                return sum + (new Date(j.updatedAt) - new Date(j.appliedDate)) / 86400000;
            }, 0) / respondedJobs.length).toFixed(1))
            : 0;

        const keyMetrics = {
            totalApplications: jobs.length,
            activeApplications,
            interviewRate: parseFloat((interviewOrOffer / (jobs.length || 1) * 100).toFixed(1)),
            avgResponseDays,
            offersReceived,
            thisWeekCount
        };

        res.json({ applicationsOverTime, statusDistribution, platformPerformance, weekdayHeatmap, keyMetrics });

    } catch (err) {
        console.error('[Analytics] Error:', err.message);
        res.status(500).json({ error: 'Failed to compute analytics' });
    }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sun
    const diff = (day === 0) ? -6 : 1 - day; // Monday start
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function weekStartToLabel(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    return `${month} W${weekOfMonth}`;
}

// GET /api/analytics/market-signals — Manual refresh of market intelligence signals
router.get('/market-signals', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const profile = await Profile.findOne({ userId });
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const searchQuery = (profile?.preferences?.preferredRoles || ['software engineer'])[0] || 'software engineer';
        const rawJobs = await aggregateJobs(searchQuery);

        const result = await marketIntelligenceAgent.run({ userId, profile, rawJobs });
        if (!result) return res.json({ signals: [], cachedAt: new Date(), source: 'generated', generationMs: null });

        res.json({
            signals: result.signals || [],
            cachedAt: new Date(),
            source: result.source || 'generated',
            generationMs: result.generationMs || null,
        });
    } catch (err) {
        console.error('[Analytics] market-signals error:', err.message);
        res.status(500).json({ error: 'Failed to fetch market signals', signals: [] });
    }
});

module.exports = router;
