/**
 * Chunk 4.5 e2e: confirmation page (ICS + instructions + cancel link)
 * and token-protected cancellation, both deposit outcomes.
 *
 * Flow A (free window): book a deposit service >24h out via the API,
 * open the confirmation page, verify ICS + instructions, reject a wrong
 * token, cancel through the UI with the right token, assert Released.
 *
 * Flow B (late cancel): book the soonest slot inside the 24h window and
 * cancel; assert Captured. Skips with a notice if no in-window slot
 * exists (early-morning runs against a Tue-Sat business).
 *
 * Most HTTP calls below go through page.request (not a plain Node fetch),
 * so they share the Playwright page's browser context and cookie jar. The
 * bookings POST mints the HttpOnly slatewell_visitor cookie (D-014); a bare
 * fetch() has no cookie jar at all, so it would drop the cookie the response
 * sets and every follow-up request/page-load would otherwise silently hit
 * the visitor-scope gate instead of the surface it means to test.
 *
 * The .ics download is the one exception: confirmation and .ics are
 * visitor-cookie-gated (D-014), and the production image sets that cookie
 * Secure. Playwright's APIRequestContext (page.request) does not send
 * Secure cookies to http://127.0.0.1, while the browser itself does
 * (127.0.0.1 is a potentially trustworthy origin) -- see D-016. So the .ics
 * fetch below runs inside the page (pageFetch, an in-page fetch()), exactly
 * like a real browser, instead of through page.request.
 *
 * Prereqs: server on BASE_URL, seeded db. Usage: node scripts/e2e-cancellation.mjs
 */
import { chromium } from "playwright";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, ".shots");
const SLUG = "wave-wellness";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// HTTP from inside the page: the browser attaches its own cookies (Secure
// ones included on a trustworthy origin), same as the real app's fetches
// and the same pattern e2e-visitor-scope.mjs uses (D-016).
async function pageFetch(pg, url, init = {}) {
  return pg.evaluate(
    async ({ url, init }) => {
      const r = await fetch(url, { redirect: "manual", ...init });
      return {
        status: r.status,
        headers: Object.fromEntries(r.headers.entries()),
        body: await r.text(),
      };
    },
    { url, init },
  );
}

// Headings and status text swap in right after a navigation or a click;
// asserting isVisible() immediately races the render (same fix as
// e2e-booking.mjs). Wait for the element to actually appear before
// recording pass/fail.
const waitVisible = async (locator, timeout = 10000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

const db = new Database(path.join(ROOT, "data", "slatewell.db"), {
  readonly: true,
});
const getBooking = (id) =>
  db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${BASE_URL}/book/${SLUG}`);

async function getSlots(serviceId, date) {
  const res = await page.request.get(
    `${BASE_URL}/api/book/${SLUG}/availability?serviceId=${serviceId}&date=${date}`
  );
  return (await res.json()).slots ?? [];
}

async function createBooking(serviceId, date, slot, email) {
  const res = await page.request.post(
    `${BASE_URL}/api/book/${SLUG}/bookings`,
    {
      data: {
        serviceId,
        staffId: slot.staffId,
        date,
        time: slot.time,
        customer: {
          firstName: "Cancel",
          lastName: "Tester",
          email,
          phone: "(555) 010-4545",
        },
      },
    }
  );
  if (res.status() !== 201) {
    throw new Error(`booking failed: ${res.status()}`);
  }
  return (await res.json()).id;
}

// Service 1 = Signature Facial (60 min, $25 deposit).
const SERVICE_ID = 1;

// ---- Flow A: book >24h out --------------------------------------------------

let dateA = null;
let slotA = null;
for (let offset = 3; offset <= 10 && !slotA; offset++) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const candidates = await getSlots(SERVICE_ID, iso(d));
  if (candidates.length > 0) {
    dateA = iso(d);
    slotA = candidates[0];
  }
}
check("flow A: found a slot >24h out", Boolean(slotA), "no slots in +3..+10 days");
const idA = await createBooking(SERVICE_ID, dateA, slotA, "cancel.a@example.com");
const rowA = getBooking(idA);
check("flow A: deposit Held after booking", rowA.deposit_status === "Held", rowA.deposit_status);

// Confirmation page: ICS link, instructions, cancel link.
await page.goto(`${BASE_URL}/book/${SLUG}/confirmation/${idA}`);
check(
  "confirmation: ICS download link present",
  await waitVisible(page.getByRole("link", { name: /Add to calendar/ }))
);
check(
  "confirmation: instructions section present",
  await waitVisible(page.getByRole("heading", { name: "Before your visit" }))
);
check(
  "confirmation: cancel link present",
  await waitVisible(page.getByRole("link", { name: /Cancel or reschedule/ }))
);
await page.screenshot({ path: path.join(SHOTS, "cancel-1-confirmation.png") });

// ICS content over HTTP, in-page (visitor-scoped, and needs Secure cookies
// to reach http://127.0.0.1 -- see the file header and D-016).
const icsRes = await pageFetch(
  page,
  `${BASE_URL}/book/${SLUG}/confirmation/${idA}/ics`
);
const icsText = icsRes.body;
check("ics: HTTP 200", icsRes.status === 200, String(icsRes.status));
check(
  "ics: content type text/calendar",
  (icsRes.headers["content-type"] ?? "").includes("text/calendar")
);
check("ics: VCALENDAR wrapper", icsText.includes("BEGIN:VCALENDAR") && icsText.includes("END:VCALENDAR"));
check("ics: VTIMEZONE for America/New_York", icsText.includes("TZID:America/New_York"));
check(
  "ics: TZID-qualified DTSTART (D-003)",
  icsText.includes(`DTSTART;TZID=America/New_York:${dateA.replaceAll("-", "")}T${slotA.time.replace(":", "")}00`)
);
check("ics: UID present", icsText.includes(`UID:${idA}@`));
check("ics: SUMMARY present", icsText.includes("SUMMARY:Signature Facial"));

// Wrong token rejected: page level and API level.
await page.goto(`${BASE_URL}/book/${SLUG}/cancel/${idA}?token=deadbeef`);
check(
  "cancel: wrong token shows clear error",
  await waitVisible(page.getByText("This link is not valid"))
);
const badRes = await page.request.post(
  `${BASE_URL}/api/book/${SLUG}/bookings/${idA}/cancel`,
  { data: { token: "deadbeef" } }
);
check("cancel API: wrong token 403", badRes.status() === 403, badRes.status());
check(
  "cancel: booking untouched after bad attempts",
  getBooking(idA).status === "Confirmed"
);

// Right token: cancel through the UI.
const tokenA = rowA.cancel_token;
await page.goto(`${BASE_URL}/book/${SLUG}/cancel/${idA}?token=${tokenA}`);
check(
  "cancel: free-window notice shown",
  await waitVisible(page.getByText(/deposit will be released/))
);
await page.screenshot({ path: path.join(SHOTS, "cancel-2-confirm.png") });
await page.getByRole("button", { name: /Yes, cancel appointment/ }).click();
await page.waitForSelector("text=Your appointment is cancelled", { timeout: 10000 });
check(
  "cancel: success state shows released deposit",
  await waitVisible(page.getByText(/deposit has been released/))
);
await page.screenshot({ path: path.join(SHOTS, "cancel-3-done.png") });

const cancelledA = getBooking(idA);
check("flow A: status Cancelled", cancelledA.status === "Cancelled", cancelledA.status);
check("flow A: deposit Released", cancelledA.deposit_status === "Released", cancelledA.deposit_status);
check("flow A: cancelled_at set", Boolean(cancelledA.cancelled_at));
const commsA = db
  .prepare("SELECT channel FROM communications WHERE booking_id = ? AND kind = 'cancellation'")
  .all(idA);
check("flow A: cancellation sms + email logged", commsA.length === 2, JSON.stringify(commsA));

// Double cancel blocked.
const dupRes = await page.request.post(
  `${BASE_URL}/api/book/${SLUG}/bookings/${idA}/cancel`,
  { data: { token: tokenA } }
);
check("cancel API: double cancel 409", dupRes.status() === 409, dupRes.status());

// ---- Flow B: book inside the 24h window ------------------------------------

let dateB = null;
let slotB = null;
const windowCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
for (let offset = 0; offset <= 1 && !slotB; offset++) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const day = iso(d);
  for (const s of await getSlots(SERVICE_ID, day)) {
    const start = new Date(`${day}T${s.time}`);
    if (start < windowCutoff) {
      dateB = day;
      slotB = s;
      break;
    }
  }
}

if (!slotB) {
  console.log("SKIP  flow B: no slot inside the 24h window right now (run later in the day)");
} else {
  const idB = await createBooking(SERVICE_ID, dateB, slotB, "cancel.b@example.com");
  const rowB = getBooking(idB);
  await page.goto(`${BASE_URL}/book/${SLUG}/cancel/${idB}?token=${rowB.cancel_token}`);
  check(
    "flow B: kept-deposit warning shown",
    await waitVisible(page.getByText(/deposit will be kept/))
  );
  await page.getByRole("button", { name: /Yes, cancel appointment/ }).click();
  await page.waitForSelector("text=Your appointment is cancelled", { timeout: 10000 });
  check(
    "flow B: success state shows kept deposit",
    await waitVisible(page.getByText(/deposit was kept/))
  );
  await page.screenshot({ path: path.join(SHOTS, "cancel-4-late.png") });
  const cancelledB = getBooking(idB);
  check("flow B: status Cancelled", cancelledB.status === "Cancelled", cancelledB.status);
  check("flow B: deposit Captured", cancelledB.deposit_status === "Captured", cancelledB.deposit_status);
  const commsB = db
    .prepare("SELECT channel FROM communications WHERE booking_id = ? AND kind = 'cancellation'")
    .all(idB);
  check("flow B: cancellation comms logged", commsB.length === 2, JSON.stringify(commsB));
}

await browser.close();
process.exit(failures === 0 ? 0 : 1);
