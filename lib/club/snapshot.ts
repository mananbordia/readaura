// Builds the canonical published HTML for a local doc, independent of whether
// the doc is currently open in the viewer. Used by both the in-reader publish
// button and the /club publish list so the same doc hashes identically either
// way (the content hash is the dedupe + update key).
//
// The opener re-tags TTS spans on view, so we deliberately publish the *raw*
// rendered HTML (saved edits if any, else freshly converted source) without
// data-tts-index attributes — they'd only add hash noise.

import type { Document } from '@/lib/types';
import { getFile, getHtmlOverride } from '@/lib/storage';
import { convertDocxBlobToHtml } from '@/lib/docx-html';
import { textToHtml } from '@/lib/reader-html';
import { sha256Hex } from './hash';

export async function buildDocSnapshotHtml(doc: Document): Promise<string | undefined> {
  if (doc.fileType === 'pdf') return undefined; // pdf publishes its bytes directly
  const override = await getHtmlOverride(doc.id);
  if (override) return override; // user's saved edits win
  const blob = await getFile(doc.id);
  if (!blob) throw new Error('File data missing in browser storage.');
  if (doc.fileType === 'docx') return convertDocxBlobToHtml(blob);
  return textToHtml(await blob.text());
}

// The content hash of the doc as it stands locally — identical to what
// publishLocalDoc would send. Compared against a club link's cachedContentHash
// to tell whether local edits diverge from the published version.
export async function computeLocalContentHash(doc: Document): Promise<string> {
  if (doc.fileType === 'pdf') {
    const blob = await getFile(doc.id);
    if (!blob) throw new Error('File data missing in browser storage.');
    return sha256Hex(new Uint8Array(await blob.arrayBuffer()));
  }
  return sha256Hex((await buildDocSnapshotHtml(doc)) ?? '');
}
