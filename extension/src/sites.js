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
      followText: [/^follow$/i, /^follow back$/i, /^add friend$/i, /^message$/i]
    },
    snapchat: {
      hosts: [/(^|\.)snapchat\.com$/],
      paths: {
        disableForYou: [/^\/spotlight/, /^\/discover/],
        disableExplore: [/^\/discover/, /^\/explore/, /^\/lens/, /^\/t\//],
        disableShortVideo: [/^\/spotlight/],
        disableStories: [/^\/stories/, /^\/p\//],
        disableSearch: [/^\/search/]
      },
      safeLanding: "https://web.snapchat.com/",
      hide: {
        disableForYou: ['a[href*="/spotlight"]', 'a[href*="/discover"]'],
        disableExplore: ['a[href*="/discover"]', 'a[href*="/lens"]'],
        hideFriendSuggestions: ['[aria-label*="Quick Add" i]', '[aria-label*="Add Friends" i]', '[aria-label*="Suggested" i]'],
        disableStories: ['[aria-label*="Stories" i]'],
        disableSearch: ['input[placeholder*="Search" i]']
      },
      posts: ['article', '[role="listitem"]', '[role="article"]'],
      profile: p => (p.match(/^\/add\/([^/?#]+)/) || p.match(/^\/@([^/?#]+)/) || [])[1],
      followText: [/^add friend$/i, /^add$/i, /^accept$/i, /^subscribe$/i]
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
      forYouRedirect: (u) => (u.pathname === "/" || u.pathname === "/home.php") ? "/?sk=h_chr" : null,
      safeLanding: "/?sk=h_chr",
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
        disableExplore: [/^\/search/]
      },
      // Threads' "Following" feed lives at /following.
      safeLanding: "/following",
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
