/**
 * ============================================================================
 *  NearStock — data-layer selector
 * ============================================================================
 *  Picks MySQL when a connection is configured, otherwise falls back to the
 *  seeded in-memory store. If MySQL is configured but unreachable we log the
 *  reason and degrade to memory rather than 500-ing the whole site.
 */

const memoryStore = require('./store-memory');

let active = null;
let bootPromise = null;
let note = '';

function mysqlConfigured() {
  return Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER));
}

async function boot() {
  if (mysqlConfigured()) {
    try {
      const mysqlStore = require('./store-mysql');
      await mysqlStore.init();
      note = 'Connected to MySQL.';
      return mysqlStore;
    } catch (err) {
      note = `MySQL was configured but unreachable (${err.code || err.message}); using the seeded in-memory dataset.`;
      console.warn('[nearstock]', note);
    }
  } else {
    note = 'No MySQL configured — using the seeded in-memory dataset.';
  }
  await memoryStore.init();
  return memoryStore;
}

/** Resolve to the active store, booting it exactly once. */
function getStore() {
  if (active) return Promise.resolve(active);
  if (!bootPromise) {
    bootPromise = boot().then((s) => {
      active = s;
      return s;
    });
  }
  return bootPromise;
}

const driverInfo = () => ({ driver: active ? active.driver : 'booting', note });

module.exports = { getStore, driverInfo };
