// Age tiers -> effective settings. A setting listed in `locked` cannot be
// relaxed from the options page while the child's age falls in that tier,
// even with the parent PIN. Parents can always make things *stricter*.
(function (root) {
  const ALL_CATEGORIES = ["selfHarm", "extremism", "hate", "violence", "sexual", "drugs",
    "gambling", "dangerousChallenges", "predatory", "mature"];

  const PLATFORMS = ["tiktok", "snapchat", "instagram", "facebook", "messenger", "threads", "whatsapp", "metaai"];

  // Limits applied whenever the For You / algorithmic feed is switched on.
  // Numbers are ceilings: parents can lower them but never raise them.
  // 0 means "no limit" and is only used for adults.
  const FOR_YOU_LIMITS = {
    under13: { allowed: false },
    "13to15": {
      allowed: true, dailyMinutes: 15, breakEveryMinutes: 5, breakSeconds: 120, maxPostsPerDay: 40,
      hours: { start: "15:00", end: "20:00" }, hideComments: true, hideLiveAndShop: true,
      filterCategories: ALL_CATEGORIES.slice(), filterMode: "remove"
    },
    "16to17": {
      allowed: true, dailyMinutes: 30, breakEveryMinutes: 10, breakSeconds: 60, maxPostsPerDay: 100,
      hours: { start: "07:00", end: "22:00" }, hideComments: true, hideLiveAndShop: true,
      filterCategories: ALL_CATEGORIES.filter(c => c !== "mature"), filterMode: "remove"
    },
    adult: {
      allowed: true, dailyMinutes: 0, breakEveryMinutes: 0, breakSeconds: 60, maxPostsPerDay: 0,
      hours: null, hideComments: false, hideLiveAndShop: false, filterCategories: [], filterMode: "blur"
    }
  };

  const TIERS = [
    {
      id: "under13", maxAge: 12, label: "Under 13",
      settings: {
        blockedPlatforms: PLATFORMS.slice(), // all of these services require 13+
        disableForYou: true, disableExplore: true, disableShortVideo: true, disableLive: true,
        disableSearch: true, hideFriendSuggestions: true, friendAllowlistOnly: true,
        disableDMs: true, hideComments: true, disableStories: true, filterCategories: ALL_CATEGORIES.slice(),
        filterMode: "remove", dailyMinutes: 0, bedtime: { start: "20:00", end: "07:00" }
      },
      locked: ["blockedPlatforms", "disableForYou", "disableExplore", "disableShortVideo", "disableLive",
        "disableSearch", "hideFriendSuggestions", "friendAllowlistOnly", "disableDMs", "hideComments",
        "filterCategories", "filterMode"]
    },
    {
      id: "13to15", maxAge: 15, label: "13 – 15",
      settings: {
        blockedPlatforms: ["metaai"],
        disableForYou: true, disableExplore: true, disableShortVideo: false, disableLive: true,
        disableSearch: true, hideFriendSuggestions: true, friendAllowlistOnly: true,
        disableDMs: false, hideComments: true, disableStories: false, filterCategories: ALL_CATEGORIES.slice(),
        filterMode: "remove", dailyMinutes: 60, bedtime: { start: "21:30", end: "07:00" }
      },
      locked: ["disableExplore", "disableLive", "hideFriendSuggestions",
        "friendAllowlistOnly", "filterCategories:selfHarm", "filterCategories:extremism",
        "filterCategories:hate", "filterCategories:violence", "filterCategories:sexual",
        "filterCategories:drugs", "filterCategories:gambling", "filterCategories:dangerousChallenges",
        "filterCategories:predatory", "filterMode"]
    },
    {
      id: "16to17", maxAge: 17, label: "16 – 17",
      settings: {
        blockedPlatforms: [],
        disableForYou: true, disableExplore: false, disableShortVideo: false, disableLive: true,
        disableSearch: false, hideFriendSuggestions: true, friendAllowlistOnly: false,
        disableDMs: false, hideComments: false, disableStories: false,
        filterCategories: ALL_CATEGORIES.filter(c => c !== "mature"),
        filterMode: "blur", dailyMinutes: 120, bedtime: { start: "23:00", end: "06:00" }
      },
      locked: ["filterCategories:selfHarm", "filterCategories:extremism", "filterCategories:hate",
        "filterCategories:violence", "filterCategories:sexual", "filterCategories:predatory",
        "filterCategories:dangerousChallenges"]
    },
    {
      id: "adult", maxAge: Infinity, label: "18+",
      settings: {
        blockedPlatforms: [], disableForYou: false, disableExplore: false, disableShortVideo: false,
        disableLive: false, disableSearch: false, hideFriendSuggestions: false, friendAllowlistOnly: false,
        disableDMs: false, hideComments: false, disableStories: false,
        filterCategories: ["extremism", "selfHarm", "violence"], filterMode: "blur",
        dailyMinutes: 0, bedtime: null
      },
      locked: []
    }
  ];

  function tierForAge(age) {
    const a = Number(age);
    if (!Number.isFinite(a) || a < 0) return TIERS[0]; // unknown age -> strictest
    return TIERS.find(t => a <= t.maxAge);
  }

  function isLocked(tier, key, value) {
    return tier.locked.includes(key) || (value !== undefined && tier.locked.includes(key + ":" + value));
  }

  function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Accept a numeric override only if it is at least as strict as the ceiling.
  function tighten(ceiling, value) {
    if (!Number.isFinite(value) || value < 0) return ceiling;
    if (ceiling === 0) return value;            // no ceiling (adults)
    if (value === 0) return ceiling;            // "unlimited" not allowed under a ceiling
    return Math.min(value, ceiling);
  }

  function forYouLimits(tier, o) {
    const base = FOR_YOU_LIMITS[tier.id];
    if (!base.allowed) return { allowed: false };
    const out = JSON.parse(JSON.stringify(base));
    const lo = (o && o.forYouLimits) || {};
    out.dailyMinutes = tighten(base.dailyMinutes, lo.dailyMinutes);
    out.breakEveryMinutes = tighten(base.breakEveryMinutes, lo.breakEveryMinutes);
    out.maxPostsPerDay = tighten(base.maxPostsPerDay, lo.maxPostsPerDay);
    if (lo.hours && HHMM.test(lo.hours.start) && HHMM.test(lo.hours.end) && toMinutes(lo.hours.start) < toMinutes(lo.hours.end)) {
      // Custom hours must sit inside the tier's window.
      if (!base.hours || (toMinutes(lo.hours.start) >= toMinutes(base.hours.start) && toMinutes(lo.hours.end) <= toMinutes(base.hours.end))) {
        out.hours = lo.hours;
      }
    }
    return out;
  }

  const STRICTER_BOOLEAN_TRUE = ["disableForYou", "disableExplore", "disableShortVideo", "disableLive",
    "disableSearch", "hideFriendSuggestions", "friendAllowlistOnly", "disableDMs", "hideComments", "disableStories"];

  // Merge parent overrides onto tier defaults, discarding any override that
  // would loosen a locked setting.
  function effectiveSettings(age, overrides) {
    const tier = tierForAge(age);
    const base = JSON.parse(JSON.stringify(tier.settings));
    const o = overrides || {};
    const out = { ...base };

    for (const k of STRICTER_BOOLEAN_TRUE) {
      if (typeof o[k] !== "boolean") continue;
      if (isLocked(tier, k) && base[k] && !o[k]) continue; // cannot loosen
      out[k] = o[k];
    }

    if (Array.isArray(o.filterCategories)) {
      const set = new Set(o.filterCategories.filter(c => ALL_CATEGORIES.includes(c)));
      for (const c of base.filterCategories) if (isLocked(tier, "filterCategories", c) || isLocked(tier, "filterCategories")) set.add(c);
      out.filterCategories = [...set];
    }

    if (Array.isArray(o.blockedPlatforms)) {
      const set = new Set(o.blockedPlatforms.filter(p => PLATFORMS.includes(p)));
      if (isLocked(tier, "blockedPlatforms")) base.blockedPlatforms.forEach(p => set.add(p));
      out.blockedPlatforms = [...set];
    }

    if (o.filterMode === "remove" || o.filterMode === "blur") {
      if (!(isLocked(tier, "filterMode") && base.filterMode === "remove" && o.filterMode === "blur")) out.filterMode = o.filterMode;
    }

    if (Number.isFinite(o.dailyMinutes) && o.dailyMinutes >= 0) {
      // A limit may be tightened, never removed, below 18 (0 = unlimited for adults only).
      if (tier.id === "adult" || (o.dailyMinutes > 0 && (base.dailyMinutes === 0 || o.dailyMinutes <= base.dailyMinutes * 2))) {
        out.dailyMinutes = o.dailyMinutes;
      }
    }
    if (o.bedtime === null && tier.id === "adult") out.bedtime = null;
    else if (o.bedtime && /^\d\d:\d\d$/.test(o.bedtime.start) && /^\d\d:\d\d$/.test(o.bedtime.end)) out.bedtime = o.bedtime;

    out.forYou = forYouLimits(tier, o);
    if (!out.forYou.allowed) out.disableForYou = true;
    out.forYou.enabled = !out.disableForYou;

    out.friendAllowlist = (o.friendAllowlist || []).map(s => String(s).trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
    out.customTerms = (o.customTerms || []).map(String).filter(Boolean);
    out.tier = tier.id;
    out.tierLabel = tier.label;
    return out;
  }

  root.SafeScrollPolicy = { TIERS, FOR_YOU_LIMITS, forYouLimits, PLATFORMS, ALL_CATEGORIES, tierForAge, isLocked, effectiveSettings };
  if (typeof module !== "undefined") module.exports = root.SafeScrollPolicy;
})(typeof globalThis !== "undefined" ? globalThis : this);
