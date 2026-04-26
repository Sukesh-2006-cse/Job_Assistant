const { query } = require('../utils/pgClient');
const { generateEmbedding } = require('../utils/embedder');
const Job = require('../../models/Job');
const Profile = require('../../models/Profile');
const { getButlerActions } = require('../utils/butlerEngine');

const storeChunk = async (userId, chunkType, text, metadata, referenceId) => {
    try {
        const embedding = await generateEmbedding(text);
        if (!embedding) {
            console.warn(`[RAG] Skipping chunk storage - embedding null for ${chunkType}`);
            return false;
        }

        const embeddingJson = JSON.stringify(embedding);

        const sql = `
            INSERT INTO user_context 
                (user_id, chunk_type, reference_id, text, embedding, metadata, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id, chunk_type, reference_id) 
            DO UPDATE SET 
                text = EXCLUDED.text,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        `;

        await query(sql, [userId, chunkType, referenceId, text, embeddingJson, JSON.stringify(metadata)]);
        return true;
    } catch (err) {
        console.error('[RAG] storeChunk Error:', err);
        return false;
    }
};

const retrieveRelevantChunks = async (userId, queryText, topK = 5) => {
    try {
        const embedding = await generateEmbedding(queryText);
        if (!embedding) return [];

        const embeddingJson = JSON.stringify(embedding);

        const sql = `
            SELECT 
                chunk_type, 
                text, 
                metadata, 
                1 - (embedding <=> $1::vector) AS similarity_score
            FROM user_context
            WHERE user_id = $2
            ORDER BY embedding <=> $1::vector
            LIMIT $3
        `;

        const rows = await query(sql, [embeddingJson, userId, topK]);

        return rows.map(row => ({
            chunkType: row.chunk_type,
            text: row.text,
            metadata: row.metadata,
            score: parseFloat(row.similarity_score).toFixed(2)
        }));
    } catch (err) {
        console.error('[RAG] retrieveRelevantChunks Error:', err);
        return [];
    }
};

const getContextStatus = async (userId) => {
    const sql = `
        SELECT COUNT(*) as count, array_agg(DISTINCT chunk_type) as chunk_types
        FROM user_context
        WHERE user_id = $1
    `;
    const rows = await query(sql, [userId]);
    const first = rows[0] || { count: 0, chunk_types: [] };
    return {
        chunkCount: parseInt(first.count),
        chunkTypes: first.chunk_types || []
    };
};

const deleteJobChunk = async (userId, jobId) => {
    const sql = `DELETE FROM user_context WHERE user_id = $1 AND reference_id = $2`;
    await query(sql, [userId, jobId]);
    return true;
};

const deleteAllUserChunks = async (userId) => {
    const sql = `DELETE FROM user_context WHERE user_id = $1`;
    const res = await query(sql, [userId]);
    return res.length;
};

const rebuildUserContext = async (userId) => {
    const start = Date.now();
    let chunksStored = 0;

    try {
        const profile = await Profile.findOne({ userId });
        const jobs = await Job.find({ userId });
        const butler = getButlerActions(jobs);

        // 1. Store Profile Chunk
        if (profile) {
            const profileText = `This user has the following skills: ${profile.experience?.skills?.join(', ') || 'None listed'}. 
They are looking for roles as: ${profile.preferences?.preferredRoles?.join(', ') || 'Tech roles'}. 
Experience level: ${profile.experience?.experienceLevel || 'Not specified'}. 
Location preference: ${profile.preferences?.locationPref || 'Not specified'}. 
Education: ${profile.education?.degree || 'N/A'} in ${profile.education?.branch || 'N/A'} from ${profile.education?.college || 'N/A'}. 
Graduation year: ${profile.education?.graduationYear || 'N/A'}. 
Expected salary: ${profile.preferences?.expectedSalary?.min || '0'} to ${profile.preferences?.expectedSalary?.max || '0'} LPA.`;

            const success = await storeChunk(userId, 'profile', profileText, profile, userId + '_profile');
            if (success) chunksStored++;
        }

        // 2. Store Job Chunks
        for (const job of jobs) {
            const daysSince = Math.floor((Date.now() - new Date(job.appliedDate)) / 86400000);
            const chunkType = `job_${job.status.toLowerCase()}`;
            const jobText = `${job.company} ${job.role} position. Applied ${daysSince} days ago via ${job.platform}. Current status: ${job.status}. Notes: ${job.notes || 'No notes'}. Recommended action: ${job.nextAction || 'None yet'}.`;

            const success = await storeChunk(userId, chunkType, jobText, {
                company: job.company,
                role: job.role,
                status: job.status,
                daysSince,
                platform: job.platform,
                appliedDate: job.appliedDate,
                jobId: job._id
            }, job._id.toString());
            if (success) chunksStored++;
        }

        // 3. Store Butler Actions Chunk
        if (butler && butler.actions) {
            const highActions = butler.actions.filter(a => a.priority === 'High');
            const butlerText = `Current priority actions for job search: ${butler.actions.map(a => a.company + ': ' + a.action).join('. ')}. Total active applications: ${jobs.length}. High priority follow-ups: ${highActions.length}.`;

            const success = await storeChunk(userId, 'butler_actions', butlerText, {
                actionCount: butler.actions.length,
                highCount: highActions.length,
                totalJobs: jobs.length
            }, userId + '_butler');
            if (success) chunksStored++;
        }

        console.log(`[RAG] Rebuilt context for ${userId}: ${chunksStored} chunks in ${Date.now() - start}ms`);
        return { chunksStored, timeTakenMs: Date.now() - start };
    } catch (err) {
        console.error('[RAG] rebuildUserContext Error:', err);
        return { chunksStored: 0, error: err.message };
    }
};

const updateJobChunk = async (userId, job) => {
    const daysSince = Math.floor((Date.now() - new Date(job.appliedDate)) / 86400000);
    const chunkType = `job_${job.status.toLowerCase()}`;
    const jobText = `${job.company} ${job.role} position. Applied ${daysSince} days ago via ${job.platform}. Current status: ${job.status}. Notes: ${job.notes || 'No notes'}. Recommended action: ${job.nextAction || 'None yet'}.`;

    return await storeChunk(userId, chunkType, jobText, {
        company: job.company,
        role: job.role,
        status: job.status,
        daysSince,
        platform: job.platform,
        appliedDate: job.appliedDate,
        jobId: job._id
    }, job._id.toString());
};

const storeDiscoveryChunk = async (userId, topJobs) => {
    if (!topJobs || topJobs.length === 0) return false;

    const topCompanies = topJobs.map(j => j.company);
    const allSkills = topJobs.flatMap(j => j.skills || []);
    const uniqueSkills = [...new Set(allSkills)].slice(0, 5);
    const remoteCount = topJobs.filter(j => j.location?.toLowerCase().includes('remote')).length;

    const discoveryText = `Available job opportunities matching this user: ${topJobs.map(j => j.title + ' at ' + j.company + ' (' + j.matchScore + '% match)').join(', ')}. Skills frequently required in matches: ${uniqueSkills.join(', ')}. Remote opportunities available: ${remoteCount}.`;

    return await storeChunk(userId, 'discovery_feed', discoveryText, {
        jobCount: topJobs.length,
        topCompanies,
        requiredSkills: uniqueSkills
    }, userId + '_discovery');
};

const storeChatHistory = async (userId, messages) => {
    // Take last 5 message pairs (max 10 messages)
    const recentMessages = messages.slice(-10);
    const historyText = `Recent conversation history: ${recentMessages.map(m => m.role + ': ' + m.content).join(' | ')}`;

    return await storeChunk(userId, 'chat_history', historyText, {
        messageCount: recentMessages.length,
        storedAt: new Date()
    }, userId + '_chat');
};

module.exports = {
    storeChunk,
    retrieveRelevantChunks,
    getContextStatus,
    deleteJobChunk,
    deleteAllUserChunks,
    rebuildUserContext,
    updateJobChunk,
    storeDiscoveryChunk,
    storeChatHistory
};
