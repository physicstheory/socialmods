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
    // On www.snapchat.com: the web app, plus pages SafeTok opened as the desktop site (people links).
    if (location.hostname === "www.snapchat.com" && !location.pathname.startsWith("/web") && !/Macintosh/.test(navigator.userAgent)) return;
  }
  const layout = window.__safescrollSnapLayout || "phone";
  // The web app itself: web.snapchat.com (old address) or www.snapchat.com/web/ (where it lives now).
  const isWebApp = location.hostname === "web.snapchat.com" || (location.hostname === "www.snapchat.com" && location.pathname.startsWith("/web"));
  let panesActive = false;

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
    if (isWebApp) {
      phonePanes(() => { if (viewport !== PHONE) { viewport = PHONE; applyViewport(); } });
      setTimeout(() => { if (!panesActive) fitWideScreens(); }, 10000);
    } else {
      addEventListener("load", () => setTimeout(fitWideScreens, 1500));
      setTimeout(fitWideScreens, 8000);
    }
  }

  // Snapchat's web app puts its columns side by side (chat list, chat, camera). On a phone each column
  // becomes its own full-width screen, like the real app: chats first, the camera one swipe (or the Camera
  // button) away, opening a chat slides to it, and the "‹" tab on the left edge goes back to the list. It works from the page's layout rather than Snapchat's (changing)
  // class names: it looks for the full-screen row whose children stand side by side.
  function phonePanes(onFound) {
    const css = document.createElement("style");
    css.textContent = `
      [data-safetok-panes]{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;
        overflow-x:auto!important;overflow-y:hidden!important;scroll-snap-type:x mandatory;scroll-behavior:smooth;
        width:100vw!important;max-width:100vw!important;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain}
      [data-safetok-panes]::-webkit-scrollbar{display:none}
      [data-safetok-pane]{flex:0 0 100vw!important;width:100vw!important;min-width:100vw!important;max-width:100vw!important;
        scroll-snap-align:start;scroll-snap-stop:always;box-sizing:border-box!important}
      [data-safetok-rail]{flex:0 0 auto!important;scroll-snap-align:none}
      #safetok-back{position:fixed!important;z-index:2147483646!important;top:50%!important;left:0!important;transform:translateY(-50%)!important;
        display:block!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;border:0!important;background:none!important}
      #safetok-tabs{position:fixed!important;z-index:2147483646!important;left:50%!important;transform:translateX(-50%)!important;
        bottom:calc(env(safe-area-inset-bottom) + 10px)!important;display:block!important;width:auto!important;height:auto!important;
        margin:0!important;padding:0!important;border:0!important;background:none!important}
      #safetok-back[hidden],#safetok-tabs[hidden]{display:none!important}`;
    (function add() { const root = document.head || document.documentElement; if (root) root.appendChild(css); else setTimeout(add, 10); })();

    let row = null, panes = [], allPanes = [], cameraPane = null;
    // SafeTok's own controls live in shadow roots, so Snapchat's styles can't change them.
    const back = document.createElement("div");
    back.id = "safetok-back"; back.hidden = true;
    back.attachShadow({ mode: "open" }).innerHTML = `<style>
      button{display:block;width:26px;height:58px;border-radius:0 14px 14px 0;border:0;margin:0;padding:0 2px 0 0;background:rgba(20,18,23,.5);
        color:#fff;font:600 22px/58px -apple-system,system-ui,sans-serif;text-align:center;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}</style>
      <button aria-label="Back to chats">‹</button>`;
    back.addEventListener("click", () => show(0));
    // A small Chats / Camera switcher at the bottom, like the iPhone app's (hidden while you're typing in a chat).
    const tabs = document.createElement("div");
    tabs.id = "safetok-tabs"; tabs.hidden = true;
    const tabsRoot = tabs.attachShadow({ mode: "open" });
    tabsRoot.innerHTML = `<style>
      .bar{display:flex;gap:4px;padding:5px;border-radius:99px;background:rgba(20,18,23,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
        box-shadow:0 6px 20px rgba(0,0,0,.25)}
      button{display:flex;align-items:center;gap:6px;border:0;margin:0;border-radius:99px;padding:9px 16px;background:transparent;
        color:rgba(255,255,255,.8);font:600 14px -apple-system,system-ui,sans-serif;white-space:nowrap}
      button[aria-current="true"]{background:#fffc00;color:#111}
      svg{width:18px;height:18px;flex:none}</style><div class="bar" role="navigation" aria-label="Snapchat">` +
      '<button data-tab="chats"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>Chats</button>' +
      '<button data-tab="camera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>Camera</button></div>';
    tabsRoot.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tab === "chats") show(0);
      else if (cameraPane) show(panes.indexOf(cameraPane));
    });

    // Elements to look inside: skips scripts and SafeTok's own button; wrappers with no size of their own
    // (display: contents, portals) are looked through rather than skipped.
    const kidsOf = el => [...el.children].filter(c => c !== back && c !== tabs && !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/.test(c.tagName));
    const box = el => el.getBoundingClientRect();
    // The biggest element on the page is the app itself; sizes are judged against it, not the viewport
    // (which iOS stretches when a page made for a computer is zoomed out).
    function appBox() {
      let best = null, bestArea = 0;
      (function walk(el, depth) {
        if (!el || depth > 8) return;
        for (const c of kidsOf(el)) {
          const r = box(c), a = area(r);
          if (a > bestArea) { best = r; bestArea = a; }
          walk(c, depth + 1);
        }
      })(document.body, 0);
      return best;
    }
    function find() {
      const app = appBox();
      if (!app || app.height < 100) return null;
      // Height is judged against the app; width against the page (columns can be wider than the screen).
      const ref = { height: app.height, width: Math.min(app.width, document.documentElement.clientWidth || app.width) };
      let found = null;
      (function walk(el, depth) {
        if (found || !el || depth > 18) return;
        for (const c of kidsOf(el)) {
          if (found) return;
          const r = box(c);
          const big = r.height >= ref.height * 0.6 && r.width >= ref.width * 0.85;
          if (big) {
            const kids = kidsOf(c).filter(k => { const kr = box(k); return kr.height > ref.height * 0.5 && kr.width > 40; });
            const lefts = new Set(kids.map(k => Math.round(box(k).left / 8)));
            if (kids.length >= 2 && lefts.size >= 2) { found = { row: c, kids }; return; }
          }
          if (big || area(r) === 0) walk(c, depth + 1);
        }
      })(document.body, 0);
      return found;
    }

    function current() {
      let best = 0, dist = Infinity;
      panes.forEach((p, i) => { const d = Math.abs(p.getBoundingClientRect().left); if (d < dist) { dist = d; best = i; } });
      return best;
    }
    function show(i) {
      const p = panes[Math.max(0, Math.min(i, panes.length - 1))];
      if (p) p.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      setTimeout(update, 450);
    }
    function update() {
      const i = current(), here = panes[i];
      back.hidden = !panes.length || i === 0;
      tabs.hidden = !panes.length || !here || (here !== cameraPane && i !== 0) || !!(here && typing(here) && i !== 0);
      for (const b of tabsRoot.querySelectorAll("button")) {
        b.setAttribute("aria-current", String(b.dataset.tab === "chats" ? i === 0 : here === cameraPane));
      }
    }

    // Narrow icon bars stay as they are; every other column becomes a full-width screen.
    function classify(kids) {
      allPanes = [];
      for (const k of kids) {
        if (k.hasAttribute("data-safetok-rail") || (!k.hasAttribute("data-safetok-pane") && k.getBoundingClientRect().width <= 96)) k.setAttribute("data-safetok-rail", "");
        else { k.setAttribute("data-safetok-pane", ""); allPanes.push(k); }
      }
      panes = allPanes.slice();
    }
    // The columns in the row now (Snapchat adds one for some screens, like adding friends).
    function columnsNow() {
      const h = row.getBoundingClientRect().height;
      return kidsOf(row).filter(k => k.hasAttribute("data-safetok-pane") || k.hasAttribute("data-safetok-rail") ||
        (k.getBoundingClientRect().height > h * 0.5 && k.getBoundingClientRect().width > 40));
    }

    function setUp(found) {
      row = found.row;
      row.setAttribute("data-safetok-panes", "");
      classify(found.kids);
      if (panes.length < 2) { row.removeAttribute("data-safetok-panes"); row = null; return; }
      panesActive = true;
      if (onFound) onFound();
      row.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
      if (!back.isConnected) (document.body || document.documentElement).appendChild(back);
      if (!tabs.isConnected) (document.body || document.documentElement).appendChild(tabs);
      row.scrollLeft = 0;
      update();
    }

    // Opening a chat in the list slides to it: when the address changes, or the chat column changes
    // just after a tap in the list.
    let lastPath = location.pathname;
    const onRoute = () => {
      if (location.pathname === lastPath) return;
      const deeper = location.pathname.length > lastPath.length;
      lastPath = location.pathname;
      if (row && deeper && current() === 0) setTimeout(() => { tidy(); show(1); }, 200);
    };
    for (const m of ["pushState", "replaceState"]) {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); setTimeout(onRoute, 0); return r; };
    }
    addEventListener("popstate", () => { lastPath = location.pathname; if (row) show(0); });
    document.addEventListener("click", e => {
      if (!row || !panes[0] || !panes[0].contains(e.target) || current() !== 0) return;
      if (e.target.closest("input,textarea,[contenteditable='true'],[role='searchbox']")) return;
      if (!e.target.closest("a,button,li,[role='button'],[role='listitem'],[role='row'],[role='link'],[tabindex]")) return;
      const next = allPanes[allPanes.indexOf(panes[0]) + 1];
      if (!next) return;
      const watch = new MutationObserver(() => { watch.disconnect(); setTimeout(() => { tidy(); show(1); }, 150); });
      watch.observe(next, { childList: true, subtree: true, characterData: true });
      setTimeout(() => watch.disconnect(), 1200);
    }, true);

    // Snapchat's web app shows a big live camera in the middle; on the phone it's hidden and the chat
    // list stays the main screen. (Snaps and videos in chats still play: only the live camera goes.)
    // Pop-ups and welcome screens made for a computer are fitted to the phone's width.
    const area = r => r.width * r.height;
    // Somewhere to type (a chat box, or the search on the add-friends screen) means a real screen.
    const typing = el => el.querySelector("textarea,[contenteditable='true'],input[type='text'],input[type='search'],input:not([type]),[role='searchbox'],[role='textbox']");
    function tidy() {
      // A column Snapchat added (for example adding friends) becomes a screen too, and opens.
      if (row && row.isConnected) {
        const cols = columnsNow();
        const added = cols.filter(k => !k.hasAttribute("data-safetok-pane") && !k.hasAttribute("data-safetok-rail"));
        if (added.length || cols.length !== allPanes.length + kidsOf(row).filter(k => k.hasAttribute("data-safetok-rail")).length) {
          classify(cols);
          const fresh = added.find(k => k.hasAttribute("data-safetok-pane"));
          if (fresh) setTimeout(() => fresh.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" }), 100);
        }
      }
      // Like the iPhone app: chats first, with the camera one swipe (or the Camera button) away. The
      // column showing the camera, or Snapchat's "Click the Camera to send Snaps" prompt, is the camera.
      if (allPanes.length) {
        panes = allPanes.slice();
        const live = p => [...p.querySelectorAll("video")].some(v => typeof MediaStream !== "undefined" && v.srcObject instanceof MediaStream);
        cameraPane = panes.find(p => !typing(p) && (live(p) || /click the camera to send snaps/i.test(p.innerText || ""))) || panes[1] || null;
        update();
      }
      const vw = document.documentElement.clientWidth;
      // Pop-ups, plus floating welcome/onboarding screens that aren't marked as pop-ups.
      const floating = document.body ? [...document.body.querySelectorAll(":scope > *, :scope > * > *")]
        .filter(el => /fixed|absolute/.test(getComputedStyle(el).position)) : [];
      for (const d of new Set([...document.querySelectorAll("[role='dialog'],[role='alertdialog'],dialog,[aria-modal='true']"), ...floating])) {
        if (d === back || d === tabs || d.hasAttribute("data-safetok-panes") || d.getBoundingClientRect().width <= vw + 2) continue;
        d.style.setProperty("width", "calc(100vw - 16px)", "important");
        d.style.setProperty("max-width", "calc(100vw - 16px)", "important");
        d.style.setProperty("min-width", "0", "important");
        d.style.setProperty("box-sizing", "border-box", "important");
        for (const m of d.querySelectorAll("img,video,canvas,svg")) m.style.setProperty("max-width", "100%", "important");
      }
      // Nothing floats past the screen's edges: pop-overs and panels that stick out are pulled inside.
      for (const d of new Set([...document.querySelectorAll("[role='dialog'],[role='menu'],[role='listbox'],[role='tooltip'],dialog,[aria-modal='true']"), ...floating])) {
        if (d === back || d === tabs || d.hasAttribute("data-safetok-panes") || d.closest("[data-safetok-panes]")) continue;
        const r = d.getBoundingClientRect();
        if (r.width === 0 || (r.left >= -1 && r.right <= vw + 1)) continue;
        if (getComputedStyle(d).position === "fixed" || getComputedStyle(d).position === "absolute") {
          d.style.setProperty("left", "8px", "important");
          d.style.setProperty("right", "auto", "important");
          d.style.setProperty("transform", "none", "important");
          d.style.setProperty("max-width", "calc(100vw - 16px)", "important");
        } else {
          d.style.setProperty("max-width", "100%", "important");
        }
      }
    }
    setInterval(tidy, 2000);

    // Find the columns once the app has drawn them, and again if it redraws.
    let pending = false;
    const check = () => {
      pending = false;
      tidy();
      if (row && row.isConnected) return;
      row = null; panes = []; allPanes = []; cameraPane = null; panesActive = false; back.hidden = true; tabs.hidden = true;
      const found = find();
      if (found) setUp(found);
    };
    new MutationObserver(() => { if (!pending) { pending = true; setTimeout(check, 400); } })
      .observe(document, { childList: true, subtree: true });
    addEventListener("resize", () => { if (row) row.scrollLeft = panes[current()] ? panes[current()].offsetLeft : 0; });

    // For "Copy page report": how the page is laid out (sizes and tags only, no text).
    window.__safetokLayout = () => {
      const de = document.documentElement, ref = appBox();
      const out = [`viewport ${de.clientWidth}x${de.clientHeight} inner ${innerWidth}x${innerHeight} page ${de.scrollWidth}x${de.scrollHeight}` +
        (ref ? ` app ${Math.round(ref.width)}x${Math.round(ref.height)}` : "")];
      const min = ref ? area(ref) * 0.02 : 0;
      (function walk(el, depth) {
        if (!el || depth > 7 || out.length > 60) return;
        for (const c of kidsOf(el)) {
          const r = box(c), cs = getComputedStyle(c);
          if (area(r) >= min || cs.display === "contents") {
            const cls = typeof c.className === "string" ? c.className.split(/\s+/)[0].slice(0, 16) : "";
            out.push(`${depth}:${c.tagName.toLowerCase()}${cls ? "." + cls : ""} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
              `${cs.display}${cs.display.includes("flex") ? "/" + cs.flexDirection : ""}${cs.position !== "static" ? " " + cs.position : ""}`);
          }
          if (area(r) >= min || area(r) === 0) walk(c, depth + 1);
        }
      })(document.body, 0);
      return `panes ${panesActive ? panes.length + " of " + allPanes.length : "not found"} | ` + out.join(" | ");
    };
  }

  // Text sized for a phone, and no sideways wobble. Other Snapchat pages opened as the desktop site
  // (profiles, add-friend links) are made to fit the phone's width: nothing wider than the screen.
  const style = document.createElement("style");
  style.textContent = "html{-webkit-text-size-adjust:100%;overflow-x:hidden}" + (isWebApp || location.hostname !== "www.snapchat.com" ? "" :
    "body{max-width:100vw!important;overflow-x:hidden!important}body *{max-width:100%!important;min-width:0!important;box-sizing:border-box!important}" +
    "body [style*='width']{width:auto!important}");
  (function add() {
    const root = document.head || document.documentElement;
    if (root) root.appendChild(style); else setTimeout(add, 10);
  })();

  // Desktop Safari has notifications and service workers; the iPhone's in-app browser doesn't. Snapchat's
  // web app expects them, so give it harmless stand-ins (notifications stay off). If it still fails,
  // show what went wrong so it can be fixed.
  function webAppSupport() {
    // The web app: web.snapchat.com (old address) or www.snapchat.com/web/ (where it lives now).
    if (location.hostname === "web.snapchat.com" || (location.hostname === "www.snapchat.com" && location.pathname.startsWith("/web"))) standIns();
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
      if (!("Notification" in window)) missing.push("Notification");
      else if (window.Notification.name === "Notification" && String(window.Notification).includes("SafeTok")) missing.push("Notification (stand-in)");
      if (!navigator.serviceWorker) missing.push("serviceWorker");
      else if (navigator.serviceWorker.startMessages && !("ServiceWorkerContainer" in window && navigator.serviceWorker instanceof window.ServiceWorkerContainer)) missing.push("serviceWorker (stand-in)");
      if (!window.crossOriginIsolated) missing.push("crossOriginIsolated");
      const page = ((document.body && document.body.innerText) || "").match(/error id:?\s*\S+|version:?\s*\S+/gi) || [];
      return [
        "SafeTok Snapchat report",
        "Page: " + where(location.href) + (page.length ? " · " + page.join(" · ") : ""),
        "Browser: " + navigator.userAgent.replace(/^Mozilla\/5\.0 /, "") + " · layout " + layout,
        "Missing: " + (missing.join(", ") || "none"),
        ...(window.__safetokLayout ? ["Layout: " + window.__safetokLayout()] : []),
        ...(errors.length ? errors : ["No errors were recorded."])
      ];
    }

    // SafeTok's "Copy page report" (settings menu) reads this.
    Object.defineProperty(window, "__safetokReport", { value: report });

    let shown = false;
    setInterval(() => {
      // Only in the web app itself, and only for an error you can actually see on screen.
      if (shown || !isWebApp || !document.body || !/something went wrong|error id:/i.test(document.body.innerText || "")) return;
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
