import { startSyncBackupScheduler } from './lib/sync-backup';
import { createApp } from './app';

startSyncBackupScheduler();

const { app, staticRoot } = createApp();
const port = Number(process.env.PORT ?? 3000);
const server = Bun.serve({
  port,
  maxRequestBodySize: 4 * 1024 * 1024 * 1024,
  fetch: app.fetch,
});

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

export async function stopServer(force = true): Promise<void> {
  await server.stop(force);
}

export { app, server };
