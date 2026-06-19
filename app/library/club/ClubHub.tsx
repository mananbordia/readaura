'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownUp, BookUp, Check, ChevronRight, Copy, FileText, FileType2, Loader2, RefreshCw, Search, Trash2, UserPlus,
} from 'lucide-react';
import type { InviteDTO, MemberDTO, PublishedDocDTO } from '@/shared/club-types';
import type { Document } from '@/lib/types';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { openClubDoc, publishLocalDoc, unpublishDoc, type ClubLink } from '@/lib/club/actions';
import { buildDocSnapshotHtml, computeLocalContentHash } from '@/lib/club/snapshot';
import { getDocument, listClubDocs, listDocuments, putClubDoc } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// The signed-in club surface, rendered inside the library hub (not a separate
// page). Discover + Members + the publish picker. "My published" is folded away:
// your own docs show "by you" here (with an Unpublish action) and carry a
// "Published" badge back in the Library tab. Opening a doc hands its local id up
// to the hub via onOpenDoc so it opens in the same reader (no navigation).

type Props = {
  view: 'discover' | 'members';
  onOpenDoc: (localDocId: string) => void;
  /** Bumped after publish/unpublish so the Library tab can refresh its badges. */
  onChanged?: () => void;
};

// "2h 14m left" / "expired" for an invite's TTL.
function formatRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'no expiry';
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

type ClubSortMode = 'date-desc' | 'date-asc' | 'title';
const CLUB_SORT_LABELS: Record<ClubSortMode, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  title: 'Title (A–Z)',
};

export default function ClubHub({ view, onOpenDoc, onChanged }: Props) {
  const club = useClub();

  const [docs, setDocs] = useState<PublishedDocDTO[]>([]);
  const [links, setLinks] = useState<ClubLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Members tab (owner): active invites + who's joined.
  const [minting, setMinting] = useState(false);
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Publish-a-document picker
  const [publishOpen, setPublishOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>([]);
  // Local ids of my published docs that are unchanged since publish → show
  // "Published" instead of "Update in club" (mirrors the in-reader button).
  const [upToDateIds, setUpToDateIds] = useState<Set<string>>(new Set());

  // Discover search + sort (mirrors the Library list controls).
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<ClubSortMode>('date-desc');

  const linkByLogical = new Map(links.map((l) => [l.logicalId, l] as const));
  const linkByLocal = new Map(
    links.filter((l) => l.localDocumentId).map((l) => [l.localDocumentId as string, l] as const),
  );
  // logicalIds that still exist server-side (this refresh's discover results).
  const liveLogicalIds = new Set(docs.map((d) => d.logicalId));

  // Discover list after search + sort. `.filter` returns a fresh array, so the
  // subsequent `.sort` never mutates `docs`.
  const filteredDocs = docs
    .filter((d) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return d.title.toLowerCase().includes(q)
        || d.fileType.toLowerCase().includes(q)
        || d.publisherName.toLowerCase().includes(q)
        || d.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title);
      const ta = new Date(a.publishedAt).getTime();
      const tb = new Date(b.publishedAt).getTime();
      return sortMode === 'date-asc' ? ta - tb : tb - ta;
    });

  const openPublishPicker = async () => {
    let docs: Document[] = [];
    try { docs = await listDocuments(); } catch { /* ignore */ }
    setLocalDocs(docs);
    setPublishOpen(true);
    // Hash each of my published docs' current content; if it still matches what
    // was published, mark it up to date (no "Update in club" needed).
    const upToDate = new Set<string>();
    await Promise.all(docs.map(async (d) => {
      const link = linkByLocal.get(d.id);
      if (!link?.mine) return;
      try {
        if (await computeLocalContentHash(d) === link.contentHash) upToDate.add(d.id);
      } catch { /* if hashing fails, leave it offering the update */ }
    }));
    setUpToDateIds(upToDate);
  };

  const refresh = useCallback(async () => {
    const token = club.session?.token;
    const myId = club.session?.userId;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [discovered, localLinks] = await Promise.all([clubApi.discover(token), listClubDocs()]);
      setDocs(discovered);
      // Reconcile the local `mine` flag against the server's authorship so the
      // "Published" badges (Library tab) and "by you" labels (Discover) match
      // who actually published each doc; self-heals links that drifted.
      const authoredByLogical = new Map(discovered.map((d) => [d.logicalId, d.publisherId === myId] as const));
      const reconciled = await Promise.all(localLinks.map(async (r) => {
        const authored = authoredByLogical.get(r.logicalId);
        if (authored !== undefined && r.mine !== authored) {
          const fixed = { ...r, mine: authored };
          await putClubDoc(fixed);
          return fixed;
        }
        return r;
      }));
      setLinks(reconciled.map((r) => ({
        logicalId: r.logicalId,
        contentHash: r.cachedContentHash,
        localDocumentId: r.localDocumentId,
        mine: r.mine === true,
      })));
      if (club.session?.role === 'owner') {
        const [inv, mem] = await Promise.all([clubApi.listInvites(token), clubApi.listMembers(token)]);
        setInvites(inv);
        setMembers(mem);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the club library.');
    }
    setLoading(false);
  }, [club.session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tick so invite "remaining time" stays current (minute granularity is fine).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setError('');
    try { await fn(); await refresh(); onChanged?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    setBusy(null);
  };

  // Open a discovered doc in the library reader. If we already hold a current
  // local copy (you published it, or pulled it before) open that directly;
  // otherwise pull it into the library, then hand the local id up to the hub.
  const open = async (d: PublishedDocDTO) => {
    if (!club.session) return;
    setBusy(d.logicalId); setError('');
    try {
      const link = linkByLogical.get(d.logicalId);
      const localId = link?.localDocumentId ?? null;
      const stale = !!(link && link.contentHash !== d.contentHash);
      const haveLocal = localId ? !!(await getDocument(localId)) : false;
      const targetId = haveLocal && !stale ? localId! : await openClubDoc({ session: club.session, dto: d });
      onOpenDoc(targetId); // hub swaps to the reader; leave busy set (we unmount)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open this document.');
      setBusy(null);
    }
  };

  // Publish (or update) a local doc straight from the picker. Snapshot HTML is
  // rebuilt from storage so the hash matches the in-reader publish path. For a
  // doc that was unpublished, this reuses its logicalId and un-tombstones it.
  const publishFromList = (d: Document) => run(`pub:${d.id}`, async () => {
    await publishLocalDoc({ session: club.session!, doc: d, snapshotHtml: await buildDocSnapshotHtml(d) });
    setUpToDateIds((prev) => new Set(prev).add(d.id)); // now matches the published content
  });

  const mintInvite = async () => {
    const token = club.session?.token;
    if (!token) return;
    setMinting(true); setError('');
    try {
      await clubApi.createInvite(token);
      setInvites(await clubApi.listInvites(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite.');
    }
    setMinting(false);
  };

  const skeletonRows = (
    <div className="overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-border p-3 first:border-t-0">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto hidden h-4 w-10 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {view === 'discover' && docs.length > 0 && (
          <>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, tag, type, or author..."
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-start gap-2 sm:justify-between">
                  <ArrowDownUp className="h-4 w-4" />
                  <span>{CLUB_SORT_LABELS[sortMode]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(v) => setSortMode(v as ClubSortMode)}>
                  <DropdownMenuRadioItem value="date-desc">Newest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="date-asc">Oldest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="title">Title (A–Z)</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <div className="flex items-center gap-1 sm:ml-auto">
          <Button size="sm" onClick={openPublishPicker}>
            <BookUp className="h-4 w-4" /> <span className="hidden sm:inline">Publish</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

      {view === 'discover' && (
        loading && docs.length === 0
          ? skeletonRows
          : docs.length === 0
          ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="rounded-full bg-muted p-3">
                  <BookUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">Nothing published yet</div>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    Publish a document from your library to share it with the club. Your private docs stay private until you do.
                  </p>
                </div>
                <Button size="sm" onClick={openPublishPicker}>
                  <BookUp className="h-4 w-4" /> Publish a document
                </Button>
              </CardContent>
            </Card>
          )
          : <>
              {filteredDocs.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
                  No documents match the current filter.
                </div>
              ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left sm:p-3">Title</th>
                      <th className="hidden p-3 text-left sm:table-cell">Type</th>
                      <th className="hidden p-3 text-left md:table-cell">By</th>
                      <th className="hidden p-3 text-left lg:table-cell">Tags</th>
                      <th className="p-2 text-right sm:p-3">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((d) => {
                    const link = linkByLogical.get(d.logicalId);
                    const stale = link && link.contentHash !== d.contentHash;
                    const isBusy = busy === d.logicalId;
                    const isAuthor = d.publisherId === club.session?.userId;
                    return (
                      <tr
                        key={d.logicalId}
                        onClick={() => { if (!isBusy) open(d); }}
                        className={`border-t border-border transition-colors hover:bg-muted/30 ${isBusy ? 'opacity-60' : 'cursor-pointer'}`}
                      >
                        <td className="p-2 font-medium sm:p-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {d.fileType === 'pdf' ? <FileType2 className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <span className="truncate">{d.title}</span>
                          </div>
                        </td>
                        <td className="hidden p-3 text-muted-foreground sm:table-cell">{d.fileType.toUpperCase()}</td>
                        <td className="hidden p-3 text-muted-foreground md:table-cell">{isAuthor ? 'you' : d.publisherName}</td>
                        <td className="hidden p-3 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {d.tags.map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}
                          </div>
                        </td>
                        <td className="p-2 text-right sm:p-3">
                          <div className="flex items-center justify-end gap-2">
                            {stale && <Badge variant="default" className="text-[10px]">Update</Badge>}
                            {isAuthor && (
                              <Button
                                size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
                                title="Unpublish" aria-label="Unpublish" disabled={isBusy}
                                onClick={(e) => { e.stopPropagation(); run(d.logicalId, () => unpublishDoc({ session: club.session!, logicalId: d.logicalId })); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              )}
            </>
      )}

      {view === 'members' && club.session?.role === 'owner' && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Mint a single-use invite per member. Codes expire in 72h.</p>
            <Button size="sm" className="mt-2" onClick={mintInvite} disabled={minting}>
              {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Create invite</>}
            </Button>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active invites <Badge variant="muted" className="font-normal normal-case">{invites.length}</Badge>
            </div>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active invites — create one above.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">{inv.code}</code>
                      <span className="text-xs text-muted-foreground">{formatRemaining(inv.expiresAt, now)}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0"
                      onClick={() => { navigator.clipboard?.writeText(inv.code); setCopiedCode(inv.id); setTimeout(() => setCopiedCode(null), 1500); }}>
                      {copiedCode === inv.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Members <Badge variant="muted" className="font-normal normal-case">{members.length}</Badge>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members have joined yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <span className="truncate text-sm font-medium">{m.displayName}{m.role === 'owner' ? ' · owner' : ''}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">joined {new Date(m.joinedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Publish a document</DialogTitle>
            <DialogDescription>
              Publish a document from your library to the club, or update one you&apos;ve already published.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {localDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your library is empty — add a document first.</p>
          ) : (
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
              {localDocs.map((d) => {
                const link = linkByLocal.get(d.id);
                // Lock only docs opened from a club publication that's still live:
                // you can't republish someone else's doc (no forking). A link to a
                // publication that no longer exists isn't a fork — allow publishing.
                const foreign = !!link && !link.mine && liveLogicalIds.has(link.logicalId);
                const published = !!link && link.mine;
                const pubBusy = busy === `pub:${d.id}`;
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.fileType.toUpperCase()}{published ? ' · in club' : foreign ? ' · opened from club' : ''}
                      </span>
                    </span>
                    {foreign ? (
                      <span className="shrink-0 text-xs text-muted-foreground" title="Opened from the club — read-only copy.">Read-only copy</span>
                    ) : published && upToDateIds.has(d.id) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Published to the club and up to date">
                        <Check className="h-3.5 w-3.5 text-primary" /> Published
                      </span>
                    ) : (
                      <Button size="sm" variant={published ? 'ghost' : 'outline'} className="shrink-0" disabled={pubBusy}
                        onClick={() => publishFromList(d)}>
                        {pubBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><BookUp className="h-4 w-4" /> {published ? 'Update in club' : 'Publish to Club'}</>}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
