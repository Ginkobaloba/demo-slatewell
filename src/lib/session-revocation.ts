import type { Database } from "better-sqlite3";

/**
 * Server-side sign-out (D-015). An admin session is a stateless HS256 JWT,
 * so deleting the cookie alone left a captured cookie pair usable until the
 * token expired (up to 8 hours). Sign-out now records the session's `jti`
 * here, and authorizeAdmin() in src/lib/admin-auth.ts refuses any session
 * whose `jti` is listed.
 *
 * Node only (SQLite). The Edge middleware cannot reach this table, which is
 * why every admin page and admin API handler authorizes through
 * authorizeAdmin() and not just the middleware.
 *
 * `exp` is the token's own expiry in Unix epoch seconds (a token attribute,
 * not a business timestamp, so D-003's local ISO strings do not apply). A
 * row is useless once the token has expired, because jwtVerify rejects an
 * expired token on its own, so rows are purged after `exp`.
 */

export function ensureRevocationTable(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS revoked_admin_sessions (
    jti TEXT PRIMARY KEY,
    exp INTEGER NOT NULL,
    revoked_at INTEGER NOT NULL
  )`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_revoked_admin_sessions_exp ON revoked_admin_sessions(exp)",
  );
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Revoke a session by id until its expiry. Idempotent. Callers pass only a
 * jti taken from a token whose signature verified, so forged tokens cannot
 * fill the table.
 */
export function revokeAdminSession(
  db: Database,
  jti: string,
  exp: number,
  now: number = nowSeconds(),
): void {
  db.prepare(
    `INSERT INTO revoked_admin_sessions (jti, exp, revoked_at) VALUES (?, ?, ?)
     ON CONFLICT(jti) DO NOTHING`,
  ).run(jti, exp, now);
  purgeExpiredRevocations(db, now);
}

export function isAdminSessionRevoked(db: Database, jti: string): boolean {
  return (
    db.prepare("SELECT 1 FROM revoked_admin_sessions WHERE jti = ?").get(jti) !==
    undefined
  );
}

/** Drop rows whose token has expired. Returns the number removed. */
export function purgeExpiredRevocations(
  db: Database,
  now: number = nowSeconds(),
): number {
  return db.prepare("DELETE FROM revoked_admin_sessions WHERE exp < ?").run(now)
    .changes;
}
