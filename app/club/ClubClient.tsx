'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, BookUp, Check, Copy, Download, Globe, Loader2, LogOut, RefreshCw, Trash2, UserPlus,
} from 'lucide-react';
import type { PublishedDocDTO } from '@/shared/club-types';
import type { Document } from '@/lib/types';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { openClubDoc, unpublishDoc, type ClubLink } from '@/lib/club/actions';
import { listClubDocs, listDocuments } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type Tab = 'discover' | 'mine' | 'members';

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

  // invites (owner)
  const [inviteLabel, setInviteLabel] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintedInvite, setMintedInvite] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Publish-a-document picker
  const [publishOpen, setPublishOpen] = useState(false);
  const [localDocs, setLocalDocs] = useState<Document[]>([]);

  const linkByLogical = new Map(links.map((l) => [l.logicalId, l] as const));
  const mineLocalIds = new Set(links.filter((l) => l.mine && l.localDocumentId).map((l) => l.localDocumentId as string));
  const foreignLocalIds = new Set(links.filter((l) => !l.mine && l.localDocumentId).map((l) => l.localDocumentId as string));

  const openPublishPicker = async () => {
    try { setLocalDocs(await listDocuments()); } catch { /* ignore */ }
    setPublishOpen(true);
  };

  const refresh = useCallback(async () => {
    const token = club.session?.token;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [discovered, localLinks] = await Promise.all([clubApi.discover(token), listClubDocs()]);
      setDocs(discovered);
      setLinks(localLinks.map((r) => ({
        logicalId: r.logicalId,
        contentHash: r.cachedContentHash,
        localDocumentId: r.localDocumentId,
        mine: r.mine === true,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the club library.');
    }
    setLoading(false);
  }, [club.session?.token]);

  useEffect(() => {
    if (club.signedIn) refresh();
  }, [club.signedIn, refresh]);

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
    setRecoveryCode(null); setMintedInvite(null); setInviteLabel('');
    setDocs([]); setLinks([]); setError('');
  };

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setError('');
    try { await fn(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    setBusy(null);
  };

  const open = (dto: PublishedDocDTO) => run(dto.logicalId, async () => {
    const localId = await openClubDoc({ session: club.session!, dto });
    router.push(`/library?doc=${localId}`);
  });

  const mintInvite = async () => {
    const token = club.session?.token;
    if (!token) return;
    setMinting(true); setError('');
    try {
      const res = await clubApi.createInvite(token, inviteLabel.trim() || undefined);
      setMintedInvite(res.code); setInviteLabel('');
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
                  const label = !link ? 'Open' : stale ? 'Update' : 'Opened';
                  return (
                    <li key={d.logicalId} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.title}</div>
                        <div className="text-xs text-muted-foreground">{d.fileType.toUpperCase()} · by {d.publisherName}</div>
                        {d.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>}
                      </div>
                      <Button size="sm" variant={stale ? 'default' : link ? 'ghost' : 'outline'} disabled={busy === d.logicalId} onClick={() => open(d)}>
                        {busy === d.logicalId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4" /> {label}</>}
                      </Button>
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
                  return (
                    <li key={l.logicalId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d?.title ?? 'Published doc'}</div>
                        <div className="text-xs text-muted-foreground">{d ? `${d.fileType.toUpperCase()} · published` : 'unpublished'}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {l.localDocumentId && (
                          <Button size="sm" variant="outline" onClick={() => router.push(`/library?doc=${l.localDocumentId}`)}>
                            <BookOpen className="h-4 w-4" /> Open
                          </Button>
                        )}
                        {d && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={busy === l.logicalId}
                            onClick={() => run(l.logicalId, () => unpublishDoc({ session: club.session!, logicalId: l.logicalId }))}>
                            <Trash2 className="h-4 w-4" /> Unpublish
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
        )}

        {tab === 'members' && club.session?.role === 'owner' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Mint a single-use invite per member. Codes expire in 72h.</p>
            <div className="flex items-center gap-2">
              <Input value={inviteLabel} onChange={(e) => setInviteLabel(e.target.value)} placeholder="Label (optional, e.g. Alice)" />
              <Button size="sm" onClick={mintInvite} disabled={minting}>
                {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Create invite</>}
              </Button>
            </div>
            {mintedInvite && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Single-use — share with one new member.</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono">{mintedInvite}</code>
                  <Button size="sm" variant="outline"
                    onClick={() => { navigator.clipboard?.writeText(mintedInvite); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1500); }}>
                    {inviteCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish a document</DialogTitle>
            <DialogDescription>
              Pick a document from your library — it opens in the reader, where you publish or update it.
            </DialogDescription>
          </DialogHeader>
          {localDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your library is empty — add a document first.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
              {localDocs.map((d) => {
                const foreign = foreignLocalIds.has(d.id);
                const published = mineLocalIds.has(d.id);
                return (
                  <li key={d.id}>
                    <button
                      disabled={foreign}
                      onClick={() => { setPublishOpen(false); router.push(`/library?doc=${d.id}`); }}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-2.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {d.fileType.toUpperCase()}{published ? ' · in club' : foreign ? ' · opened from club' : ''}
                        </span>
                      </span>
                      <BookUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
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
