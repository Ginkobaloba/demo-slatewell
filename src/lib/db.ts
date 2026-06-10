import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH =
  process.env.SLATEWELL_DB_PATH ??
  path.join(process.cwd(), "data", "slatewell.db");

declare global {
  // eslint-disable-next-line no-var
  var __slatewellDb: Database.Database | undefined;
}

/**
 * Singleton SQLite handle, cached on globalThis so Next.js dev-mode HMR
 * does not leak file handles by re-opening on every reload.
 */
export function getDb(): Database.Database {
  if (globalThis.__slatewellDb) return globalThis.__slatewellDb;

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Slatewell database not found at ${DB_PATH}. Run "npm run db:seed" first.`
    );
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  globalThis.__slatewellDb = db;
  return db;
}
