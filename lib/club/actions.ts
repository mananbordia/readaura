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

// Publish a local doc as a content-hash snapshot. For docx/txt pass the rendered
// (data-tts-index-tagged) HTML the viewer already holds; for pdf the bytes are
// read from storage. Reuses my logicalId to UPDATE; if the doc was OPENED from
// someone else it forks to a new logicalId (the backend also rejects non-author
// updates as a safety net).
export async function publishLocalDoc(opts: {
  session: ClubSession;
  doc: Document;
  snapshotHtml?: string;
}): Promise<void> {
  const { session, doc, snapshotHtml } = opts;
  const existing = await getClubDocByLocalId(doc.id);
  const updating = existing?.mine === true;
  const logicalId = updating ? existing.logicalId : crypto.randomUUID();

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
    id: existing?.id ?? crypto.randomUUID(),
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

  await putClubDoc({
    id: existingLink?.id ?? crypto.randomUUID(),
    logicalId: dto.logicalId, contentHash: dto.contentHash, cachedContentHash: dto.contentHash,
    clubId: '', title: dto.title, tags: dto.tags, fileType: dto.fileType,
    publishedByName: dto.publisherName, publishedAt: dto.publishedAt,
    snapshotFormatVersion: dto.snapshotFormatVersion, localDocumentId: localId, mine: false,
  });
  return localId;
}

export async function unpublishDoc(opts: { session: ClubSession; logicalId: string }): Promise<void> {
  await clubApi.unpublish(opts.session.token, opts.logicalId);
}
