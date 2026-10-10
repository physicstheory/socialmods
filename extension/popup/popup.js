/* global SafeScrollPolicy, chrome */
(async () => {
  const { age, overrides, usage = {} } = await chrome.storage.local.get(["age", "overrides", "usage"]);
  const cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides);
  document.getElementById("tier").textContent = age === undefined ? "Not set up yet — everything is blocked." : "Rules: " + cfg.tierLabel;
  const used = Math.round(usage[new Date().toISOString().slice(0, 10)] || 0);
  document.getElementById("used").textContent = cfg.dailyMinutes ? `Today: ${used} / ${cfg.dailyMinutes} min` : `Today: ${used} min`;
  document.getElementById("open").onclick = () => chrome.runtime.openOptionsPage();
})();
