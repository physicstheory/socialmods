// SafeScroll Preview: TikTok's mobile website in a phone-sized window, with the
// same SafeScroll script as the Safari version (userscript/safescroll.user.js).
const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const START = process.env.SAFESCROLL_START || "https://www.tiktok.com/foryou";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const script = fs.readFileSync(path.join(__dirname, "safescroll.user.js"), "utf8");

// ---------- GM storage (settings, PIN, usage) ----------
const storeFile = () => path.join(app.getPath("userData"), "safescroll-storage.json");
let store = {};
function loadStore() { try { store = JSON.parse(fs.readFileSync(storeFile(), "utf8")); } catch { store = {}; } }
function saveStore() { fs.mkdirSync(path.dirname(storeFile()), { recursive: true }); fs.writeFileSync(storeFile(), JSON.stringify(store)); }
ipcMain.on("userscript-source", e => { e.returnValue = script; });
ipcMain.handle("gm-get", (_e, key, fallback) => (key in store ? store[key] : fallback));
ipcMain.handle("gm-set", (_e, key, value) => { store[key] = value; saveStore(); });

// ---------- Which pages may open (same rules as the iPhone app) ----------
const TIKTOK = ["tiktok.com", "tiktokv.com", "tiktokv.us", "tiktokw.us", "tiktokcdn.com", "tiktokcdn-us.com", "ttwstatic.com", "byteoversea.com", "ibytedtos.com", "snapchat.com", "snap.com"];
const LOGIN = ["appleid.apple.com", "accounts.google.com", "facebook.com", "twitter.com", "x.com", "access.line.me", "kauth.kakao.com", "accounts.kakao.com"];
const matches = (host, list) => list.some(d => host === d || host.endsWith("." + d));
function allowed(url) {
  try {
    const u = new URL(url);
    if (["about:", "data:", "blob:"].includes(u.protocol)) return true;
    if (!/^https?:$/.test(u.protocol)) return false; // tiktok://, snssdk…://, app store links
    return matches(u.hostname, TIKTOK) || matches(u.hostname, LOGIN);
  } catch { return false; }
}

function phoneWindow(opts = {}) {
  const win = new BrowserWindow({
    width: 400, height: 860, minWidth: 340, title: "SafeScroll Preview", backgroundColor: "#000000",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
    ...opts
  });
  const wc = win.webContents;
  wc.setUserAgent(IPHONE_UA);
  // Touch and mobile layout, like the iPhone.
  if (!process.env.SAFESCROLL_TEST_ROUTES) try { // tests drive the window with their own tools
    wc.debugger.attach("1.3");
    wc.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    wc.debugger.sendCommand("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  } catch { /* emulation is a nicety */ }
  wc.on("will-navigate", (e, url) => { if (!allowed(url)) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => {
    if (!allowed(url)) return { action: "deny" };
    // Sign-in windows open inside the app as small windows; TikTok links open in the main window.
    try { if (matches(new URL(url).hostname, LOGIN) || url === "about:blank") return { action: "allow", overrideBrowserWindowOptions: { width: 420, height: 700, parent: win, webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true } } }; } catch {}
    wc.loadURL(url);
    return { action: "deny" };
  });
  return win;
}

function buildMenu(win) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "SafeScroll", submenu: [
      { label: "Back", accelerator: "Alt+Left", click: () => win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
      { label: "For You", click: () => win.loadURL("https://www.tiktok.com/foryou") },
      { label: "Following", click: () => win.loadURL("https://www.tiktok.com/following") },
      { label: "Reload", accelerator: "F5", click: () => win.webContents.reload() },
      { type: "separator" },
      { label: "Reset SafeScroll (PIN, age and all settings)…", click: async () => {
          const r = await dialog.showMessageBox(win, { type: "warning", buttons: ["Cancel", "Reset"], defaultId: 0, message: "Reset SafeScroll on this computer?", detail: "This only affects SafeScroll Preview on this laptop, not the iPhone." });
          if (r.response === 1) { store = {}; saveStore(); win.webContents.reload(); }
        } },
      { type: "separator" },
      { role: "quit" }
    ] }
  ]));
}

if (process.env.SAFESCROLL_TEST_ROUTES) app.disableHardwareAcceleration(); // virtual test screens have no GPU
app.whenReady().then(() => {
  loadStore();
  if (process.env.SAFESCROLL_TEST_ROUTES) require(process.env.SAFESCROLL_TEST_ROUTES)(); // test stand-in pages
  const win = phoneWindow();
  buildMenu(win);
  win.loadURL(START);
});
app.on("window-all-closed", () => app.quit());
