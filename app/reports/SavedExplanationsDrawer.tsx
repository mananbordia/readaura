'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { SavedExplanation } from '@/lib/db';
import { timeAgo } from '@/lib/format';

type Props = {
  documentId: string;
  // Bumped by parent when a new explanation is saved, to trigger a refetch
  refreshKey: number;
  onContinue: (explanation: SavedExplanation) => void;
};

export default function SavedExplanationsDrawer({ documentId, refreshKey, onContinue }: Props) {
  const [explanations, setExplanations] = useState<SavedExplanation[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadExplanations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${documentId}/explanations`);
      if (!res.ok) return;
      const data = await res.json() as { explanations: SavedExplanation[] };
      setExplanations(data.explanations);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadExplanations();
  }, [loadExplanations, refreshKey]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this saved explanation?')) return;
    const res = await fetch(`/api/reports/${documentId}/explanations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setExplanations(prev => prev.filter(e => e.id !== id));
    }
  };

  return (
    <div style={{
      marginTop: '1rem',
      border: '1px solid var(--term-dim)',
      fontFamily: 'var(--font-mono)',
    }}>
      <div
        onClick={() => setDrawerOpen(v => !v)}
        style={{
          padding: '0.5rem 0.8rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          background: 'var(--term-bg)',
          borderBottom: drawerOpen ? '1px solid var(--term-dim)' : 'none',
        }}
      >
        <span>✨ SAVED EXPLANATIONS ({explanations.length})</span>
        <span>{drawerOpen ? '▼' : '▶'}</span>
      </div>

      {drawerOpen && (
        <div style={{ padding: '0.5rem 0.8rem', maxHeight: '40vh', overflowY: 'auto' }}>
          {loading && explanations.length === 0 && (
            <div style={{ color: 'var(--term-dim)', fontSize: '0.8rem' }}>Loading…</div>
          )}
          {!loading && explanations.length === 0 && (
            <div style={{ color: 'var(--term-dim)', fontSize: '0.8rem' }}>
              No saved explanations yet — highlight text in the document to get started.
            </div>
          )}
          {explanations.map(exp => {
            const isExpanded = expanded.has(exp.id);
            const turnCount = exp.messages.length;
            const truncated = exp.selectedText.length > 100
              ? exp.selectedText.slice(0, 100) + '…'
              : exp.selectedText;
            return (
              <div
                key={exp.id}
                style={{
                  marginBottom: '0.5rem',
                  border: '1px solid var(--term-dim)',
                  fontSize: '0.8rem',
                }}
              >
                <div
                  onClick={() => toggleExpanded(exp.id)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ flex: 1, fontStyle: 'italic', color: 'var(--term-dim)' }}>
                    &ldquo;{isExpanded ? exp.selectedText : truncated}&rdquo;
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--term-dim)' }}>
                    {turnCount} turn{turnCount !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--term-dim)' }}>
                    {timeAgo(exp.updatedAt)}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '0.5rem 0.6rem',
                    borderTop: '1px solid var(--term-dim)',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    {exp.messages.map(m => (
                      <div key={m.id} style={{ marginBottom: '0.5rem' }}>
                        <div style={{
                          fontSize: '0.65rem',
                          color: m.role === 'assistant' ? 'var(--term-fg)' : 'var(--term-dim)',
                          fontWeight: 'bold',
                          marginBottom: '0.15rem',
                        }}>
                          {m.role === 'assistant' ? 'AURA' : 'YOU'}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onContinue(exp); }}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                      >
                        Continue
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }}
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: 'var(--term-alert)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
