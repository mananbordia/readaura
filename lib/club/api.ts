// Thin client for the club backend. Every request goes to the same-origin
// /api/club proxy (Vercel HTTPS), which forwards to the Oracle backend. This is
// the ONLY club network surface on the client.

import type {
  CreateInviteResponse,
  InviteDTO,
  JoinResponse,
  MemberDTO,
  PublishRequest,
  PublishedDocDTO,
  RecoverResponse,
  ShareAnnotationRequest,
  SharedAnnotationDTO,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@/shared/club-types';
import { writeClubSession } from '@/lib/use-club';

const BASE = '/api/club';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // A 401 means the token was rejected (expired, or the account was removed
    // server-side). Drop the stale session so the UI re-prompts to join/recover
    // instead of looping on a broken credential.
    if (res.status === 401) writeClubSession(null);
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

  createInvite: (token: string) =>
    fetch(`${BASE}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({}),
    }).then((r) => jsonOrThrow<CreateInviteResponse>(r)),

  listInvites: (token: string) =>
    fetch(`${BASE}/invites`, { headers: auth(token) }).then((r) => jsonOrThrow<InviteDTO[]>(r)),

  listMembers: (token: string) =>
    fetch(`${BASE}/members`, { headers: auth(token) }).then((r) => jsonOrThrow<MemberDTO[]>(r)),

  discover: (token: string) =>
    fetch(`${BASE}/docs`, { headers: auth(token) }).then((r) => jsonOrThrow<PublishedDocDTO[]>(r)),

  // Is this logicalId still a live publication? (404 once unpublished/wiped.)
  // Used to decide whether an opened-from-club local copy is still a fork
  // target, or just an orphaned local doc the user may now publish themselves.
  exists: (token: string, logicalId: string) =>
    fetch(`${BASE}/docs/${encodeURIComponent(logicalId)}`, { headers: auth(token) }).then((r) => r.ok),

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

  // ---- Shared annotations (Phase 3) ----
  shareAnnotation: (token: string, body: ShareAnnotationRequest) =>
    fetch(`${BASE}/annotations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify(body),
    }).then((r) => jsonOrThrow<SharedAnnotationDTO>(r)),

  listAnnotations: (token: string, logicalId: string) =>
    fetch(`${BASE}/annotations?logicalId=${encodeURIComponent(logicalId)}`, { headers: auth(token) })
      .then((r) => jsonOrThrow<SharedAnnotationDTO[]>(r)),

  deleteAnnotation: (token: string, clientId: string) =>
    fetch(`${BASE}/annotations/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify({ clientId }),
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),

  // ---- Personal sync (account-level library mirror) ----
  pullSync: (token: string, since: string | null) =>
    fetch(`${BASE}/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`, { headers: auth(token) })
      .then((r) => jsonOrThrow<SyncPullResponse>(r)),

  pushSync: (token: string, body: SyncPushRequest) =>
    fetch(`${BASE}/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(token) },
      body: JSON.stringify(body),
    }).then((r) => jsonOrThrow<SyncPushResponse>(r)),

  syncBlobExists: (token: string, hash: string) =>
    fetch(`${BASE}/sync/blobs/${hash}`, { method: 'HEAD', headers: auth(token) }).then((r) => r.ok),

  putSyncBlob: (token: string, hash: string, body: Blob) =>
    fetch(`${BASE}/sync/blobs/${hash}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', ...auth(token) },
      body,
    }).then((r) => jsonOrThrow<{ ok: boolean }>(r)),

  getSyncBlobBytes: (token: string, hash: string) =>
    fetch(`${BASE}/sync/blobs/${hash}`, { headers: auth(token) }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }),
};
