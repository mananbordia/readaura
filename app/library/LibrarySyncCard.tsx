'use client';

import { useEffect, useState } from 'react';
import { Cloud, Loader2, RefreshCw } from 'lucide-react';
import { useClub } from '@/lib/use-club';
import { getSyncMeta } from '@/lib/storage';
import { enableSync, disableSync, syncNow } from '@/lib/sync/engine';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';

// Opt-in, account-level library sync. Dynamic-imported behind the club build
// flag (the engine talks to the club backend), so it never ships in the
// flag-off bundle. Renders nothing unless the user is signed in to the club.
type Props = { onSynced?: () => void };

export default function LibrarySyncCard({ onSynced }: Props) {
  const club = useClub();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [error, setError] = useState('');

  // On sign-in, load state and (if on) run a cycle so this device pulls/restores.
  useEffect(() => {
    if (!club.signedIn) return;
    let cancelled = false;
    (async () => {
      const meta = await getSyncMeta();
      if (cancelled) return;
      setEnabled(meta.enabled);
      setLastSynced(meta.lastPulledAt);
      if (!meta.enabled) return;
      setBusy(true);
      try {
        const res = await syncNow();
        if (cancelled) return;
        setLastSynced((await getSyncMeta()).lastPulledAt);
        if (res && res.pulled > 0) onSynced?.();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Sync failed.');
      }
      if (!cancelled) setBusy(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.signedIn]);

  if (!club.hydrated || !club.signedIn) return null;

  const runSyncNow = async () => {
    setBusy(true); setError('');
    try {
      const res = await syncNow();
      setLastSynced((await getSyncMeta()).lastPulledAt);
      if (res && res.pulled > 0) onSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
    }
    setBusy(false);
  };

  const toggle = async () => {
    setBusy(true); setError('');
    try {
      if (enabled) await disableSync();
      else await enableSync(); // restores on a fresh device + backs up the library
      const m = await getSyncMeta();
      setEnabled(m.enabled);
      setLastSynced(m.lastPulledAt);
      onSynced?.(); // a restore may have added documents
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
    }
    setBusy(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Cloud className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Library sync</div>
            <div className="text-xs text-muted-foreground">
              {busy ? 'Syncing…'
                : enabled ? `On${lastSynced ? ` · synced ${timeAgo(lastSynced)}` : ''}`
                : 'Back up your library to your account and restore it on any device.'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {enabled && (
            <Button size="sm" variant="ghost" onClick={runSyncNow} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Sync now</span>
            </Button>
          )}
          <Button size="sm" variant={enabled ? 'outline' : 'default'} onClick={toggle} disabled={busy}>
            {enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
