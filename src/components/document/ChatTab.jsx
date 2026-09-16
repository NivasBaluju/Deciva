import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Icon from '../common/Icon';
import SkeletonLoader from '../common/SkeletonLoader';
import { buttonMotion, EASE_OUT } from '../../styles/motion';

export const ChatTab = ({ doc }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [retrievalStage, setRetrievalStage] = useState('');
  const chatWindowRef = useRef(null);
  const { toast } = useToast();

  const suggestions = [
    'What are the termination conditions?',
    'What payment obligations exist?',
    'Are there any important deadlines or notice periods?',
    'What is the governing law or liability limit?'
  ];

  useEffect(() => {
    let isMounted = true;
    async function loadChat() {
      try {
        const res = await Api.get(`/api/documents/${doc.id}/chat`);
        if (isMounted) setMessages(res.messages || []);
      } catch (err) {
        if (isMounted) toast(err.message || 'Failed to load chat history', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadChat();
    return () => {
      isMounted = false;
    };
  }, [doc.id, toast]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, sending, retrievalStage]);

  const handleSend = async (questionText) => {
    const q = (questionText || input).trim();
    if (!q || sending) return;

    setInput('');
    const userMsg = { id: `user-${Date.now()}`, role: 'USER', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setRetrievalStage('retrieving');

    const stageTimer = setTimeout(() => {
      setRetrievalStage('generating');
    }, 450);

    try {
      const res = await Api.post(`/api/documents/${doc.id}/chat`, { question: q });
      clearTimeout(stageTimer);

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'ASSISTANT',
        content: res.answer,
        confidence: res.confidence,
        grounded: res.grounded !== undefined ? res.grounded : true,
        sources: res.sources || []
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      clearTimeout(stageTimer);
      toast(err.message || 'AI Chat request failed', 'error');
    } finally {
      setSending(false);
      setRetrievalStage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  if (loading) {
    return <SkeletonLoader.Card count={1} height="320px" />;
  }

  return (
    <div className="card">
      <div className="card-header-flex">
        <div className="card-title">
          <span className="dot dot-gold" />
          Document AI Assistant (RAG)
        </div>
        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
          Isolated Document Scope
        </span>
      </div>

      <p className="text-lo mt-4 mb-16" style={{ fontSize: '13px' }}>
        Ask any legal question about this contract. Answers are strictly grounded in existing document segments with verifiable citations.
      </p>

      <div className="chat-suggestions mb-16">
        {suggestions.map((s, idx) => (
          <motion.button
            key={idx}
            className="chat-suggestion-btn"
            onClick={() => handleSend(s)}
            disabled={sending}
            {...buttonMotion}
          >
            {s}
          </motion.button>
        ))}
      </div>

      <div className="divider" />

      <div className="chat-window" id="chatWindow" ref={chatWindowRef} style={{ minHeight: '320px', maxHeight: '520px', overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚖️</div>
            <div style={{ fontWeight: 600, color: 'var(--hi)' }}>Ask DocuGuard AI About This Document</div>
            <p className="text-lo" style={{ fontSize: '12px', maxWidth: '420px', margin: '6px auto 0' }}>
              Select a suggested question above or type any query regarding clauses, obligations, liabilities, or deadlines.
            </p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isUser = m.role === 'USER' || m.role === 'user';
            if (isUser) {
              return (
                <div key={m.id || idx} className="chat-msg user">
                  {m.content}
                </div>
              );
            }

            const isGrounded = m.grounded !== false;
            const sources = Array.isArray(m.sources) ? m.sources : [];

            return (
              <motion.div
                key={m.id || idx}
                className="chat-msg assistant"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                style={{
                  borderLeft: isGrounded ? '3px solid var(--royal)' : '3px solid var(--amber-glow)',
                  background: 'rgba(255, 255, 255, 0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  {isGrounded ? (
                    <span className="badge badge-ok" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ✓ Grounded in Document
                      {typeof m.retrieval_score === 'number'
                        ? ` (${Math.round(m.retrieval_score * 100)}% match)`
                        : (typeof m.confidence === 'number'
                            ? ` (${Math.round(m.confidence * 100)}% match)`
                            : (m.confidence?.score != null ? ` (${Math.round(m.confidence.score * 100)}% match)` : ''))}
                      {(m.engine || m.provenance?.engine) ? ` • ${(m.engine || m.provenance?.engine).toUpperCase()}` : ''}
                    </span>
                  ) : (
                    <span className="badge badge-warn" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ⚠ Information Not Found in Document
                      {(m.engine || m.provenance?.engine) ? ` • ${(m.engine || m.provenance?.engine).toUpperCase()}` : ''}
                    </span>
                  )}
                  {m.createdAt && (
                    <span className="text-lo" style={{ fontSize: '10px' }}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div style={{ lineHeight: '1.6', fontSize: '13.5px', color: 'var(--hi)' }}>
                  {m.content}
                </div>

                {sources.length > 0 && (
                  <div className="mt-12" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                    <div className="text-lo" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      📎 Supporting Evidence & Citations ({sources.length})
                    </div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {sources.map((src, sIdx) => (
                        <div
                          key={sIdx}
                          style={{
                            background: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--gold)' }}>
                              📄 {src.section || `Segment #${src.segmentIndex + 1}`}
                            </span>
                            {src.similarity && (
                              <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                Relevance {Math.round(src.similarity * 100)}%
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--mid)', fontStyle: 'italic', lineHeight: '1.4' }}>
                            "{src.excerpt}"
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}

        {sending && (
          <motion.div
            className="chat-msg assistant"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ color: 'var(--royal)', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px' }}
          >
            <span className="dot dot-gold" style={{ animation: 'pulse 1s infinite alternate' }} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>
              {retrievalStage === 'retrieving' ? '🔍 Searching document segments…' : '✦ Generating grounded answer…'}
            </span>
          </motion.div>
        )}
      </div>

      <div className="chat-input-row" style={{ marginTop: '16px' }}>
        <input
          id="chatInput"
          placeholder="Ask a question grounded in this document…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          style={{ flex: 1 }}
        />
        <motion.button
          className="btn btn-primary"
          id="chatSendBtn"
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
          {...buttonMotion}
        >
          <Icon.chat /> Ask AI
        </motion.button>
      </div>
    </div>
  );
};

export default ChatTab;
