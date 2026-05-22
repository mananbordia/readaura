'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Sparkles, Trash2 } from 'lucide-react';
import type { SavedExplanation } from '@/lib/types';
import { listExplanations, deleteExplanation } from '@/lib/storage';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

type Props = {
  documentId: string;
  refreshKey: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: (explanation: SavedExplanation) => void;
};

export default function SavedExplanationsDrawer({ documentId, refreshKey, open, onOpenChange, onContinue }: Props) {
  const [explanations, setExplanations] = useState<SavedExplanation[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadExplanations = useCallback(async () => {
    setLoading(true);
    try {
      setExplanations(await listExplanations(documentId));
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
    await deleteExplanation(id);
    setExplanations(prev => prev.filter(e => e.id !== id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Saved explanations
            <Badge variant="muted" className="font-normal">{explanations.length}</Badge>
          </SheetTitle>
          <SheetDescription>Threads you saved for this document.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {loading && explanations.length === 0 && (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
            {!loading && explanations.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <Sparkles className="mx-auto mb-2 h-5 w-5 opacity-60" />
                Highlight a passage in the document and ask Aura to explain it. Saved threads show up here.
              </div>
            )}

            <ul className="space-y-2">
              {explanations.map(exp => {
                const isExpanded = expanded.has(exp.id);
                const turnCount = exp.messages.length;
                const truncated = exp.selectedText.length > 110
                  ? exp.selectedText.slice(0, 110) + '…'
                  : exp.selectedText;
                return (
                  <li key={exp.id} className="overflow-hidden rounded-md border border-border">
                    <button
                      onClick={() => toggleExpanded(exp.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1 truncate italic text-muted-foreground">
                        &ldquo;{truncated}&rdquo;
                      </span>
                      <Badge variant="muted" className="shrink-0 font-normal">{turnCount}</Badge>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(exp.updatedAt)}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20 p-3">
                        <div className="space-y-3 text-sm">
                          {exp.messages.map(m => (
                            <div key={m.id}>
                              <div className={`mb-0.5 text-xs font-semibold uppercase tracking-wide ${m.role === 'assistant' ? 'text-primary' : 'text-muted-foreground'}`}>
                                {m.role === 'assistant' ? 'Aura' : 'You'}
                              </div>
                              <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={() => onContinue(exp)}>
                            Continue
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(exp.id)} className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
