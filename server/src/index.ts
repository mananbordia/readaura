import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env';
import { gatewayGuard } from './middleware/gateway-guard';
import { ensureSeed } from './seed';
import { authRoutes } from './routes/auth';
import { blobsRoutes, docsRoutes } from './routes/docs';
import { invitesRoutes } from './routes/invites';
import { membersRoutes } from './routes/members';
import { annotationsRoutes } from './routes/annotations';
import { syncRoutes } from './routes/sync';

const app = new Hono();

// Browser-direct Club API calls are allowed only from known ReadAura and local
// development origins. CORS is not authentication; member routes still verify
// their bearer JWT, while join/recover retain per-IP throttles.
app.use(
  '*',
  cors({
    origin: (origin) => env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : null,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  }),
);

// Liveness is intentionally outside the route guard, but the server itself is
// loopback-only. External health checks go through Nginx HTTPS.
app.get('/health', (c) => c.json({ ok: true, service: 'readaura-club' }));

// Everything below must arrive through local Nginx. Guard exact mount paths AND
// subpaths (e.g. GET /docs is discover).
app.use('/auth/*', gatewayGuard);
app.route('/auth', authRoutes);

app.use('/docs', gatewayGuard);
app.use('/docs/*', gatewayGuard);
app.route('/docs', docsRoutes);

app.use('/blobs/*', gatewayGuard);
app.route('/blobs', blobsRoutes);

app.use('/invites', gatewayGuard);
app.use('/invites/*', gatewayGuard);
app.route('/invites', invitesRoutes);

app.use('/members', gatewayGuard);
app.use('/members/*', gatewayGuard);
app.route('/members', membersRoutes);

// Phase 3: shared annotations (explanations auto-shared onto club docs).
app.use('/annotations', gatewayGuard);
app.use('/annotations/*', gatewayGuard);
app.route('/annotations', annotationsRoutes);

// Personal sync (opt-in account-level library mirror; separate lane from clubs).
app.use('/sync', gatewayGuard);
app.use('/sync/*', gatewayGuard);
app.route('/sync', syncRoutes);

await ensureSeed();

serve({ fetch: app.fetch, port: env.PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`[club] readaura-club backend listening on 127.0.0.1:${info.port}`);
});
