// SHA-256 of the canonical snapshot bytes, computed in the browser and
// re-verified server-side. For DOCX/TXT this is the UTF-8 of the rendered
// (data-tts-index-tagged) HTML; for PDFs the raw blob bytes. The hash is the
// dedupe + identity key for a published doc.

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
