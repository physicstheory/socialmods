import "./policy.js";
const { effectiveSettings } = globalThis.SafeScrollPolicy;

const DOMAINS = {
  tiktok: ["tiktok.com", "tiktokv.com", "tiktokcdn.com", "musical.ly"],
  snapchat: ["snapchat.com", "snap.com", "sc-cdn.net", "snapkit.com"],
  instagram: ["instagram.com", "cdninstagram.com"],
  facebook: ["facebook.com", "fb.com", "fbcdn.net", "fb.watch"],
  messenger: ["messenger.com", "m.me"],
  threads: ["threads.net", "threads.com"],
  whatsapp: ["whatsapp.com", "web.whatsapp.com", "wa.me"],
  metaai: ["meta.ai"]
};

async function syncNetworkRules() {
  const { age, overrides, region } = await chrome.storage.local.get(["age", "overrides", "region"]);
  const cfg = effectiveSettings(age === undefined ? 0 : age, overrides, region);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  let id = 1;
  for (const p of cfg.blockedPlatforms) {
    for (const d of DOMAINS[p] || []) {
      addRules.push({
        id: id++, priority: 1,
        action: { type: "redirect", redirect: { extensionPath: `/blocked/blocked.html?reason=platform&site=${p}` } },
        condition: { requestDomains: [d], resourceTypes: ["main_frame"] }
      });
      addRules.push({
        id: id++, priority: 1, action: { type: "block" },
        condition: { requestDomains: [d], resourceTypes: ["sub_frame", "xmlhttprequest", "media", "image", "script", "websocket"] }
      });
    }
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(r => r.id), addRules });
}

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
  syncNetworkRules();
});
chrome.runtime.onStartup.addListener(syncNetworkRules);
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && (c.age || c.overrides || c.region)) syncNetworkRules(); });
