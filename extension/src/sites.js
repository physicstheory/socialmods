// Per-platform knowledge. Web apps change their markup often, so rules lean on
// URL paths, ARIA labels, link targets and visible button text rather than
// generated class names. Update selectors here when a site changes.
(function (root) {
  const SITES = {
    tiktok: {
      hosts: [/(^|\.)tiktok\.com$/],
      paths: {
        // "/" and "/foryou" are the algorithmic feed; "/following" is allowed.
        disableForYou: [/^\/$/, /^\/foryou/, /^\/en\/?$/],
        disableExplore: [/^\/explore/, /^\/discover/, /^\/tag\//, /^\/music\//, /^\/channel\//],
        disableLive: [/^\/live/, /\/live$/],
        disableSearch: [/^\/search/],
        disableDMs: [/^\/messages/],
        blockAccounts: [/^\/login/, /^\/signup/]
      },
      safeLanding: "/following",
      hide: {
        disableForYou: ['a[href="/foryou"]', 'a[href="/"][data-e2e="nav-foryou"]', '[data-e2e="nav-foryou"]'],
        disableExplore: ['a[href^="/explore"]', '[data-e2e="nav-explore"]'],
        disableLive: ['a[href^="/live"]', '[data-e2e="nav-live"]'],
        disableSearch: ['[data-e2e="search-box"]', 'form[action*="search"]', '[data-e2e="search-user-input"]'],
        hideFriendSuggestions: ['[data-e2e="suggest-accounts"]', '[data-e2e="recommend-list"]', '[data-e2e="nav-friends"]'],
        disableDMs: ['a[href^="/messages"]', '[data-e2e="top-dm-icon"]'],
        blockAccounts: ['[data-e2e="top-login-button"]', '[data-e2e="nav-login-button"]', 'a[href^="/login"]', 'a[href^="/signup"]', '[data-e2e="login-modal"]'],
        hideComments: ['[data-e2e="comment-list"]', '[data-e2e="comment-icon"]', '[data-e2e="browse-comment"]', 'div[class*="CommentListContainer"]']
      },
      fypExtraHide: ['a[href^="/shop"]', '[data-e2e="nav-shop"]', '[data-e2e*="live-card"]', '[data-e2e="video-ad-tag"]', 'a[href*="/live"]'],
      posts: ['[data-e2e="recommend-list-item-container"]', '[data-e2e="user-post-item"]', 'article', '[data-e2e="comment-level-1"]', '[data-e2e="search_top-item"]'],
      profile: p => (p.match(/^\/@([^/?#]+)/) || [])[1],
      followText: [/^follow$/i, /^follow back$/i, /^add friend$/i, /^message$/i],
      // "Open the app" nags: dismissed or hidden so nothing leads out to the TikTok app or to buying coins.
      nags: {
        dismiss: [/^not now$/i, /^maybe later$/i],
        dismissWithin: /full app experience|open tiktok|get the app|download the app/i,
        hide: [/^open app$/i, /^open tiktok$/i, /^get coins$/i, /^use tiktok app$/i, /^get tiktok app$/i]
      }
    },
    snapchat: {
      hosts: [/(^|\.)snapchat\.com$/],
      paths: {
        // Spotlight is Snapchat's algorithmic feed, so it follows the For You switch and limits.
        disableForYou: [/^\/spotlight/],
        disableExplore: [/^\/discover/, /^\/explore/, /^\/lens/, /^\/t\//],
        disableStories: [/^\/stories/],
        disableSearch: [/^\/search/]
      },
      // Whole Snapchat sites that are switched off by a setting (checked by hostname).
      hostRules: {
        disableDMs: [/^web\.snapchat\.com$/],        // chat
        blockAccounts: [/^accounts\.snapchat\.com$/, /^web\.snapchat\.com$/], // log in, sign up, chat
        disableMap: [/^map\.snapchat\.com$/]         // Snap Map shows friends' locations
      },
      safeLanding: "https://www.snapchat.com/",
      landingWorksLoggedOut: true, // Snapchat's home page works without an account
      hide: {
        disableForYou: ['a[href*="/spotlight"]'],
        disableExplore: ['a[href*="/discover"]', 'a[href*="/lens"]', 'a[href*="/explore"]'],
        hideFriendSuggestions: ['[aria-label*="Quick Add" i]', '[aria-label*="Add Friends" i]', '[aria-label*="Suggested" i]'],
        disableStories: ['[aria-label*="Stories" i]', 'a[href*="/stories"]'],
        disableSearch: ['input[placeholder*="Search" i]', 'a[href*="/search"]', 'button[aria-label*="search" i]', '[role="button"][aria-label*="search" i]'],
        disableMap: ['a[href*="map.snapchat.com"]'],
        disableDMs: ['a[href*="web.snapchat.com"]'],
        blockAccounts: ['a[href*="accounts.snapchat.com"]', 'a[href*="web.snapchat.com"]']
      },
      posts: ['article', '[role="listitem"]', '[role="article"]', '[class*="Spotlight" i] > div'],
      profile: p => (p.match(/^\/add\/([^/?#]+)/) || p.match(/^\/@([^/?#]+)/) || [])[1],
      allowlistKey: "snapAllowlist",
      followText: [/^add friend$/i, /^add$/i, /^accept$/i, /^subscribe$/i, /^chat$/i],
      nags: {
        dismiss: [/^not now$/i, /^maybe later$/i, /^continue on web$/i, /^no thanks$/i, /^continue$/i],
        dismissWithin: /open snapchat|get snapchat|download|use the app|in the app|better on the app/i,
        hide: [/^open snapchat$/i, /^get snapchat$/i, /^open in app$/i, /^open in snapchat$/i, /^download snapchat$/i, /^get the app$/i, /^open app$/i]
      }
    },
    instagram: {
      hosts: [/(^|\.)instagram\.com$/],
      paths: {
        disableExplore: [/^\/explore/],
        disableShortVideo: [/^\/reels?\//, /^\/reels\/?$/],
        disableLive: [/\/live\/?$/],
        disableDMs: [/^\/direct/],
        disableStories: [/^\/stories\//],
        disableSearch: [/^\/explore\/search/, /^\/explore\/tags/],
        blockAccounts: [/^\/accounts\/(login|emailsignup|signup)/]
      },
      // Home feed defaults to algorithmic; "?variant=following" is chronological.
      forYouRedirect: (u) => (u.pathname === "/" && u.searchParams.get("variant") !== "following") ? "/?variant=following" : null,
      safeLanding: "/?variant=following",
      signInPage: "/accounts/login/",
      nags: { dismiss: [/^not now$/i], dismissWithin: /get the app|open instagram|use the app/i,
        hide: [/^open instagram$/i, /^get the app$/i, /^use the app$/i] },
      hide: {
        disableExplore: ['a[href="/explore/"]'],
        disableShortVideo: ['a[href="/reels/"]', 'a[href^="/reels/"]'],
        disableDMs: ['a[href^="/direct"]'],
        disableSearch: ['a[href="#"][role="link"] svg[aria-label="Search"]', 'svg[aria-label="Search"]'],
        hideFriendSuggestions: ['a[href="/explore/people/"]', 'div:has(> div > span > a[href="/explore/people/"])', '[aria-label*="Suggested for you" i]'],
        disableStories: ['[role="menu"] [aria-label*="Story" i]', 'div:has(> ul > li canvas)'],
        blockAccounts: ['a[href^="/accounts/login"]', 'a[href^="/accounts/emailsignup"]'],
        hideComments: ['ul._a9z6', 'section:has(textarea[aria-label*="comment" i])']
      },
      fypExtraHide: ['a[href*="/shop"]', 'article:has(a[href*="/ads/"])', 'a[href*="/live/"]'],
      posts: ['article', 'div[role="dialog"] ul > div', 'ul > li[role="menuitem"]'],
      profile: p => {
        const m = p.match(/^\/([A-Za-z0-9._]+)\/?$/);
        return m && !["explore", "reels", "direct", "accounts", "stories", "p"].includes(m[1]) ? m[1] : null;
      },
      followText: [/^follow$/i, /^follow back$/i, /^message$/i]
    },
    facebook: {
      hosts: [/(^|\.)facebook\.com$/],
      paths: {
        disableForYou: [/^\/watch/, /^\/reel/],
        disableExplore: [/^\/watch/, /^\/gaming/, /^\/marketplace/, /^\/groups\/discover/],
        disableShortVideo: [/^\/reel/, /^\/watch\/reels/],
        disableLive: [/^\/watch\/live/, /\/videos\/live/],
        disableDMs: [/^\/messages/],
        disableStories: [/^\/stories/],
        disableSearch: [/^\/search/],
        hideFriendSuggestions: [/^\/friends\/suggestions/, /^\/friends\/?$/],
        blockAccounts: [/^\/login/, /^\/r\.php/, /^\/reg\//]
      },
      forYouRedirect: (u) => (u.pathname === "/" || u.pathname === "/home.php") && u.searchParams.get("sk") !== "h_chr" ? "/?sk=h_chr" : null,
      safeLanding: "/?sk=h_chr",
      signInPage: "/login/",
      nags: { dismiss: [/^not now$/i], dismissWithin: /get facebook for|open (in )?app|use the app/i,
        hide: [/^get facebook for (ios|iphone)/i, /^open app$/i, /^open in app$/i] },
      hide: {
        disableExplore: ['a[href*="/watch"]', 'a[href*="/marketplace"]', 'a[href*="/gaming"]'],
        disableShortVideo: ['a[href*="/reel"]', '[aria-label*="Reels" i]'],
        disableStories: ['[aria-label="Stories" i]', '[aria-label*="stories tray" i]'],
        hideFriendSuggestions: ['[aria-label="People you may know" i]', 'a[href*="/friends/suggestions"]', 'div[role="article"]:has(a[href*="/friends/suggestions"])'],
        disableSearch: ['input[type="search"]', '[aria-label="Search Facebook" i]'],
        disableDMs: ['[aria-label="Messenger" i]', 'a[href*="/messages"]'],
        hideComments: ['[aria-label*="Comment" i][role="article"]', 'form[role="presentation"]:has([aria-label*="comment" i])']
      },
      fypExtraHide: ['a[href*="/marketplace"]', 'a[href*="/watch/live"]', 'div[role="article"]:has(a[href*="/ads/about"])'],
      posts: ['div[role="article"]', '[data-pagelet^="FeedUnit"]', 'div[aria-posinset]'],
      profile: p => {
        if (p.startsWith("/profile.php")) return new URLSearchParams(location.search).get("id");
        const m = p.match(/^\/([A-Za-z0-9.]+)\/?$/);
        return m && !["watch", "marketplace", "groups", "gaming", "friends", "messages", "reel", "stories", "search"].includes(m[1]) ? m[1] : null;
      },
      followText: [/^add friend$/i, /^follow$/i, /^confirm$/i, /^message$/i]
    },
    messenger: {
      hosts: [/(^|\.)messenger\.com$/],
      paths: { disableDMs: [/.*/] },
      hide: { hideFriendSuggestions: ['[aria-label*="Message requests" i]', 'a[href*="/requests"]'] },
      posts: ['[role="row"]'],
      profile: () => null,
      followText: []
    },
    threads: {
      hosts: [/(^|\.)threads\.(net|com)$/],
      paths: {
        disableForYou: [/^\/$/],
        disableSearch: [/^\/search/],
        disableExplore: [/^\/search/],
        blockAccounts: [/^\/login/]
      },
      // Threads' "Following" feed lives at /following.
      safeLanding: "/following",
      signInPage: "/login",
      nags: { dismiss: [/^not now$/i], dismissWithin: /better in the app|download threads/i,
        hide: [/^get app$/i, /^it'?s better in the app$/i, /^open app$/i, /^open threads$/i] },
      hide: {
        disableForYou: ['a[href="/"][role="link"]'],
        disableSearch: ['a[href="/search"]'],
        hideFriendSuggestions: ['[aria-label*="Suggested" i]']
      },
      posts: ['div[data-pressable-container="true"]', 'article'],
      profile: p => (p.match(/^\/@([^/?#]+)/) || [])[1],
      followText: [/^follow$/i, /^follow back$/i]
    },
    whatsapp: {
      hosts: [/(^|\.)whatsapp\.com$/],
      paths: { disableDMs: [/.*/] },
      hide: { disableExplore: ['[aria-label*="Channels" i]', '[data-icon="newsletter-outline"]'] },
      posts: ['[role="row"]', '.message-in'],
      profile: () => null,
      followText: []
    },
    metaai: {
      hosts: [/(^|\.)meta\.ai$/],
      paths: { disableExplore: [/^\/discover/] },
      hide: {},
      posts: ['[role="article"]'],
      profile: () => null,
      followText: []
    }
  };

  function siteForHost(host) {
    for (const [id, s] of Object.entries(SITES)) if (s.hosts.some(re => re.test(host))) return id;
    return null;
  }

  root.SafeScrollSites = { SITES, siteForHost };
  if (typeof module !== "undefined") module.exports = root.SafeScrollSites;
})(typeof globalThis !== "undefined" ? globalThis : this);
