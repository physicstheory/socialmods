const REASONS = {
  platform: "This app isn't available for your age setting.",
  bedtime: "It's bedtime — apps are paused until morning.",
  timelimit: "You've used today's screen time.",
  disableForYou: "The For You feed is turned off.",
  disableExplore: "Explore / Discover is turned off.",
  disableShortVideo: "Reels and Spotlight are turned off.",
  disableLive: "LIVE is turned off.",
  disableSearch: "Search is turned off.",
  disableDMs: "Messaging is turned off.",
  disableStories: "Stories are turned off.",
  hideFriendSuggestions: "Friend suggestions are turned off."
};
const p = new URLSearchParams(location.search);
document.getElementById("why").textContent = REASONS[p.get("reason")] || "This page is blocked.";
