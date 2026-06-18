// A club snapshot's HTML is authored by ANOTHER member, so it must be
// sanitized before it ever touches the DOM (see memory: club-html-sanitization
// — guards against stored XSS). Local docs are self-authored and skip this.
//
// DOMPurify is dynamic-imported (like mammoth / pdf.js elsewhere in this repo)
// because it touches `window` and would break SSR if imported at module load.
// Defaults strip <script>, event handlers, and javascript: URIs while keeping
// formatting, links, base64 images, and data-* attributes (data-tts-index).

export async function sanitizeClubHtml(html: string): Promise<string> {
  const DOMPurify = (await import('dompurify')).default;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-tts-index'] });
}
