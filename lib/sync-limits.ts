// Max file-blob size that personal sync can upload. The upload goes through a
// Vercel serverless function whose request body is capped at ~4.5 MB, so a larger
// blob is rejected (413) and can't sync — it stays on the device. Kept
// dependency-free (no sync/network imports) so the library UI can import the
// threshold without pulling club code into the flag-off bundle.
export const MAX_SYNC_BLOB_BYTES = 4 * 1024 * 1024;
