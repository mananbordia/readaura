// Max file-blob size that personal sync can upload through the direct Oracle
// HTTPS gateway. Keep one MiB below the backend/Nginx 25 MiB hard cap. Kept
// dependency-free (no sync/network imports) so the library UI can import the
// threshold without pulling club code into the flag-off bundle.
export const MAX_SYNC_BLOB_BYTES = 24 * 1024 * 1024;
