/* global SafeScrollFilters, SafeScrollPolicy, SafeScrollSites, chrome */
(function () {
  const siteId = SafeScrollSites.siteForHost(location.hostname);
  if (!siteId) return;
  const site = SafeScrollSites.SITES[siteId];
  let cfg = null;
  let matcher = () => null;
  let styleEl = null;

  // Hide the page until settings load so nothing slips through on first paint.
  const veil = document.createElement("style");
  veil.textContent = "html{visibility:hidden!important}";
  (document.head || document.documentElement).appendChild(veil);

  function blockPage(reason) {
    const url = chrome.runtime.getURL("blocked/blocked.html") +
      "?reason=" + encodeURIComponent(reason) + "&site=" + encodeURIComponent(siteId);
    location.replace(url);
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function inBedtime(bt) {
    if (!bt) return false;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = bt.start.split(":").map(Number);
    const [eh, em] = bt.end.split(":").map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    return s <= e ? (mins >= s && mins < e) : (mins >= s || mins < e);
  }

  async function usedMinutes() {
    const { usage = {} } = await chrome.storage.local.get("usage");
    return usage[today()] || 0;
  }

  function checkRoute() {
    if (!cfg) return;
    if (cfg.blockedPlatforms.includes(siteId)) return blockPage("platform");
    if (inBedtime(cfg.bedtime)) return blockPage("bedtime");
    const url = new URL(location.href);
    for (const [key, patterns] of Object.entries(site.paths || {})) {
      if (!cfg[key]) continue;
      if (patterns.some(re => re.test(url.pathname))) {
        if (key === "disableForYou" && site.safeLanding && !isSamePage(site.safeLanding, url)) {
          return location.replace(new URL(site.safeLanding, url).href);
        }
        return blockPage(key);
      }
    }
    if (cfg.disableForYou && site.forYouRedirect) {
      const target = site.forYouRedirect(url);
      if (target) return location.replace(new URL(target, url).href);
    }
  }

  function isSamePage(target, url) {
    const t = new URL(target, url);
    return t.host === url.host && t.pathname === url.pathname && t.search === url.search;
  }

  function buildCss() {
    const sels = [];
    for (const [key, list] of Object.entries(site.hide || {})) if (cfg[key]) sels.push(...list);
    if (cfg.disableShortVideo) sels.push("video[loop][autoplay]");
    // Validate each selector individually; one bad selector would kill the whole rule.
    const ok = sels.filter(s => { try { document.querySelector(s); return true; } catch { return false; } });
    return (ok.length ? ok.join(",\n") + "{display:none!important}\n" : "") +
      ".safescroll-blur{filter:blur(24px)!important;pointer-events:none!important;user-select:none!important}\n" +
      ".safescroll-removed{display:none!important}\n" +
      ".safescroll-follow-locked{display:none!important}";
  }

  function applyCss() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "safescroll-style";
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = buildCss();
  }

  function textOf(el) {
    const parts = [el.innerText || el.textContent || ""];
    el.querySelectorAll("img[alt],[aria-label]").forEach(n => parts.push(n.getAttribute("alt") || "", n.getAttribute("aria-label") || ""));
    el.querySelectorAll("a[href*='/tag/'],a[href*='/explore/tags/'],a[href*='hashtag']").forEach(a => parts.push(a.getAttribute("href")));
    return parts.join(" \n ");
  }

  function scanPosts(rootNode) {
    if (!cfg) return;
    const nodes = new Set();
    for (const sel of site.posts) {
      try {
        if (rootNode.matches && rootNode.matches(sel)) nodes.add(rootNode);
        (rootNode.querySelectorAll ? rootNode.querySelectorAll(sel) : []).forEach(n => nodes.add(n));
      } catch { /* invalid selector on this engine */ }
    }
    for (const el of nodes) {
      const text = textOf(el);
      if (el.dataset.safescrollLen === String(text.length)) continue; // unchanged since last scan
      el.dataset.safescrollLen = String(text.length);
      const hit = matcher(text);
      el.classList.remove("safescroll-blur", "safescroll-removed");
      if (hit) {
        el.classList.add(cfg.filterMode === "remove" ? "safescroll-removed" : "safescroll-blur");
        el.dataset.safescrollReason = hit.category;
        // Stop any video in a filtered post.
        el.querySelectorAll("video").forEach(v => { try { v.pause(); v.muted = true; } catch {} });
      }
    }
  }

  function lockFollowButtons() {
    if (!cfg || !cfg.friendAllowlistOnly || !site.followText.length) return;
    const profile = site.profile(location.pathname);
    const allowed = profile && cfg.friendAllowlist.includes(decodeURIComponent(profile).toLowerCase());
    document.querySelectorAll("button,[role='button'],a[role='link']").forEach(b => {
      const label = (b.innerText || b.getAttribute("aria-label") || "").trim();
      if (!label || label.length > 20) return;
      if (site.followText.some(re => re.test(label))) {
        // On allowlisted profiles the buttons work; everywhere else (feeds,
        // search results, suggestion cards) they are hidden.
        b.classList.toggle("safescroll-follow-locked", !allowed);
      }
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      checkRoute();
      scanPosts(document.body || document.documentElement);
      lockFollowButtons();
    });
  }

  // Detect SPA navigations.
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; schedule(); } }, 300);

  // Screen-time accounting: one tick per visible 30 seconds.
  setInterval(async () => {
    if (!cfg || document.visibilityState !== "visible") return;
    const { usage = {} } = await chrome.storage.local.get("usage");
    const d = today();
    usage[d] = (usage[d] || 0) + 0.5;
    for (const k of Object.keys(usage)) if (k < new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)) delete usage[k];
    await chrome.storage.local.set({ usage });
    if (cfg.dailyMinutes > 0 && usage[d] >= cfg.dailyMinutes) blockPage("timelimit");
    if (inBedtime(cfg.bedtime)) blockPage("bedtime");
  }, 30000);

  async function load() {
    const { age, overrides } = await chrome.storage.local.get(["age", "overrides"]);
    // No setup yet -> strictest tier.
    cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides);
    matcher = SafeScrollFilters.buildMatcher(cfg.filterCategories, cfg.customTerms);
    document.querySelectorAll("[data-safescroll-len]").forEach(n => delete n.dataset.safescrollLen);
    applyCss();
    checkRoute();
    if (cfg.dailyMinutes > 0 && (await usedMinutes()) >= cfg.dailyMinutes) return blockPage("timelimit");
    veil.remove();
    schedule();
  }

  new MutationObserver(muts => {
    if (!cfg) return;
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { schedule(); return; }
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.age || changes.overrides)) load();
  });

  load();
})();
