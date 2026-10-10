/* global SafeScrollPolicy, SafeScrollFilters, chrome */
const P = SafeScrollPolicy;
const $ = id => document.getElementById(id);
const PLATFORM_LABELS = { tiktok: "TikTok", snapchat: "Snapchat", instagram: "Instagram", facebook: "Facebook",
  messenger: "Messenger", threads: "Threads", whatsapp: "WhatsApp", metaai: "Meta AI" };
const TOGGLE_LABELS = {
  disableForYou: "Turn off For You / algorithmic feed", disableExplore: "Turn off Explore / Discover",
  disableShortVideo: "Turn off Reels / Spotlight", disableLive: "Turn off LIVE", disableSearch: "Turn off search",
  hideFriendSuggestions: "Hide friend suggestions / Quick Add", friendAllowlistOnly: "Approved accounts only (friending)",
  disableDMs: "Turn off direct messages", hideComments: "Hide comments", disableStories: "Turn off Stories"
};
const SESSION_MS = 10 * 60 * 1000;

async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function show(id) { for (const s of ["pinGate", "setup", "panel"]) $(s).hidden = s !== id; }

async function init() {
  const { pinHash, unlockedUntil } = await chrome.storage.local.get(["pinHash", "unlockedUntil"]);
  if (!pinHash) return show("setup");
  if (unlockedUntil && unlockedUntil > Date.now()) return openPanel();
  show("pinGate");
}

$("setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("newPin").value, b = $("newPin2").value;
  if (!/^\d{6,}$/.test(a)) return ($("setupMsg").textContent = "PIN must be at least 6 digits.");
  if (a !== b) return ($("setupMsg").textContent = "PINs don't match.");
  const salt = crypto.randomUUID();
  await chrome.storage.local.set({ pinSalt: salt, pinHash: await hashPin(a, salt), age: Number($("setupAge").value),
    overrides: {}, unlockedUntil: Date.now() + SESSION_MS });
  openPanel();
});

let failed = 0;
$("unlockForm").addEventListener("submit", async e => {
  e.preventDefault();
  const { pinHash, pinSalt, lockoutUntil = 0 } = await chrome.storage.local.get(["pinHash", "pinSalt", "lockoutUntil"]);
  if (lockoutUntil > Date.now()) return ($("unlockMsg").textContent = "Too many attempts. Try again later.");
  if (await hashPin($("unlockPin").value, pinSalt) === pinHash) {
    failed = 0;
    await chrome.storage.local.set({ unlockedUntil: Date.now() + SESSION_MS });
    return openPanel();
  }
  failed++;
  $("unlockPin").value = "";
  if (failed >= 5) {
    await chrome.storage.local.set({ lockoutUntil: Date.now() + 15 * 60 * 1000 });
    failed = 0;
    $("unlockMsg").textContent = "Wrong PIN. Locked for 15 minutes.";
  } else $("unlockMsg").textContent = "Wrong PIN.";
});

function check(container, key, value, label, checked, locked) {
  const l = document.createElement("label");
  const i = document.createElement("input");
  i.type = "checkbox"; i.dataset.key = key; if (value) i.dataset.value = value;
  i.checked = checked;
  // A locked + checked box cannot be unchecked. Locked + unchecked is still allowed to be turned on.
  if (locked && checked) i.disabled = true;
  if (locked) l.className = "locked";
  l.append(i, " " + label);
  container.append(l);
}

async function render() {
  const { age, overrides = {}, usage = {} } = await chrome.storage.local.get(["age", "overrides", "usage"]);
  const tier = P.tierForAge(age);
  const cfg = P.effectiveSettings(age, overrides);
  $("age").value = age;
  $("tierBadge").textContent = "Rules: " + tier.label;

  $("platforms").replaceChildren();
  for (const p of P.PLATFORMS) {
    const blocked = cfg.blockedPlatforms.includes(p);
    check($("platforms"), "blockedPlatforms", p, "Block " + PLATFORM_LABELS[p], blocked,
      P.isLocked(tier, "blockedPlatforms") && tier.settings.blockedPlatforms.includes(p));
  }
  $("toggles").replaceChildren();
  for (const [k, label] of Object.entries(TOGGLE_LABELS)) {
    check($("toggles"), k, null, label, cfg[k], P.isLocked(tier, k) && tier.settings[k]);
  }
  $("categories").replaceChildren();
  for (const c of P.ALL_CATEGORIES) {
    check($("categories"), "filterCategories", c, SafeScrollFilters.CATEGORIES[c].label, cfg.filterCategories.includes(c),
      (P.isLocked(tier, "filterCategories") || P.isLocked(tier, "filterCategories", c)) && tier.settings.filterCategories.includes(c));
  }
  $("filterMode").value = cfg.filterMode;
  $("filterMode").querySelector('[value="blur"]').disabled = P.isLocked(tier, "filterMode") && tier.settings.filterMode === "remove";
  $("customTerms").value = cfg.customTerms.join("\n");
  $("friendAllowlist").value = cfg.friendAllowlist.join("\n");
  $("dailyMinutes").value = cfg.dailyMinutes;
  $("bedStart").value = cfg.bedtime ? cfg.bedtime.start : "";
  $("bedEnd").value = cfg.bedtime ? cfg.bedtime.end : "";
  $("usage").textContent = `Used today: ${Math.round(usage[new Date().toISOString().slice(0, 10)] || 0)} min`;
}

async function openPanel() { show("panel"); await render(); }

$("age").addEventListener("change", async () => {
  const { unlockedUntil } = await chrome.storage.local.get("unlockedUntil");
  if (!unlockedUntil || unlockedUntil < Date.now()) { show("pinGate"); return; }
  await chrome.storage.local.set({ age: Number($("age").value) });
  render();
});

$("save").addEventListener("click", async () => {
  const { unlockedUntil } = await chrome.storage.local.get("unlockedUntil");
  if (!unlockedUntil || unlockedUntil < Date.now()) { show("pinGate"); return; }
  const o = { blockedPlatforms: [], filterCategories: [] };
  document.querySelectorAll("input[type=checkbox]").forEach(i => {
    if (i.dataset.value) { if (i.checked) o[i.dataset.key].push(i.dataset.value); }
    else o[i.dataset.key] = i.checked;
  });
  o.filterMode = $("filterMode").value;
  o.customTerms = $("customTerms").value.split("\n").map(s => s.trim()).filter(Boolean);
  o.friendAllowlist = $("friendAllowlist").value.split("\n").map(s => s.trim()).filter(Boolean);
  o.dailyMinutes = Number($("dailyMinutes").value);
  o.bedtime = $("bedStart").value && $("bedEnd").value ? { start: $("bedStart").value, end: $("bedEnd").value } : null;
  await chrome.storage.local.set({ overrides: o, age: Number($("age").value), unlockedUntil: Date.now() + SESSION_MS });
  $("saveMsg").textContent = "Saved. Locked rules for this age were kept on.";
  render();
});

$("lock").addEventListener("click", async () => { await chrome.storage.local.set({ unlockedUntil: 0 }); show("pinGate"); });
$("changePin").addEventListener("click", async () => {
  const pin = prompt("New PIN (6+ digits)");
  if (!pin || !/^\d{6,}$/.test(pin)) return;
  const salt = crypto.randomUUID();
  await chrome.storage.local.set({ pinSalt: salt, pinHash: await hashPin(pin, salt) });
  $("saveMsg").textContent = "PIN changed.";
});

init();
