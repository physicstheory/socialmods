// Snapchat's web app (web.snapchat.com) and its log-in pages are loaded as a desktop browser, because
// Snapchat only lets desktop browsers in. This runs before Snapchat's own code and finishes the job:
// the page also reads as a laptop (screen size, no touch screen), and in the "phone" layout it is laid
// out at the phone's width so it works like an app instead of a shrunken desktop page.
// Runs in the page's own world; does nothing on other sites.
(function () {
  if (window.top !== window || !/^(web|accounts)\.snapchat\.com$|^www\.snapchat\.com$/.test(location.hostname)) return;
  if (location.hostname === "www.snapchat.com" && !location.pathname.startsWith("/web")) return;
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
})();
