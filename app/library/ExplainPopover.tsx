'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Loader2, Save, Send, Sparkles, Square, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { readApiKey } from '@/lib/use-api-key';

const MAX_TURNS = 20;

type Props = {
  documentId: string;
  documentTitle: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  initialMessages?: UIMessage[];
  initialExplanationId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

function getMessageText(m: UIMessage): string {
  return m.parts.map(p => (p.type === 'text' ? p.text : '')).join('');
}

export default function ExplainPopover({
  documentId,
  documentTitle,
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
  const [savedMessageCount, setSavedMessageCount] = useState<number>(initialMessages?.length ?? 0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const threadRef = useRef<HTMLDivElement>(null);
  const hasAutoStartedRef = useRef(false);

  // The transport `body` is captured at construction time, but the AI SDK
  // resolves `body` as a function on each send if you pass one. We snapshot
  // localStorage at construction since the popover is short-lived; if the user
  // updates the key in Settings while it's open, they can close and reopen.
  const apiKey = typeof window !== 'undefined' ? readApiKey() : '';

  const { messages, sendMessage, status, stop, setMessages, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/explain',
      body: {
        reportId: documentId,
        reportTitle: documentTitle,
        selectedText,
        contextBefore,
        contextAfter,
        apiKey,
      },
    }),
    messages: initialMessages,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;
    if (!initialMessages || initialMessages.length === 0) {
      sendMessage({ text: 'Please explain the highlighted text.' });
    }
  }, [initialMessages, sendMessage]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

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

    const messagesToPersist = messages
      .filter((m, i) => !(i === 0 && m.role === 'user' && getMessageText(m).startsWith('Please explain the highlighted text.')))
      .map(m => ({ role: m.role as 'user' | 'assistant', content: getMessageText(m) }));

    try {
      if (!savedId) {
        const res = await fetch(`/api/library/${documentId}/explanations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedText, contextBefore, contextAfter, messages: messagesToPersist }),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json() as { id: string };
        setSavedId(data.id);
        setSavedMessageCount(messages.length);
      } else {
        const newMessages = messagesToPersist.slice(savedMessageCount);
        if (newMessages.length === 0) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 1500);
          return;
        }
        const res = await fetch(`/api/library/${documentId}/explanations/${savedId}`, {
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
    setTimeout(() => {
      hasAutoStartedRef.current = true;
      sendMessage({ text: 'Please explain the highlighted text.' });
    }, 0);
  };

  const truncatedSelection = selectedText.length > 120 ? selectedText.slice(0, 120) + '…' : selectedText;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent data-explain-popover className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-3 pr-12">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Explanation</span>
          </div>
        </div>

        {/* Selection blockquote */}
        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
          <p className="text-xs italic text-muted-foreground">&ldquo;{truncatedSelection}&rdquo;</p>
        </div>

        {/* Thread */}
        <ScrollArea className="flex-1">
          <div ref={threadRef} className="space-y-4 p-4 text-sm">
            {visibleMessages.length === 0 && isStreaming && (
              <div className="flex items-center gap-2 text-muted-foreground animate-pulse-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
            {visibleMessages.map((m, i) => {
              const text = getMessageText(m);
              const isLast = i === visibleMessages.length - 1;
              return (
                <div key={m.id}>
                  <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${m.role === 'assistant' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {m.role === 'assistant' ? 'Aura' : 'You'}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {text}
                    {isLast && m.role === 'assistant' && isStreaming && (
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary" />
                    )}
                  </div>
                </div>
              );
            })}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="flex-1">
                  {error.message}
                  <Button size="sm" variant="ghost" onClick={() => regenerate()} className="ml-2 h-6 px-2 text-xs">
                    <RotateCcw className="h-3 w-3" /> Retry
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Composer */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={followupCapReached ? 'Maximum follow-ups reached.' : 'Ask a follow-up…'}
              disabled={isStreaming || followupCapReached}
              rows={1}
              className="min-h-[40px] max-h-32 resize-none"
            />
            {isStreaming ? (
              <Button size="icon" variant="outline" onClick={() => stop()} aria-label="Stop">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" onClick={handleSend} disabled={!input.trim() || followupCapReached} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
          <Button
            size="sm"
            variant={savedId && !hasUnsavedChanges ? 'ghost' : 'default'}
            onClick={handleSave}
            disabled={!canSave || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saveStatus === 'saving' ? 'Saving…'
              : saveStatus === 'saved' ? 'Saved'
              : saveStatus === 'error' ? 'Failed'
              : savedId ? (hasUnsavedChanges ? 'Update note' : 'Saved')
              : 'Save note'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleNewQuestion} disabled={isStreaming}>
            New question
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">{totalTurns}/{MAX_TURNS} turns</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
