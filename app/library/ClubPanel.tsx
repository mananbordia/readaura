'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookUp, Check, Copy, Download, Globe, Loader2, LogOut, RefreshCw, Trash2, UserPlus,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import { CLUB_SNAPSHOT_FORMAT_VERSION, type PublishedDocDTO } from '@/shared/club-types';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { sha256Hex } from '@/lib/club/hash';
import { sanitizeClubHtml } from '@/lib/club/sanitize';
import { convertDocxBlobToHtml } from '@/lib/docx-html';
import {
  createDocument, getDocument, getFile, getHtmlOverride, listDocuments,
  getClubDocByLocalId, getClubDocByLogicalId, putClubDoc, replaceFile, setHtmlOverride,
} from '@/lib/storage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export type ClubLink = { logicalId: string; contentHash: string; localDocumentId: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: Document[];
  links: ClubLink[];
  // Generic render helpers from LibraryClient (kept here so LibraryClient has no
  // static club imports — that keeps the flag-off bundle club-free).
  renderDocxHtml: (rawHtml: string) => string;
  txtToHtml: (text: string) => string;
  // Reload the library list + the link cache after a publish/open/unpublish.
  onChanged: () => Promise<void> | void;
};

export default function ClubPanel({
  open, onOpenChange, documents, links, renderDocxHtml, txtToHtml, onChanged,
}: Props) {
  const club = useClub();
  const [docs, setDocs] = useState<PublishedDocDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [mode, setMode] = useState<'join' | 'recover'>('join');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Owner-only: mint single-use member invites.
  const [inviteLabel, setInviteLabel] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintedInvite, setMintedInvite] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const linkByLogical = new Map(links.map((l) => [l.logicalId, l] as const));
  const linkByLocal = new Map(
    links.filter((l) => l.localDocumentId).map((l) => [l.localDocumentId as string, l] as const),
  );

  const refreshDiscover = useCallback(async () => {
    const token = club.session?.token;
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setDocs(await clubApi.discover(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load club library.');
    }
    setLoading(false);
  }, [club.session?.token]);

  useEffect(() => {
    if (open && club.signedIn) refreshDiscover();
  }, [open, club.signedIn, refreshDiscover]);

  const submitAuth = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res =
        mode === 'join'
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

  // ---- Publish a local doc as a content-hash snapshot ----------------------
  const publish = async (doc: Document) => {
    const session = club.session;
    if (!session) throw new Error('Join the club first.');
    const blob = await getFile(doc.id);
    if (!blob) throw new Error('File data missing in browser storage.');
    const existing = await getClubDocByLocalId(doc.id);
    const logicalId = existing?.logicalId ?? crypto.randomUUID();
    let contentHash: string;

    if (doc.fileType === 'pdf') {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      contentHash = await sha256Hex(bytes);
      if (!(await clubApi.blobExists(session.token, contentHash))) {
        await clubApi.putBlob(session.token, contentHash, blob);
      }
      await clubApi.publish(session.token, {
        contentHash, logicalId, title: doc.title, tags: doc.tags,
        fileType: 'pdf', snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION,
      });
    } else {
      const override = await getHtmlOverride(doc.id);
      const rawHtml = override ?? (doc.fileType === 'docx'
        ? await convertDocxBlobToHtml(blob)
        : txtToHtml(await blob.text()));
      const html = renderDocxHtml(rawHtml);
      contentHash = await sha256Hex(html);
      await clubApi.publish(session.token, {
        contentHash, logicalId, title: doc.title, tags: doc.tags,
        fileType: doc.fileType, snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION,
        snapshotHtml: html,
      });
    }

    await putClubDoc({
      id: existing?.id ?? crypto.randomUUID(),
      logicalId, contentHash, cachedContentHash: contentHash, clubId: '',
      title: doc.title, tags: doc.tags, fileType: doc.fileType,
      publishedByName: session.displayName, publishedAt: new Date().toISOString(),
      snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION, localDocumentId: doc.id,
    });
    await onChanged();
  };

  // ---- Open a club doc into the local library (sanitize HTML first) --------
  const openClubDoc = async (dto: PublishedDocDTO) => {
    const session = club.session;
    if (!session) throw new Error('Join the club first.');
    const existingLink = await getClubDocByLogicalId(dto.logicalId);
    let existingLocalId: string | null = null;
    if (existingLink?.localDocumentId && (await getDocument(existingLink.localDocumentId))) {
      existingLocalId = existingLink.localDocumentId;
    }
    let localId: string;

    if (dto.fileType === 'pdf') {
      const bytes = await clubApi.getBlobBytes(session.token, dto.contentHash);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (existingLocalId) { await replaceFile(existingLocalId, blob); localId = existingLocalId; }
      else { localId = (await createDocument({ blob, title: dto.title, tags: dto.tags, fileType: 'pdf' })).id; }
    } else {
      const raw = await clubApi.getBlobText(session.token, dto.contentHash);
      const safe = await sanitizeClubHtml(raw); // untrusted cross-user HTML
      const htmlBlob = new Blob([safe], { type: 'text/html' });
      if (existingLocalId) {
        await replaceFile(existingLocalId, htmlBlob);
        await setHtmlOverride(existingLocalId, safe);
        localId = existingLocalId;
      } else {
        localId = (await createDocument({ blob: htmlBlob, title: dto.title, tags: dto.tags, fileType: dto.fileType })).id;
        await setHtmlOverride(localId, safe);
      }
    }

    await putClubDoc({
      id: existingLink?.id ?? crypto.randomUUID(),
      logicalId: dto.logicalId, contentHash: dto.contentHash, cachedContentHash: dto.contentHash,
      clubId: '', title: dto.title, tags: dto.tags, fileType: dto.fileType,
      publishedByName: dto.publisherName, publishedAt: dto.publishedAt,
      snapshotFormatVersion: dto.snapshotFormatVersion, localDocumentId: localId,
    });
    await onChanged();
  };

  const unpublish = async (logicalId: string) => {
    const session = club.session;
    if (!session) throw new Error('Join the club first.');
    await clubApi.unpublish(session.token, logicalId);
    await onChanged();
  };

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError('');
    try {
      await fn();
      await refreshDiscover();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
    setBusy(null);
  };

  // Sign out must also clear all transient panel state — otherwise a stale
  // recovery code, the discovered list, and the recover/join mode linger and
  // bleed into the next session's auth view.
  const mintInvite = async () => {
    const token = club.session?.token;
    if (!token) return;
    setMinting(true);
    setError('');
    try {
      const res = await clubApi.createInvite(token, inviteLabel.trim() || undefined);
      setMintedInvite(res.code);
      setInviteLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create invite.');
    }
    setMinting(false);
  };

  const handleSignOut = () => {
    club.signOut();
    setRecoveryCode(null);
    setMode('join');
    setInviteCode('');
    setDisplayName('');
    setRecoveryInput('');
    setDocs([]);
    setError('');
    setMintedInvite(null);
    setInviteLabel('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-club-panel className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> Reading Club
          </SheetTitle>
          <SheetDescription>
            {club.signedIn
              ? `Signed in as ${club.session?.displayName}. Published docs are shared with your club; your private notes stay on this device.`
              : 'Join your club with an invite code to publish and discover docs.'}
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {recoveryCode ? (
          /* Blocking gate: the recovery code is shown ONCE, so the user must
             acknowledge it before reaching the signed-in view — and therefore
             before they can sign out (sign-out lives only in that view). */
          <div className="m-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <div className="font-medium">Save your recovery code</div>
            <p className="mt-1 text-muted-foreground">
              Shown once. It&apos;s the only way to reclaim your account and published docs if you clear your browser or sign out.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{recoveryCode}</code>
              <Button
                size="sm" variant="outline"
                onClick={() => { navigator.clipboard?.writeText(recoveryCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" className="mt-3 w-full" onClick={() => setRecoveryCode(null)}>I&apos;ve saved it</Button>
          </div>
        ) : !club.signedIn ? (
          <div className="flex flex-col gap-3 p-4">
            {mode === 'join' ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="club-invite">Invite code</Label>
                  <Input id="club-invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="6-character invite code" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="club-name">Display name</Label>
                  <Input id="club-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How others see you" />
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
                  <Label htmlFor="club-recovery">Recovery code</Label>
                  <Input id="club-recovery" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} placeholder="locator.secret" />
                </div>
                <Button onClick={submitAuth} disabled={submitting || !recoveryInput.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Recover account'}
                </Button>
                <button className="text-xs text-muted-foreground underline" onClick={() => { setMode('join'); setError(''); }}>
                  Back to join
                </button>
              </>
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-5 p-4">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Club library</h3>
                  <Button size="sm" variant="ghost" onClick={refreshDiscover} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
                {docs.length === 0 && !loading ? (
                  <p className="text-sm text-muted-foreground">Nothing published yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {docs.map((d) => {
                      const link = linkByLogical.get(d.logicalId);
                      const opened = !!link;
                      const stale = link && link.contentHash !== d.contentHash;
                      const label = !opened ? 'Open' : stale ? 'Update' : 'Opened';
                      return (
                        <li key={d.logicalId} className="rounded-md border border-border p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{d.title}</div>
                              <div className="text-xs text-muted-foreground">{d.fileType.toUpperCase()} · by {d.publisherName}</div>
                              {d.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {d.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm" variant={stale ? 'default' : opened ? 'ghost' : 'outline'}
                              disabled={busy === d.logicalId}
                              onClick={() => run(d.logicalId, () => openClubDoc(d))}
                            >
                              {busy === d.logicalId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4" /> {label}</>}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {club.session?.role === 'owner' && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Invite a member</h3>
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteLabel}
                      onChange={(e) => setInviteLabel(e.target.value)}
                      placeholder="Label (optional, e.g. Alice)"
                    />
                    <Button size="sm" onClick={mintInvite} disabled={minting}>
                      {minting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Create</>}
                    </Button>
                  </div>
                  {mintedInvite && (
                    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5 text-sm">
                      <p className="text-xs text-muted-foreground">Single-use — share with one new member; it works once.</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs">{mintedInvite}</code>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => { navigator.clipboard?.writeText(mintedInvite); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1500); }}
                        >
                          {inviteCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Publish from your library</h3>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a document to your library to publish it.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {documents.map((doc) => {
                      const link = linkByLocal.get(doc.id);
                      return (
                        <li key={doc.id} className="rounded-md border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{doc.title}</div>
                              <div className="text-xs text-muted-foreground">{doc.fileType.toUpperCase()}{link ? ' · in club' : ''}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                size="sm" variant={link ? 'ghost' : 'outline'}
                                disabled={busy === doc.id}
                                onClick={() => run(doc.id, () => publish(doc))}
                              >
                                {busy === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><BookUp className="h-4 w-4" /> {link ? 'Update' : 'Publish'}</>}
                              </Button>
                              {link && (
                                <Button
                                  size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
                                  disabled={busy === doc.id}
                                  onClick={() => run(doc.id, () => unpublish(link.logicalId))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
