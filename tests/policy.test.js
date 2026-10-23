const test = require("node:test");
const assert = require("node:assert");
const P = require("../extension/src/policy.js");
const F = require("../extension/src/filters.js");

test("unknown age falls back to strictest tier", () => {
  assert.equal(P.tierForAge(undefined).id, "under13");
  assert.equal(P.tierForAge(-3).id, "under13");
});

test("tiers by age", () => {
  assert.equal(P.tierForAge(10).id, "under13");
  assert.equal(P.tierForAge(13).id, "13to15");
  assert.equal(P.tierForAge(17).id, "16to17");
  assert.equal(P.tierForAge(30).id, "adult");
});

test("locked toggles cannot be loosened", () => {
  const c = P.effectiveSettings(14, { disableExplore: false, hideFriendSuggestions: false, disableDMs: true });
  assert.equal(c.disableExplore, true);
  assert.equal(c.hideFriendSuggestions, true);
  assert.equal(c.disableDMs, true, "tightening allowed");
});

test("under-13 keeps every platform blocked", () => {
  const c = P.effectiveSettings(9, { blockedPlatforms: [] });
  assert.deepEqual(c.blockedPlatforms.sort(), P.PLATFORMS.slice().sort());
});

test("locked filter categories survive removal", () => {
  const c = P.effectiveSettings(16, { filterCategories: [] });
  for (const k of ["extremism", "selfHarm", "sexual", "predatory"]) assert.ok(c.filterCategories.includes(k), k);
  assert.ok(!c.filterCategories.includes("drugs"), "unlocked category can be removed at 16");
});

test("filter mode cannot be relaxed to blur when locked", () => {
  assert.equal(P.effectiveSettings(13, { filterMode: "blur" }).filterMode, "remove");
  assert.equal(P.effectiveSettings(17, { filterMode: "remove" }).filterMode, "remove");
});

test("minors cannot remove the daily limit", () => {
  assert.equal(P.effectiveSettings(14, { dailyMinutes: 0 }).dailyMinutes, 60);
  assert.equal(P.effectiveSettings(14, { dailyMinutes: 30 }).dailyMinutes, 30);
  assert.equal(P.effectiveSettings(14, { dailyMinutes: 9999 }).dailyMinutes, 60);
});

test("matcher catches categories and evasions", () => {
  const m = F.buildMatcher(P.ALL_CATEGORIES, ["badword"]);
  assert.equal(m("join the #RaceWar now").category, "extremism");
  assert.equal(m("check my 0nlyfans").category, "sexual");
  assert.equal(m("try the blackout challenge").category, "dangerousChallenges");
  assert.equal(m("1488 forever").category, "extremism");
  assert.equal(m("add my snap pls").category, "predatory");
  assert.equal(m("this is a BADWORD").category, "custom");
  assert.equal(m("my class assignment on shellfish"), null, "no substring false positives");
  assert.equal(m("cute dog video"), null);
});

test("For You cannot be turned on under 13", () => {
  const c = P.effectiveSettings(11, { disableForYou: false });
  assert.equal(c.disableForYou, true);
  assert.equal(c.forYou.allowed, false);
  assert.equal(c.forYou.enabled, false);
});

test("For You can be turned on at 13-15 but is heavily limited", () => {
  const off = P.effectiveSettings(14, {});
  assert.equal(off.forYou.enabled, false, "off by default");
  const on = P.effectiveSettings(14, { disableForYou: false });
  assert.equal(on.forYou.enabled, true);
  assert.equal(on.forYou.dailyMinutes, 15);
  assert.equal(on.forYou.breakEveryMinutes, 5);
  assert.equal(on.forYou.maxPostsPerDay, 40);
  assert.deepEqual(on.forYou.hours, { start: "15:00", end: "20:00" });
  assert.equal(on.forYou.filterMode, "remove");
  assert.equal(on.forYou.filterCategories.length, P.ALL_CATEGORIES.length);
});

test("For You limits scale with age", () => {
  const a = P.effectiveSettings(14, { disableForYou: false }).forYou;
  const b = P.effectiveSettings(17, { disableForYou: false }).forYou;
  const c = P.effectiveSettings(30, { disableForYou: false }).forYou;
  assert.ok(a.dailyMinutes < b.dailyMinutes);
  assert.ok(a.maxPostsPerDay < b.maxPostsPerDay);
  assert.equal(c.dailyMinutes, 0, "adults unlimited");
  assert.equal(c.hours, null);
});

test("parents can tighten but not loosen For You limits", () => {
  const lim = (age, l) => P.effectiveSettings(age, { disableForYou: false, forYouLimits: l }).forYou;
  assert.equal(lim(14, { dailyMinutes: 10 }).dailyMinutes, 10);
  assert.equal(lim(14, { dailyMinutes: 90 }).dailyMinutes, 15);
  assert.equal(lim(14, { dailyMinutes: 0 }).dailyMinutes, 15, "can't remove the cap");
  assert.equal(lim(14, { maxPostsPerDay: 500 }).maxPostsPerDay, 40);
  assert.equal(lim(14, { breakEveryMinutes: 3 }).breakEveryMinutes, 3);
  assert.deepEqual(lim(14, { hours: { start: "16:00", end: "18:00" } }).hours, { start: "16:00", end: "18:00" });
  assert.deepEqual(lim(14, { hours: { start: "06:00", end: "23:00" } }).hours, { start: "15:00", end: "20:00" }, "outside window rejected");
  assert.equal(lim(30, { dailyMinutes: 45 }).dailyMinutes, 45, "adults may add limits");
});

test("Australia: no accounts under 16, logged-out viewing only", () => {
  const au14 = P.effectiveSettings(14, {}, "AU");
  assert.equal(au14.accountsAllowed, false);
  assert.equal(au14.blockAccounts, true);
  assert.ok(!au14.blockedPlatforms.includes("tiktok"), "logged-out watching still allowed");
  assert.equal(P.effectiveSettings(16, {}, "AU").accountsAllowed, true);
  assert.equal(P.effectiveSettings(14, {}, "default").accountsAllowed, true);
  assert.equal(P.effectiveSettings(14, {}).accountsAllowed, true);
  assert.equal(P.effectiveSettings(12, {}).accountsAllowed, false);
});

test("region guess from locale", () => {
  assert.equal(P.guessRegion("en-AU"), "AU");
  assert.equal(P.guessRegion("en-US"), "default");
  assert.equal(P.guessRegion(undefined), "default");
});
