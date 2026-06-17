import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env';
import { proxyGuard } from './middleware/proxy-guard';
import { ensureSeed } from './seed';
import { authRoutes } from './routes/auth';
import { blobsRoutes, docsRoutes } from './routes/docs';

const app = new Hono();

// Liveness — intentionally NOT behind the proxy guard, so the Vercel proxy and
// a plain curl can health-check the box.
app.get('/health', (c) => c.json({ ok: true, service: 'readaura-club' }));

// Everything below requires the shared proxy secret.
app.use('/auth/*', proxyGuard);
app.route('/auth', authRoutes);

app.use('/docs/*', proxyGuard);
app.use('/blobs/*', proxyGuard);
app.route('/docs', docsRoutes);
app.route('/blobs', blobsRoutes);

// Phase 3 mounts /annotations; the personal-sync track mounts /sync — each
// behind its own proxyGuard.

await ensureSeed();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[club] readaura-club backend listening on :${info.port}`);
});
