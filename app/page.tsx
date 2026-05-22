'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { HeroDemo, samples, type Phase } from '@/components/hero-demo';
import { cn } from '@/lib/utils';

function Github({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.555 0-.275-.01-1.005-.016-1.972-3.197.695-3.872-1.541-3.872-1.541-.523-1.327-1.278-1.68-1.278-1.68-1.044-.713.08-.698.08-.698 1.154.082 1.762 1.185 1.762 1.185 1.027 1.76 2.695 1.252 3.353.957.105-.744.402-1.252.731-1.54-2.553-.29-5.236-1.276-5.236-5.682 0-1.255.45-2.281 1.184-3.085-.119-.29-.513-1.461.113-3.044 0 0 .965-.309 3.16 1.179a10.96 10.96 0 0 1 2.876-.387c.975.005 1.957.132 2.876.387 2.193-1.488 3.156-1.179 3.156-1.179.628 1.583.234 2.754.115 3.044.737.804 1.183 1.83 1.183 3.085 0 4.416-2.688 5.388-5.249 5.673.413.355.78 1.057.78 2.13 0 1.538-.014 2.778-.014 3.156 0 .308.207.667.79.554A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

const ACT_AT = 1100;
const RESULT_AT = 2400;
const CYCLE_MS = 8500;

export default function HomePage() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  // Single source of truth for the cycle. Both the left-hand copy
  // (verb + short line) and the right-hand demo read from this state.
  useEffect(() => {
    setPhase('idle');
    const t1 = setTimeout(() => setPhase('act'), ACT_AT);
    const t2 = setTimeout(() => setPhase('result'), RESULT_AT);
    const t3 = setTimeout(() => setIdx(i => (i + 1) % samples.length), CYCLE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [idx]);

  const sample = samples[idx];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="relative flex flex-1 items-center overflow-hidden px-6 py-8">
        {/* Single sophisticated wash — vertical gradient that's nearly invisible,
            just enough to lift the eye toward the headline area. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.55 0.13 250 / 0.10) 0%, transparent 65%)',
          }}
        />

        {/* One soft accent glow behind the demo — gives the card presence
            without painting the page. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[8%] top-1/2 -z-10 h-[36rem] w-[36rem] -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl"
        />

        {/* Film grain — sells the "this is a real artefact, not a CSS demo" feeling.
            SVG fractal noise, base64-inlined, ~4% opacity. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
            backgroundSize: '240px 240px',
          }}
        />

        {/* Crosshair-grid — extremely faint, gives the page a sense of a
            considered layout instead of empty void. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.025] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:80px_80px] text-foreground [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
          {/* ─── Left: BIG brand title + syncing verb + CTAs ─── */}
          <div>
            <h1 className="font-serif text-5xl font-medium leading-[0.98] tracking-[-0.025em] sm:text-6xl lg:text-[5.25rem]">
              Read with an{' '}
              <em className="not-italic bg-gradient-to-br from-primary via-primary/90 to-foreground/90 bg-clip-text text-transparent">
                Aura.
              </em>
            </h1>

            {/* The synced action verb sits below the brand title and changes
                per sample. `key={idx}` remounts it so the fade-up animation
                re-runs on each change. */}
            <p
              key={`verb-${idx}`}
              className="mt-8 text-2xl font-medium tracking-tight text-foreground sm:text-[1.625rem]"
              style={{ animation: 'fade-up 0.5s ease-out both' }}
            >
              <span className="text-primary">{sample.verb}.</span>{' '}
              <span className="font-normal text-muted-foreground">{sample.desc}</span>
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/library">
                  Try it now <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="https://github.com/mananbordia/readaura" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" /> GitHub
                </a>
              </Button>
            </div>

            {/* Sample progress — three labels with thin progress bars */}
            <div className="mt-12 flex items-center gap-6">
              {samples.map((sample, i) => (
                <button
                  key={sample.verb}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cn(
                    'flex flex-col items-start gap-2 text-left transition-opacity',
                    i === idx ? 'opacity-100' : 'opacity-40 hover:opacity-70',
                  )}
                >
                  <span className={cn(
                    'font-mono text-[10px] font-medium uppercase tracking-[0.18em]',
                    i === idx ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {String(i + 1).padStart(2, '0')} — {sample.verb}
                  </span>
                  <span className="h-px w-16 overflow-hidden bg-border">
                    <span
                      className={cn(
                        'block h-full origin-left bg-foreground transition-transform',
                        i === idx ? 'scale-x-100' : 'scale-x-0',
                      )}
                      style={i === idx ? { animation: `dot-progress ${CYCLE_MS}ms linear` } : undefined}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── Right: live demo ─── */}
          <div className="flex justify-center lg:justify-end">
            <HeroDemo idx={idx} phase={phase} />
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-xs text-muted-foreground">
          <span>ReadAura · MIT</span>
          <a
            href="https://github.com/mananbordia/readaura"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" /> Source
          </a>
        </div>
      </footer>
    </div>
  );
}
