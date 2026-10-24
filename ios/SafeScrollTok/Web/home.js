/* global SafeScrollPolicy, SafeScrollIcons, chrome */
(async () => {
  const { icon, hydrate } = SafeScrollIcons;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date().toISOString().slice(0, 10);

  // Each service's own sign-in and sign-up pages. They open inside the app with the filters on;
  // you type your details into the service's own form.
  const ACCOUNT_PAGES = {
    TikTok: { signIn: "https://www.tiktok.com/login", create: "https://www.tiktok.com/signup" },
    // Snapchat's log-in continues to its web app (chats and snaps); signed in already, it goes straight there.
    Snapchat: { signIn: "https://accounts.snapchat.com/accounts/v2/login?continue=https%3A%2F%2Fweb.snapchat.com%2F", create: "https://accounts.snapchat.com/accounts/signup" }
  };

  async function render() {
    const { age, overrides, region, fypUsage = {} } = await chrome.storage.local.get(["age", "overrides", "region", "fypUsage"]);
    const cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides, region);
    const fy = cfg.forYou;
    const used = (fypUsage[today] || {}).minutes || 0;

    let fySub = "Turned off in Settings";
    if (!fy.allowed) fySub = "Not available at this age";
    else if (fy.enabled) {
      const parts = [];
      if (fy.dailyMinutes) parts.push(`${Math.max(0, Math.round(fy.dailyMinutes - used))} min left today`);
      if (fy.hours) parts.push(`open ${fy.hours.start}–${fy.hours.end}`);
      fySub = parts.join(" · ") || "No limits";
    }
    const tile = (href, ic, title, sub, on = true) =>
      `<a class="tile ${on ? "" : "off"}" href="${href}"><div class="ti">${icon(ic)}</div><div><b>${title}</b><span>${esc(sub)}</span></div><div class="go">›</div></a>`;
    const account = service => cfg.accountsAllowed
      ? `<div class="acct"><a class="btn primary" href="${ACCOUNT_PAGES[service].signIn}">Sign in</a>` +
        `<a class="btn ghost" href="${ACCOUNT_PAGES[service].create}">Create an account</a></div>`
      : `<div class="locked">${icon("lock")}<span>Where you live, ${service} accounts start at ${cfg.minAccountAge}, so sign in and sign up are off. Public videos still play.</span></div>`;

    document.getElementById("sub").textContent = cfg.accountsAllowed ? `${cfg.tierLabel} rules` : `${cfg.tierLabel} rules · watching without an account`;

    // TikTok
    document.getElementById("tiles").innerHTML =
      tile("https://www.tiktok.com/foryou", "play", "For You", fySub, fy.enabled) +
      (cfg.accountsAllowed ? tile("https://www.tiktok.com/following", "users", "Following", "Accounts you follow") : "");
    document.getElementById("tiktokAccount").innerHTML = account("TikTok");
    const list = cfg.friendAllowlist;
    document.getElementById("creators").innerHTML = list.length
      ? list.map(u => `<a class="creator" href="https://www.tiktok.com/@${encodeURIComponent(u)}"><i>${esc(u[0].toUpperCase())}</i><span>@${esc(u)}</span></a>`).join("")
      : `<div class="empty" style="grid-column:1/-1">No creators yet. Add usernames under Friends in Settings (the cog, top right).</div>`;

    // Snapchat: its home page always opens; Spotlight follows the For You switch.
    const snapOn = !cfg.blockedPlatforms.includes("snapchat");
    document.getElementById("snap").hidden = !snapOn;
    if (snapOn) {
      // With chat allowed, Snapchat opens its full web app (chats, snaps, stories), laid out for the phone.
      const chat = cfg.accountsAllowed && !cfg.disableDMs;
      document.getElementById("snapTiles").innerHTML =
        (chat ? tile(ACCOUNT_PAGES.Snapchat.signIn, "users", "Open Snapchat", "Chats, snaps and stories")
              : tile("https://www.snapchat.com/", "grid", "Open Snapchat", cfg.accountsAllowed ? "Snapchat's home page · chat is off in Settings" : "Snapchat's home page and public profiles")) +
        tile("https://www.snapchat.com/spotlight", "play", "Spotlight", fy.enabled ? fySub : (fy.allowed ? "Turned off in Settings" : "Not available at this age"), fy.enabled);
      document.getElementById("snapAccount").innerHTML = account("Snapchat");
      const snapList = cfg.snapAllowlist;
      document.getElementById("snapCreators").innerHTML = snapList.length
        ? snapList.map(u => `<a class="creator" href="https://www.snapchat.com/add/${encodeURIComponent(u)}"><i>${esc(u[0].toUpperCase())}</i><span>@${esc(u)}</span></a>`).join("")
        : `<div class="empty" style="grid-column:1/-1">No Snapchat accounts yet. Add them under Friends in Settings.</div>`;
    }
    hydrate();
  }

  chrome.storage.onChanged.addListener(render);
  render();
})();
