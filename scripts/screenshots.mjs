// Regenerates docs/screenshots using the real extension in Chromium.
// Usage: npm i -D playwright && node scripts/screenshots.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ext = path.join(root, "extension");
const out = path.join(root, "docs/screenshots") + "/";
const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const base = `chrome-extension://${id}/`;
const store = v => sw.evaluate(v => chrome.storage.local.set(v), v);
const today = new Date().toISOString().slice(0, 10);
const errors = [];

const page = await ctx.newPage();
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
for (const p of ctx.pages()) if (p !== page) await p.close();  // onInstalled opens options

// 1. Setup
await page.goto(base + "options/options.html");
await page.waitForSelector("#setup:not([hidden])");
await page.screenshot({ path: out + "01-setup.png" });

await page.fill("#newPin", "123456"); await page.fill("#newPin2", "123456"); await page.fill("#setupAge", "14");
await page.click("#setupForm button");
await page.waitForSelector("#panel:not([hidden])");

await store({ usage: { [today]: 34 }, fypUsage: { [today]: { minutes: 6, posts: 17 } },
  overrides: { friendAllowlist: ["grandma.jones", "alex_cousin", "coach.rivera"], customTerms: ["looksmaxxing", "sigma grindset"] } });
await page.reload(); await page.waitForSelector("#foryou");

// 2. Turn For You on (shows unsaved-changes bar)
await page.click("#fySwitch");
await page.waitForSelector(".limits");
await page.screenshot({ path: out + "02-dashboard-foryou-on.png" });
await page.click("#save");
await page.waitForSelector("#toast:not([hidden])");
await page.waitForSelector("#toast", { state: "hidden", timeout: 6000 });
await page.locator("#foryou").screenshot({ path: out + "03-foryou-limits-13-15.png" });

// 3. Full page
await page.screenshot({ path: out + "04-full-dashboard.png", fullPage: true });

// 4. Under 13: For You locked
await page.fill("#age", "10"); await page.press("#age", "Tab");
await page.waitForSelector(".fy-status.locked");
await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById("savebar").hidden = true; });
await page.screenshot({ path: out + "05-under-13-locked.png" });
await page.evaluate(() => { document.getElementById("savebar").hidden = false; });
await page.click("#discard");

// 5. Off state for 16-17 + dark mode
await page.emulateMedia({ colorScheme: "dark" });
await page.fill("#age", "16"); await page.press("#age", "Tab");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: out + "06-dark-16-17.png" });
await page.click("#discard");
await page.emulateMedia({ colorScheme: "light" });

// 6. Mobile width
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.getElementById("foryou").scrollIntoView());
await page.evaluate(() => window.scrollBy(0, -70));
await page.screenshot({ path: out + "07-mobile.png" });
await page.setViewportSize({ width: 1280, height: 860 });

// 7. PIN gate
await page.click("#lock");
await page.waitForSelector("#pinGate:not([hidden])");
await page.fill("#unlockPin", "000000"); await page.click("#unlockForm button");
await page.waitForFunction(() => document.getElementById("unlockMsg").textContent);
await page.screenshot({ path: out + "08-pin-lock.png" });

// 8. Popup
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 320, height: 330 });
await pop.goto(base + "popup/popup.html");
await pop.waitForTimeout(300);
await pop.screenshot({ path: out + "09-popup.png", clip: { x: 0, y: 0, width: 320, height: await pop.evaluate(() => document.body.scrollHeight) } });
await pop.close();

// 9. Blocked page after For You time runs out
const blk = await ctx.newPage();
await blk.setViewportSize({ width: 1280, height: 760 });
await blk.goto(base + "blocked/blocked.html?reason=fypTime&site=tiktok&back=" + encodeURIComponent("https://www.tiktok.com/following"));
await blk.waitForSelector("#back:not([hidden])");
await blk.waitForTimeout(300);
await blk.screenshot({ path: out + "10-foryou-time-up.png" });
await blk.close();

// 10. Live demo on a mock feed: filtered post removed + forced break
await ctx.route("https://www.tiktok.com/**", r => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><title>Demo feed</title>
<style>body{margin:0;background:#111;color:#fff;font:15px system-ui}.top{padding:14px 20px;background:#000;font-weight:700}
.feed{display:flex;gap:16px;padding:20px;flex-wrap:wrap}[data-e2e="recommend-list-item-container"]{width:260px;height:420px;border-radius:14px;padding:14px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;background:linear-gradient(160deg,#334,#112)}
img{display:none}</style></head><body><div class="top">Demo For You feed (mock page)</div><div class="feed">
<div data-e2e="recommend-list-item-container"><img alt="">@bakewithmia · 3 ingredient cookies 🍪 #baking</div>
<div data-e2e="recommend-list-item-container"><img alt="">@stuntkid · trying the #blackoutchallenge 😵</div>
<div data-e2e="recommend-list-item-container"><img alt="">@sciencesam · elephant toothpaste experiment #stem</div>
<div data-e2e="recommend-list-item-container"><img alt="">@puppyclips · golden retriever meets snow ❄️</div>
</div></body></html>` }));
await store({ age: 17, overrides: { disableForYou: false, forYouLimits: { breakEveryMinutes: 1 } }, fypUsage: {} });
const demo = await ctx.newPage();
await demo.setViewportSize({ width: 1180, height: 520 });
await demo.goto("https://www.tiktok.com/foryou");
await demo.waitForTimeout(1500);
const visible = await demo.$$eval('[data-e2e="recommend-list-item-container"]', els => els.filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent.trim()));
console.log("visible posts:", visible);
await demo.screenshot({ path: out + "11-filter-demo.png" });
await demo.waitForSelector("#safescroll-break", { state: "attached", timeout: 80000 });
await demo.waitForTimeout(600);
await demo.screenshot({ path: out + "12-break-overlay.png" });

console.log("errors:", errors);
await ctx.close();
