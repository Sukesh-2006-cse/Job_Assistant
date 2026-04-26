const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const authMiddleware = require('../middleware/auth');
const Profile = require('../../models/Profile');
const orchestratorAgent = require('../agents/orchestratorAgent');
const { TRIGGERS } = require('../agents/agentConfig');
const { rebuildUserContext } = require('../rag/contextManager');

// Configure Multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// GET /api/profile - Get current user profile
router.get('/', authMiddleware, async (req, res) => {
    try {
        const profile = await Profile.findOne({ userId: req.user.id });
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// POST /api/profile/upload-resume - Extract and update from resume
router.post('/upload-resume', authMiddleware, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Resume file is required' });
        }

        // Parse PDF to text
        const data = await pdf(req.file.buffer);
        const resumeText = data.text;

        // Run orchestration trigger
        const result = await orchestratorAgent.run({
            trigger: TRIGGERS.RESUME_UPLOADED,
            userId: req.user.id,
            context: { resumeText }
        });

        if (result.error) {
            return res.status(500).json({ error: result.error });
        }

        res.json({
            message: 'Profile updated from resume',
            extracted: result.extracted
        });

        // Rebuild RAG context (fire and forget)
        rebuildUserContext(req.user.id).catch(e => console.error('[Profile] RAG Rebuild Error:', e));
    } catch (error) {
        console.error('Resume Upload Error:', error);
        res.status(500).json({ error: 'Failed to process resume', details: error.message });
    }
});

const User = require('../../models/User');

// POST /api/profile/onboarding - Save initial profile
router.post('/onboarding', async (req, res) => {
    try {
        const {
            userId,
            degree, branch, college, gradYear,
            skills, experienceLevel,
            preferredRoles, locationPreference, preferredCities, minSalary, maxSalary
        } = req.body;

        const newProfile = new Profile({
            userId,
            academic: { degree, branch, college, gradYear },
            experience: { skills, experienceLevel },
            preferences: {
                preferredRoles,
                locationPreference,
                preferredCities,
                salaryRange: { min: minSalary, max: maxSalary }
            }
        });

        await newProfile.save();
        await User.findByIdAndUpdate(userId, { isOnboarded: true });

        // Build RAG context for the first time (fire and forget)
        rebuildUserContext(userId).catch(e => console.error('[Profile] RAG Rebuild Error:', e));

        res.status(201).json({ message: 'Profile saved successfully' });
    } catch (error) {
        console.error('Error saving profile:', error);
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// Backward compatibility: GET /api/profile/profiles/:userId (Wait, no, this becomes /api/profile/:userId)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const profile = await Profile.findOne({ userId });
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

module.exports = router;
