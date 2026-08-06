import { getConnInfo } from '@hono/node-server/conninfo';
import { createMiddleware } from 'hono/factory';

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// Only the local Nginx gateway may reach protected route groups. The service is
// also bound to loopback, making this a defense-in-depth check against a future
// listener misconfiguration. Member routes still verify their bearer JWT.
export const gatewayGuard = createMiddleware(async (c, next) => {
  if (!isLoopback(getConnInfo(c).remote.address)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
});
