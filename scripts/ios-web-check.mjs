// Exercises the iPhone app's web layer in Chromium: the chrome.* shim, the
// home page, the settings page and the injected TikTok filters. A fake
// window.webkit.messageHandlers.safescroll stands in for Bridge.swift and
// follows the same rules (only the settings page may change settings).
// Usage: npm i -D playwright && node scripts/ios-web-check.mjs [--shots]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extRoot = path.join(root, "extension"), appRoot = path.join(root, "ios/SafeScrollTok/Web");
const shotsDir = path.join(root, "docs/screenshots");
const shots = process.argv.includes("--shots");
const types = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css" };

// Same URL layout as BundleSchemeHandler: /_app/* → ios/SafeScrollTok/Web, everything else → extension/.
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const [base, rel] = p.startsWith("/_app/") ? [appRoot, p.slice(6)] : [extRoot, p.slice(1)];
  const file = path.join(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(file).slice(1)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

let store = {};
const counterKeys = new Set(["usage", "fypUsage"]);
let failures = 0;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures++; };

// Run as if it's midday, so bedtime / For You hours don't depend on when the tests run.
const daytimeTZ = (() => { let off = 12 - new Date().getUTCHours(); if (off > 14) off -= 24; if (off < -12) off += 24; return off >= 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`; })();
const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: daytimeTZ, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pages = new Set();

// Native side of the bridge.
await ctx.exposeBinding("__nativeBridge", async ({ page }, msg, isSettings) => {
  switch (msg.op) {
    case "get": {
      const k = msg.keys;
      if (k == null) return store;
      const keys = typeof k === "string" ? [k] : Array.isArray(k) ? k : Object.keys(k);
      return Object.fromEntries(keys.filter(x => x in store).map(x => [x, store[x]]));
    }
    case "set": {
      const items = isSettings ? msg.items : Object.fromEntries(Object.entries(msg.items).filter(([x]) => counterKeys.has(x)));
      const changes = {};
      for (const [x, v] of Object.entries(items)) { changes[x] = { oldValue: store[x], newValue: v }; store[x] = v; }
      for (const p of pages) p.evaluate(c => window.__safescrollChanged && window.__safescrollChanged(c), changes).catch(() => {});
      return null;
    }
    case "sha256": {
      const { createHash } = await import("node:crypto");
      return createHash("sha256").update(msg.input).digest("hex");
    }
    default: return null;
  }
});
await ctx.addInitScript(() => {
  const isSettings = location.pathname.startsWith("/options/");
  window.webkit = { messageHandlers: { safescroll: { postMessage: m => window.__nativeBridge(m, isSettings) } } };
});
const track = p => { pages.add(p); p.on("close", () => pages.delete(p)); p.on("pageerror", e => { console.log("page error:", e.message); failures++; }); return p; };

// 1. Settings page through the shim: first-run setup, using the native SHA-256 fallback.
const settings = track(await ctx.newPage());
await settings.addInitScript({ path: path.join(appRoot, "chrome-shim.js") });
await settings.addInitScript(() => { Object.defineProperty(crypto, "subtle", { value: undefined }); }); // like an insecure context
await settings.goto(origin + "/options/options.html");
await settings.waitForSelector("#setup:not([hidden])");
check(await settings.$eval("#setupRegion", s => s.options.length) === 2, "setup offers a country choice");
await settings.fill("#newPin", "123456"); await settings.fill("#newPin2", "123456"); await settings.fill("#setupAge", "14");
await settings.selectOption("#setupRegion", "AU");
if (shots) await settings.screenshot({ path: path.join(shotsDir, "13-app-setup.png") });
await settings.click("#setupForm button");
await settings.waitForSelector("#panel:not([hidden])");
check(/^[0-9a-f]{64}$/.test(store.pinHash || ""), "PIN hashed via native SHA-256 fallback");
check(store.region === "AU" && store.age === 14, "age and country saved");
check((await settings.textContent("#overview")).includes("log in and sign up are off"), "Australia notice shown for a 14-year-old");

// 2. Home page reads settings and lists approved creators.
store.overrides = { ...(store.overrides || {}), friendAllowlist: ["sciencesam", "bakewithmia", "nasa"], disableForYou: false };
const home = track(await ctx.newPage());
await home.goto(origin + "/_app/home.html");
await home.waitForSelector(".chip");
const appHref = name => home.$$eval(".app", (as, n) => { const a = as.find(x => x.querySelector(".name").textContent === n); return a ? (a.getAttribute("href") || "") : null; }, name);
check((await home.$$("#creators .chip")).length === 3, "home lists approved creators");
check(await appHref("TikTok") === "https://www.tiktok.com/foryou", "TikTok opens For You when it's on");
check((await home.textContent("#accounts")).includes("start at 16"), "home explains the under-16 rule");
check(!(await home.$("#accounts a")), "no sign in / sign up under 16 in Australia");
check(await home.evaluate(() => document.getElementById("snapAdd").hidden), "no Snapchat add-friend box under 16 in Australia");
check(await appHref("Snapchat") === "https://www.snapchat.com/", "Snapchat opens from home without an account");
check(await appHref("Instagram") === "" && await appHref("Threads") === "", "Meta apps locked without an account");
if (shots) await home.screenshot({ path: path.join(shotsDir, "14-app-home.png"), fullPage: true });

// 3. Settings changes reach the home page live (onChanged broadcast).
await settings.evaluate(() => chrome.storage.local.set({ region: "default" }));
await home.waitForFunction(() => document.querySelectorAll("#accounts a").length > 0);
check(true, "home updates live when settings change");
check(await home.$$eval("#accounts .row b", bs => bs.map(b => b.textContent).join("|")) === "TikTok|Snapchat|Instagram|Facebook",
  "sign in and create buttons for TikTok, Snapchat, Instagram and Facebook once accounts are allowed");
check(new URL(await appHref("Snapchat")).searchParams.get("continue") === "https://web.snapchat.com/",
  "Open Snapchat goes to Snapchat's full web app once chat is allowed");
check(await appHref("Instagram") === "https://www.instagram.com/", "Instagram opens once accounts are allowed");
check(await home.evaluate(() => !document.getElementById("snapAdd").hidden), "Add a friend on Snapchat box shows once chat is allowed");

// 4. "Jump back in" shows the last page.
await settings.evaluate(() => chrome.storage.local.set({ lastPage: "https://www.tiktok.com/@nasa" }));
await home.waitForFunction(() => !document.getElementById("resumeWrap").hidden);
check((await home.textContent("#resumeTitle")) === "TikTok · @nasa", "Jump back in names the last page");
if (shots) await home.screenshot({ path: path.join(shotsDir, "14b-app-home-accounts.png"), fullPage: true });
await settings.evaluate(() => chrome.storage.local.set({ region: "AU" }));

// Snapchat's web app: reads as a Mac but is laid out at the phone's width.
await ctx.route("https://web.snapchat.com/**", r => r.fulfill({ contentType: "text/html",
  body: `<!doctype html><html><head><meta name="viewport" content="width=1200"></head><body><div id="app">Chats</div></body></html>` }));
const snapWeb = track(await ctx.newPage());
await snapWeb.addInitScript({ path: path.join(appRoot, "snapchat-web.js") });
await snapWeb.goto("https://web.snapchat.com/");
check(await snapWeb.evaluate(() => navigator.platform === "MacIntel" && navigator.maxTouchPoints === 0), "Snapchat web app sees a desktop browser");
check(await snapWeb.evaluate(() => [...document.querySelectorAll('meta[name="viewport"]')].map(m => m.content).join("|")) ===
  "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover", "Snapchat web app laid out at the phone's width");
await snapWeb.close();

// If Snapchat's web app still fails, a details box shows what went wrong.
await ctx.route("https://web.snapchat.com/broken", r => r.fulfill({ contentType: "text/html",
  body: `<!doctype html><html><head></head><body><script>setTimeout(() => { document.body.textContent = "Something went wrong"; null.boom(); }, 50)</script></body></html>` }));
const snapBroken = track(await ctx.newPage());
snapBroken.removeAllListeners("pageerror"); // the test page throws on purpose
await snapBroken.addInitScript({ path: path.join(appRoot, "snapchat-web.js") });
await snapBroken.goto("https://web.snapchat.com/broken");
await snapBroken.waitForFunction(() => [...document.documentElement.children].some(e => e.tagName === "DIV" && e.style.position === "fixed"), null, { timeout: 5000 })
  .then(() => check(true, "Snapchat problem details box appears"), () => check(false, "Snapchat problem details box appears"));
await snapBroken.close();

// The stand-ins also apply where Snapchat's web app lives now, www.snapchat.com/web/.
await ctx.route("https://www.snapchat.com/web/", r => r.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body>Snapchat</body></html>" }));
const snapNew = track(await ctx.newPage());
await snapNew.addInitScript(() => { delete window.Notification; Object.defineProperty(Navigator.prototype, "serviceWorker", { get: () => undefined, configurable: true }); });
await snapNew.addInitScript({ path: path.join(appRoot, "snapchat-web.js") });
await snapNew.goto("https://www.snapchat.com/web/");
check(await snapNew.evaluate(() => Notification.permission === "denied" && typeof navigator.serviceWorker.register === "function"),
  "notification and service worker stand-ins at www.snapchat.com/web/");
await snapNew.close();

// On a phone, the web app's side-by-side columns become full-width screens you swipe between.
await ctx.route("https://www.snapchat.com/web/app", r => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head>
  <style>html,body{margin:0;height:100%}#root{display:flex;height:100vh;width:100vw}nav{width:64px;background:#222}
  #list{min-width:360px;background:#fffbe0;overflow:auto}#chat{flex:1;min-width:500px;background:#eef}#cam{min-width:400px;background:#111}
  li{padding:14px;border-bottom:1px solid #ddd;list-style:none;cursor:pointer}</style></head><body>
  <div style="display:contents"><div id="root"><nav></nav><section id="list"><ul style="margin:0;padding:0">${["Mia", "Sam", "Jo"].map((n, i) =>
    `<li role="button" onclick="history.pushState({}, '', '/web/c${i}'); document.getElementById('chat').textContent = 'Chat with ${n}'">${n}</li>`).join("")}</ul></section>
  <main id="chat"><div>Click the Camera to send Snaps</div></main><aside id="cam"><video id="v" autoplay muted style="width:100%;height:100%"></video></aside></div></div>
  <div role="dialog" id="welcome" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);width:640px;background:#fff;border:1px solid #ccc">Welcome to Snapchat for Web</div>
  <script>const c = document.createElement("canvas"); c.width = 320; c.height = 240; c.getContext("2d").fillRect(0, 0, 320, 240);
  document.getElementById("v").srcObject = c.captureStream();</script></body></html>` }));
const snapPhone = track(await ctx.newPage());
await snapPhone.setViewportSize({ width: 393, height: 852 });
await snapPhone.addInitScript(() => { window.__safescrollSnapLayout = "phone"; });
await snapPhone.addInitScript({ path: path.join(appRoot, "snapchat-web.js") });
await snapPhone.goto("https://www.snapchat.com/web/app");
await snapPhone.waitForSelector("[data-safetok-panes]", { timeout: 5000 }).catch(() => {});
await snapPhone.waitForTimeout(2500); // the camera check runs every 2 s
const widths = await snapPhone.$$eval("[data-safetok-pane]", ps => ps.map(p => Math.round(p.getBoundingClientRect().width)));
check(widths.length === 3 && widths.every(w => w === 393), `each Snapchat column is a full phone screen (${widths.join(", ")})`);
check(await snapPhone.evaluate(() => Math.abs(document.getElementById("list").getBoundingClientRect().left) < 2), "Snapchat opens on the chat list, like the app");
check(await snapPhone.evaluate(() => !document.getElementById("safetok-tabs").hidden), "Chats / Camera switcher shows on the chat list");
if (shots) await snapPhone.screenshot({ path: path.join(shotsDir, "snap-phone-list.png") });
await snapPhone.click("#safetok-tabs [data-tab=camera]");
await snapPhone.waitForFunction(() => Math.abs(document.getElementById("chat").getBoundingClientRect().left) < 2, null, { timeout: 3000 })
  .then(() => check(true, "Camera button opens the camera screen"), () => check(false, "Camera button opens the camera screen"));
if (shots) await snapPhone.screenshot({ path: path.join(shotsDir, "snap-phone-camera.png") });
await snapPhone.click("#safetok-tabs [data-tab=chats]");
await snapPhone.waitForFunction(() => Math.abs(document.getElementById("list").getBoundingClientRect().left) < 2, null, { timeout: 3000 });
check(await snapPhone.evaluate(() => document.getElementById("welcome").getBoundingClientRect().width <= 393), "welcome window fits the phone's width");
await snapPhone.click("li >> text=Sam");
await snapPhone.waitForFunction(() => Math.abs(document.getElementById("chat").getBoundingClientRect().left) < 2, null, { timeout: 3000 })
  .then(() => check(true, "opening a chat slides to it"), () => check(false, "opening a chat slides to it"));
await snapPhone.waitForTimeout(600);
check(await snapPhone.evaluate(() => !document.getElementById("safetok-back").hidden), "back button shows on the chat");
if (shots) await snapPhone.screenshot({ path: path.join(shotsDir, "snap-phone-chat.png") });
await snapPhone.click("#safetok-back");
await snapPhone.waitForFunction(() => Math.abs(document.getElementById("list").getBoundingClientRect().left) < 2, null, { timeout: 3000 })
  .then(() => check(true, "back button returns to the chat list"), () => check(false, "back button returns to the chat list"));
await snapPhone.close();

// Screens Snapchat opens later fit too: adding friends in a new column, adding friends in the middle
// column (with the camera prompt still underneath), and a pop-over hanging off the screen's edge.
await ctx.route("https://www.snapchat.com/web/add", r => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head>
  <style>html,body{margin:0;height:100%}#root{display:flex;height:100vh;width:100vw}#list{min-width:360px}#mid{flex:1;min-width:500px;position:relative}
  .over{position:absolute;inset:0;background:#fff}</style></head><body>
  <div id="root"><section id="list"><button id="addcol">Add friends (column)</button><button id="addmid">Add friends (middle)</button><button id="pop">Menu</button></section>
  <main id="mid"><div>Click the Camera to send Snaps</div></main></div>
  <script>
    addcol.onclick = () => { const s = document.createElement("section"); s.id = "add"; s.style.cssText = "min-width:420px;height:100vh";
      s.innerHTML = '<input type="search" placeholder="Find friends"><p>Quick Add</p>'; document.getElementById("root").appendChild(s); };
    addmid.onclick = () => { const o = document.createElement("div"); o.className = "over"; o.id = "addpanel";
      o.innerHTML = '<input type="search" placeholder="Find friends"><p>' + "Add Friends ".repeat(20) + '</p>'; mid.appendChild(o); };
    pop.onclick = () => { const m = document.createElement("div"); m.id = "menu"; m.setAttribute("role", "menu");
      m.style.cssText = "position:fixed;top:100px;left:300px;width:260px;height:120px;background:#eee"; document.body.appendChild(m); };
  </script></body></html>` }));
const snapAdd = track(await ctx.newPage());
await snapAdd.setViewportSize({ width: 393, height: 852 });
await snapAdd.addInitScript(() => { window.__safescrollSnapLayout = "phone"; });
await snapAdd.addInitScript({ path: path.join(appRoot, "snapchat-web.js") });
await snapAdd.goto("https://www.snapchat.com/web/add");
await snapAdd.waitForTimeout(2500);
check(await snapAdd.evaluate(() => Math.abs(document.getElementById("list").getBoundingClientRect().left) < 2), "starts on the chat list");
await snapAdd.click("#addmid");
await snapAdd.waitForFunction(() => Math.abs(document.getElementById("mid").getBoundingClientRect().left) < 2, null, { timeout: 3000 })
  .then(() => check(true, "adding friends in the middle column slides to it"), () => check(false, "adding friends in the middle column slides to it"));
await snapAdd.click("#safetok-back").catch(() => {});
await snapAdd.waitForTimeout(600);
await snapAdd.click("#addcol");
await snapAdd.waitForTimeout(2600);
const addBox = await snapAdd.evaluate(() => { const r = document.getElementById("add").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.left)]; });
check(addBox[0] === 393 && Math.abs(addBox[1]) < 3, `a new add-friends column becomes a full screen and opens (${addBox})`);
await snapAdd.evaluate(() => document.getElementById("pop").click());
await snapAdd.waitForTimeout(2600);
check(await snapAdd.evaluate(() => document.getElementById("menu").getBoundingClientRect().right <= 393), "pop-overs are kept inside the screen's edges");
await snapAdd.close();
if (shots) await home.screenshot({ path: path.join(shotsDir, "14b-app-home-accounts.png") });
await settings.evaluate(() => chrome.storage.local.set({ region: "AU" }));

// 5. A non-settings page can only write counters, not rules.
await home.evaluate(() => chrome.storage.local.set({ age: 30, pinHash: "x", usage: { d: 1 } }));
check(store.age === 14 && store.pinHash !== "x" && store.usage && store.usage.d === 1, "only counters writable outside settings");

// 5. Injected filters on a mock TikTok page, built exactly like Resources.contentScript.
const bundle = ["../ios/SafeScrollTok/Web/chrome-shim.js", "src/filters.js", "src/policy.js", "src/sites.js", "src/content.js"]
  .map(f => fs.readFileSync(path.join(extRoot, f), "utf8"));
bundle.splice(1, 0, `chrome.runtime.getURL = p => "${origin}/" + p;`); // Chromium can't open safescroll://
await ctx.route("https://www.tiktok.com/**", r => r.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><body>
  <a data-e2e="top-login-button" href="/login">Log in</a>
  <div data-e2e="recommend-list-item-container"><img alt="">cookies #baking</div>
  <div data-e2e="recommend-list-item-container"><img alt="">try the #blackoutchallenge</div></body>` }));
store.fypUsage = {};
const tt = track(await ctx.newPage());
await tt.addInitScript({ content: bundle.join("\n;\n") });
await tt.goto("https://www.tiktok.com/@sciencesam");
await tt.waitForTimeout(800);
const visible = await tt.$$eval('[data-e2e="recommend-list-item-container"]', els => els.filter(e => getComputedStyle(e).display !== "none").length);
check(visible === 1, "harmful post removed inside the app");
check(await tt.$eval('[data-e2e="top-login-button"]', e => getComputedStyle(e).display === "none"), "Log in button hidden under 16 in Australia");
const navs = [];
tt.on("framenavigated", f => { if (f === tt.mainFrame()) navs.push(f.url()); });
await tt.goto("https://www.tiktok.com/login");
let redirected = false;
for (let i = 0; i < 50 && !redirected; i++) { redirected = /blocked\.html\?reason=blockAccounts/.test(tt.url()); if (!redirected) await tt.waitForTimeout(100); }
check(redirected, "login page blocked under 16 in Australia");
if (!redirected) console.log("  navigations:", navs);
await tt.waitForLoadState("load");
if (shots) await tt.screenshot({ path: path.join(shotsDir, "15-app-login-blocked.png") });

// 6. Same child set to 16: login allowed.
store.age = 16;
await tt.goto("https://www.tiktok.com/login");
await tt.waitForTimeout(800);
check(tt.url().startsWith("https://www.tiktok.com/login"), "login allowed at 16");

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
