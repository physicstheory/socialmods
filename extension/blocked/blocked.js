/* global SafeScrollIcons */
const REASONS = {
  platform: ["🚫", "This app is off", "This app isn't available with your current rules."],
  bedtime: ["🌙", "It's bedtime", "Apps are paused until morning. Sleep well!"],
  timelimit: ["⏳", "Screen time is up", "You've used today's screen time. It resets tomorrow."],
  disableForYou: ["✨", "For You is turned off", "Your feed shows the accounts you follow instead."],
  fypTime: ["⏳", "For You time is up", "You've used today's For You time. The accounts you follow are still available."],
  fypPosts: ["🎬", "That's enough For You for today", "You've reached today's post limit on the For You feed. The accounts you follow are still available."],
  fypHours: ["🕒", "For You isn't open right now", "The For You feed is only available during set hours. The accounts you follow are still available."],
  disableExplore: ["🧭", "Explore is turned off", "Browsing trending pages isn't available."],
  disableShortVideo: ["🎞️", "Reels & Spotlight are off", "The short-video tabs aren't available."],
  disableLive: ["📡", "LIVE is turned off", "Live streams aren't available."],
  disableSearch: ["🔍", "Search is turned off", "Searching isn't available."],
  disableDMs: ["💬", "Messages are turned off", "Direct messages aren't available."],
  disableStories: ["⭕", "Stories are turned off", "Stories aren't available."],
  blockAccounts: ["🔑", "Accounts aren't available yet", "Where you live, you need to be older to have an account. You can still watch public videos."],
  hideFriendSuggestions: ["👥", "Friend suggestions are off", "Suggested accounts aren't available."]
};
const SAFE_HOSTS = /(^|\.)(tiktok\.com|instagram\.com|facebook\.com|threads\.(net|com)|snapchat\.com)$/;
const p = new URLSearchParams(window.__safescrollParams || location.search);
const [em, title, why] = REASONS[p.get("reason")] || ["🛡️", "This page is blocked", "It isn't available with your current rules."];
document.getElementById("em").textContent = em;
document.getElementById("title").textContent = title;
document.getElementById("why").textContent = why;
document.title = title + " · SafeScroll";
// Only offer the Following feed when the For You feed was what got stopped.
try {
  const back = new URL(p.get("back") || "");
  if (/^(fyp|disableForYou)/.test(p.get("reason")) && back.protocol === "https:" && SAFE_HOSTS.test(back.hostname)) {
    const a = document.getElementById("back");
    a.href = back.href; a.hidden = false;
  }
} catch { /* no back link */ }
SafeScrollIcons.hydrate();
