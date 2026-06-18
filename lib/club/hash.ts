// SHA-256 of the canonical snapshot bytes, computed in the browser and
// re-verified server-side. For DOCX/TXT this is the UTF-8 of the rendered
// (data-tts-index-tagged) HTML; for PDFs the raw blob bytes. The hash is the
// dedupe + identity key for a published doc.

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  // crypto.subtle only exists in a secure context (https or http://localhost).
  // Fail with an actionable message instead of a cryptic "cannot read subtle".
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Publishing needs a secure context — open the app at http://localhost:3000 (a LAN IP or plain http won’t work).',
    );
  }
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
