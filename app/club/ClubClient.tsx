'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookUp, Check, ChevronRight, Copy, Globe, Loader2, LogOut, RefreshCw, Trash2, UserPlus,
} from 'lucide-react';
import type { InviteDTO, MemberDTO, PublishedDocDTO } from '@/shared/club-types';
import type { Document } from '@/lib/types';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { openClubDoc, publishLocalDoc, unpublishDoc, type ClubLink } from '@/lib/club/actions';
import { buildDocSnapshotHtml } from '@/lib/club/snapshot';
import { getDocument, listClubDocs, listDocuments, putClubDoc } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type Tab = 'discover' | 'mine' | 'members';

// "2h 14m left" / "expired" for an invite's TTL.
function formatRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'no expiry';
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export default function ClubClient() {
  const club = useClub();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('discover');
  const [docs, setDocs] = useState<PublishedDocDTO[]>([]);
  const [links, setLinks] = useState<ClubLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // auth
  const [mode, setMode] = useState<'join' | 'recover'>('join');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Members tab (owner): active invites + who's joined.
  const [minting, setMinting] = useState(false);
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Publish-a-document picker
  const [publishOpen, setPublishOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>([]);

  const linkByLogical = new Map(links.map((l) => [l.logicalId, l] as const));
  const linkByLocal = new Map(
    links.filter((l) => l.localDocumentId).map((l) => [l.localDocumentId as string, l] as const),
  );
  // logicalIds that still exist server-side (this refresh's discover results).
  const liveLogicalIds = new Set(docs.map((d) => d.logicalId));

  const openPublishPicker = async () => {
    try { setLocalDocs(await listDocuments()); } catch { /* ignore */ }
    setPublishOpen(true);
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
      // Reconcile the local `mine` flag against the server's authorship: for any
      // doc currently in discover, `mine` must equal "I published it". This
      // self-heals links that drifted (e.g. an old open-from-club path wrote
      // mine:false on a doc I actually authored) so "My published" matches the
      // "by you" docs in Discover. Links for docs not in discover (unpublished)
      // keep their flag so they can still be re-published.
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
      // Owner-only Members tab data: active invites + who's joined.
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

  useEffect(() => {
    if (club.signedIn) refresh();
  }, [club.signedIn, refresh]);

  // Tick so invite "remaining time" stays current (minute granularity is fine).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const submitAuth = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = mode === 'join'
        ? await clubApi.join(inviteCode.trim(), displayName.trim())
        : await clubApi.recover(recoveryInput.trim());
      club.save({ token: res.token, userId: res.userId, displayName: res.displayName, role: res.role });
      setRecoveryCode(res.recoveryCode);
      setInviteCode(''); setRecoveryInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    }
    setSubmitting(false);
  };

  const handleSignOut = () => {
    club.signOut();
    setMode('join'); setInviteCode(''); setDisplayName(''); setRecoveryInput('');
    setRecoveryCode(null);
    setDocs([]); setLinks([]); setInvites([]); setMembers([]); setError('');
  };

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setError('');
    try { await fn(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    setBusy(null);
  };

  // Open a discovered doc in the library reader. If we already hold a current
  // local copy (you published it, or pulled it before) open that directly —
  // avoids a needless re-download and never clobbers your own edits. Otherwise
  // pull it into the library (or sync to the newer version) and open that.
  const open = async (d: PublishedDocDTO) => {
    const token = club.session?.token;
    if (!token) return;
    setBusy(d.logicalId); setError('');
    try {
      const link = linkByLogical.get(d.logicalId);
      const localId = link?.localDocumentId ?? null;
      const stale = !!(link && link.contentHash !== d.contentHash);
      const haveLocal = localId ? !!(await getDocument(localId)) : false;
      const targetId = haveLocal && !stale ? localId! : await openClubDoc({ session: club.session!, dto: d });
      router.push(`/library?doc=${targetId}&from=club`); // unmounts; leave busy set
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open this document.');
      setBusy(null);
    }
  };

  // Publish (or update) a local doc straight from the picker — no detour
  // through the reader. Snapshot HTML is rebuilt from storage so the hash
  // matches the in-reader publish path.
  const publishFromList = (d: Document) => run(`pub:${d.id}`, async () => {
    await publishLocalDoc({
      session: club.session!,
      doc: d,
      snapshotHtml: await buildDocSnapshotHtml(d),
    });
  });

  // Re-publish a doc that was unpublished (tombstoned server-side, local link
  // still mine). Reuses the same logicalId, so the server un-tombstones the
  // existing row rather than creating a duplicate. Needs the local copy.
  const republish = (l: ClubLink) => run(l.logicalId, async () => {
    const doc = l.localDocumentId ? await getDocument(l.localDocumentId) : null;
    if (!doc) throw new Error('The local copy is gone — re-add the file to your library to publish it again.');
    await publishLocalDoc({
      session: club.session!,
      doc,
      snapshotHtml: await buildDocSnapshotHtml(doc),
    });
  });

  const mintInvite = async () => {
    const token = club.session?.token;
    if (!token) return;
    setMinting(true); setError('');
    try {
      await clubApi.createInvite(token);
      setInvites(await clubApi.listInvites(token)); // surface the new code in the list
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite.');
    }
    setMinting(false);
  };

  // ----- render -----------------------------------------------------------

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
  );

  if (!club.hydrated) {
    return shell(<div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>);
  }

  // Blocking recovery-code gate (shown once after join/recover).
  if (recoveryCode) {
    return shell(
      <div className="mx-auto max-w-md rounded-lg border border-amber-500/50 bg-amber-500/10 p-5">
        <h2 className="text-base font-semibold">Save your recovery code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown once. It&apos;s the only way to reclaim your account and published docs if you clear your browser or sign out.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-sm">{recoveryCode}</code>
          <Button size="sm" variant="outline"
            onClick={() => { navigator.clipboard?.writeText(recoveryCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <Button className="mt-4 w-full" onClick={() => setRecoveryCode(null)}>I&apos;ve saved it</Button>
      </div>,
    );
  }

  if (!club.signedIn) {
    return shell(
      <div className="mx-auto max-w-md">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Globe className="h-5 w-5" /> Reading Club</h1>
        <p className="mt-1 text-sm text-muted-foreground">Join your club with an invite code to publish and discover docs. Your private notes stay on this device.</p>
        {error && <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-4">
          {mode === 'join' ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="invite">Invite code</Label>
                <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="6-character invite code" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How others see you" />
              </div>
              <Button onClick={submitAuth} disabled={submitting || !inviteCode.trim() || !displayName.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join club'}
              </Button>
              <button className="text-xs text-muted-foreground underline" onClick={() => { setMode('recover'); setError(''); }}>
                Cleared your browser? Recover with a recovery code
              </button>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="recovery">Recovery code</Label>
                <Input id="recovery" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} placeholder="locator.secret" />
              </div>
              <Button onClick={submitAuth} disabled={submitting || !recoveryInput.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recover account'}
              </Button>
              <button className="text-xs text-muted-foreground underline" onClick={() => { setMode('join'); setError(''); }}>Back to join</button>
            </>
          )}
        </div>
      </div>,
    );
  }

  const mine = links.filter((l) => l.mine);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'mine', label: 'My published' },
    ...(club.session?.role === 'owner' ? [{ id: 'members' as Tab, label: 'Members' }] : []),
  ];

  return shell(
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Globe className="h-5 w-5" /> Reading Club</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{club.session?.displayName}{club.session?.role === 'owner' ? ' · owner' : ''}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" onClick={openPublishPicker}>
            <BookUp className="h-4 w-4" /> <span className="hidden sm:inline">Publish a document</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="mt-4">
        {tab === 'discover' && (
          docs.length === 0 && !loading
            ? <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            : <ul className="flex flex-col gap-2">
                {docs.map((d) => {
                  const link = linkByLogical.get(d.logicalId);
                  const stale = link && link.contentHash !== d.contentHash;
                  const isBusy = busy === d.logicalId;
                  const isAuthor = d.publisherId === club.session?.userId;
                  return (
                    <li key={d.logicalId}>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => open(d)}
                        className="flex w-full items-start justify-between gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{d.title}</span>
                          <span className="block text-xs text-muted-foreground">{d.fileType.toUpperCase()} · by {isAuthor ? 'you' : d.publisherName}</span>
                          {d.tags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          {stale && <Badge variant="default" className="text-[10px]">Update</Badge>}
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
        )}

        {tab === 'mine' && (
          mine.length === 0
            ? <p className="text-sm text-muted-foreground">You haven&apos;t published anything yet. Open a doc in your library and use &ldquo;Publish to club.&rdquo;</p>
            : <ul className="flex flex-col gap-2">
                {mine.map((l) => {
                  const d = docs.find((x) => x.logicalId === l.logicalId);
                  const isBusy = busy === l.logicalId;
                  const openable = !!l.localDocumentId;
                  const openDoc = () => { if (openable) router.push(`/library?doc=${l.localDocumentId}&from=club`); };
                  return (
                    <li key={l.logicalId}>
                      <div
                        role={openable ? 'button' : undefined}
                        tabIndex={openable ? 0 : undefined}
                        onClick={openable ? openDoc : undefined}
                        onKeyDown={openable ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(); } }) : undefined}
                        className={`flex items-center justify-between gap-3 rounded-md border border-border p-3 ${openable ? 'cursor-pointer transition-colors hover:bg-muted' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{d?.title ?? 'Published doc'}</div>
                          <div className="text-xs text-muted-foreground">{d ? `${d.fileType.toUpperCase()} · published` : 'Unpublished — not visible to the club'}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {d ? (
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={isBusy}
                              onClick={(e) => { e.stopPropagation(); run(l.logicalId, () => unpublishDoc({ session: club.session!, logicalId: l.logicalId })); }}>
                              <Trash2 className="h-4 w-4" /> Unpublish
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={isBusy}
                              onClick={(e) => { e.stopPropagation(); republish(l); }}>
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><BookUp className="h-4 w-4" /> Re-publish</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
        )}

        {tab === 'members' && club.session?.role === 'owner' && (
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
      </div>

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
                // Lock only docs opened from a club publication that's still
                // live: you can't republish someone else's doc (no forking).
                // A link to a publication that no longer exists isn't a fork —
                // allow publishing so wiped/unpublished docs don't get stuck.
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
    </>,
  );
}
