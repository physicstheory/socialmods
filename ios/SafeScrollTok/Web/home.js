/* global SafeScrollPolicy, SafeScrollIcons, chrome */
(async () => {
  const { icon, hydrate } = SafeScrollIcons;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date().toISOString().slice(0, 10);

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

    document.getElementById("sub").textContent = cfg.accountsAllowed ? `${cfg.tierLabel} rules` : `${cfg.tierLabel} rules · watching without an account`;
    document.getElementById("tiles").innerHTML =
      tile("https://www.tiktok.com/foryou", "play", "For You", fySub, fy.enabled) +
      (cfg.accountsAllowed ? tile("https://www.tiktok.com/following", "users", "Following", "Accounts you follow") : "");

    const list = cfg.friendAllowlist;
    document.getElementById("creators").innerHTML = list.length
      ? list.map(u => `<a class="creator" href="https://www.tiktok.com/@${encodeURIComponent(u)}"><i>${esc(u[0].toUpperCase())}</i><span>@${esc(u)}</span></a>`).join("")
      : `<div class="empty" style="grid-column:1/-1">No creators yet. Add usernames under Friends in Settings (the cog, top right).</div>`;

    document.getElementById("note").innerHTML = cfg.accountsAllowed ? "" :
      `${icon("lock")}<span>Where you live, TikTok accounts start at ${cfg.minAccountAge}, so log in and sign up are off. Public videos still play.</span>`;
    hydrate();
  }

  chrome.storage.onChanged.addListener(render);
  render();
})();
