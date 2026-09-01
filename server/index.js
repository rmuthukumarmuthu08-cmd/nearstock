/**
 * NearStock — local development server.
 *   npm run dev   →   http://localhost:3000
 */

const app = require('./app');
const { getStore, driverInfo } = require('./lib/db');

const PORT = process.env.PORT || 3000;

getStore()
  .then(() => {
    app.listen(PORT, () => {
      const { driver, note } = driverInfo();
      console.log('');
      console.log('  🛒  NearStock is running');
      console.log(`      Customer app   http://localhost:${PORT}/`);
      console.log(`      Shop dashboard http://localhost:${PORT}/shop.html`);
      console.log(`      API health     http://localhost:${PORT}/api/health`);
      console.log(`      Data source    ${driver} — ${note}`);
      console.log('');
    });
  })
  .catch((err) => {
    console.error('Failed to start NearStock:', err);
    process.exit(1);
  });
