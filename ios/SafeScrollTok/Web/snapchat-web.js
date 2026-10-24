// Snapchat's web app (web.snapchat.com) and its log-in pages are loaded as a desktop browser, because
// Snapchat only lets desktop browsers in. This runs before Snapchat's own code and finishes the job:
// the page also reads as a laptop (screen size, no touch screen), and in the "phone" layout it is laid
// out at the phone's width so it works like an app instead of a shrunken desktop page.
// Runs in the page's own world; does nothing on other sites.
(function () {
  if (window.top !== window) return;
  if (window.__safescrollSnapSticky) {
    if (!/(^|\.)snapchat\.com$/.test(location.hostname)) return;
  } else {
    if (!/^(web|accounts)\.snapchat\.com$|^www\.snapchat\.com$/.test(location.hostname)) return;
    if (location.hostname === "www.snapchat.com" && !location.pathname.startsWith("/web")) return;
  }
  const layout = window.__safescrollSnapLayout || "phone";

  const define = (obj, key, get) => { try { Object.defineProperty(obj, key, { get, configurable: true }); } catch (e) { /* leave it */ } };
  define(Navigator.prototype, "platform", () => "MacIntel");
  define(Navigator.prototype, "maxTouchPoints", () => 0);
  // A laptop-sized screen, and no touch screen.
  define(Screen.prototype, "width", () => 1440);
  define(Screen.prototype, "height", () => 900);
  define(Screen.prototype, "availWidth", () => 1440);
  define(Screen.prototype, "availHeight", () => 875);
  for (const target of [window, Document.prototype, HTMLElement.prototype, Window.prototype]) {
    for (const key of ["ontouchstart", "ontouchend", "ontouchmove", "ontouchcancel"]) {
      try { delete target[key]; } catch (e) { /* leave it */ }
    }
  }
  const realMatchMedia = window.matchMedia.bind(window);
  const desktopAnswers = [
    [/\(\s*pointer\s*:\s*coarse\s*\)|\(\s*hover\s*:\s*none\s*\)|\(\s*any-pointer\s*:\s*coarse\s*\)/, false],
    [/\(\s*pointer\s*:\s*fine\s*\)|\(\s*hover\s*:\s*hover\s*\)|\(\s*any-pointer\s*:\s*fine\s*\)/, true]
  ];
  window.matchMedia = function (query) {
    const result = realMatchMedia(query);
    for (const [re, answer] of desktopAnswers) {
      if (re.test(String(query))) {
        return new Proxy(result, { get: (t, k) => k === "matches" ? answer : (typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
      }
    }
    return result;
  };

  webAppSupport();

  if (layout === "phone") {
    const PHONE = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
    let viewport = PHONE;
    const applyViewport = () => {
      const head = document.head;
      if (!head) return;
      let meta = document.getElementById("safescroll-viewport");
      for (const m of head.querySelectorAll('meta[name="viewport"]')) if (m !== meta) m.remove();
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        meta.id = "safescroll-viewport";
        head.prepend(meta);
      }
      if (meta.content !== viewport) meta.content = viewport;
    };

    // Keep our viewport in charge if Snapchat adds its own.
    const watchHead = new MutationObserver(applyViewport);
    const waitForHead = new MutationObserver(() => {
      if (!document.head) return;
      waitForHead.disconnect();
      applyViewport();
      watchHead.observe(document.head, { childList: true });
    });
    if (document.head) { applyViewport(); watchHead.observe(document.head, { childList: true }); }
    else waitForHead.observe(document.documentElement || document, { childList: true, subtree: true });

    // Some screens may have a fixed desktop width. If one doesn't fit, show the whole screen scaled to
    // the phone (pinch to zoom) rather than cutting part of it off.
    const fitWideScreens = () => {
      if (viewport !== PHONE) return;
      const wide = document.documentElement.scrollWidth;
      if (wide > innerWidth + 40) {
        viewport = `width=${Math.min(wide, 1280)}, viewport-fit=cover`;
        applyViewport();
      }
    };
    addEventListener("load", () => setTimeout(fitWideScreens, 1500));
    setTimeout(fitWideScreens, 8000);
  }

  // Text sized for a phone, and no sideways wobble.
  const style = document.createElement("style");
  style.textContent = "html{-webkit-text-size-adjust:100%;overflow-x:hidden}";
  (function add() {
    const root = document.head || document.documentElement;
    if (root) root.appendChild(style); else setTimeout(add, 10);
  })();

  // Desktop Safari has notifications and service workers; the iPhone's in-app browser doesn't. Snapchat's
  // web app expects them, so give it harmless stand-ins (notifications stay off). If it still fails,
  // show what went wrong so it can be fixed.
  function webAppSupport() {
    if (location.hostname === "web.snapchat.com") standIns();
    recordProblems();
  }

  function standIns() {
    if (!("Notification" in window)) {
      const Stub = function Notification() { throw new TypeError("Notifications are off in SafeTok"); };
      Stub.permission = "denied";
      Stub.requestPermission = cb => { if (typeof cb === "function") cb("denied"); return Promise.resolve("denied"); };
      window.Notification = Stub;
    }
    if (!navigator.serviceWorker) {
      const sw = {
        controller: null,
        ready: new Promise(() => {}),
        register: () => Promise.reject(new DOMException("Service workers are off in SafeTok", "NotSupportedError")),
        getRegistration: () => Promise.resolve(undefined),
        getRegistrations: () => Promise.resolve([]),
        startMessages() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
      };
      define(Navigator.prototype, "serviceWorker", () => sw);
    }
    if (navigator.permissions && navigator.permissions.query) {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = desc => query(desc).catch(err => {
        if (desc && /notifications|push|persistent-storage|clipboard/.test(desc.name)) return { state: "denied", onchange: null, addEventListener() {}, removeEventListener() {} };
        throw err;
      });
    }
  }

  function recordProblems() {
    // Record what goes wrong while the web app starts, so a failure can be fixed. Addresses are kept
    // without their ?query part (which can hold sign-in tokens).
    const errors = [];
    const note = msg => { const m = String(msg).slice(0, 240); if (m && errors[errors.length - 1] !== m) errors.push(m); if (errors.length > 14) errors.shift(); };
    const where = url => { try { const u = new URL(url, location.href); return u.host + u.pathname; } catch { return String(url).split("?")[0]; } };
    addEventListener("error", e => note((e.message || (e.target && (e.target.src || e.target.href) ? "Couldn't load " + where(e.target.src || e.target.href) : "error")) +
      (e.filename ? " @ " + e.filename.split("/").pop().split("?")[0] + ":" + e.lineno : "")), true);
    addEventListener("unhandledrejection", e => note("Promise: " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
    const consoleError = console.error;
    console.error = function (...args) { note("console: " + args.map(a => (a && (a.message || a.stack)) || String(a)).join(" ")); return consoleError.apply(this, args); };
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input && input.url;
      return realFetch.apply(this, arguments).then(res => { if (res.status >= 400) note(`fetch ${res.status} ${where(url)}`); return res; },
        err => { note(`fetch failed ${where(url)}: ${err && err.message}`); throw err; });
    };
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.addEventListener("loadend", () => { if (this.status === 0 || this.status >= 400) note(`xhr ${this.status || "failed"} ${where(url)}`); });
      return xhrOpen.apply(this, arguments);
    };
    const swRegister = navigator.serviceWorker && navigator.serviceWorker.register;
    if (swRegister) navigator.serviceWorker.register = function (url) { note("service worker requested: " + where(url)); return swRegister.apply(this, arguments); };

    function report() {
      const missing = ["WebAssembly", "SharedArrayBuffer", "OffscreenCanvas", "VideoDecoder", "VideoEncoder", "AudioDecoder",
        "MediaRecorder", "RTCPeerConnection", "indexedDB", "BroadcastChannel", "CompressionStream", "WebGL2RenderingContext", "PushManager"]
        .filter(k => !(k in window));
      if (!(navigator.locks)) missing.push("navigator.locks");
      if (!window.crossOriginIsolated) missing.push("crossOriginIsolated");
      const page = ((document.body && document.body.innerText) || "").match(/error id:?\s*\S+|version:?\s*\S+/gi) || [];
      return [
        "SafeTok Snapchat report",
        "Page: " + where(location.href) + (page.length ? " · " + page.join(" · ") : ""),
        "Browser: " + navigator.userAgent.replace(/^Mozilla\/5\.0 /, "") + " · layout " + layout,
        "Missing: " + (missing.join(", ") || "none"),
        ...(errors.length ? errors : ["No errors were recorded."])
      ];
    }

    // SafeTok's "Copy page report" (settings menu) reads this.
    Object.defineProperty(window, "__safetokReport", { value: report });

    let shown = false;
    setInterval(() => {
      if (shown || !document.body || !/something went wrong|error id/i.test(document.body.textContent || "")) return;
      shown = true;
      const lines = report();
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147483647";
      const shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `<style>
        .p{font:13px/1.4 -apple-system,system-ui,sans-serif;background:rgba(20,18,23,.95);color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
        b{display:block;font-size:14px;margin-bottom:4px} ul{margin:6px 0 10px;padding-left:16px;max-height:34vh;overflow:auto;font:11px/1.35 ui-monospace,Menlo,monospace;color:#d6d3dc;word-break:break-word;-webkit-user-select:text;user-select:text}
        .r{display:flex;flex-wrap:wrap;gap:8px} button{font:600 13px -apple-system,system-ui;border:0;border-radius:99px;padding:8px 14px}
        .a{background:#fe2c55;color:#fff} .c{background:#3a3640;color:#fff}</style>
        <div class="p"><b>SafeTok: Snapchat hit a problem</b>Tap Copy details and paste them to Claude to get this fixed.
        <ul>${lines.map(m => `<li>${m.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</li>`).join("")}</ul>
        <div class="r"><button class="a" id="copy">Copy details</button><button class="c" id="again">Try again</button>
        <button class="c" id="mobile">Snapchat home</button><button class="c" id="close">Close</button></div></div>`;
      shadow.getElementById("copy").onclick = e => {
        const text = report().join("\n");
        const done = () => { e.target.textContent = "Copied ✓"; };
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(done, () => { const ta = document.createElement("textarea"); ta.value = text; shadow.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (err) { /* select manually */ } ta.remove(); });
      };
      shadow.getElementById("again").onclick = () => location.reload();
      shadow.getElementById("mobile").onclick = () => { location.href = "https://www.snapchat.com/"; };
      shadow.getElementById("close").onclick = () => host.remove();
      document.documentElement.appendChild(host);
    }, 1500);
  }
})();
