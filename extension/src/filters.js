// Content filter categories. Terms are matched case-insensitively on word
// boundaries against post captions, comments, hashtags and alt text.
// Lists are intentionally conservative starting points; parents can add terms.
(function (root) {
  const CATEGORIES = {
    selfHarm: {
      label: "Self-harm & suicide",
      terms: ["suicide", "kill myself", "kms", "self harm", "selfharm", "cutting", "unalive",
        "su1c1de", "want to die", "thinspo", "proana", "pro ana", "promia", "meanspo",
        "skinnytok", "edtwt", "sh tw", "bonespo"]
    },
    extremism: {
      label: "Extremism & terrorism",
      terms: ["jihad", "caliphate", "isis", "white power", "great replacement", "1488", "14 words",
        "race war", "accelerationism", "boogaloo", "day of the rope", "siege culture",
        "atomwaffen", "manifesto", "ethnostate", "zog", "rahowa", "glorious leader",
        "incel uprising", "saint tarrant", "blackpill", "redpill"]
    },
    hate: {
      label: "Hate speech & harassment",
      terms: ["kys", "go die", "subhuman", "vermin", "degenerate", "groomer", "nazi",
        "white genocide", "kill all", "gas the", "you should die"]
    },
    violence: {
      label: "Graphic violence & weapons",
      terms: ["gore", "beheading", "shooting video", "school shooting", "murder video",
        "liveleak", "bestgore", "massacre", "mass shooter", "ghost gun", "3d printed gun",
        "pipe bomb", "how to make a bomb", "stabbing", "fight compilation"]
    },
    sexual: {
      label: "Sexual & adult content",
      terms: ["nsfw", "onlyfans", "of link", "porn", "nudes", "nude", "18+", "xxx", "sexting",
        "hookup", "sugar daddy", "sugar baby", "spicy content", "link in bio 18", "fansly",
        "send pics", "dtf", "thot", "camgirl", "escort"]
    },
    drugs: {
      label: "Drugs, alcohol & vaping",
      terms: ["vape", "vaping", "weed", "edibles", "xanax", "percs", "percocet", "lean",
        "molly", "mdma", "cocaine", "plug", "dab pen", "thc cart", "shrooms", "ketamine",
        "fentanyl", "get drunk", "blackout drunk", "juul"]
    },
    gambling: {
      label: "Gambling & scams",
      terms: ["casino", "sports betting", "bet slip", "crypto giveaway", "double your money",
        "free robux", "free vbucks", "cash app flip", "stake.com", "roobet", "get rich quick",
        "skin gambling", "case opening"]
    },
    dangerousChallenges: {
      label: "Dangerous challenges & stunts",
      terms: ["blackout challenge", "choking challenge", "pass out challenge", "benadryl challenge",
        "nyquil chicken", "skull breaker", "fire challenge", "milk crate challenge",
        "tide pod", "car surfing", "subway surfing", "chroming", "dusting"]
    },
    predatory: {
      label: "Grooming & stranger contact",
      terms: ["dm me", "add my snap", "add me on snap", "whats your snap", "telegram me",
        "kik me", "send a pic", "are you alone", "dont tell your parents", "our secret",
        "how old are you", "asl", "wanna meet", "move to telegram", "discord me"]
    },
    mature: {
      label: "Mature themes & profanity",
      terms: ["fuck", "shit", "bitch", "wtf", "stfu", "damn", "hell", "ass", "dick",
        "crime", "drunk", "hungover"]
    }
  };

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Normalize leetspeak and spacing tricks commonly used to dodge filters.
  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[0]/g, "o").replace(/[1!|]/g, "i").replace(/[3]/g, "e")
      .replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/[7]/g, "t")
      .replace(/[#_\-.*]/g, " ")
      .replace(/\s+/g, " ");
  }

  function buildMatcher(categoryIds, extraTerms) {
    const entries = [];
    for (const id of categoryIds) {
      const cat = CATEGORIES[id];
      if (!cat) continue;
      for (const t of cat.terms) {
        entries.push([normalize(t).trim(), id]);
        entries.push([t.toLowerCase(), id]);
        // Hashtag form: "race war" -> "racewar".
        if (t.includes(" ") && t.length >= 6) entries.push([normalize(t).replace(/ /g, ""), id]);
      }
    }
    for (const t of extraTerms || []) if (t && t.trim()) {
      entries.push([normalize(t).trim(), "custom"]);
      entries.push([t.trim().toLowerCase(), "custom"]);
    }
    if (!entries.length) return () => null;
    const re = new RegExp("(?:^|[^a-z0-9])(" + entries.sort((a, b) => b[0].length - a[0].length).map(e => escapeRe(e[0])).join("|") + ")(?=$|[^a-z0-9])");
    const lookup = new Map(entries);
    return function match(text) {
      const raw = String(text || "").toLowerCase();
      // Check both raw (keeps "18+", "1488") and normalized forms.
      for (const s of [raw.replace(/[#_]/g, " "), normalize(text)]) {
        const m = re.exec(s);
        if (m) return { term: m[1], category: lookup.get(m[1]) || "custom" };
      }
      return null;
    };
  }

  root.SafeScrollFilters = { CATEGORIES, normalize, buildMatcher };
  if (typeof module !== "undefined") module.exports = root.SafeScrollFilters;
})(typeof globalThis !== "undefined" ? globalThis : this);
