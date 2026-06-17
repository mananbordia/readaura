import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../env';

// Content-addressed blob store on local disk. Files are named by their SHA-256
// (DOCX/TXT rendered-HTML snapshots and PDF bytes alike), so they are immutable
// and de-duped for free.

const HASH_RE = /^[a-f0-9]{64}$/;

function pathFor(hash: string): string {
  if (!HASH_RE.test(hash)) throw new Error('invalid content hash');
  return join(env.CLUB_BLOB_DIR, hash);
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function blobExists(hash: string): Promise<boolean> {
  try {
    await access(pathFor(hash));
    return true;
  } catch {
    return false;
  }
}

export async function putBlob(hash: string, data: Uint8Array): Promise<void> {
  await mkdir(env.CLUB_BLOB_DIR, { recursive: true });
  await writeFile(pathFor(hash), data);
}

export async function getBlob(hash: string): Promise<Buffer | null> {
  try {
    return await readFile(pathFor(hash));
  } catch {
    return null;
  }
}
