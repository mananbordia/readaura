'use client';

import { useEffect, useState } from 'react';
import { Cloud, Loader2, RefreshCw } from 'lucide-react';
import { useClub } from '@/lib/use-club';
import { getSyncMeta } from '@/lib/storage';
import { enableSync, disableSync, syncNow } from '@/lib/sync/engine';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import JoinClubDialog from './club/JoinClubDialog';

// Opt-in, account-level library sync. Dynamic-imported behind the club build
// flag (the engine talks to the club backend), so it never ships in the
// flag-off bundle. Renders nothing unless the user is signed in to the club.
type Props = {
  onSynced?: () => void;
  /** Inline form (status + icon buttons, no card chrome) for the tab-bar row. */
  compact?: boolean;
};

export default function LibrarySyncCard({ onSynced, compact }: Props) {
  const club = useClub();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reconnectOpen, setReconnectOpen] = useState(false);

  // On sign-in, load state and (if on) run a cycle so this device pulls/restores.
  // Skipped while `expired` (a rejected token) — we wait for the reconnect.
  useEffect(() => {
    if (!club.signedIn || club.expired) return;
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
  }, [club.signedIn, club.expired]);

  if (!club.hydrated || !club.signedIn) return null;

  // Token was rejected on this device — offer a one-tap reconnect (sign in again
  // with the account key) rather than silently dropping the session.
  if (club.expired) {
    return (
      <div className={compact ? 'flex items-center gap-1 text-xs' : 'mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm'}>
        <span className="text-destructive">Session expired</span>
        <Button size="sm" variant="ghost" className="ml-1" onClick={() => setReconnectOpen(true)}>Sign in again</Button>
        <JoinClubDialog
          open={reconnectOpen}
          onOpenChange={setReconnectOpen}
          initialMode="recover"
          onSignedIn={() => { setReconnectOpen(false); onSynced?.(); }}
        />
      </div>
    );
  }

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

  // Inline form for the tab-bar row: just status + controls, no card.
  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {enabled ? (
          <>
            <span className="mr-0.5 hidden items-center gap-1 md:inline-flex">
              <Cloud className="h-3.5 w-3.5 text-primary" />
              {busy ? 'Syncing…'
                : error ? <span className="text-destructive" title={error}>Sync failed</span>
                : lastSynced ? `Synced ${timeAgo(lastSynced)}` : 'Synced'}
            </span>
            <Button size="icon-sm" variant="ghost" onClick={runSyncNow} disabled={busy} title="Sync now" aria-label="Sync now">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={toggle} disabled={busy}>Turn off</Button>
          </>
        ) : (
          <Button
            size="sm" variant="ghost" onClick={toggle} disabled={busy}
            title={error || 'Back up your private documents to your account and restore them on any device.'}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            <span className="hidden sm:inline">Sync Private</span>
          </Button>
        )}
      </div>
    );
  }

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
