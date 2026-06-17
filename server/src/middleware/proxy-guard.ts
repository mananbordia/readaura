import { createMiddleware } from 'hono/factory';
import { env } from '../env';

// The backend port is open on the box, but only the Vercel proxy knows
// CLUB_PROXY_SECRET. Reject anything without the matching header so a direct
// hit on http://box:PORT/... can't reach the club routes.
export const proxyGuard = createMiddleware(async (c, next) => {
  if (c.req.header('x-club-proxy-secret') !== env.CLUB_PROXY_SECRET) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
});
