// Thin client for the club backend. Every request goes to the same-origin
// /api/club proxy (Vercel HTTPS), which forwards to the Oracle backend. This is
// the ONLY club network surface on the client.

import type {
  CreateInviteResponse,
  JoinResponse,
  PublishRequest,
  PublishedDocDTO,
  RecoverResponse,
} from '@/shared/club-types';

const BASE = '/api/club';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export const clubApi = {
  join: (inviteCode: string, displayName: string) =>
    fetch(`${BASE}/auth/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode, displayName }),
    }).then((r) => jsonOrThrow<JoinResponse>(r)),

  recover: (recoveryCode: string) =>
    fetch(`${BASE}/auth/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryCode }),
    }).then((r) => jsonOrThrow<RecoverResponse>(r)),

  createInvite: (token: string, label?: string) =>
    fetch(`${BASE}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({ label }),
    }).then((r) => jsonOrThrow<CreateInviteResponse>(r)),

  discover: (token: string) =>
    fetch(`${BASE}/docs`, { headers: auth(token) }).then((r) => jsonOrThrow<PublishedDocDTO[]>(r)),

  publish: (token: string, body: PublishRequest) =>
    fetch(`${BASE}/docs/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify(body),
    }).then((r) => jsonOrThrow<{ ok: boolean; logicalId: string; contentHash: string }>(r)),

  unpublish: (token: string, logicalId: string) =>
    fetch(`${BASE}/docs/unpublish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({ logicalId }),
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),

  blobExists: (token: string, hash: string) =>
    fetch(`${BASE}/blobs/${hash}`, { method: 'HEAD', headers: auth(token) }).then((r) => r.ok),

  putBlob: (token: string, hash: string, body: Blob) =>
    fetch(`${BASE}/blobs/${hash}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', ...auth(token) },
      body,
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),

  getBlobBytes: (token: string, hash: string) =>
    fetch(`${BASE}/blobs/${hash}`, { headers: auth(token) }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }),

  getBlobText: (token: string, hash: string) =>
    fetch(`${BASE}/blobs/${hash}`, { headers: auth(token) }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }),
};
