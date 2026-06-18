'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookUp, Check, Loader2 } from 'lucide-react';
import type { Document } from '@/lib/types';
import { useClub } from '@/lib/use-club';
import { getClubDocByLocalId } from '@/lib/storage';
import { publishLocalDoc } from '@/lib/club/actions';
import { Button } from '@/components/ui/button';

// Rendered in the reader header (dynamic-imported behind the build flag, so it
// lives only in a club chunk). For docx/txt the parent passes the already-
// rendered snapshot HTML (the viewer's docxHtml); pdf bytes are read in actions.
type Props = { doc: Document; snapshotHtml: string };

type LinkState = 'new' | 'mine' | 'foreign';

export default function PublishToClubButton({ doc, snapshotHtml }: Props) {
  const club = useClub();
  const [state, setState] = useState<LinkState>('new');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setDone(false); setError('');
    getClubDocByLocalId(doc.id)
      .then((link) => { if (!cancelled) setState(!link ? 'new' : link.mine ? 'mine' : 'foreign'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [doc.id]);

  if (!club.hydrated) return null;

  if (!club.signedIn) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/club"><BookUp className="h-4 w-4" /> <span className="hidden sm:inline">Join club to publish</span></Link>
      </Button>
    );
  }

  const label = done
    ? 'Published'
    : state === 'mine' ? 'Update in club'
    : state === 'foreign' ? 'Publish a copy'
    : 'Publish to club';

  const onClick = async () => {
    if (!club.session) return;
    setBusy(true); setError('');
    try {
      await publishLocalDoc({
        session: club.session,
        doc,
        snapshotHtml: doc.fileType === 'pdf' ? undefined : snapshotHtml,
      });
      setDone(true);
      const link = await getClubDocByLocalId(doc.id);
      setState(!link ? 'new' : link.mine ? 'mine' : 'foreign');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.');
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2" data-club-publish>
      <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <BookUp className="h-4 w-4" />}
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {error && <span className="max-w-[12rem] truncate text-xs text-destructive" title={error}>{error}</span>}
    </div>
  );
}
