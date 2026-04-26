const express = require('express');
const router = express.Router();
const Job = require('../../models/Job');
const authMiddleware = require('../middleware/auth');
const orchestratorAgent = require('../agents/orchestratorAgent');
const { TRIGGERS } = require('../agents/agentConfig');
const { updateJobChunk, deleteJobChunk } = require('../rag/contextManager');

// GET /api/jobs - Fetch all job applications for user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const jobs = await Job.find({ userId: req.user.id }).sort({ appliedDate: -1 });
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// POST /api/jobs - Create a new job application
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { company, role, appliedDate, status, platform, notes } = req.body;

        if (!company || !role || !appliedDate) {
            return res.status(400).json({ error: 'Company, role, and appliedDate are required' });
        }

        const newJob = new Job({
            userId: req.user.id,
            company,
            role,
            appliedDate,
            status: status || 'Applied',
            platform: platform || 'Other',
            notes: notes || ''
        });

        const savedJob = await newJob.save();

        // Update RAG context (fire and forget)
        updateJobChunk(req.user.id, savedJob).catch(e => console.error('[Jobs] RAG Update Error:', e));

        res.status(201).json(savedJob);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create job', details: error.message });
    }
});

// PUT /api/jobs/:id - Update an existing job application
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Verify ownership
        if (job.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to update this job' });
        }

        const updates = req.body;
        const allowedUpdates = [
            'company', 'role', 'appliedDate', 'status',
            'platform', 'notes', 'priority', 'nextAction'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                job[field] = updates[field];
            }
        });

        const updatedJob = await job.save();

        // Update RAG context (fire and forget)
        updateJobChunk(req.user.id, updatedJob).catch(e => console.error('[Jobs] RAG Update Error:', e));

        // Trigger Interview Prep in background if status changed to Interview
        if (updates.status === 'Interview') {
            orchestratorAgent.run({
                trigger: TRIGGERS.STATUS_CHANGED_INTERVIEW,
                userId: req.user.id,
                context: { job: updatedJob }
            }).catch(err => console.error('[Jobs Route] Prep Agent Error:', err));
        }

        res.json(updatedJob);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update job' });
    }
});

// DELETE /api/jobs/:id - Delete a job application
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Verify ownership
        if (job.userId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to delete this job' });
        }

        await Job.findByIdAndDelete(req.params.id);

        // Delete RAG context (fire and forget)
        deleteJobChunk(req.user.id, req.params.id).catch(e => console.error('[Jobs] RAG Delete Error:', e));

        res.json({ success: true, message: 'Job deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

module.exports = router;
