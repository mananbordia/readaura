import type { NextRequest } from 'next/server';

// The ONLY network surface for club + personal-sync traffic.
//
// The browser calls this route same-origin over Vercel's HTTPS; it forwards to
// the Oracle backend (CLUB_BACKEND_URL) over plain HTTP, server-to-server, so
// there is no browser CORS or mixed-content concern and the box needs no TLS
// cert. A shared secret (CLUB_PROXY_SECRET) authorises this proxy to the
// otherwise-open backend port.
//
// With CLUB_ENABLED unset every method 404s before touching the backend, so the
// default / Vercel-demo deployment behaves byte-for-byte as today.
//
// NOTE: requests stream through Vercel's serverless body limit (~4.5 MB), so
// large PDF publishes are capped client-side for v1 (see the publish flow).
// NOTE: the Vercel->Oracle hop is unencrypted today; switch CLUB_BACKEND_URL to
// https:// once the box has a cert to protect tokens + personal-sync payloads.

export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
]);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const enabled = process.env.CLUB_ENABLED === 'true';
  const backend = process.env.CLUB_BACKEND_URL;
  if (!enabled || !backend) {
    return new Response(null, { status: 404 });
  }

  const { path } = await ctx.params;
  const target = `${backend.replace(/\/+$/, '')}/${(path ?? []).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const [k, v] of req.headers) {
    const key = k.toLowerCase();
    if (key === 'host' || HOP_BY_HOP.has(key)) continue;
    headers.set(k, v);
  }
  const secret = process.env.CLUB_PROXY_SECRET;
  if (secret) headers.set('x-club-proxy-secret', secret);

  // Forward the real (Vercel-set) client IP so the backend can rate-limit per
  // principal. Set AFTER the copy loop and delete any inbound value first, so a
  // client can't spoof it.
  headers.delete('x-club-client-ip');
  const clientIp =
    req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  if (clientIp) headers.set('x-club-client-ip', clientIp);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = 'half'; // stream the body rather than buffering it
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init as RequestInit);
  } catch {
    return Response.json({ error: 'club backend unreachable' }, { status: 502 });
  }

  // fetch has already decoded the body; drop framing headers that would now lie.
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');
  resHeaders.delete('transfer-encoding');
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
