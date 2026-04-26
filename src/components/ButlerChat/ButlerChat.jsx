import React, { useState, useRef, useEffect } from 'react';
import {
    BotMessageSquare, X, Trash2, Send,
    Briefcase, ChevronDown, Loader2, Brain, Info
} from 'lucide-react';
import styles from './ButlerChat.module.css';
import { useButlerChat } from '../../hooks/useButlerChat';

// Development Mode Panel for RAG Contexts
const DevContext = ({ contexts }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    if (!contexts || contexts.length === 0) return null;

    return (
        <div className={styles.devContext}>
            <div className={styles.devToggle} onClick={() => setIsExpanded(!isExpanded)}>
                <Info size={10} />
                <span>pgvector retrieved {contexts.length} chunks</span>
                <ChevronDown size={10} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
            </div>
            {isExpanded && (
                <div className={styles.contextList}>
                    {contexts.map((c, i) => (
                        <div key={i} className={styles.contextItem}>
                            <span className={styles.contextType}>{c.type}</span>
                            <span className={styles.contextScore}>{c.score} similarity</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ButlerChat = () => {
    const {
        messages, isOpen, isLoading, suggestions,
        ragStatus, toggleChat, sendMessage, clearChat
    } = useButlerChat();
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);
    const bottomRef = useRef(null);

    // Auto-focus input when chat opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        const text = inputValue.trim();
        if (!text || isLoading) return;
        setInputValue('');
        sendMessage(text);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date) =>
        new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const hasStreamingMessage = messages.some(m => m.streaming);
    const showNotificationDot = messages.length > 0 && !isOpen;

    return (
        <>
            {/* ── Chat Panel ── */}
            {isOpen && (
                <div className={styles.panel} role="dialog" aria-label="Butler AI Chat">

                    {/* Header */}
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <div className={styles.avatarSmall}>
                                <BotMessageSquare size={18} strokeWidth={2} />
                            </div>
                            <div>
                                <div className={styles.headerName}>Butler</div>
                                <div className={styles.headerSub}>AI Career Assistant</div>
                            </div>
                        </div>
                        <div className={styles.headerRight}>
                            {/* RAG Status Pill */}
                            <div className={`${styles.ragPill} ${ragStatus.hasContext ? styles.ragActive : styles.ragBuilding}`}>
                                {ragStatus.loading ? (
                                    <Loader2 size={10} className={styles.spin} />
                                ) : (
                                    <Brain size={12} />
                                )}
                                <span>{ragStatus.hasContext ? 'RAG Active' : 'Building...'}</span>
                                <div className={styles.ragTooltip}>
                                    {ragStatus.hasContext
                                        ? `${ragStatus.chunkCount} vectors in pgvector`
                                        : 'Generating your knowledge base...'}
                                </div>
                            </div>

                            <button
                                className={styles.headerBtn}
                                onClick={clearChat}
                                title="Clear conversation"
                                aria-label="Clear conversation"
                            >
                                <Trash2 size={15} />
                            </button>
                            <button
                                className={styles.headerBtn}
                                onClick={toggleChat}
                                title="Close"
                                aria-label="Close chat"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className={styles.messages}>
                        {messages.length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyAvatar}>
                                    <BotMessageSquare size={28} strokeWidth={1.5} />
                                </div>
                                <p className={styles.emptyGreeting}>Hi, I'm Butler 👋</p>
                                <p className={styles.emptySub}>Ask me anything about your job search.</p>
                                <div className={styles.suggestions}>
                                    {suggestions.map((q, i) => (
                                        <button
                                            key={i}
                                            className={styles.chip}
                                            onClick={() => sendMessage(q)}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`${styles.row} ${msg.role === 'user' ? styles.rowUser : styles.rowAssistant}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className={styles.msgAvatar}>
                                            <BotMessageSquare size={14} strokeWidth={2} />
                                        </div>
                                    )}
                                    <div className={styles.bubbleWrap}>
                                        <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}>
                                            {msg.content || (msg.streaming && !msg.content && (
                                                <span className={styles.dots}>
                                                    <span /><span /><span />
                                                </span>
                                            ))}
                                            {msg.streaming && msg.content && (
                                                <span className={styles.cursor} />
                                            )}
                                        </div>

                                        {/* Dev Context Panel (visible in dev mode only) */}
                                        {import.meta.env.DEV && msg.role === 'assistant' && (
                                            <DevContext contexts={msg.contexts} />
                                        )}

                                        <div className={`${styles.ts} ${msg.role === 'user' ? styles.tsRight : ''}`}>
                                            {formatTime(msg.timestamp)}
                                        </div>
                                    </div>
                                    {msg.role === 'user' && <div className={styles.userSpacer} />}
                                </div>
                            ))
                        )}

                        {/* Typing indicator */}
                        {isLoading && !hasStreamingMessage && (
                            <div className={`${styles.row} ${styles.rowAssistant}`}>
                                <div className={styles.msgAvatar}>
                                    <BotMessageSquare size={14} strokeWidth={2} />
                                </div>
                                <div className={`${styles.msgBubble} ${styles.bubbleAssistant}`}>
                                    <span className={styles.dots}>
                                        <span /><span /><span />
                                    </span>
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className={styles.inputRow}>
                        <input
                            ref={inputRef}
                            className={styles.input}
                            type="text"
                            placeholder="Ask Butler anything..."
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading || hasStreamingMessage}
                            aria-label="Message input"
                        />
                        <button
                            className={styles.sendBtn}
                            onClick={handleSend}
                            disabled={isLoading || hasStreamingMessage || !inputValue.trim()}
                            aria-label="Send message"
                        >
                            {isLoading ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
                        </button>
                    </div>

                    <div className={styles.footer}>
                        <Briefcase size={10} />
                        <span>Powered by Groq · Apply-Flow</span>
                    </div>
                </div>
            )}

            {/* ── Floating Bubble ── */}
            <button
                className={`${styles.floatingBubble} ${isOpen ? styles.bubbleOpen : ''}`}
                onClick={toggleChat}
                aria-label={isOpen ? 'Close Butler chat' : 'Open Butler chat'}
                aria-expanded={isOpen}
            >
                {isOpen
                    ? <ChevronDown size={24} strokeWidth={2.5} />
                    : <BotMessageSquare size={24} strokeWidth={2} />
                }
                {showNotificationDot && !isOpen && (
                    <span className={styles.notifDot} aria-hidden="true" />
                )}
            </button>
        </>
    );
};

export default ButlerChat;
