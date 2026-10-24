/* global SafeScrollPolicy, SafeScrollIcons, chrome */
(async () => {
  const { icon, hydrate } = SafeScrollIcons;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date().toISOString().slice(0, 10);
  const $ = id => document.getElementById(id);

  // Simple app glyphs in each service's colours (drawn for SafeTok, not the services' own logos).
  const GHOST = "M262 470C262 300 372 196 512 196S762 300 762 470V742Q720 812 678 742T595 742 512 742 429 742 345 742 262 742Z";
  const GLYPHS = {
    tiktok: { bg: "#111", svg: `<svg viewBox="0 0 24 24"><g fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M13 4v11.5a3.5 3.5 0 1 1-3-3.46" stroke="#25f4ee" transform="translate(-.8 -.6)"/><path d="M13 4v11.5a3.5 3.5 0 1 1-3-3.46" stroke="#fe2c55" transform="translate(.8 .6)"/><path d="M13 4v11.5a3.5 3.5 0 1 1-3-3.46M13 4c.5 2.6 2.4 4.3 5 4.5" stroke="#fff"/></g></svg>` },
    snapchat: { bg: "#fffc00", svg: `<svg viewBox="230 170 565 680"><path d="${GHOST}" fill="#fff" stroke="#111" stroke-width="42" stroke-linejoin="round"/></svg>` },
    instagram: { bg: "linear-gradient(45deg,#feda75,#fa7e1e 25%,#d62976 50%,#962fbf 75%,#4f5bd5)", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>` },
    threads: { bg: "#111", svg: `<svg viewBox="0 0 24 24"><text x="12" y="17.5" text-anchor="middle" font-family="-apple-system,system-ui" font-weight="700" font-size="17" fill="#fff">@</text></svg>` },
    facebook: { bg: "#1877f2", svg: `<svg viewBox="0 0 24 24"><text x="12.5" y="20" text-anchor="middle" font-family="-apple-system,system-ui" font-weight="800" font-size="21" fill="#fff">f</text></svg>` },
    messenger: { bg: "linear-gradient(45deg,#0695ff,#a334fa 60%,#ff6968)", svg: `<svg viewBox="0 0 24 24"><path d="M12 3.5c-4.9 0-8.5 3.5-8.5 8 0 2.4 1 4.5 2.8 6v3l2.8-1.6c.9.3 1.9.4 2.9.4 4.9 0 8.5-3.5 8.5-8s-3.6-7.8-8.5-7.8z" fill="#fff"/><path d="M6.8 14l3.4-3.5 2 1.6 3-1.6-3.4 3.6-2-1.7z" fill="#7b4dff"/></svg>` }
  };
  const glyph = (id, el) => { const g = GLYPHS[id]; el.style.background = g.bg; el.innerHTML = g.svg; };
  const glyphHTML = (id, extra = "") => `<span class="glyph" style="background:${GLYPHS[id].bg}">${GLYPHS[id].svg}${extra}</span>`;

  const SNAP_SIGN_IN = "https://accounts.snapchat.com/accounts/v2/login?continue=https%3A%2F%2Fweb.snapchat.com%2F";

  function fyText(fy, used) {
    if (!fy.allowed) return "Not available at this age";
    if (!fy.enabled) return "Off in Settings";
    const parts = [];
    if (fy.dailyMinutes) parts.push(`${Math.max(0, Math.round(fy.dailyMinutes - used))} min left`);
    if (fy.hours) parts.push(`${fy.hours.start}–${fy.hours.end}`);
    return parts.join(" · ") || "No limits";
  }

  // Which app and page a saved address belongs to, for "Jump back in".
  function describe(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const h = u.hostname, p = u.pathname;
    if (/(^|\.)tiktok\.com$/.test(h)) {
      const who = p.match(/^\/@([^/]+)/);
      return ["tiktok", "TikTok · " + (who ? "@" + decodeURIComponent(who[1]) : p.startsWith("/following") ? "Following" : p.startsWith("/foryou") || p === "/" ? "For You" : "TikTok")];
    }
    if (h === "web.snapchat.com") return ["snapchat", "Snapchat · Chats"];
    if (/(^|\.)snapchat\.com$/.test(h)) {
      const who = p.match(/^\/add\/([^/]+)/);
      return ["snapchat", "Snapchat · " + (who ? "@" + decodeURIComponent(who[1]) : p.startsWith("/spotlight") ? "Spotlight" : "Home")];
    }
    if (/(^|\.)instagram\.com$/.test(h)) return ["instagram", "Instagram"];
    if (/(^|\.)threads\.(net|com)$/.test(h)) return ["threads", "Threads"];
    if (/(^|\.)facebook\.com$/.test(h)) return p.startsWith("/messages") ? ["messenger", "Messenger"] : ["facebook", "Facebook"];
    if (/(^|\.)messenger\.com$/.test(h)) return ["messenger", "Messenger"];
    return null;
  }

  async function render() {
    const { age, overrides, region, fypUsage = {}, usage = {}, lastPage } =
      await chrome.storage.local.get(["age", "overrides", "region", "fypUsage", "usage", "lastPage"]);
    const cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides, region);
    const fy = cfg.forYou;
    const fyUsed = (fypUsage[today] || {}).minutes || 0;
    const acc = cfg.accountsAllowed;
    const chat = acc && !cfg.disableDMs;
    const blocked = p => cfg.blockedPlatforms.includes(p);
    const noAccount = `Accounts ${cfg.minAccountAge}+`;

    $("rules").textContent = `${cfg.tierLabel} rules${cfg.region === "AU" ? " · Australia" : ""}`;

    // Apps
    const apps = [
      { id: "tiktok", name: "TikTok",
        href: fy.enabled ? "https://www.tiktok.com/foryou" : acc ? "https://www.tiktok.com/following" : "#creators",
        st: fy.enabled ? "For You · " + fyText(fy, fyUsed) : acc ? "Following" : "Approved creators" },
      { id: "snapchat", name: "Snapchat", href: chat ? SNAP_SIGN_IN : "https://www.snapchat.com/",
        st: chat ? "Chats, snaps & stories" : fy.enabled ? "Spotlight & stories" : "Home & profiles" },
      { id: "instagram", name: "Instagram", href: "https://www.instagram.com/", needsAccount: true,
        st: fy.enabled ? "Feed & reels" : "Following feed" },
      { id: "threads", name: "Threads", href: "https://www.threads.com/", needsAccount: true,
        st: fy.enabled ? "For you & following" : "Following feed" },
      { id: "facebook", name: "Facebook", href: "https://m.facebook.com/", needsAccount: true, st: "Feed & groups" },
      { id: "messenger", name: "Messenger", href: "https://www.facebook.com/messages/", needsAccount: true, needsChat: true, st: "Messages" }
    ].filter(a => !blocked(a.id));
    $("apps").innerHTML = apps.map(a => {
      let off = "", st = a.st;
      if (a.needsAccount && !acc) { off = "off"; st = noAccount; }
      else if (a.needsChat && cfg.disableDMs) { off = "off"; st = "Messages off"; }
      const lock = off ? `<span class="lock">${icon("lock")}</span>` : "";
      return `<a class="card app ${off}" ${off ? "" : `href="${a.href}"`}>${glyphHTML(a.id, lock)}<span class="name">${a.name}</span><span class="st">${esc(st)}</span></a>`;
    }).join("");

    // Jump back in
    const last = lastPage && !lastPage.startsWith("safescroll:") ? describe(lastPage) : null;
    $("resumeWrap").hidden = !last || blocked(last[0]);
    if (last) {
      $("resume").href = lastPage;
      glyph(last[0], $("resumeGlyph"));
      $("resumeTitle").textContent = last[1];
    }

    // Today
    const used = usage[today] || 0;
    $("timeUsed").textContent = `${Math.round(used)} min`;
    $("timeBar").style.width = cfg.dailyMinutes ? `${Math.min(100, used / cfg.dailyMinutes * 100)}%` : "0%";
    $("timeSub").textContent = (cfg.dailyMinutes ? `of ${cfg.dailyMinutes} min a day` : "No daily limit") +
      (cfg.bedtime ? ` · bedtime ${cfg.bedtime.start}` : "");
    $("fyLeft").textContent = !fy.allowed ? "Locked" : !fy.enabled ? "Off" : fy.dailyMinutes ? `${Math.max(0, Math.round(fy.dailyMinutes - fyUsed))} min` : "On";
    $("fyBar").style.width = fy.enabled && fy.dailyMinutes ? `${Math.min(100, fyUsed / fy.dailyMinutes * 100)}%` : "0%";
    $("fySub").textContent = !fy.allowed ? "Not available at this age" : !fy.enabled ? "Turn on in Settings" :
      (fy.dailyMinutes ? "left today" : "No daily limit") + (fy.hours ? ` · ${fy.hours.start}–${fy.hours.end}` : "");

    // Accounts: each service's own sign-in and sign-up pages, inside SafeTok. You stay signed in afterwards.
    const rows = [
      { id: "tiktok", name: "TikTok", sub: "Videos, following, inbox", signIn: "https://www.tiktok.com/login", create: "https://www.tiktok.com/signup" },
      { id: "snapchat", name: "Snapchat", sub: "Chats, snaps and stories", signIn: SNAP_SIGN_IN, create: "https://accounts.snapchat.com/accounts/signup" },
      { id: "instagram", name: "Instagram", sub: "Also signs you in to Threads", signIn: "https://www.instagram.com/accounts/login/", create: "https://www.instagram.com/accounts/emailsignup/" },
      { id: "facebook", name: "Facebook", sub: "Also used for Messenger", signIn: "https://m.facebook.com/login/", create: "https://m.facebook.com/reg/" }
    ].filter(r => !blocked(r.id));
    $("accounts").innerHTML = acc
      ? rows.map(r => `<div class="row">${glyphHTML(r.id)}<div class="who"><b>${r.name}</b><span>${r.sub}</span></div>` +
          `<div class="btns"><a class="btn primary" href="${r.signIn}">Sign in</a><a class="btn" href="${r.create}">Create</a></div></div>`).join("")
      : `<div class="locked">${icon("lock")}<span>Where you live, accounts start at ${cfg.minAccountAge}, so signing in and creating accounts are off. Public videos on TikTok and Snapchat still play.</span></div>`;

    // Approved accounts (Settings → Friends)
    const chips = [
      ...cfg.friendAllowlist.map(u => ({ id: "tiktok", u, href: `https://www.tiktok.com/@${encodeURIComponent(u)}` })),
      ...(blocked("snapchat") ? [] : cfg.snapAllowlist.map(u => ({ id: "snapchat", u, href: `https://www.snapchat.com/add/${encodeURIComponent(u)}` })))
    ];
    $("creators").innerHTML = chips.length
      ? chips.map(c => `<a class="chip" href="${c.href}"><i style="background:${c.id === "snapchat" ? "#e6c800" : "#111"}">${esc(c.u[0].toUpperCase())}</i><span>@${esc(c.u)}</span></a>`).join("")
      : `<div class="empty">No approved accounts yet. Add TikTok creators and Snapchat accounts under Friends in Settings (the cog, top right).</div>`;

    $("foot").textContent = "Your family's rules are on in every app. Change them with the cog.";
    hydrate();
  }

  chrome.storage.onChanged.addListener(render);
  render();
})();
