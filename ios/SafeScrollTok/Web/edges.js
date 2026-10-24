// Tells the app the colour at the very top and bottom of the page, so the strips
// around the page (under the clock, below the bottom bar) can match it.
(function () {
  if (window.top !== window) return;
  const h = window.webkit && webkit.messageHandlers && webkit.messageHandlers.safescroll;
  if (!h) return;
  const clear = c => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  function colourAt(y) {
    let el = document.elementFromPoint(innerWidth / 2, y);
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      if (!clear(c)) return c;
    }
    const b = getComputedStyle(document.body || document.documentElement).backgroundColor;
    return clear(b) ? "rgb(255, 255, 255)" : b;
  }
  let last = "";
  function sample() {
    if (!document.body) return;
    const top = colourAt(1), bottom = colourAt(innerHeight - 1);
    if (top + bottom !== last) { last = top + bottom; h.postMessage({ op: "edges", top, bottom }); }
  }
  setInterval(sample, 400);
  addEventListener("load", sample);
})();
