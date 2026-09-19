import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  ensureVisitorScopeColumns,
  maybePurgeExpiredVisitorData,
} from "@/lib/retention";
import { ensureRevocationTable } from "@/lib/session-revocation";

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
 *
 * On first open it applies the D-014 schema upgrade and makes sure the D-015
 * sign-out revocation table exists; on every call it gives the visitor-data
 * and expired-revocation purge a chance to run (itself throttled to hourly).
 */
export function getDb(): Database.Database {
  let db = globalThis.__slatewellDb;
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Slatewell database not found at ${DB_PATH}. Run "npm run db:seed" first.`
      );
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    ensureVisitorScopeColumns(db);
    ensureRevocationTable(db);
    globalThis.__slatewellDb = db;
  }
  maybePurgeExpiredVisitorData(db);
  return db;
}
