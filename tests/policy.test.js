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
  const c = P.effectiveSettings(14, { disableForYou: false, hideFriendSuggestions: false, disableDMs: true });
  assert.equal(c.disableForYou, true);
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
