const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getButlerActions } = require('../utils/butlerEngine');
const {
    getContextStatus,
    retrieveRelevantChunks,
    rebuildUserContext,
    storeChatHistory
} = require('../rag/contextManager');
const Job = require('../../models/Job');
const Profile = require('../../models/Profile');

// Use same AI SDK pattern as the rest of the project
const { groq } = require('@ai-sdk/groq');
const { streamText } = require('ai');

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// POST /api/chat/message — streaming chat endpoint
router.post('/message', authMiddleware, async (req, res) => {
    const { message, history = [] } = req.body;

    // Step 1 — Validate input
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Set streaming headers BEFORE writing anything
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        const userId = req.user._id || req.user.id;

        // Fetch jobs and profile (as requested for the route context)
        const [jobs, profile] = await Promise.all([
            Job.find({ userId }),
            Profile.findOne({ userId })
        ]);

        // Step 2 — Ensure context exists
        const status = await getContextStatus(userId.toString());
        if (status.chunkCount === 0) {
            console.log('[Chat] Context empty, building fresh RAG context...');
            await rebuildUserContext(userId.toString());
        }

        // Step 3 — Retrieve relevant chunks from PostgreSQL
        const relevantChunks = await retrieveRelevantChunks(userId.toString(), message, 5);

        // Expose retrieved context types and scores in a header for frontend dev mode
        if (relevantChunks.length > 0) {
            const contextMeta = relevantChunks.map(c => ({ type: c.chunkType, score: c.score }));
            res.setHeader('X-Rag-Contexts', JSON.stringify(contextMeta));
            res.setHeader('Access-Control-Expose-Headers', 'X-Rag-Contexts');
        }

        // Step 4 — Build context-aware RAG system prompt
        const ragContextText = relevantChunks.map(chunk =>
            `--- ${chunk.chunkType.toUpperCase()} ---\n${chunk.text}`
        ).join('\n\n');

        const systemPrompt = `You are Butler, an intelligent personal career assistant inside Apply-Flow. You have deep knowledge of this user's job search from the retrieved context below. 

Always reference specific companies, roles, and dates from the context when answering. Never invent jobs or skills not present in the context. Be concise and actionable — under 120 words unless writing a full email draft.

PERSONALISED CONTEXT (retrieved via vector search):
${ragContextText || '(No relevant context found in your database)'}

INSTRUCTIONS:
- Use ONLY the context above to answer.
- If context is insufficient say: "I don't have enough data on that yet — try adding more applications."
- When writing emails, use exact company names and roles from the context.
- When asked about priorities or "what should I do", refer to the butler_actions context if available.`;

        // Step 4 — Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message.trim() }
        ];

        // Step 5 — Stream with Vercel AI SDK (same pattern as butler.js)
        const result = await streamText({
            model: groq(GROQ_MODEL),
            messages,
            maxTokens: 500,
        });

        // Step 6 — Pipe text stream to HTTP response
        for await (const textPart of result.textStream) {
            res.write(textPart);
        }

        res.end();

        // Step 6 — Store chat history (fire and forget)
        const combinedMessages = [...history, { role: 'user', content: message }, { role: 'assistant', content: '...' }]; // Note: simplified placeholder
        storeChatHistory(userId.toString(), combinedMessages).catch(e => console.error('[Chat] History store error:', e));

    } catch (err) {
        console.error('[Chat] Stream error:', err.message, err.stack);
        try {
            res.write(`I encountered an error: ${err.message}. Please try again.`);
            res.end();
        } catch {
            // Response may already be closed
        }
    }
});

// GET /api/chat/context-status (protected)
router.get('/context-status', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const status = await getContextStatus(userId.toString());
        res.json({
            hasContext: status.chunkCount > 0,
            chunkCount: status.chunkCount,
            chunkTypes: status.chunkTypes
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get context status' });
    }
});

// POST /api/chat/rebuild-context (protected)
router.post('/rebuild-context', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const result = await rebuildUserContext(userId.toString());
        res.json({
            success: true,
            message: 'Context rebuilt',
            chunksStored: result.chunksStored
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rebuild context' });
    }
});

module.exports = router;
