import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env';
import { proxyGuard } from './middleware/proxy-guard';
import { ensureSeed } from './seed';
import { authRoutes } from './routes/auth';
import { blobsRoutes, docsRoutes } from './routes/docs';
import { invitesRoutes } from './routes/invites';
import { membersRoutes } from './routes/members';
import { annotationsRoutes } from './routes/annotations';
import { syncRoutes } from './routes/sync';

const app = new Hono();

// Liveness — intentionally NOT behind the proxy guard, so the Vercel proxy and
// a plain curl can health-check the box.
app.get('/health', (c) => c.json({ ok: true, service: 'readaura-club' }));

// Everything below requires the shared proxy secret.
// Guard exact mount paths AND subpaths (e.g. GET /docs is the discover list).
app.use('/auth/*', proxyGuard);
app.route('/auth', authRoutes);

app.use('/docs', proxyGuard);
app.use('/docs/*', proxyGuard);
app.route('/docs', docsRoutes);

app.use('/blobs/*', proxyGuard);
app.route('/blobs', blobsRoutes);

app.use('/invites', proxyGuard);
app.use('/invites/*', proxyGuard);
app.route('/invites', invitesRoutes);

app.use('/members', proxyGuard);
app.use('/members/*', proxyGuard);
app.route('/members', membersRoutes);

// Phase 3: shared annotations (explanations auto-shared onto club docs).
app.use('/annotations', proxyGuard);
app.use('/annotations/*', proxyGuard);
app.route('/annotations', annotationsRoutes);

// Personal sync (opt-in account-level library mirror; separate lane from clubs).
app.use('/sync', proxyGuard);
app.use('/sync/*', proxyGuard);
app.route('/sync', syncRoutes);

await ensureSeed();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[club] readaura-club backend listening on :${info.port}`);
});
