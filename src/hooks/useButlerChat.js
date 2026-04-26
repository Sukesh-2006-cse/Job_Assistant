import { useState, useRef, useCallback, useEffect } from 'react';
import { sendChatMessage } from '../api/chatApi';
import { getButlerToday } from '../api/butlerApi';
import apiClient from '../api/apiClient';

export function useButlerChat() {
    const [messages, setMessages] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [suggestions, setSuggestions] = useState([
        "What should I focus on today?",
        "Write a follow-up for my latest application",
        "What skills am I missing?",
        "How is my job search going?"
    ]);
    const [ragStatus, setRagStatus] = useState({ hasContext: false, chunkCount: 0, loading: true });

    const hasLoadedContextRef = useRef(false);

    const fetchRagStatus = useCallback(async () => {
        try {
            setRagStatus(prev => ({ ...prev, loading: true }));
            const { data } = await apiClient.get('/chat/context-status');
            setRagStatus({ ...data, loading: false });

            // If no context, trigger a rebuild in the background
            if (data.chunkCount === 0) {
                apiClient.post('/chat/rebuild-context')
                    .then(res => {
                        if (res.data.success && res.data.chunksStored > 0) {
                            setRagStatus({ hasContext: true, chunkCount: res.data.chunksStored, loading: false });
                        } else {
                            setRagStatus({ hasContext: false, chunkCount: 0, loading: false });
                        }
                    })
                    .catch(e => {
                        console.error('[useButlerChat] Rebuild failed:', e);
                        setRagStatus({ hasContext: false, chunkCount: 0, loading: false });
                    });
            }
        } catch (err) {
            console.error('[useButlerChat] Status Error:', err);
            setRagStatus(prev => ({ ...prev, loading: false }));
        }
    }, []);

    const toggleChat = useCallback(async () => {
        setIsOpen(prev => {
            const nextOpen = !prev;

            // Load context suggestions and RAG status first time it opens
            if (nextOpen && !hasLoadedContextRef.current) {
                hasLoadedContextRef.current = true;

                fetchRagStatus();

                getButlerToday().then(data => {
                    if (!data) return;
                    const newSuggestions = [...suggestions];

                    const highPriority = (data.actions || []).filter(a => a.priority === 'High');
                    if (highPriority.length > 0) {
                        newSuggestions[0] = `Should I follow up with ${highPriority[0].company}?`;
                    }

                    const interviews = (data.actions || []).filter(a => a.status === 'Interview');
                    if (interviews.length > 0) {
                        newSuggestions.splice(1, 0, `Help me prepare for my ${interviews[0].company} interview`);
                    }

                    const offers = (data.actions || []).filter(a => a.status === 'Offer');
                    if (offers.length > 0) {
                        newSuggestions.splice(1, 0, `How should I respond to the ${offers[0].company} offer?`);
                    }

                    setSuggestions(newSuggestions.slice(0, 4));
                }).catch(() => { /* use default suggestions */ });
            }

            return nextOpen;
        });
    }, [suggestions, fetchRagStatus]);

    const sendMessage = useCallback(async (userMessageText) => {
        const text = typeof userMessageText === 'string' ? userMessageText.trim() : '';
        if (!text || isLoading) return;

        setError(null);

        // Build history from current messages
        const historyForApi = messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        // 1. Add user message
        const userMsg = {
            id: Date.now() + Math.random(),
            role: 'user',
            content: text,
            streaming: false,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);

        // 2. Set loading
        setIsLoading(true);

        // 3. Add assistant placeholder
        const assistantMsgId = Date.now() + Math.random() + 1;
        const assistantMsg = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            streaming: true,
            timestamp: new Date(),
            contexts: [] // Placeholder for RAG metadata
        };
        setMessages(prev => [...prev, assistantMsg]);

        try {
            // 5. Call streaming fetch
            const response = await sendChatMessage(text, historyForApi);

            // Extract context metadata from header
            const contextHeader = response.headers.get('X-Rag-Contexts');
            let contexts = [];
            if (contextHeader) {
                try { contexts = JSON.parse(contextHeader); } catch (e) { }
            }

            // 6. First chunk arrived — update contexts
            setIsLoading(false);
            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, contexts } : m
            ));

            // 7. Read stream chunks
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId
                        ? { ...m, content: m.content + chunk }
                        : m
                ));
            }

            // 8. Mark streaming complete
            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                    ? { ...m, streaming: false }
                    : m
            ));

        } catch (err) {
            console.error('[useButlerChat] Error:', err);
            setIsLoading(false);
            setError(err.message);

            setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                    ? {
                        ...m,
                        content: (m.content || '') +
                            (m.content ? '\n\n[Connection lost — please resend your message]' :
                                'Sorry, Butler is unavailable right now. Please try again.'),
                        streaming: false
                    }
                    : m
            ));
        }
    }, [isLoading, messages]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isOpen,
        isLoading,
        error,
        suggestions,
        ragStatus,
        toggleChat,
        sendMessage,
        clearChat
    };
}
