import { syncAll } from "./services/syncService.js"; import { pool } from "./db/pool.js"; await syncAll(); await pool.end();
