// Snapchat's web app (web.snapchat.com) and its log-in pages are loaded as Safari on a Mac, because
// Snapchat only lets desktop browsers in. This runs before Snapchat's own code and finishes the job:
// the page also reads as a Mac, but is laid out at the phone's width so it looks and works like an app
// instead of a shrunken desktop page. Runs in the page's own world; does nothing on other sites.
(function () {
  if (window.top !== window || !/^(web|accounts)\.snapchat\.com$/.test(location.hostname)) return;

  try {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel", configurable: true });
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 0, configurable: true });
  } catch (e) { /* already defined: leave it */ }

  const PHONE = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
  let viewport = PHONE;

  function applyViewport() {
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
  }

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
  function fitWideScreens() {
    if (viewport !== PHONE) return;
    const wide = document.documentElement.scrollWidth;
    if (wide > innerWidth + 40) {
      viewport = `width=${Math.min(wide, 1280)}, viewport-fit=cover`;
      applyViewport();
    }
  }
  addEventListener("load", () => setTimeout(fitWideScreens, 1500));
  setTimeout(fitWideScreens, 8000);

  // Text and controls sized for a finger, and no sideways wobble.
  const style = document.createElement("style");
  style.textContent = "html{-webkit-text-size-adjust:100%;overflow-x:hidden}";
  (function add() {
    const root = document.head || document.documentElement;
    if (root) root.appendChild(style); else setTimeout(add, 10);
  })();
})();
