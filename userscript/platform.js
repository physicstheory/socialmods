// SafeScroll for Safari (Userscripts app): storage, settings and blocked-screen overlays.
// Runs before the shared extension code; SETTINGS_HTML and BLOCKED_HTML are filled in by build.mjs.
const STORE = "safescroll.storage.v1";
const readStore = async () => { try { return JSON.parse(await GM.getValue(STORE, "{}")) || {}; } catch { return {}; } };
let data = await readStore();
const listeners = [];
const settingsFrames = new Set();

// While settings are open, page rules aren't re-applied (that could navigate away
// mid-edit). Closing settings reloads the page once if anything changed.
let settingsOpen = false;
let changedWhileOpen = false;

function emit(changes) {
  for (const f of settingsFrames) { try { f.contentWindow.postMessage({ safescroll: "changed", changes }, "*"); } catch {} }
  if (settingsOpen) {
    if (Object.keys(changes).some(k => k !== "usage" && k !== "fypUsage" && k !== "unlockedUntil")) changedWhileOpen = true;
    return;
  }
  for (const fn of listeners) { try { fn(changes, "local"); } catch (e) { console.error(e); } }
}

function pick(keys) {
  if (keys == null) return JSON.parse(JSON.stringify(data));
  const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
  const out = Array.isArray(keys) || typeof keys === "string" ? {} : { ...keys };
  for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
  return out;
}

async function setItems(items) {
  data = await readStore(); // another tab may have written since
  const changes = {};
  for (const [k, v] of Object.entries(JSON.parse(JSON.stringify(items)))) {
    changes[k] = { oldValue: data[k], newValue: v };
    data[k] = v;
  }
  await GM.setValue(STORE, JSON.stringify(data));
  emit(changes);
}

async function removeItems(keys) {
  data = await readStore();
  const changes = {};
  for (const k of [].concat(keys)) if (k in data) { changes[k] = { oldValue: data[k] }; delete data[k]; }
  await GM.setValue(STORE, JSON.stringify(data));
  emit(changes);
}

globalThis.chrome = {
  storage: {
    local: { get: async keys => pick(keys), set: setItems, remove: removeItems },
    onChanged: { addListener: fn => listeners.push(fn) }
  },
  runtime: { getURL: p => p, openOptionsPage: () => openSettings(), onInstalled: { addListener() {} }, onStartup: { addListener() {} } }
};

// ---------- Overlays (closed shadow roots so the site's CSS and scripts can't restyle them) ----------
function overlayHost(id, z) {
  const host = document.createElement("div");
  host.id = id;
  host.style.cssText = `all:initial;position:fixed;inset:0;z-index:${z};visibility:visible!important;display:block`;
  (document.documentElement || document).appendChild(host);
  return { host, root: host.attachShadow({ mode: "closed" }) };
}

const FRAME_CSS = `
  .wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#f5f6f8}
  .bar{display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;
       background:#fff;border-bottom:1px solid #e3e6eb;font:600 16px -apple-system,system-ui,sans-serif;color:#0f172a}
  .bar button{border:0;background:none;color:#2563eb;font:600 16px -apple-system,system-ui,sans-serif;padding:4px}
  iframe{flex:1;border:0;width:100%;background:#f5f6f8}
  @media (prefers-color-scheme:dark){.wrap,iframe{background:#0d1117}.bar{background:#161b22;border-color:#2a313c;color:#e6edf3}.bar button{color:#4c8dff}}`;

function openSettings() {
  if (document.getElementById("safescroll-settings")) return;
  const { host, root } = overlayHost("safescroll-settings", 2147483647);
  settingsOpen = true;
  changedWhileOpen = false;
  root.innerHTML = `<style>${FRAME_CSS}</style><div class="wrap"><div class="bar"><span>SafeScroll settings</span><button type="button">Done</button></div><iframe title="SafeScroll settings"></iframe></div>`;
  const frame = root.querySelector("iframe");
  settingsFrames.add(frame);
  frame.srcdoc = SETTINGS_HTML;
  const onMessage = async e => {
    if (e.source !== frame.contentWindow || !e.data || e.data.safescroll !== "call") return;
    const { id, op, arg } = e.data;
    let result = null;
    if (op === "get") result = pick(arg);
    else if (op === "set") await setItems(arg);
    else if (op === "remove") await removeItems(arg);
    frame.contentWindow.postMessage({ safescroll: "reply", id, result }, "*");
  };
  addEventListener("message", onMessage);
  root.querySelector("button").onclick = () => {
    removeEventListener("message", onMessage);
    settingsFrames.delete(frame);
    host.remove();
    settingsOpen = false;
    if (changedWhileOpen) location.reload();
  };
}

let blockedShown = false;
globalThis.SafeScrollPlatform = {
  userscript: true,
  showBlocked(reason, siteId, back) {
    if (blockedShown) return;
    blockedShown = true;
    const { root } = overlayHost("safescroll-blocked", 2147483646);
    const params = new URLSearchParams({ reason, site: siteId, back: back || "" }).toString();
    root.innerHTML = `<style>iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#f5f6f8}</style><iframe title="Paused by SafeScroll"></iframe>`;
    root.querySelector("iframe").srcdoc = BLOCKED_HTML.replace("__PARAMS__", JSON.stringify(params));
    // Keep everything underneath silent and still.
    const hush = () => document.querySelectorAll("video,audio").forEach(m => { try { m.pause(); m.muted = true; } catch {} });
    hush();
    setInterval(hush, 500);
  }
};

// ---------- Settings cog, top right ----------
function addCog() {
  if (document.getElementById("safescroll-cog") || !document.body) return;
  const host = document.createElement("div");
  host.id = "safescroll-cog";
  host.style.cssText = "all:initial;position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:10px;z-index:2147483645;visibility:visible!important";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>button{width:34px;height:34px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;
      background:rgba(40,40,46,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
      svg{width:18px;height:18px;fill:none;stroke:#e5e7eb;stroke-width:2}</style>
    <button type="button" aria-label="SafeScroll settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`;
  root.querySelector("button").onclick = openSettings;
  document.documentElement.appendChild(host);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addCog); else addCog();
setInterval(addCog, 2000); // sites sometimes wipe the page; put it back

// First visit before setup: open settings straight away so a parent can set the PIN, age and country.
if (!data.pinHash) {
  const first = () => openSettings();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", first); else first();
}
