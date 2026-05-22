'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

const MAX_TURNS = 20;

type Props = {
  reportId: string;
  reportTitle: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  initialMessages?: UIMessage[]; // for "Continue" from a saved thread
  initialExplanationId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

function getMessageText(m: UIMessage): string {
  return m.parts
    .map(p => (p.type === 'text' ? p.text : ''))
    .join('');
}

export default function ExplainPopover({
  reportId,
  reportTitle,
  selectedText,
  contextBefore,
  contextAfter,
  initialMessages,
  initialExplanationId,
  onClose,
  onSaved,
}: Props) {
  const [input, setInput] = useState('');
  const [savedId, setSavedId] = useState<string | null>(initialExplanationId ?? null);
  // Track how many messages have been persisted so we only PATCH the new ones.
  const [savedMessageCount, setSavedMessageCount] = useState<number>(initialMessages?.length ?? 0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const popoverRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const hasAutoStartedRef = useRef(false);

  const { messages, sendMessage, status, stop, setMessages, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/explain',
      body: { reportId, reportTitle, selectedText, contextBefore, contextAfter },
    }),
    messages: initialMessages,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Auto-fire the initial explanation request once on mount (only when there's no prior history)
  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;
    if (!initialMessages || initialMessages.length === 0) {
      sendMessage({ text: 'Please explain the highlighted text.' });
    }
  }, [initialMessages, sendMessage]);

  // Auto-scroll thread to bottom on new tokens
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Hide the implicit "Please explain..." seed message from the rendered thread.
  // It's the first user message, sent before any prior history existed.
  const visibleMessages = messages.filter((m, i) => {
    if (i === 0 && m.role === 'user' && getMessageText(m).startsWith('Please explain the highlighted text.')) {
      return false;
    }
    return true;
  });

  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  const canSave = assistantCount > 0 && !isStreaming;
  const totalTurns = messages.length;
  const hasUnsavedChanges = messages.length > savedMessageCount;
  const followupCapReached = totalTurns >= MAX_TURNS;

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming || followupCapReached) return;
    setInput('');
    sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaveStatus('saving');

    // Strip the seed user message from what we persist
    const messagesToPersist = messages
      .filter((m, i) => !(i === 0 && m.role === 'user' && getMessageText(m).startsWith('Please explain the highlighted text.')))
      .map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }));

    try {
      if (!savedId) {
        // First save: POST the whole thread
        const res = await fetch(`/api/reports/${reportId}/explanations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText,
            contextBefore,
            contextAfter,
            messages: messagesToPersist,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json() as { id: string };
        setSavedId(data.id);
        setSavedMessageCount(messages.length);
      } else {
        // Subsequent save: PATCH only new messages since last save
        const newMessages = messagesToPersist.slice(savedMessageCount);
        if (newMessages.length === 0) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 1500);
          return;
        }
        const res = await fetch(`/api/reports/${reportId}/explanations/${savedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages }),
        });
        if (!res.ok) throw new Error('Save failed');
        setSavedMessageCount(messages.length);
      }
      setSaveStatus('saved');
      onSaved?.();
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleNewQuestion = () => {
    setMessages([]);
    setSavedId(null);
    setSavedMessageCount(0);
    hasAutoStartedRef.current = false;
    // Re-fire the initial explanation
    setTimeout(() => {
      hasAutoStartedRef.current = true;
      sendMessage({ text: 'Please explain the highlighted text.' });
    }, 0);
  };

  const truncatedSelection = selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText;

  return (
    <>
      {/* Backdrop (click-to-close disabled so it doesn't interfere with text selection inside the popover) */}
      <div
        data-explain-popover
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 9998,
        }}
      />
      {/* Popover */}
      <div
        ref={popoverRef}
        data-explain-popover
        role="dialog"
        aria-label="Explanation"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(560px, 90vw)',
          maxHeight: '85vh',
          background: 'var(--term-bg)',
          border: '2px solid var(--term-fg)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--term-fg)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 0.8rem',
          borderBottom: '1px solid var(--term-fg)',
        }}>
          <span style={{ fontSize: '0.85rem' }}>✨ EXPLANATION</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--term-fg)',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0 0.3rem',
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Highlighted selection preview */}
        <div style={{
          padding: '0.5rem 0.8rem',
          borderBottom: '1px solid var(--term-dim)',
          fontSize: '0.75rem',
          color: 'var(--term-dim)',
          fontStyle: 'italic',
        }}>
          &ldquo;{truncatedSelection}&rdquo;
        </div>

        {/* Conversation thread */}
        <div
          ref={threadRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.6rem 0.8rem',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            minHeight: '120px',
          }}
        >
          {visibleMessages.length === 0 && isStreaming && (
            <div style={{ color: 'var(--term-dim)' }}>Thinking…</div>
          )}
          {visibleMessages.map((m, i) => {
            const text = getMessageText(m);
            const isLast = i === visibleMessages.length - 1;
            return (
              <div key={m.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{
                  fontSize: '0.7rem',
                  color: m.role === 'assistant' ? 'var(--term-fg)' : 'var(--term-dim)',
                  marginBottom: '0.2rem',
                  fontWeight: 'bold',
                }}>
                  {m.role === 'assistant' ? 'ANALYST' : 'YOU'}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {text}
                  {isLast && m.role === 'assistant' && isStreaming && (
                    <span style={{ animation: 'blink 1s step-start infinite' }}>▋</span>
                  )}
                </div>
              </div>
            );
          })}
          {error && (
            <div style={{ color: 'var(--term-alert)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Error: {error.message}
              <button onClick={() => regenerate()} style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Follow-up input */}
        <div style={{
          padding: '0.5rem 0.8rem',
          borderTop: '1px solid var(--term-dim)',
          display: 'flex',
          gap: '0.4rem',
          alignItems: 'flex-end',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={followupCapReached ? 'Maximum follow-ups reached.' : 'Ask a follow-up...'}
            disabled={isStreaming || followupCapReached}
            rows={1}
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              padding: '0.3rem 0.4rem',
              background: 'var(--term-bg)',
              color: 'var(--term-fg)',
              border: '1px solid var(--term-dim)',
              resize: 'none',
              minHeight: '1.8rem',
              maxHeight: '4rem',
            }}
          />
          {isStreaming ? (
            <button onClick={() => stop()} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || followupCapReached}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            >
              Send
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '0.5rem 0.8rem',
          borderTop: '1px solid var(--term-dim)',
          display: 'flex',
          gap: '0.4rem',
          alignItems: 'center',
        }}>
          <button
            onClick={handleSave}
            disabled={!canSave || saveStatus === 'saving'}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            {saveStatus === 'saving' ? 'Saving…'
              : saveStatus === 'saved' ? '✓ Saved'
              : saveStatus === 'error' ? '✗ Failed'
              : savedId ? (hasUnsavedChanges ? 'Update Note •' : 'Saved')
              : 'Save Note'}
          </button>
          <button
            onClick={handleNewQuestion}
            disabled={isStreaming}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            New Question
          </button>
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.7rem',
            color: 'var(--term-dim)',
          }}>
            {totalTurns}/{MAX_TURNS} turns
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
