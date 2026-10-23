/* global SafeScrollPolicy, SafeScrollIcons, chrome */
(async () => {
  SafeScrollIcons.hydrate();
  const { age, overrides, region, usage = {}, fypUsage = {} } = await chrome.storage.local.get(["age", "overrides", "region", "usage", "fypUsage"]);
  const cfg = SafeScrollPolicy.effectiveSettings(age === undefined ? 0 : age, overrides, region);
  const d = new Date().toISOString().slice(0, 10);
  const used = Math.round(usage[d] || 0);
  const $ = id => document.getElementById(id);
  if (age === undefined) { $("state").textContent = "Not set up · all apps blocked"; $("state").classList.add("warn"); }
  $("tier").textContent = age === undefined ? "Strictest" : `Age ${age} · ${cfg.tierLabel}`;
  $("used").textContent = cfg.dailyMinutes ? `${used} / ${cfg.dailyMinutes} min` : `${used} min`;
  $("usedBar").style.width = cfg.dailyMinutes ? Math.min(100, used / cfg.dailyMinutes * 100) + "%" : "0%";
  const fy = cfg.forYou;
  const fyUsed = Math.round((fypUsage[d] || {}).minutes || 0);
  $("fy").textContent = !fy.allowed ? "Locked off" : !fy.enabled ? "Off" : fy.dailyMinutes ? `On · ${fyUsed}/${fy.dailyMinutes} min` : "On";
  $("bed").textContent = cfg.bedtime ? `${cfg.bedtime.start} – ${cfg.bedtime.end}` : "None";
  $("open").onclick = () => chrome.runtime.openOptionsPage();
})();
