/**
 * Post-deploy verification against the PUBLIC URL (no database access;
 * the cancel token is read from the confirmation page's cancel link).
 * Books a real demo booking, checks ICS, rejects a wrong token, then
 * cancels with the right one. Container data resets on redeploy, so the
 * test residue is acceptable demo noise.
 *
 * Usage: node scripts/verify-prod.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE_URL = process.argv[2] ?? "https://slatewell.projectnexuscode.org";
const SLUG = "wave-wellness";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Find a bookable slot 3-10 days out.
let date = null;
let slot = null;
for (let offset = 3; offset <= 10 && !slot; offset++) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const res = await fetch(
    `${BASE_URL}/api/book/${SLUG}/availability?serviceId=1&date=${iso(d)}`
  );
  const slots = (await res.json()).slots ?? [];
  if (slots.length > 0) {
    date = iso(d);
    slot = slots[0];
  }
}
check("prod: availability API returns slots", Boolean(slot));

const bookRes = await fetch(`${BASE_URL}/api/book/${SLUG}/bookings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    serviceId: 1,
    staffId: slot.staffId,
    date,
    time: slot.time,
    customer: {
      firstName: "Deploy",
      lastName: "Check",
      email: "deploy.check@example.com",
      phone: "(555) 010-9090",
    },
  }),
});
check("prod: booking created (201)", bookRes.status === 201, bookRes.status);
const { id } = await bookRes.json();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE_URL}/book/${SLUG}/confirmation/${id}`);
check(
  "prod: confirmation renders",
  await page.getByText(/You're booked/).isVisible()
);
check(
  "prod: instructions present",
  await page.getByRole("heading", { name: "Before your visit" }).isVisible()
);

const cancelHref = await page
  .getByRole("link", { name: /Cancel or reschedule/ })
  .getAttribute("href");
check("prod: cancel link carries token", /token=[0-9a-f]{32}/.test(cancelHref ?? ""));
const token = new URL(cancelHref, BASE_URL).searchParams.get("token");

const icsRes = await fetch(`${BASE_URL}/book/${SLUG}/confirmation/${id}/ics`);
// Unfold per RFC 5545 (folded lines continue with CRLF + space) before
// matching content; long values like URLs fold mid-token.
const icsText = (await icsRes.text()).replace(/\r\n[ \t]/g, "");
check("prod: ICS 200 + text/calendar", icsRes.status === 200 && (icsRes.headers.get("content-type") ?? "").includes("text/calendar"));
check("prod: ICS has TZID DTSTART", icsText.includes("DTSTART;TZID=America/New_York:"));
check(
  "prod: ICS cancel URL uses https public origin",
  icsText.includes("https://slatewell.projectnexuscode.org/book/"),
  icsText.split("\r\n").find((l) => l.includes("Cancel"))
);

const badRes = await fetch(`${BASE_URL}/api/book/${SLUG}/bookings/${id}/cancel`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: "0".repeat(32) }),
});
check("prod: wrong token 403", badRes.status === 403, badRes.status);

await page.goto(`${BASE_URL}/book/${SLUG}/cancel/${id}?token=${token}`);
check(
  "prod: cancel page shows free-window notice",
  await page.getByText(/deposit will be released/).isVisible()
);
await page.getByRole("button", { name: /Yes, cancel appointment/ }).click();
await page.waitForSelector("text=Your appointment is cancelled", { timeout: 15000 });
check(
  "prod: cancelled with deposit released",
  await page.getByText(/deposit has been released/).isVisible()
);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
