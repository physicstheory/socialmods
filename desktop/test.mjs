// Drives the real desktop app (Electron) with Playwright against stand-in pages.
import { _electron as electron } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, "..", "docs", "screenshots", "desktop");
fs.mkdirSync(shots, { recursive: true });
const userData = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "ssp-"));
let failures = 0;
const check = (ok, m) => { console.log((ok ? "PASS " : "FAIL ") + m); if (!ok) failures++; };

// Run as if it's midday, so bedtime / For You hours don't depend on when the tests run.
const daytimeTZ = (() => { let off = 12 - new Date().getUTCHours(); if (off > 14) off -= 24; if (off < -12) off += 24; return off >= 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`; })();
const app = await electron.launch({
  executablePath: path.join(here, "node_modules/electron/dist/electron"),
  args: [here, `--user-data-dir=${userData}`, "--no-sandbox"],
  env: { ...process.env, TZ: daytimeTZ, SAFESCROLL_TEST_ROUTES: path.join(here, "test-routes.js") }
});
const win = await app.firstWindow();
const errors = [];
win.on("pageerror", e => errors.push(e.message));
await win.waitForLoadState("load");
await win.waitForTimeout(1500);
const frames = () => win.frames().filter(f => f.url() === "about:srcdoc");
async function find(sel) { for (const f of frames()) if (await f.$(sel).catch(() => null)) return f; return null; }

let f = await find("#setup:not([hidden])");
check(!!f, "first launch opens SafeScroll setup");
await win.screenshot({ path: path.join(shots, "1-setup.png") });
await f.fill("#newPin", "123456"); await f.fill("#newPin2", "123456"); await f.fill("#setupAge", "14");
await f.selectOption("#setupRegion", "AU");
await f.click("#setupForm button");
await f.waitForSelector("#panel:not([hidden])");
await win.screenshot({ path: path.join(shots, "2-settings.png") });
const size = await win.evaluate(() => [innerWidth, innerHeight]);
await Promise.all([win.waitForEvent("load"), win.mouse.click(size[0] - 30, 24)]);
await win.waitForTimeout(1500);
check(win.url().endsWith("/following"), "For You off at 14 → Following (" + win.url() + ")");
const shown = await win.$$eval('[data-e2e="recommend-list-item-container"]', els => els.filter(e => getComputedStyle(e).display !== "none").length);
check(shown === 2, "harmful post removed");
check(await win.evaluate(() => getComputedStyle(document.documentElement).visibility === "visible"), "page visible (not stuck hidden)");
check(await win.$eval('[data-e2e="top-login-button"]', e => getComputedStyle(e).display === "none"), "Log in hidden (14, Australia)");
check(await win.evaluate(() => !!document.getElementById("safescroll-cog")), "settings cog shown");
await win.waitForTimeout(1000);
await win.screenshot({ path: path.join(shots, "3-feed.png") });
const prefs = JSON.parse(fs.readFileSync(path.join(userData, "safescroll-storage.json"), "utf8"));
check(JSON.parse(prefs["safescroll.storage.v1"]).age === 14, "settings saved to disk");
check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await app.close();
console.log(failures ? `${failures} failure(s)` : "All checks passed");
process.exit(failures ? 1 : 0);
