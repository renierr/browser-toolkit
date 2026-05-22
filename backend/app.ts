import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import systemRoutes from './routes/system';
import testRoutes from './routes/test';
import discoveryRoutes from './routes/discovery';
import networkRoutes from './routes/network';
import syncRoutes from './routes/sync';
import dropRoutes from './routes/drop';
import aiRoutes from './routes/ai';
import { resolveStaticRoot } from './lib/static-root';

export type BackendApp = {
  app: Hono;
  staticRoot: ReturnType<typeof resolveStaticRoot>;
};

export function createApp(): BackendApp {
  const app = new Hono();
  const staticRoot = resolveStaticRoot();

  app.route('/api', systemRoutes);
  app.route('/api', testRoutes);
  app.route('/api', discoveryRoutes);
  app.route('/api/network', networkRoutes);
  app.route('/api/sync', syncRoutes);
  app.route('/api/drop', dropRoutes);
  app.route('/api/ai', aiRoutes);

  app.use('/*', serveStatic({ root: staticRoot.root }));

  return { app, staticRoot };
}
