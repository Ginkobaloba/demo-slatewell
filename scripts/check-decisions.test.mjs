// Tests for the duplicate decision-id check. Run: npm run test:decisions
//
// The case that matters is the real 2026-09-19 incident (in demo-harborbistro,
// this repo's CI dialect twin): two branches each add a "## D-019: ..."
// heading; the merge is clean (no conflict); nothing else in CI reads
// docs/decisions.md. This suite proves the function itself catches that
// shape. The CI step (scripts/check-decisions.mjs run directly) separately
// proves the real docs/decisions.md has no duplicates today.
//
// Ported from demo-harborbistro's vitest version (origin/main b205dec) to
// this repo's native test runner (node:test + node:assert/strict, same
// convention as scripts/ledger.test.mjs) -- slatewell has no vitest
// dependency. Same cases, same assertion strings as the original.
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkDecisions } from "./check-decisions.mjs";

test("passes when every id is unique", () => {
  const text = ["## D-001: first (2026-01-01)", "", "## D-002: second (2026-01-02)", ""].join("\n");
  assert.deepEqual(checkDecisions(text), []);
});

test("fails when a file has zero decision headings (nothing was checked)", () => {
  const problems = checkDecisions("no headings here\njust prose\n");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no "## D-<n>" decision headings found/);
});

test("fails on a duplicate id, naming both lines, reproducing the 2026-09-19 D-019 collision", () => {
  const text = [
    "## D-018: first (2026-09-19)",
    "body",
    "",
    "## D-019: claimed by branch A (2026-09-19)",
    "body",
    "",
    "## D-019: claimed by branch B (2026-09-19)",
    "body",
    "",
  ].join("\n");
  const problems = checkDecisions(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /id 19 appears 2 times \(D-019 on line 4, D-019 on line 7\)/);
});

test("reports every duplicated id, not just the first", () => {
  const text = ["## D-001: a", "## D-001: b", "## D-002: c", "## D-002: d", "## D-002: e"].join("\n");
  const problems = checkDecisions(text);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => p.includes("id 1 appears 2 times")));
  assert.ok(problems.some((p) => p.includes("id 2 appears 3 times")));
});

test("is not fooled by CRLF line endings", () => {
  const text = "## D-001: a\r\n## D-001: b\r\n";
  const problems = checkDecisions(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /id 1 appears 2 times \(D-001 on line 1, D-001 on line 2\)/);
});

test("ignores headings that are not decision ids", () => {
  const text = ["## Some other heading", "## D-1: numeric id still counts", "### D-1: wrong heading level"].join("\n");
  assert.deepEqual(checkDecisions(text), []);
});

test("treats inconsistently padded ids as the same decision (D-019 vs D-19)", () => {
  const text = ["## D-019: padded (2026-09-19)", "## D-19: unpadded, same decision (2026-09-19)"].join("\n");
  const problems = checkDecisions(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /id 19 appears 2 times \(D-019 on line 1, D-19 on line 2\)/);
});
