// Club write/read actions shared by the /club page and the in-viewer publish
// button. Imports the club API + storage, so it only ever lands in a club chunk
// (the /club route or the dynamic publish button) — never the main bundle.

import type { Document } from '@/lib/types';
import { CLUB_SNAPSHOT_FORMAT_VERSION, type PublishedDocDTO } from '@/shared/club-types';
import type { ClubSession } from '@/lib/use-club';
import { clubApi } from './api';
import { sha256Hex } from './hash';
import { sanitizeClubHtml } from './sanitize';
import {
  createDocument, getClubDocByLocalId, getClubDocByLogicalId, getDocument, getFile,
  putClubDoc, replaceFile, setHtmlOverride,
} from '@/lib/storage';

export type ClubLink = {
  logicalId: string;
  contentHash: string;
  localDocumentId: string | null;
  mine: boolean;
};

// crypto.randomUUID needs a secure context; fall back so a non-secure context
// surfaces the (clearer) hashing error rather than crashing here first.
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Publish (or update) a local doc as a content-hash snapshot. For docx/txt pass
// the rendered (data-tts-index-tagged) HTML the viewer already holds; for pdf
// the bytes are read from storage. Reuses my logicalId to UPDATE my own doc;
// publishing a doc opened from the club is rejected (no forking).
export async function publishLocalDoc(opts: {
  session: ClubSession;
  doc: Document;
  snapshotHtml?: string;
}): Promise<void> {
  const { session, doc, snapshotHtml } = opts;
  const existing = await getClubDocByLocalId(doc.id);
  // No forking: a doc opened from the club stays a read-only local copy — but
  // only while that publication is still live. Once it's unpublished/wiped
  // server-side it's just an orphaned local doc, so the user may publish it as
  // their own (we mint a fresh logicalId so it doesn't inherit the old one).
  let reuseLogicalId = false;
  if (existing) {
    if (existing.mine) {
      reuseLogicalId = true;
    } else if (await clubApi.exists(session.token, existing.logicalId)) {
      throw new Error('This document was opened from the club — it stays a local copy.');
    }
  }
  const logicalId = reuseLogicalId && existing ? existing.logicalId : newId();

  let contentHash: string;
  if (doc.fileType === 'pdf') {
    const blob = await getFile(doc.id);
    if (!blob) throw new Error('File data missing in browser storage.');
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
    if (typeof snapshotHtml !== 'string') throw new Error('Open the document to publish it.');
    contentHash = await sha256Hex(snapshotHtml);
    await clubApi.publish(session.token, {
      contentHash, logicalId, title: doc.title, tags: doc.tags,
      fileType: doc.fileType, snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION, snapshotHtml,
    });
  }

  // One link per local doc: replace the opened-from link with my publication.
  await putClubDoc({
    id: existing?.id ?? newId(),
    logicalId, contentHash, cachedContentHash: contentHash, clubId: '',
    title: doc.title, tags: doc.tags, fileType: doc.fileType,
    publishedByName: session.displayName, publishedAt: new Date().toISOString(),
    snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION, localDocumentId: doc.id, mine: true,
  });
}

// Pull a club doc into the local library (sanitizing untrusted HTML) so it reads
// offline like any local doc. Syncs in place if already opened. Returns the
// local document id (for deep-linking into the viewer).
export async function openClubDoc(opts: { session: ClubSession; dto: PublishedDocDTO }): Promise<string> {
  const { session, dto } = opts;
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

  // If the current user is the doc's publisher (e.g. they cleared their browser
  // and pulled their own doc back after recovering), keep the link as theirs so
  // they can still update it — otherwise it's a read-only copy of another
  // member's doc (no forking). Preserve an existing `mine` if already set.
  const mine = dto.publisherId === session.userId || existingLink?.mine === true;

  await putClubDoc({
    id: existingLink?.id ?? newId(),
    logicalId: dto.logicalId, contentHash: dto.contentHash, cachedContentHash: dto.contentHash,
    clubId: '', title: dto.title, tags: dto.tags, fileType: dto.fileType,
    publishedByName: dto.publisherName, publishedAt: dto.publishedAt,
    snapshotFormatVersion: dto.snapshotFormatVersion, localDocumentId: localId, mine,
  });
  return localId;
}

export async function unpublishDoc(opts: { session: ClubSession; logicalId: string }): Promise<void> {
  await clubApi.unpublish(opts.session.token, opts.logicalId);
}
