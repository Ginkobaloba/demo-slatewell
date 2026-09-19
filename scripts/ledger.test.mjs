// Tests for the ledger check's three states. Run: npm run test:ledger
//
// The case that matters is zero entries: `check` used to print
// "0 entries, 0 problem(s)" and exit 0 when the directory was missing or
// empty, so a move, a rename or a wrong path left the check green while it
// inspected nothing.
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkEntry, listEntries, runCheck } from "./ledger.mjs";

const VALID = [
  "# 2026-09-19 16:13 CDT - a valid entry",
  "- **Who:** dev-44",
  "- **Change:** something concrete",
  "- **Why:** a reason",
  "- **State after:** what is true now",
  "- **Refs:** PR #1",
  "",
].join("\n");
const VALID_NAME = "2026-09-19-1613-a-valid-entry.md";

function tmp() {
  return mkdtempSync(join(tmpdir(), "ledger-test-"));
}

function capture(dir) {
  const out = [];
  const errs = [];
  const code = runCheck(dir, (m) => out.push(m), (m) => errs.push(m));
  return { code, out: out.join("\n"), errs: errs.join("\n") };
}

test("check fails when docs/ledger is missing", () => {
  const r = capture(join(tmp(), "docs", "ledger"));
  assert.equal(r.code, 1);
  assert.match(r.errs, /does not exist/);
  assert.doesNotMatch(r.out, /0 entries, 0 problem/);
});

test("check fails when docs/ledger has zero entries", () => {
  const dir = join(tmp(), "ledger");
  mkdirSync(dir, { recursive: true });
  const r = capture(dir);
  assert.equal(r.code, 1);
  assert.match(r.errs, /no entries found/);
});

test("README alone is still no entries", () => {
  const dir = join(tmp(), "ledger");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Ledger\n");
  assert.equal(capture(dir).code, 1);
});

test("check passes on a normal tree", () => {
  const dir = join(tmp(), "ledger");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, VALID_NAME), VALID);
  const r = capture(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /1 entries, 0 problem/);
});

test("a malformed entry still fails", () => {
  const dir = join(tmp(), "ledger");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, VALID_NAME), VALID.replace("- **Why:** a reason\n", ""));
  const r = capture(dir);
  assert.equal(r.code, 1);
  assert.match(r.errs, /missing "- \*\*Why:\*\*"/);
});

test("the real ledger of this repo is valid and not empty", () => {
  assert.ok(listEntries().length > 0, "this repo must have at least one ledger entry");
  assert.equal(runCheck(undefined, () => {}, () => {}), 0);
});

test("checkEntry still catches name/heading mismatches and em dashes", () => {
  assert.match(checkEntry("2026-09-19-1613-x.md", VALID.replace("16:13", "17:13")).join(),
    /does not match the file name/);
  assert.match(checkEntry(VALID_NAME, VALID.replace("a reason", "a — reason")).join(), /em dash/);
  assert.match(checkEntry("nope.md", VALID).join(), /name must be/);
});
