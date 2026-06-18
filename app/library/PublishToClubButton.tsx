'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookUp, Check, Loader2 } from 'lucide-react';
import type { Document } from '@/lib/types';
import { useClub } from '@/lib/use-club';
import { getClubDocByLocalId } from '@/lib/storage';
import { publishLocalDoc } from '@/lib/club/actions';
import { buildDocSnapshotHtml, computeLocalContentHash } from '@/lib/club/snapshot';
import { clubApi } from '@/lib/club/api';
import { Button } from '@/components/ui/button';

// Reader-header button (dynamic-imported behind the build flag, so it lives only
// in a club chunk). The snapshot HTML is rebuilt from storage at publish time
// (same path the /club publish list uses) so the content hash matches either
// way. A doc opened from the club is a read-only local copy — no button (no
// forking) while that publication is still live.
// contentVersion bumps when the doc is edited, so we re-check local-vs-published.
type Props = { doc: Document; contentVersion?: number };
// 'loading' until we've resolved the doc's club link — we render nothing in that
// window so the button never flashes "Publish" before we know it's a viewer's
// read-only copy. 'mine' = published by me with local edits to push; 'published'
// = published by me and unchanged (nothing to update → no button).
type LinkState = 'loading' | 'new' | 'mine' | 'published' | 'foreign';

export default function PublishToClubButton({ doc, contentVersion }: Props) {
  const club = useClub();
  const [state, setState] = useState<LinkState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const token = club.session?.token;
  useEffect(() => {
    let cancelled = false;
    setError('');
    setState('loading'); // reset when switching docs so the old state can't flash
    (async () => {
      const link = await getClubDocByLocalId(doc.id).catch(() => null);
      if (cancelled) return;
      if (!link) { setState('new'); return; }
      if (link.mine) {
        // Show "Update in club" only when the local content differs from what's
        // published; otherwise it's up to date → no button. If hashing fails
        // (e.g. non-secure context) default to offering the update.
        const currentHash = await computeLocalContentHash(doc).catch(() => null);
        if (cancelled) return;
        setState(currentHash && currentHash === link.cachedContentHash ? 'published' : 'mine');
        return;
      }
      // Opened from the club: only keep it read-only while the publication is
      // still live. If it's been unpublished/wiped, it's just an orphaned local
      // doc — let the user publish it. (No token → stay conservative.)
      if (!token) { setState('foreign'); return; }
      const live = await clubApi.exists(token, link.logicalId).catch(() => true);
      if (!cancelled) setState(live ? 'foreign' : 'new');
    })();
    return () => { cancelled = true; };
  }, [doc.id, token, contentVersion]);

  if (!club.hydrated || state === 'loading') return null; // wait until the link is known
  if (state === 'foreign') return null; // opened from the club → read-only local copy

  if (!club.signedIn) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/club"><BookUp className="h-4 w-4" /> <span className="hidden sm:inline">Join club to publish</span></Link>
      </Button>
    );
  }

  // Published by me and unchanged since — nothing to update, so just confirm it.
  if (state === 'published') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Published to the club and up to date">
        <Check className="h-3.5 w-3.5 text-primary" /> <span className="hidden sm:inline">Published</span>
      </span>
    );
  }

  const label = state === 'mine' ? 'Update in club' : 'Publish to Club';

  const onClick = async () => {
    if (!club.session) return;
    setBusy(true); setError('');
    try {
      await publishLocalDoc({
        session: club.session,
        doc,
        snapshotHtml: await buildDocSnapshotHtml(doc),
      });
      setState('published'); // local now matches the published version
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.');
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2" data-club-publish>
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookUp className="h-4 w-4" />}
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {error && <span className="max-w-xs text-xs text-destructive">{error}</span>}
    </div>
  );
}
