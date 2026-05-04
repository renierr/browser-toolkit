import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import systemRoutes from './routes/system';
import testRoutes from './routes/test';
import discoveryRoutes from './routes/discovery';
import networkRoutes from './routes/network';
import syncRoutes from './routes/sync';

const app = new Hono();

// API Routes
app.route('/api', systemRoutes);
app.route('/api', testRoutes);
app.route('/api', discoveryRoutes);
app.route('/api/network', networkRoutes);
app.route('/api/sync', syncRoutes);

// Serve the static frontend (dist folder)
// It serves everything from ../dist for any unmatched routes
app.use('/*', serveStatic({ root: '../dist' }));

const port = process.env.PORT || 3000;
console.log(`\n🚀 Backend Server running at http://localhost:${port}`);
console.log(`📁 Serving static files from: ../dist`);
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

