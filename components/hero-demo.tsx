'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, FileText, MessageSquare, Pause, PencilLine, Sparkles, Upload, Volume2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

export type Sample =
  | {
      kind: 'upload';
      verb: 'Upload';
      desc: string;
      docs: { name: string; size: string }[];
      newDoc: { name: string; size: string };
    }
  | {
      kind: 'listen';
      verb: 'Listen';
      desc: string;
      title: string;
      docTitle: string;
      docMeta: string;
      paragraph: string;
      voice: string;
    }
  | {
      kind: 'ask';
      verb: 'Ask Aura';
      desc: string;
      title: string;
      docTitle: string;
      docMeta: string;
      before: string;
      highlight: string;
      after: string;
      explanation: string;
    };

export const samples: Sample[] = [
  {
    kind: 'upload',
    verb: 'Upload',
    desc: 'Drop a PDF, DOCX, or paste text.',
    docs: [
      { name: 'The Wealth of Nations.docx', size: '1.1 MB' },
      { name: 'Thinking, Fast and Slow.docx', size: '4.7 MB' },
      { name: 'Federalist No. 10.docx', size: '0.8 MB' },
    ],
    newDoc: { name: 'Apple Q1 2026 — Equity Research.docx', size: '2.3 MB' },
  },
  {
    kind: 'listen',
    verb: 'Listen',
    desc: 'Hear your docs in your favourite voice.',
    title: 'Apple Q1 2026 — Equity Research.docx',
    docTitle: 'Apple Inc. — Q1 FY26 Results',
    docMeta: 'JPM Equity Research · January 2026',
    paragraph:
      'Services revenue grew 16% YoY, driven by App Store and subscription gains. The print reinforces the bull case for multiple expansion, with consensus EPS unchanged but the implied forward P/E re-rating higher on services mix.',
    voice: 'Ava (F) · 1.00×',
  },
  {
    kind: 'ask',
    verb: 'Ask Aura',
    desc: 'Highlight anything. Get an instant answer.',
    title: 'The Wealth of Nations.docx',
    docTitle: 'The Wealth of Nations',
    docMeta: 'Adam Smith · 1776',
    before:
      'Every individual, by directing his industry in such a manner as its produce may be of the greatest value, intends only his own gain. He is led by an ',
    highlight: 'invisible hand',
    after:
      ' to promote an end which was no part of his intention.',
    explanation:
      "Smith's metaphor for how individuals acting in their own self-interest can unintentionally produce broadly beneficial outcomes in a market, as if guided by an unseen force.",
  },
];

const TYPE_INTERVAL = 14;

export type Phase = 'idle' | 'act' | 'result';

export function HeroDemo({ idx, phase }: { idx: number; phase: Phase }) {
  const s = samples[idx];
  const [typed, setTyped] = useState('');
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Typewriter for ask samples only
  useEffect(() => {
    if (s.kind !== 'ask' || phase !== 'result') {
      setTyped('');
      return;
    }
    setTyped('');
    let i = 0;
    typeTimer.current = setInterval(() => {
      i++;
      setTyped(s.explanation.slice(0, i));
      if (i >= s.explanation.length && typeTimer.current) clearInterval(typeTimer.current);
    }, TYPE_INTERVAL);
    return () => { if (typeTimer.current) clearInterval(typeTimer.current); };
  }, [phase, s]);

  return (
    <div className="relative w-full max-w-[660px]">
      <div
        className="relative h-[440px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/[0.08]"
        style={{
          boxShadow:
            '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -16px rgba(0,0,0,0.18), 0 4px 12px -4px rgba(0,0,0,0.08)',
        }}
      >
        {s.kind === 'upload' && <UploadView s={s} phase={phase} />}
        {s.kind === 'listen' && <ListenView s={s} phase={phase} />}
        {s.kind === 'ask' && <AskView s={s} phase={phase} typed={typed} />}
      </div>
    </div>
  );
}

/* ─────────────── UPLOAD ─────────────── */

function UploadView({ s, phase }: { s: Extract<Sample, { kind: 'upload' }>; phase: Phase }) {
  return (
    <>
      {/* Library toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Logo size={14} className="text-primary" />
          <span className="text-sm font-medium">Library</span>
          <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {phase === 'idle' ? s.docs.length : s.docs.length + 1}
          </span>
        </div>
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-foreground px-2 text-[10px] font-medium text-background">
          <Upload className="h-3 w-3" /> Upload
        </span>
      </div>

      {/* Drop zone or list */}
      <div className="space-y-2 px-6 py-6 sm:px-8">
        {/* The new doc row — animates in on act, gets the "Just added" pill on result */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-500 ease-out',
            phase === 'idle' ? 'max-h-0 opacity-0 -translate-y-2' : 'max-h-20 opacity-100 translate-y-0',
          )}
        >
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/[0.06] px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{s.newDoc.name}</div>
              <div className="text-[11px] text-muted-foreground">DOCX · {s.newDoc.size}</div>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-500',
                phase === 'result'
                  ? 'bg-primary/15 text-primary opacity-100'
                  : 'bg-muted text-muted-foreground opacity-100',
              )}
            >
              {phase === 'result' ? (
                <>
                  <Check className="h-3 w-3" /> Just added
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Uploading
                </>
              )}
            </span>
          </div>
        </div>

        {/* Existing docs */}
        {s.docs.map(doc => (
          <div
            key={doc.name}
            className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{doc.name}</div>
              <div className="text-[11px] text-muted-foreground">DOCX · {doc.size}</div>
            </div>
          </div>
        ))}
      </div>

      {/* "Drop to upload" hint at the top — visible during idle, fades during act */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 transition-all duration-500',
          phase === 'idle' ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-background/80 px-10 py-6 backdrop-blur">
          <Upload className="h-6 w-6 text-primary" />
          <span className="text-xs font-medium text-foreground">Drop a PDF or DOCX</span>
        </div>
      </div>
    </>
  );
}

/* ─────────────── LISTEN ─────────────── */

function ListenView({
  s, phase,
}: { s: Extract<Sample, { kind: 'listen' }>; phase: Phase }) {
  const active = phase !== 'idle';
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={14} className="shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{s.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {active ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground">
              <Pause className="h-3 w-3" /> Pause
            </span>
          ) : (
            <Pill icon={<Volume2 className="h-3 w-3" />} label="Read aloud" />
          )}
          <Pill icon={<MessageSquare className="h-3 w-3" />} label="Explanations" />
          <Pill icon={<PencilLine className="h-3 w-3" />} label="Edit" />
        </div>
      </div>

      <div className="px-6 py-6 sm:px-10 sm:py-8">
        <h3 className="font-serif text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
          {s.docTitle}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{s.docMeta}</p>

        <p
          className={cn(
            'mt-5 font-serif text-[15px] leading-[1.7] transition-all duration-500 sm:text-[16px]',
            active ? 'border-l-2 border-primary bg-primary/10 pl-3 text-foreground' : 'pl-3 text-foreground',
          )}
        >
          {s.paragraph}
        </p>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 border-t border-primary/30 bg-primary/[0.08] backdrop-blur transition-all duration-500',
          active ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        )}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-[12px] text-foreground">
            <Waveform />
            <span className="font-medium">Reading paragraph 1 of 1</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{s.voice}</span>
        </div>
      </div>
    </>
  );
}

/* ─────────────── ASK AURA ─────────────── */

function AskView({
  s, phase, typed,
}: { s: Extract<Sample, { kind: 'ask' }>; phase: Phase; typed: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={14} className="shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{s.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill icon={<Volume2 className="h-3 w-3" />} label="Read aloud" />
          <Pill icon={<MessageSquare className="h-3 w-3" />} label="Explanations" />
          <Pill icon={<PencilLine className="h-3 w-3" />} label="Edit" />
        </div>
      </div>

      <div className="px-6 py-6 sm:px-10 sm:py-8">
        <h3 className="font-serif text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
          {s.docTitle}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{s.docMeta}</p>

        <p className="mt-5 font-serif text-[15px] leading-[1.7] text-foreground sm:text-[16px]">
          {s.before}
          <span className="relative inline whitespace-normal">
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-[0.05em] left-0 right-0 -z-0 bg-primary/35 transition-transform duration-[550ms] ease-out',
                phase === 'idle' ? 'origin-left scale-x-0' : 'origin-left scale-x-100',
              )}
            />
            <span className="relative z-10">{s.highlight}</span>
            <span
              className={cn(
                'absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-lg transition-all duration-300',
                phase === 'act' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Explain
              </span>
              <span aria-hidden className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary" />
            </span>
          </span>
          {s.after}
        </p>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 border-t border-primary/30 bg-primary/[0.08] backdrop-blur transition-all duration-500',
          phase === 'result' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
        )}
      >
        <div className="flex items-center justify-between border-b border-primary/20 px-4 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Aura · Explanation
          </div>
          <span className="text-[10px] text-muted-foreground">streaming</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[13px] leading-relaxed text-foreground">
            {typed}
            {typed.length < s.explanation.length && (
              <span className="ml-0.5 inline-block h-3 w-[2px] -translate-y-px animate-pulse bg-primary" />
            )}
          </p>
        </div>
      </div>
    </>
  );
}

/* ─────────────── shared bits ─────────────── */

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="hidden h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[10px] text-muted-foreground sm:inline-flex">
      {icon} {label}
    </span>
  );
}

function Waveform() {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className="w-[2.5px] rounded-sm bg-primary"
          style={{ height: '10px', animation: `waveform 0.9s ease-in-out ${i * 0.12}s infinite alternate` }}
        />
      ))}
      <style>{`
        @keyframes waveform {
          0% { height: 3px; opacity: 0.6; }
          100% { height: 14px; opacity: 1; }
        }
      `}</style>
    </span>
  );
}
