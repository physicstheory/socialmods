/* global SafeScrollFilters, SafeScrollPolicy, SafeScrollSites, chrome */
(function () {
  const siteId = SafeScrollSites.siteForHost(location.hostname);
  if (!siteId) return;
  const site = SafeScrollSites.SITES[siteId];
  let cfg = null;
  let matcher = () => null;
  let fypMatcher = () => null;
  let styleEl = null;
  let onFyp = false;
  let fypStreak = 0;          // minutes of continuous For You watching since the last break
  let breakUntil = 0;
  let fyp = { date: "", minutes: 0, posts: 0 };

  // Some engines run document-start scripts before <html> exists; wait for it.
  function whenRoot(fn) {
    if (document.documentElement) return fn();
    const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); fn(); } });
    mo.observe(document, { childList: true });
  }

  // Hide the page until settings load so nothing slips through on first paint.
  const veil = document.createElement("style");
  veil.textContent = "html{visibility:hidden!important}";
  let veilLifted = false;
  whenRoot(() => { if (!veilLifted) (document.head || document.documentElement).appendChild(veil); });
  function liftVeil() { veilLifted = true; veil.remove(); }

  function blockPage(reason) {
    const back = site.safeLanding ? new URL(site.safeLanding, location.href).href : "";
    // Where extension pages can't be opened (the Safari userscript), show the blocked screen as an overlay.
    if (globalThis.SafeScrollPlatform && SafeScrollPlatform.showBlocked) return SafeScrollPlatform.showBlocked(reason, siteId, back);
    const url = chrome.runtime.getURL("blocked/blocked.html") +
      "?reason=" + encodeURIComponent(reason) + "&site=" + encodeURIComponent(siteId) +
      (back ? "&back=" + encodeURIComponent(back) : "");
    location.replace(url);
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function hm(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }

  function inWindow(w) {
    if (!w) return false;
    const n = nowMinutes(), s = hm(w.start), e = hm(w.end);
    return s <= e ? (n >= s && n < e) : (n >= s || n < e);
  }

  async function usedMinutes() {
    const { usage = {} } = await chrome.storage.local.get("usage");
    return usage[today()] || 0;
  }

  function isForYou(url) {
    if (site.forYouRedirect) return !!site.forYouRedirect(url);
    return (site.paths.disableForYou || []).some(re => re.test(url.pathname));
  }

  // Returns a block reason if the limited For You feed has run out, else null.
  function forYouBlockReason() {
    const l = cfg.forYou;
    if (l.hours && !inWindow(l.hours)) return "fypHours";
    if (l.dailyMinutes > 0 && fyp.minutes >= l.dailyMinutes) return "fypTime";
    if (l.maxPostsPerDay > 0 && fyp.posts >= l.maxPostsPerDay) return "fypPosts";
    return null;
  }

  function checkRoute() {
    if (!cfg) return;
    if (cfg.blockedPlatforms.includes(siteId)) return blockPage("platform");
    if (inWindow(cfg.bedtime)) return blockPage("bedtime");
    const url = new URL(location.href);

    onFyp = isForYou(url);
    document.documentElement?.classList.toggle("safescroll-fyp", onFyp && cfg.forYou.enabled);
    if (onFyp) {
      if (!cfg.forYou.enabled) {
        const landing = noAccountHome() || (site.safeLanding && new URL(site.safeLanding, url).href);
        if (landing && !isSamePage(landing, url)) return location.replace(landing);
        return blockPage("disableForYou");
      }
      const reason = forYouBlockReason();
      if (reason) return blockPage(reason);
    }

    for (const [key, hosts] of Object.entries(site.hostRules || {})) {
      if (cfg[key] && hosts.some(re => re.test(url.hostname))) return blockPage(key);
    }

    // Without an account the Following feed is just a log-in prompt; go to the app's own home instead.
    const home = noAccountHome();
    if (home && site.safeLanding && isSamePage(site.safeLanding, url)) return location.replace(home);

    for (const [key, patterns] of Object.entries(site.paths || {})) {
      if (key === "disableForYou" || !cfg[key]) continue;
      if (patterns.some(re => re.test(url.pathname))) return blockPage(key);
    }
  }

  // The iPhone app has its own home page (approved creators) for when no account is allowed.
  function noAccountHome() {
    return cfg.blockAccounts && globalThis.SafeScrollPlatform && SafeScrollPlatform.homeURL || null;
  }

  function isSamePage(target, url) {
    const t = new URL(target, url);
    return t.host === url.host && t.pathname === url.pathname && t.search === url.search;
  }

  function buildCss() {
    const sels = [];
    for (const [key, list] of Object.entries(site.hide || {})) if (cfg[key]) sels.push(...list);
    if (cfg.disableShortVideo) sels.push("video[loop][autoplay]");
    // Extra hiding that only applies while the limited For You feed is open.
    const fypSels = [];
    if (cfg.forYou.enabled && cfg.forYou.hideComments) fypSels.push(...(site.hide.hideComments || []));
    if (cfg.forYou.enabled && cfg.forYou.hideLiveAndShop) fypSels.push(...(site.hide.disableLive || []), ...(site.fypExtraHide || []));
    const valid = s => { try { document.querySelector(s); return true; } catch { return false; } };
    const ok = sels.filter(valid);
    const okFyp = fypSels.filter(valid).map(s => "html.safescroll-fyp " + s);
    return (ok.length ? ok.join(",\n") + "{display:none!important}\n" : "") +
      (okFyp.length ? okFyp.join(",\n") + "{display:none!important}\n" : "") +
      ".safescroll-blur{filter:blur(24px)!important;pointer-events:none!important;user-select:none!important}\n" +
      ".safescroll-removed{display:none!important}\n" +
      ".safescroll-follow-locked{display:none!important}";
  }

  function applyCss() {
    if (!document.documentElement) return whenRoot(applyCss);
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

  // Count a For You post once it is mostly on screen.
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      if (!e.isIntersecting || !onFyp || !cfg.forYou.enabled || el.dataset.safescrollCounted) continue;
      if (el.classList.contains("safescroll-removed") || el.classList.contains("safescroll-blur")) continue;
      el.dataset.safescrollCounted = "1";
      fyp.posts++;
      saveFyp();
      if (forYouBlockReason() === "fypPosts") blockPage("fypPosts");
    }
  }, { threshold: 0.6 });

  function scanPosts(rootNode) {
    if (!cfg) return;
    const strict = onFyp && cfg.forYou.enabled;
    const m = strict ? fypMatcher : matcher;
    const mode = strict ? cfg.forYou.filterMode : cfg.filterMode;
    const nodes = new Set();
    for (const sel of site.posts) {
      try {
        if (rootNode.matches && rootNode.matches(sel)) nodes.add(rootNode);
        (rootNode.querySelectorAll ? rootNode.querySelectorAll(sel) : []).forEach(n => nodes.add(n));
      } catch { /* invalid selector on this engine */ }
    }
    for (const el of nodes) {
      const text = textOf(el);
      const key = (strict ? "f" : "n") + text.length;
      if (el.dataset.safescrollLen === key) continue; // unchanged since last scan
      el.dataset.safescrollLen = key;
      const hit = m(text);
      el.classList.remove("safescroll-blur", "safescroll-removed");
      if (hit) {
        el.classList.add(mode === "remove" ? "safescroll-removed" : "safescroll-blur");
        el.dataset.safescrollReason = hit.category;
        el.querySelectorAll("video").forEach(v => { try { v.pause(); v.muted = true; } catch {} });
      } else if (strict && el.querySelector("video,img")) {
        seen.observe(el);
      }
    }
  }

  function lockFollowButtons() {
    if (!cfg || !(cfg.friendAllowlistOnly || cfg.blockAccounts) || !site.followText.length) return;
    const profile = site.profile(location.pathname);
    // No account allowed: following is impossible, so Follow/Message are hidden everywhere.
    const allowed = !cfg.blockAccounts && (!cfg.friendAllowlistOnly ||
      (profile && (cfg[site.allowlistKey || "friendAllowlist"] || []).includes(decodeURIComponent(profile).toLowerCase())));
    document.querySelectorAll("button,[role='button'],a[role='link']").forEach(b => {
      const label = (b.innerText || b.getAttribute("aria-label") || "").trim();
      if (!label || label.length > 20) return;
      if (site.followText.some(re => re.test(label))) b.classList.toggle("safescroll-follow-locked", !allowed);
    });
  }

  // Full-screen pause that stops the feed for a short break.
  function showBreak(seconds) {
    if (document.getElementById("safescroll-break")) return;
    breakUntil = Date.now() + seconds * 1000;
    const host = document.createElement("div");
    host.id = "safescroll-break";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .wrap{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;
          background:rgba(10,14,22,.82);backdrop-filter:blur(18px);font:16px/1.5 system-ui,sans-serif;color:#fff}
        .card{max-width:340px;margin:16px;padding:32px 28px;border-radius:24px;background:#151b26;text-align:center;
          box-shadow:0 20px 60px rgba(0,0,0,.4)}
        .em{font-size:44px}.t{font-size:22px;font-weight:650;margin:8px 0 4px}.s{color:#aab4c5;font-size:14px}
        .c{font:600 40px ui-monospace,monospace;margin:18px 0 8px;letter-spacing:1px}
        a{display:inline-block;margin-top:10px;color:#8fc1ff;text-decoration:none;font-size:14px}
      </style>
      <div class="wrap"><div class="card"><div class="em">🌿</div>
        <div class="t">Time for a quick break</div>
        <div class="s">You've been on the For You feed for a while. Look away from the screen, stretch, or grab some water.</div>
        <div class="c" id="c"></div>
        ${site.safeLanding ? `<a href="${new URL(site.safeLanding, location.href).href}">Go to Following instead →</a>` : ""}
      </div></div>`;
    document.documentElement.appendChild(host);
    const c = shadow.getElementById("c");
    const tick = () => {
      const left = Math.max(0, Math.ceil((breakUntil - Date.now()) / 1000));
      c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch {} });
      if (left <= 0) { host.remove(); clearInterval(iv); }
    };
    const iv = setInterval(tick, 500);
    tick();
  }

  async function saveFyp() {
    await chrome.storage.local.set({ fypUsage: { [fyp.date]: { minutes: fyp.minutes, posts: fyp.posts } } });
  }

  // Close "open the app" pop-ups (press "Not now") and hide buttons that open the app or sell coins.
  // Without an account allowed, also hide Log in / Sign up buttons.
  const ACCOUNT_BUTTONS = [/^log in$/i, /^sign up$/i, /^log in or sign up$/i, /^sign in$/i];
  function handleNags() {
    const n = site.nags || { hide: [], dismiss: [], dismissWithin: /$^/ };
    // No account allowed: also hide Follow / Add / Chat-style buttons wherever their label sits.
    const hide = cfg.blockAccounts ? [...n.hide, ...ACCOUNT_BUTTONS, ...(site.followText || [])] : n.hide;
    if (!hide.length && !n.dismiss.length) return;
    // Labels can sit in plain divs/spans, so match on text and hide the clickable thing around it.
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      if (!text || text.length > 40 || !hide.some(re => re.test(text))) continue;
      const el = node.parentElement;
      if (!el || el.closest("#safescroll-cog,#safescroll-settings,#safescroll-blocked")) continue;
      const target = el.closest("a,button,[role='button'],[role='link']") ||
        (el.parentElement && el.parentElement !== document.body ? el.parentElement : el);
      target.classList.add("safescroll-removed");
    }
    for (const el of document.querySelectorAll("button,a,[role='button'],[role='link']")) {
      const text = (el.innerText || el.textContent || "").trim();
      if (!text || text.length > 40) continue;
      if (hide.some(re => re.test(text))) { el.classList.add("safescroll-removed"); continue; }
      if (!el.dataset.safescrollNag && n.dismiss.some(re => re.test(text))) {
        for (let box = el.parentElement, i = 0; box && i < 10; box = box.parentElement, i++) {
          if (n.dismissWithin.test(box.innerText || "")) { el.dataset.safescrollNag = "1"; el.click(); break; }
        }
      }
    }
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
      handleNags();
    });
  }

  // Detect SPA navigations.
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; fypStreak = 0; schedule(); } }, 300);

  // Screen-time accounting: one tick per visible 30 seconds.
  setInterval(async () => {
    if (!cfg || document.visibilityState !== "visible") return;
    const { usage = {} } = await chrome.storage.local.get("usage");
    const d = today();
    usage[d] = (usage[d] || 0) + 0.5;
    for (const k of Object.keys(usage)) if (k < new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)) delete usage[k];
    await chrome.storage.local.set({ usage });
    if (cfg.dailyMinutes > 0 && usage[d] >= cfg.dailyMinutes) return blockPage("timelimit");
    if (inWindow(cfg.bedtime)) return blockPage("bedtime");

    if (onFyp && cfg.forYou.enabled && Date.now() > breakUntil) {
      if (fyp.date !== d) fyp = { date: d, minutes: 0, posts: 0 };
      fyp.minutes += 0.5;
      fypStreak += 0.5;
      await saveFyp();
      const reason = forYouBlockReason();
      if (reason) return blockPage(reason);
      if (cfg.forYou.breakEveryMinutes > 0 && fypStreak >= cfg.forYou.breakEveryMinutes) {
        fypStreak = 0;
        showBreak(cfg.forYou.breakSeconds);
      }
    }
  }, 30000);

  async function load() {
    const { age, overrides, region, fypUsage = {} } = await chrome.storage.local.get(["age", "overrides", "region", "fypUsage"]);
    // No setup yet -> strictest tier.
    cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides, region);
    matcher = SafeScrollFilters.buildMatcher(cfg.filterCategories, cfg.customTerms);
    const strictCats = [...new Set([...(cfg.forYou.filterCategories || []), ...cfg.filterCategories])];
    fypMatcher = SafeScrollFilters.buildMatcher(strictCats, cfg.customTerms);
    const d = today();
    fyp = { date: d, minutes: 0, posts: 0, ...(fypUsage[d] || {}) };
    document.querySelectorAll("[data-safescroll-len]").forEach(n => delete n.dataset.safescrollLen);
    applyCss();
    checkRoute();
    if (cfg.dailyMinutes > 0 && (await usedMinutes()) >= cfg.dailyMinutes) return blockPage("timelimit");
    liftVeil();
    schedule();
  }

  whenRoot(() => new MutationObserver(() => { if (cfg) schedule(); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true }));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.age || changes.overrides || changes.region)) load();
  });

  load();
})();
