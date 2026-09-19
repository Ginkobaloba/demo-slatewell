/**
 * Per-browser demo scope for booking queries (D-014).
 *
 * A booking is visible to an admin session when it is fictional seed data
 * or was created by the same browser (visitor id). Rows created before D-014
 * have seeded = 0 and no visitor id, so they match neither branch and are
 * hidden from everyone. The single `?` binds the session's visitor id.
 */
export function visibleToVisitorSql(alias = "bk"): string {
  const col = alias ? `${alias}.` : "";
  return `(${col}seeded = 1 OR ${col}visitor_id = ?)`;
}

/** The same rule for a row already in memory. */
export function isVisibleToVisitor(
  row: { seeded: number; visitor_id: string | null },
  visitorId: string,
): boolean {
  return row.seeded === 1 || (row.visitor_id !== null && row.visitor_id === visitorId);
}

/**
 * Public booking detail pages (confirmation, .ics) are stricter: only the
 * browser that made the booking may open them, never seed or legacy rows.
 */
export function isOwnBooking(
  row: { visitor_id: string | null },
  visitorId: string | null,
): boolean {
  return Boolean(visitorId) && row.visitor_id !== null && row.visitor_id === visitorId;
}
