// Tests safescroll.user.js in Chromium against stand-in TikTok pages, with a
// fake GM.getValue/GM.setValue (what the Userscripts app provides on iPhone).
// Usage: npm i -D playwright && node userscript/test.mjs [--shots]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv.includes("--shots");
const shotDir = path.join(here, "..", "docs", "screenshots", "safari");
if (shots) fs.mkdirSync(shotDir, { recursive: true });
const script = fs.readFileSync(path.join(here, "safescroll.user.js"), "utf8");
let gm = {};
let failures = 0;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures++; };

const stub = (title, posts, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{margin:0;background:#111;color:#fff;font:15px -apple-system,system-ui,sans-serif}
header{padding:14px;font-weight:700;text-align:center;border-bottom:1px solid #333}
[data-e2e="recommend-list-item-container"]{margin:12px;padding:16px;border-radius:12px;background:#222;min-height:120px}
.note{padding:10px 14px;color:#9ca3af;font-size:12px}</style></head><body>
<header>Stand-in page (not real TikTok): ${title}</header>${extra}
${posts.map(p => `<div data-e2e="recommend-list-item-container"><img alt="">${p}</div>`).join("")}</body></html>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.exposeBinding("__gmGet", (_s, k, d) => (k in gm ? gm[k] : d));
await ctx.exposeBinding("__gmSet", (_s, k, v) => { gm[k] = v; });
await ctx.addInitScript(src => {
  if (top !== self || !location.hostname.endsWith("tiktok.com")) return; // @noframes + @match
  window.GM = { getValue: (k, d) => window.__gmGet(k, d), setValue: (k, v) => window.__gmSet(k, v) };
  (0, eval)(src);
}, script);
await ctx.route("https://www.tiktok.com/**", r => {
  const u = new URL(r.request().url());
  const posts = ["@bakewithmia · 3 ingredient cookies 🍪 #baking", "@stuntkid · trying the #blackoutchallenge 😵", "@sciencesam · elephant toothpaste #stem"];
  const login = `<a data-e2e="top-login-button" href="/login" style="display:block;margin:12px;padding:10px;background:#fe2c55;color:#fff;text-align:center;border-radius:8px">Log in</a>`;
  r.fulfill({ contentType: "text/html; charset=utf-8", body: stub(u.pathname, posts, login) });
});
const store = () => JSON.parse(gm["safescroll.storage.v1"] || "{}");
const srcdocFrames = p => p.frames().filter(fr => fr.url() === "about:srcdoc");
const settingsFrame = p => {
  for (const fr of srcdocFrames(p)) if (fr.__isSettings) return fr;
  return null;
};
async function findSettings(p) {
  for (const fr of srcdocFrames(p)) {
    if (await fr.evaluate(() => !!document.getElementById("pinGate")).catch(() => false)) { fr.__isSettings = true; return fr; }
  }
  return null;
}
async function findBlocked(p) {
  for (const fr of srcdocFrames(p)) {
    if (await fr.evaluate(() => !document.getElementById("pinGate") && !!document.getElementById("why")).catch(() => false)) return fr;
  }
  return null;
}
const errors = [];

// 1. First visit: settings open by themselves on the setup screen.
const page = await ctx.newPage();
page.on("pageerror", e => errors.push(e.message));
await page.goto("https://www.tiktok.com/foryou");
await page.waitForTimeout(1200);
let f = await findSettings(page);
check(!!f && await f.isVisible("#setup:not([hidden])").catch(() => false), "first visit opens SafeScroll setup");
if (shots) await page.screenshot({ path: path.join(shotDir, "1-setup.png") });

// 2. Setup: PIN, age 14, Australia.
await f.fill("#newPin", "123456"); await f.fill("#newPin2", "123456"); await f.fill("#setupAge", "14");
await f.selectOption("#setupRegion", "AU");
await f.click("#setupForm button");
await f.waitForSelector("#panel:not([hidden])");
check(/^[0-9a-f]{64}$/.test(store().pinHash || "") && store().age === 14 && store().region === "AU", "PIN, age and country saved in Userscripts storage");
if (shots) { await f.evaluate(() => document.getElementById("foryou").scrollIntoView()); await page.waitForTimeout(200); await page.screenshot({ path: path.join(shotDir, "2-settings.png") }); }

// 3. Done (top-right of the settings bar), then reload: rules apply.
await Promise.all([page.waitForEvent("load"), page.mouse.click(360, 24)]);
await page.waitForTimeout(300);
check(!(await findSettings(page)), "Done closes settings");
await page.goto("https://www.tiktok.com/foryou");
await page.waitForURL(/\/following$/, { timeout: 5000 }).then(() => check(true, "For You (off at 14) redirects to Following"), () => check(false, "For You (off at 14) redirects to Following"));
await page.waitForTimeout(800);
const visible = await page.$$eval('[data-e2e="recommend-list-item-container"]', els => els.filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent));
check(visible.length === 2 && !visible.some(t => t.includes("blackout")), "harmful post removed, safe posts stay");
check(await page.$eval('[data-e2e="top-login-button"]', e => getComputedStyle(e).display === "none"), "Log in button hidden under 16 in Australia");
check(await page.evaluate(() => !!document.getElementById("safescroll-cog")), "settings cog shown");
if (shots) await page.screenshot({ path: path.join(shotDir, "3-feed-filtered.png") });

// 4. Login page: blocked overlay.
await page.goto("https://www.tiktok.com/login");
await page.waitForTimeout(1200);
const blocked = await findBlocked(page);
check(!!blocked && (await blocked.textContent("h1")).includes("Accounts aren't available"), "login page shows the blocked screen");
if (shots) await page.screenshot({ path: path.join(shotDir, "4-login-blocked.png") });

// 5. Cog reopens settings behind the PIN (once the 10-minute unlock has expired).
gm["safescroll.storage.v1"] = JSON.stringify({ ...store(), unlockedUntil: 0 });
await page.goto("https://www.tiktok.com/following");
await page.waitForTimeout(800);
await page.mouse.click(370, 25);
await page.waitForTimeout(800);
f = await findSettings(page);
check(!!f && await f.isVisible("#pinGate:not([hidden])").catch(() => false), "cog opens settings, locked behind the PIN");
await f.fill("#unlockPin", "000000"); await f.click("#unlockForm button");
await f.waitForFunction(() => document.getElementById("unlockMsg").textContent.includes("Wrong PIN"));
check(true, "wrong PIN refused");
await f.fill("#unlockPin", "123456"); await f.click("#unlockForm button");
await f.waitForSelector("#panel:not([hidden])");
check(true, "right PIN unlocks settings");

// 6. Under 13: everything blocked.
gm["safescroll.storage.v1"] = JSON.stringify({ ...store(), age: 11 });
await page.goto("https://www.tiktok.com/following");
await page.waitForTimeout(1200);
const b2 = await findBlocked(page);
check(!!b2 && (await b2.textContent("h1")).includes("This app is off"), "under 13: TikTok blocked");

check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
