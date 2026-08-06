import { createMiddleware } from 'hono/factory';
import { getConnInfo } from '@hono/node-server/conninfo';
import { env } from '../env';

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// During migration, accept either the legacy Vercel proxy credential or a
// connection from local Nginx. The browser never receives CLUB_PROXY_SECRET:
// it reaches this service through Nginx on :443, whose upstream connection is
// loopback. Direct public hits on :8080 still require the shared secret.
export const proxyGuard = createMiddleware(async (c, next) => {
  const fromLegacyProxy = c.req.header('x-club-proxy-secret') === env.CLUB_PROXY_SECRET;
  const fromLocalGateway = isLoopback(getConnInfo(c).remote.address);
  if (!fromLegacyProxy && !fromLocalGateway) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
});
