'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Presentational only (no club imports) — the amber "save this once" account-key
// box, shown by the join dialog's final step and the account controls.
export default function RecoveryCodeNotice({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
      <h3 className="text-sm font-semibold">Save your account key</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown once. Use it to sign in to ReadAura on your other devices and browsers, and to reclaim your account if you clear this browser. Keep it somewhere safe.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-sm">{code}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
