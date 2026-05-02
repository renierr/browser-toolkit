import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import systemRoutes from './routes/system';
import testRoutes from './routes/test';

const app = new Hono();

// API Routes
app.route('/api', systemRoutes);
app.route('/api', testRoutes);

// Serve the static frontend (dist folder)
// It serves everything from ../dist for any unmatched routes
app.use('/*', serveStatic({ root: '../dist' }));

const port = process.env.PORT || 3000;
console.log(`\n🚀 Backend Server running at http://localhost:${port}`);
console.log(`📁 Serving static files from: ../dist`);
console.log(`\nEndpoints:`);
console.log(`- http://localhost:${port}/api/health`);
console.log(`- http://localhost:${port}/api/info`);
console.log(`- http://localhost:${port}/api/db-test`);

export default {
  port,
  fetch: app.fetch,
};

