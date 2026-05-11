import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import systemRoutes from './routes/system';
import testRoutes from './routes/test';
import discoveryRoutes from './routes/discovery';
import networkRoutes from './routes/network';
import syncRoutes from './routes/sync';
import dropRoutes from './routes/drop';
import { startSyncBackupScheduler } from './lib/sync-backup';
import { resolveStaticRoot } from './lib/static-root';

const app = new Hono();
const staticRoot = resolveStaticRoot();

// API Routes
app.route('/api', systemRoutes);
app.route('/api', testRoutes);
app.route('/api', discoveryRoutes);
app.route('/api/network', networkRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/drop', dropRoutes);

// Serve the static frontend (dist folder)
// It serves everything from ../dist for any unmatched routes
app.use('/*', serveStatic({ root: staticRoot.root }));

startSyncBackupScheduler();

const port = process.env.PORT || 3000;
console.log(`\n🚀 Backend Server running at http://localhost:${port}`);
console.log(`📁 Serving static files from: ${staticRoot.root} (${staticRoot.source})`);
if (process.env.DEBUG_STATIC_ROOT === '1') {
  console.log('📁 Static root lookup paths:');
  for (const checkedPath of staticRoot.checked) {
    console.log(`- ${checkedPath}`);
  }
}
console.log(`\nEndpoints:`);
const routes = app.routes
  .filter(r => r.path.startsWith('/api'))
  .map(r => r.path)
  .filter((value, index, self) => self.indexOf(value) === index); // Unique paths

routes.forEach(path => {
  console.log(`- http://localhost:${port}${path}`);
});

export default {
  port,
  fetch: app.fetch,
};
