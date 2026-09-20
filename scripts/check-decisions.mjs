#!/usr/bin/env node
// Duplicate decision-id guard for docs/decisions.md.
//
// Two branches each adding "## D-019: ..." merge cleanly with NO conflict
// (they touch different lines, both appended near the end), and GitHub sees
// no reason to complain. That happened for real on 2026-09-19: two PRs both
// claimed D-019. Nothing else in this repo's CI would have caught it -- the
// ledger check validates docs/ledger/, not docs/decisions.md, and there is
// no code path that reads a decision id and would fail on a collision.
//
// This script is the check: every `## D-<digits>` heading in
// docs/decisions.md must have a unique id. Run:
//   node scripts/check-decisions.mjs [path-to-decisions.md]
//
// Also run by npm test (see check-decisions.test.mjs), which covers the
// function in isolation. The CI step runs this file directly against the
// real docs/decisions.md, because a check that only exercises a synthetic
// fixture is not proof the real file passes.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PATH = join(ROOT, "docs", "decisions.md");
const HEADING_RE = /^## D-(\d+)\b/;

/**
 * Finds every `## D-<digits>` heading in `text` and returns problems: one
 * entry per id that appears more than once (naming every line it appears
 * on), plus a single problem if zero ids were found at all -- an empty or
 * missing file must fail loudly, not report "0 problems" while checking
 * nothing.
 */
export function checkDecisions(text, label = "decisions.md") {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  // Keyed by the NUMERIC value, not the matched digit string: "D-019" and
  // "D-19" name the same decision with inconsistent padding, and that is
  // exactly the kind of collision this check exists to catch, not a reason
  // to treat them as two different ids.
  /** @type {Map<number, {raw: string, line: number}[]>} */
  const seen = new Map();
  lines.forEach((line, i) => {
    const m = HEADING_RE.exec(line);
    if (!m) return;
    const id = Number(m[1]);
    const at = seen.get(id) ?? [];
    at.push({ raw: m[1], line: i + 1 });
    seen.set(id, at);
  });

  const problems = [];
  if (seen.size === 0) {
    problems.push(`${label}: no "## D-<n>" decision headings found; nothing was checked`);
    return problems;
  }
  for (const [id, occurrences] of seen) {
    if (occurrences.length > 1) {
      const spots = occurrences.map((o) => `D-${o.raw} on line ${o.line}`).join(", ");
      problems.push(`${label}: id ${id} appears ${occurrences.length} times (${spots})`);
    }
  }
  return problems;
}

export function runCheck(path = DEFAULT_PATH, log = console.log, err = console.error) {
  const label = relative(ROOT, path) || path;
  if (!existsSync(path)) {
    err(`decisions: ${label} does not exist; nothing was checked`);
    return 1;
  }
  const text = readFileSync(path, "utf8");
  const problems = checkDecisions(text, label);
  for (const p of problems) err(`decisions: ${p}`);
  const idCount = new Set(
    (text.match(/^## D-\d+\b/gm) ?? []).map((h) => Number(/^## D-(\d+)/.exec(h)[1])),
  ).size;
  log(`decisions: ${idCount} unique id(s), ${problems.length} problem(s).`);
  return problems.length ? 1 : 0;
}

function main([path]) {
  return runCheck(path ? join(process.cwd(), path) : DEFAULT_PATH);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
