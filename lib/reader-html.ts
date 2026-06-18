// Pure, SSR-safe helpers for turning plain text into reader HTML. Shared by the
// viewer (LibraryClient) and the club snapshot builder so a published TXT
// hashes identically no matter where publishing is triggered from.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}
