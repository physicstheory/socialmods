/* global SafeScrollPolicy, SafeScrollFilters, SafeScrollIcons, chrome */
const P = SafeScrollPolicy;
const { icon, hydrate } = SafeScrollIcons;
const $ = id => document.getElementById(id);
const SESSION_MS = 10 * 60 * 1000;

const APPS = {
  tiktok: { name: "TikTok", mark: "Tt", bg: "#111" },
  snapchat: { name: "Snapchat", mark: "S", bg: "#f5d90a", fg: "#111" },
  instagram: { name: "Instagram", mark: "Ig", bg: "linear-gradient(45deg,#f9a825,#e91e63,#7b1fa2)" },
  facebook: { name: "Facebook", mark: "f", bg: "#1877f2" },
  messenger: { name: "Messenger", mark: "M", bg: "linear-gradient(45deg,#0a7cff,#a033ff)" },
  threads: { name: "Threads", mark: "@", bg: "#111" },
  whatsapp: { name: "WhatsApp", mark: "W", bg: "#25d366" },
  metaai: { name: "Meta AI", mark: "AI", bg: "linear-gradient(45deg,#0467df,#7b61ff)" }
};

const FEATURES = {
  disableExplore: ["Turn off Explore & Discover", "Blocks browsing trending pages, hashtags and sounds."],
  disableShortVideo: ["Turn off Reels & Spotlight", "Blocks the endless short-video tabs."],
  disableLive: ["Turn off LIVE", "Blocks watching and joining live streams."],
  disableSearch: ["Turn off search", "Stops searching for accounts, videos and hashtags."],
  hideFriendSuggestions: ["Hide friend suggestions", "Removes Quick Add, People You May Know and Suggested for you."],
  friendAllowlistOnly: ["Approved accounts only", "Follow, Add Friend and Message only work on accounts you approve."],
  disableDMs: ["Turn off messages", "Blocks direct messages, Messenger and WhatsApp Web."],
  hideComments: ["Hide comments", "Hides comment sections everywhere."],
  disableStories: ["Turn off Stories", "Blocks Stories on Instagram, Facebook and Snapchat."]
};

const CATEGORY_DESC = {
  selfHarm: "Suicide, self-harm and pro-eating-disorder content.",
  extremism: "Terrorist, white-supremacist and radicalising content.",
  hate: "Slurs, dehumanising language and pile-on harassment.",
  violence: "Gore, shootings, weapons-making and fight videos.",
  sexual: "Nudity, adult creators and sexual solicitation.",
  drugs: "Drugs, vaping and binge-drinking content.",
  gambling: "Betting, casino streams and get-rich-quick scams.",
  dangerousChallenges: "Blackout, Benadryl and other harmful trends.",
  predatory: "Strangers asking to move chats or keep secrets.",
  mature: "Swearing and adult themes."
};

const TIER_DESC = {
  under13: "All social apps are blocked. TikTok, Snapchat and Meta require users to be 13 or older.",
  "13to15": "Strict. No Explore or LIVE, approved friends only and every safety filter on. For You can be switched on with tight limits.",
  "16to17": "Moderate. Core safety filters stay on. For You can be switched on with limits.",
  adult: "Light. Only extremism, self-harm and gore filters by default. Nothing is locked."
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);

// ---------- State ----------
let saved = null;   // { age, overrides } as stored
let draft = null;   // working copy edited by the UI
let stats = { usage: 0, fyp: { minutes: 0, posts: 0 } };

const clone = o => JSON.parse(JSON.stringify(o));
const isDirty = () => JSON.stringify(saved) !== JSON.stringify(draft);

// ---------- PIN ----------
function newSalt() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const input = salt + ":" + pin;
  // Inside the iPhone app the page may not be a "secure context", so Web Crypto
  // can be missing; the app then hashes natively with the same algorithm.
  if (!(globalThis.crypto && crypto.subtle) && globalThis.SafeScrollNative) return SafeScrollNative.sha256(input);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function show(id) {
  for (const s of ["pinGate", "setup", "panel"]) $(s).hidden = s !== id;
  const f = { pinGate: "unlockPin", setup: "newPin" }[id];
  if (f) setTimeout(() => $(f).focus(), 0);
}

async function stillUnlocked() {
  const { unlockedUntil } = await chrome.storage.local.get("unlockedUntil");
  return unlockedUntil && unlockedUntil > Date.now();
}

async function init() {
  hydrate();
  const { pinHash } = await chrome.storage.local.get("pinHash");
  if (!pinHash) {
    $("setupRegion").innerHTML = regionOptions(P.guessRegion(navigator.language));
    return show("setup");
  }
  if (await stillUnlocked()) return openPanel();
  show("pinGate");
}

$("setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("newPin").value, b = $("newPin2").value, age = Number($("setupAge").value), region = $("setupRegion").value;
  if (!/^\d{6,}$/.test(a)) return ($("setupMsg").textContent = "PIN must be at least 6 digits.");
  if (a !== b) return ($("setupMsg").textContent = "The PINs don't match.");
  if (!Number.isFinite(age) || age < 0 || age > 99) return ($("setupMsg").textContent = "Enter an age between 0 and 99.");
  const salt = newSalt();
  await chrome.storage.local.set({ pinSalt: salt, pinHash: await hashPin(a, salt), age, region, overrides: {}, unlockedUntil: Date.now() + SESSION_MS });
  openPanel();
});

let failed = 0;
$("unlockForm").addEventListener("submit", async e => {
  e.preventDefault();
  const { pinHash, pinSalt, lockoutUntil = 0 } = await chrome.storage.local.get(["pinHash", "pinSalt", "lockoutUntil"]);
  if (lockoutUntil > Date.now()) return ($("unlockMsg").textContent = "Too many attempts. Try again in a few minutes.");
  if (await hashPin($("unlockPin").value, pinSalt) === pinHash) {
    failed = 0;
    $("unlockMsg").textContent = "";
    await chrome.storage.local.set({ unlockedUntil: Date.now() + SESSION_MS });
    return openPanel();
  }
  failed++;
  $("unlockPin").value = "";
  if (failed >= 5) {
    await chrome.storage.local.set({ lockoutUntil: Date.now() + 15 * 60 * 1000 });
    failed = 0;
    $("unlockMsg").textContent = "Wrong PIN. Settings are locked for 15 minutes.";
  } else $("unlockMsg").textContent = `Wrong PIN. ${5 - failed} attempt${5 - failed === 1 ? "" : "s"} left.`;
});

// ---------- Rendering helpers ----------
function lockChip(tier) { return `<span class="lock-chip">${icon("lock")}${tier.id === "under13" ? "Required under 13" : "Required at " + tier.label}</span>`; }

function switchHtml({ id, checked, disabled, label, lg }) {
  return `<span class="switch ${lg ? "lg" : ""}"><input type="checkbox" role="switch" id="${id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} aria-label="${esc(label)}"></span>`;
}

function row({ id, title, desc, checked, locked, tier, lead = "" }) {
  return `<div class="row">${lead}<div class="txt"><div class="t">${esc(title)}${locked ? lockChip(tier) : ""}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ""}</div>
    ${switchHtml({ id, checked, disabled: locked && checked, label: title })}</div>`;
}

function card(id, iconName, title, desc, body, extraHead = "") {
  return `<section class="card" id="${id}"><div class="card-head"><div class="icon-tile">${icon(iconName)}</div>
    <div class="grow"><h2>${title}</h2><p>${desc}</p></div>${extraHead}</div><div class="card-body">${body}</div></section>`;
}

function tagInput(id, items, placeholder, prefix = "") {
  return `<div class="tags" data-tags="${id}">${items.map((t, i) =>
    `<span class="tag">${prefix}${esc(t)}<button type="button" data-remove="${id}" data-i="${i}" aria-label="Remove ${esc(t)}">${icon("x")}</button></span>`).join("")}
    <input type="text" id="tagin-${id}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div>`;
}

const pct = (v, max) => max > 0 ? Math.min(100, Math.round(v / max * 100)) : 0;
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)} min`;

// ---------- Sections ----------
function regionOptions(selected) {
  return Object.entries(P.REGIONS).map(([k, r]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${esc(r.label)}</option>`).join("");
}

function renderOverview(tier, cfg) {
  const scale = P.TIERS.map(t => `<span class="${t.id === tier.id ? "on" : ""}">${t.label}</span>`).join("");
  return card("overview", "user", "Child", "The age decides which rules apply and which are locked.", `
    <div class="overview">
      <div class="stepper"><button type="button" id="ageDown" aria-label="Decrease age">${icon("minus")}</button>
        <input id="age" type="number" min="0" max="99" value="${draft.age}" aria-label="Child's age">
        <button type="button" id="ageUp" aria-label="Increase age">${icon("plus")}</button></div>
      <div class="tier"><div class="name">${tier.label} rules</div><div class="desc">${TIER_DESC[tier.id]}</div>
        <div class="tier-scale">${scale}</div></div>
    </div>
    <div class="row" style="margin-top:14px">
      <div class="txt"><div class="t">Country</div><div class="d">${cfg.accountsAllowed
        ? `Accounts allowed from ${cfg.minAccountAge}. Your child can log in or sign up.`
        : `Accounts start at ${cfg.minAccountAge} here, so log in and sign up are off. Your child can watch public videos without an account.`}</div></div>
      <select id="region" class="select" aria-label="Country">${regionOptions(cfg.region)}</select>
    </div>`);
}

function renderForYou(tier, cfg) {
  const fy = cfg.forYou;
  const ceiling = P.FOR_YOU_LIMITS[tier.id];
  let status, details = "";
  if (!fy.allowed) {
    status = `<div class="fy-status locked">${icon("lock")}<div><b>Locked off for under 13</b>
      <span class="muted">The For You feed can't be turned on at this age. Apps open the Following feed instead.</span></div></div>`;
  } else if (!fy.enabled) {
    status = `<div class="fy-status off">${icon("eyeOff")}<div><b>Off</b>
      <span class="muted">TikTok, Instagram, Facebook and Threads open the Following feed. Snapchat Spotlight is blocked.</span></div></div>`;
  } else {
    const limited = tier.id !== "adult";
    status = `<div class="fy-status on">${icon("play")}<div><b>On${limited ? ` with ${tier.label} limits` : ""}</b>
      <span class="muted">${limited ? "The feed shuts off when any limit below is reached, then the apps open the Following feed." : "No limits by default. You can still add some below."}</span></div></div>`;
    const cap = (v, unit) => v ? `Max ${v} ${unit}` : "No limit";
    const hours = fy.hours || { start: "", end: "" };
    details = `
      <div class="limits">
        <div class="limit"><label for="fyMinutes">Daily time</label><div class="in"><input id="fyMinutes" type="number" min="${ceiling.dailyMinutes ? 1 : 0}" ${ceiling.dailyMinutes ? `max="${ceiling.dailyMinutes}"` : ""} value="${fy.dailyMinutes}"><span class="muted">min</span></div><div class="cap">${cap(ceiling.dailyMinutes, "min")}</div></div>
        <div class="limit"><label for="fyBreak">Break every</label><div class="in"><input id="fyBreak" type="number" min="${ceiling.breakEveryMinutes ? 1 : 0}" ${ceiling.breakEveryMinutes ? `max="${ceiling.breakEveryMinutes}"` : ""} value="${fy.breakEveryMinutes}"><span class="muted">min</span></div><div class="cap">${fy.breakSeconds / 60 >= 1 ? fy.breakSeconds / 60 + "-minute" : fy.breakSeconds + "-second"} pause</div></div>
        <div class="limit"><label for="fyPosts">Posts per day</label><div class="in"><input id="fyPosts" type="number" min="${ceiling.maxPostsPerDay ? 1 : 0}" ${ceiling.maxPostsPerDay ? `max="${ceiling.maxPostsPerDay}"` : ""} value="${fy.maxPostsPerDay}"></div><div class="cap">${cap(ceiling.maxPostsPerDay, "posts")}</div></div>
        <div class="limit hours"><label for="fyStart">Allowed hours</label><div class="in"><input id="fyStart" type="time" value="${hours.start}"><span class="muted">–</span><input id="fyEnd" type="time" value="${hours.end}"></div><div class="cap">${ceiling.hours ? `Within ${ceiling.hours.start}–${ceiling.hours.end}` : "Any time"}</div></div>
      </div>
      <div class="meters">
        <div class="meter"><div class="top"><span>For You time today</span><b>${fmtMin(stats.fyp.minutes)}${fy.dailyMinutes ? " / " + fmtMin(fy.dailyMinutes) : ""}</b></div><div class="bar"><i style="width:${pct(stats.fyp.minutes, fy.dailyMinutes)}%"></i></div></div>
        <div class="meter"><div class="top"><span>Posts seen today</span><b>${stats.fyp.posts}${fy.maxPostsPerDay ? " / " + fy.maxPostsPerDay : ""}</b></div><div class="bar"><i style="width:${pct(stats.fyp.posts, fy.maxPostsPerDay)}%"></i></div></div>
      </div>
      ${limited ? `<div class="subhead">Always on while For You is open</div>
      <div class="chips">
        <span class="chip">${icon("filter")}Strict filters: ${fy.filterCategories.length} categories</span>
        <span class="chip">${icon("check")}Flagged posts removed, not blurred</span>
        ${fy.hideComments ? `<span class="chip">${icon("eyeOff")}Comments hidden</span>` : ""}
        ${fy.hideLiveAndShop ? `<span class="chip">${icon("eyeOff")}LIVE, Shop &amp; ads hidden</span>` : ""}
        <span class="chip">${icon("pause")}Forced breaks</span>
      </div>` : ""}`;
  }
  const head = switchHtml({ id: "fySwitch", checked: fy.enabled, disabled: !fy.allowed, label: "Allow For You feed", lg: true });
  return card("foryou", "play", "For You feed", "The feed the algorithm picks: TikTok For You, Instagram and Facebook home, Threads For You and Snapchat Spotlight.",
    status + details, head);
}

function renderApps(tier, cfg) {
  const lockedAll = P.isLocked(tier, "blockedPlatforms");
  const rows = P.PLATFORMS.map(p => {
    const a = APPS[p];
    const allowed = !cfg.blockedPlatforms.includes(p);
    const locked = lockedAll && tier.settings.blockedPlatforms.includes(p);
    const lead = `<span class="app-badge" style="background:${a.bg};color:${a.fg || "#fff"}">${a.mark}</span>`;
    return `<div class="row">${lead}<div class="txt"><div class="t">${a.name}${locked ? lockChip(tier) : ""}</div>
      <div class="d">${allowed ? "Allowed" : "Blocked"}</div></div>
      ${switchHtml({ id: "app-" + p, checked: allowed, disabled: locked, label: "Allow " + a.name })}</div>`;
  }).join("");
  return card("apps", "grid", "Apps", "Switch an app on to allow it. Blocked apps can't load at all in this browser.", `<div class="rows app-grid">${rows}</div>`);
}

function renderFeatures(tier, cfg) {
  const rows = Object.entries(FEATURES).map(([k, [t, d]]) =>
    row({ id: "feat-" + k, title: t, desc: d, checked: cfg[k], locked: P.isLocked(tier, k) && tier.settings[k], tier })).join("");
  return card("features", "sliders", "Features", "Switch a protection on to turn that part of the apps off.", `<div class="rows">${rows}</div>`);
}

function renderFilters(tier, cfg) {
  const rows = P.ALL_CATEGORIES.map(c => row({
    id: "cat-" + c, title: SafeScrollFilters.CATEGORIES[c].label, desc: CATEGORY_DESC[c],
    checked: cfg.filterCategories.includes(c),
    locked: (P.isLocked(tier, "filterCategories") || P.isLocked(tier, "filterCategories", c)) && tier.settings.filterCategories.includes(c), tier
  })).join("");
  const blurLocked = P.isLocked(tier, "filterMode") && tier.settings.filterMode === "remove";
  const mode = `<div class="seg" role="group" aria-label="Flagged posts">
    <button type="button" data-mode="remove" class="${cfg.filterMode === "remove" ? "on" : ""}">Remove</button>
    <button type="button" data-mode="blur" class="${cfg.filterMode === "blur" ? "on" : ""}" ${blurLocked ? "disabled" : ""}>Blur</button></div>`;
  return card("filters", "filter", "Content filters", "Posts, captions, hashtags and comments that match a category are taken out of the feed.", `
    <div class="rows">${rows}</div>
    <div class="row"><div class="txt"><div class="t">Flagged posts${blurLocked ? lockChip(tier) : ""}</div><div class="d">Remove them completely, or blur them out.</div></div>${mode}</div>
    <div class="subhead">Your own blocked words</div>
    <div style="margin-top:10px">${tagInput("customTerms", cfg.customTerms, "Type a word and press Enter")}</div>
    <p class="hint">Matching is case-insensitive and also catches spellings like 0nlyfans and #joinedwords.</p>`);
}

function renderFriends(tier, cfg) {
  const on = cfg.friendAllowlistOnly;
  return card("friends", "users", "Friends", "Who your child can follow, add or message.", `
    <div class="fy-status ${on ? "on" : "off"}" style="margin-top:0">${icon(on ? "check" : "users")}<div><b>${on ? "Approved accounts only is on" : "Approved accounts only is off"}</b>
      <span class="muted">${on ? "Follow, Add Friend and Message buttons are hidden everywhere except on the accounts below." : "Turn it on under Features to limit friending to this list."}</span></div></div>
    <div class="subhead">Approved accounts</div>
    <div style="margin-top:10px">${tagInput("friendAllowlist", cfg.friendAllowlist, "Add a username, e.g. grandma.jones", "@")}</div>
    <p class="hint">Use the username exactly as it appears in the profile link, such as tiktok.com/@<b>username</b>.</p>`);
}

function renderTime(tier, cfg) {
  const bt = cfg.bedtime || { start: "", end: "" };
  return card("time", "clock", "Screen time", "Shared across every supported app.", `
    <div class="time-grid">
      <div class="limit"><label for="dailyMinutes">Daily limit</label><div class="in"><input id="dailyMinutes" type="number" min="0" value="${cfg.dailyMinutes}"><span class="muted">min</span></div><div class="cap">${tier.id === "adult" ? "0 = no limit" : "Can't be removed under 18"}</div></div>
      <div class="limit"><label for="bedStart">Bedtime starts</label><div class="in"><input id="bedStart" type="time" value="${bt.start}"></div><div class="cap">Apps pause</div></div>
      <div class="limit"><label for="bedEnd">Bedtime ends</label><div class="in"><input id="bedEnd" type="time" value="${bt.end}"></div><div class="cap">Apps resume</div></div>
    </div>
    <div class="meters" style="grid-template-columns:1fr">
      <div class="meter"><div class="top"><span>Used today</span><b>${fmtMin(stats.usage)}${cfg.dailyMinutes ? " / " + fmtMin(cfg.dailyMinutes) : ""}</b></div><div class="bar"><i style="width:${pct(stats.usage, cfg.dailyMinutes)}%"></i></div></div>
    </div>`);
}

function render() {
  const tier = P.tierForAge(draft.age);
  const cfg = P.effectiveSettings(draft.age, draft.overrides, draft.region);
  const y = window.scrollY;
  const focused = document.activeElement && document.activeElement.id;
  $("main").innerHTML = renderOverview(tier, cfg) + renderForYou(tier, cfg) + renderApps(tier, cfg) +
    renderFeatures(tier, cfg) + renderFilters(tier, cfg) + renderFriends(tier, cfg) + renderTime(tier, cfg);
  $("profilePill").innerHTML = `${icon("user")}Age ${esc(draft.age)} · ${tier.label} rules`;
  $("savebar").hidden = !isDirty();
  window.scrollTo(0, y);
  if (focused && $(focused)) $(focused).focus();
  trackNav();
}

// ---------- Editing ----------
// Write the effective value of every setting into the draft so later edits
// start from what the parent actually sees.
function materialize() {
  const cfg = P.effectiveSettings(draft.age, draft.overrides);
  const o = draft.overrides;
  o.blockedPlatforms = cfg.blockedPlatforms.slice();
  o.filterCategories = cfg.filterCategories.slice();
  for (const k of Object.keys(FEATURES)) o[k] = cfg[k];
  o.disableForYou = cfg.disableForYou;
  return cfg;
}

function update(fn) { materialize(); fn(draft.overrides); render(); }

function toggleIn(list, item, on) { const s = new Set(list); on ? s.add(item) : s.delete(item); return [...s]; }

function setAge(n) {
  n = Math.max(0, Math.min(99, Math.round(Number(n))));
  if (!Number.isFinite(n)) return;
  draft.age = n;
  render();
}

const main = $("main");
main.addEventListener("change", e => {
  const t = e.target, id = t.id;
  if (id === "age") return setAge(t.value);
  if (id === "region") { draft.region = t.value; return render(); }
  if (id === "fySwitch") return update(o => { o.disableForYou = !t.checked; });
  if (id.startsWith("app-")) return update(o => { o.blockedPlatforms = toggleIn(o.blockedPlatforms, id.slice(4), !t.checked); });
  if (id.startsWith("feat-")) return update(o => { o[id.slice(5)] = t.checked; });
  if (id.startsWith("cat-")) return update(o => { o.filterCategories = toggleIn(o.filterCategories, id.slice(4), t.checked); });
  if (["fyMinutes", "fyBreak", "fyPosts", "fyStart", "fyEnd"].includes(id)) {
    return update(o => {
      const l = o.forYouLimits = { ...(o.forYouLimits || {}) };
      if (id === "fyMinutes") l.dailyMinutes = Number(t.value);
      if (id === "fyBreak") l.breakEveryMinutes = Number(t.value);
      if (id === "fyPosts") l.maxPostsPerDay = Number(t.value);
      if (id === "fyStart" || id === "fyEnd") l.hours = { start: $("fyStart").value, end: $("fyEnd").value };
    });
  }
  if (id === "dailyMinutes") return update(o => { o.dailyMinutes = Number(t.value); });
  if (id === "bedStart" || id === "bedEnd") {
    return update(o => { o.bedtime = $("bedStart").value && $("bedEnd").value ? { start: $("bedStart").value, end: $("bedEnd").value } : null; });
  }
});

main.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "ageDown") return setAge(draft.age - 1);
  if (b.id === "ageUp") return setAge(draft.age + 1);
  if (b.dataset.mode) return update(o => { o.filterMode = b.dataset.mode; });
  if (b.dataset.remove) {
    const key = b.dataset.remove, i = Number(b.dataset.i);
    return update(o => { o[key] = (P.effectiveSettings(draft.age, draft.overrides)[key] || []).filter((_, j) => j !== i); });
  }
});

main.addEventListener("keydown", e => {
  const t = e.target;
  if (!t.id.startsWith("tagin-")) return;
  const key = t.id.slice(6);
  if ((e.key === "Enter" || e.key === ",") && t.value.trim()) {
    e.preventDefault();
    const value = t.value.trim().replace(/^@/, "");
    update(o => { o[key] = [...new Set([...(P.effectiveSettings(draft.age, draft.overrides)[key] || []), value])]; });
    $(t.id).focus();
  } else if (e.key === "Backspace" && !t.value) {
    update(o => { o[key] = (P.effectiveSettings(draft.age, draft.overrides)[key] || []).slice(0, -1); });
    $(t.id).focus();
  }
});

$("save").addEventListener("click", async () => {
  if (!(await stillUnlocked())) return show("pinGate");
  const before = JSON.stringify(draft.overrides);
  materialize();
  await chrome.storage.local.set({ age: draft.age, region: draft.region, overrides: draft.overrides, unlockedUntil: Date.now() + SESSION_MS });
  saved = clone(draft);
  render();
  toast(before === JSON.stringify(draft.overrides) ? "Saved. The new rules apply right away." : "Saved. Rules that are required at this age were kept on.");
});

$("discard").addEventListener("click", () => { draft = clone(saved); render(); });

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
}

$("lock").addEventListener("click", async () => { await chrome.storage.local.set({ unlockedUntil: 0 }); show("pinGate"); });
$("changePin").addEventListener("click", async () => {
  const pin = prompt("Enter a new parent PIN (6+ digits)");
  if (pin === null) return;
  if (!/^\d{6,}$/.test(pin)) return toast("PIN not changed. It must be at least 6 digits.");
  const salt = newSalt();
  await chrome.storage.local.set({ pinSalt: salt, pinHash: await hashPin(pin, salt) });
  toast("PIN changed.");
});

// Highlight the section in view.
const navIo = new IntersectionObserver(entries => {
  for (const en of entries) if (en.isIntersecting) {
    document.querySelectorAll(".sidenav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
  }
}, { rootMargin: "-90px 0px -60% 0px" });
function trackNav() {
  navIo.disconnect();
  document.querySelectorAll("main .card").forEach(c => navIo.observe(c));
}

async function openPanel() {
  const { age = 0, region = "default", overrides = {}, usage = {}, fypUsage = {} } = await chrome.storage.local.get(["age", "region", "overrides", "usage", "fypUsage"]);
  saved = { age, region, overrides };
  draft = clone(saved);
  stats = { usage: usage[today()] || 0, fyp: { minutes: 0, posts: 0, ...(fypUsage[today()] || {}) } };
  show("panel");
  render();
}

window.addEventListener("beforeunload", e => { if (draft && isDirty()) e.preventDefault(); });

init();
