# SafeScroll — parental controls for TikTok, Snapchat & Meta apps

SafeScroll applies strict, age-based rules on top of **TikTok, Snapchat, Instagram, Facebook, Messenger, Threads, WhatsApp and Meta AI**. Many rules are **locked** for younger ages, so even someone who knows the parent PIN can't switch them off. They can only be made stricter.

It has three layers. Use all three for the best coverage:

| Layer | Covers | Folder |
|---|---|---|
| 1. Browser extension | Web versions of every supported service (feed control, content filters, friend limits, time limits) | `extension/` |
| 2. Network blocklist | Native phone, tablet and desktop apps (whole-platform blocking) | `network/` |
| 3. Device lock-down | Stops the child removing the extension, using incognito or using another browser | `deploy/` |

## What the rules do at each age

| Setting | Under 13 | 13–15 | 16–17 | 18+ |
|---|---|---|---|---|
| All 8 platforms blocked | 🔒 on | – | – | – |
| For You / algorithmic feed off | 🔒 | 🔒 | on (can change) | off |
| Explore / Discover off | 🔒 | 🔒 | off | off |
| LIVE off | 🔒 | 🔒 | on | off |
| Search off | 🔒 | on | off | off |
| Friend suggestions / Quick Add hidden | 🔒 | 🔒 | on | off |
| Follow/add only for approved accounts | 🔒 | 🔒 | off | off |
| Comments hidden | 🔒 | on | off | off |
| Content filters | all 🔒 | all except profanity 🔒 | core categories 🔒 | extremism, self-harm, gore |
| Filtered posts | 🔒 removed | 🔒 removed | blurred | blurred |
| Daily limit / bedtime | — / 20:00–07:00 | 60 min / 21:30–07:00 | 120 min / 23:00–06:00 | none |

If the age is unknown or setup hasn't been done, the **strictest tier** applies.

**Content filter categories:** self-harm & eating disorders, extremism & terrorism, hate & harassment, graphic violence & weapons, sexual content, drugs/alcohol/vaping, gambling & scams, dangerous challenges, grooming & stranger-contact phrases, and mature language. The filters catch common evasions such as leetspeak (`0nlyfans`), joined-up hashtags (`#racewar`) and accents. Parents can add their own words.

### How each feature works per platform
- **For You off:** TikTok goes to `/following`, Instagram to the Following feed, Facebook to the most-recent feed (`?sk=h_chr`) and Threads to `/following`. Snapchat Spotlight and Discover are blocked.
- **Limiting who they can friend:** "Follow", "Add Friend" and "Message" buttons are hidden everywhere except on profiles whose username is on the parent's approved list. Suggestion modules (Quick Add, People You May Know, Suggested for you) are also hidden.
- **Time limits:** screen time is counted across all supported sites together. When the daily limit runs out or bedtime starts, the sites are blocked.

## Install

```bash
npm test          # runs the policy and filter tests
npm run zip       # builds safescroll.zip
```
1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and select `extension/`.
2. The setup page opens. Create a 6+ digit parent PIN and enter the child's age.
3. Lock it in place with `deploy/chrome-managed-policy.json`. This force-installs the extension and disables incognito, DevTools, guest mode and extra profiles. On a Chromebook, Google Family Link does the same.

Five wrong PIN attempts lock the settings for 15 minutes. The PIN is stored as a salted SHA-256 hash.

## Native apps (phones and tablets)
A third-party tool can't change the inside of the official iOS or Android apps. Apple and Google sandbox them, and modified copies of the apps break the platforms' terms and get accounts banned. For native apps:

1. **Block platforms at the network level.** Load `network/blocklist-hosts.txt` into NextDNS, a Pi-hole, AdGuard Home or your router. On mobile data, use the device's private DNS setting set to your NextDNS profile.
2. **Turn on each platform's own teen controls.** Together these cover what the extension does on the web:
   - **TikTok Family Pairing:** Restricted Mode, turn off search, limit who can message or comment, screen-time limits, keyword filters, and a STEM-only feed for younger teens.
   - **Snapchat Family Center:** see their friend list, report accounts, and turn on Content Controls to limit Stories and Spotlight.
   - **Meta Family Center / Teen Accounts** (Instagram, Facebook, Messenger, Threads): private-by-default account, Sensitive Content "Less", messages only from people they follow, Quiet Mode and time limits.
3. **Lock the device:** iOS Screen Time (App Limits, block app installs, Content Restrictions) or Android Family Link (approve apps, app limits, block sideloading and VPN apps).

## Honest limitations
No filter can **guarantee** that every harmful post is caught. Keyword filters miss content that is only in images or audio, and new slang appears all the time. The sites also change their page layouts, which can break the hiding rules in `extension/src/sites.js` until those are updated. Use SafeScroll as one strong layer alongside the platforms' own controls, device locks and conversations with your child.

## Project layout
```
extension/manifest.json        MV3 manifest
extension/src/policy.js        Age tiers, locked settings, override merging
extension/src/filters.js       Content categories + evasion-resistant matcher
extension/src/sites.js         Per-platform URLs/selectors (edit when sites change)
extension/src/content.js       Enforcement on the page
extension/src/background.js    Network-level blocking of blocked platforms
extension/options/             PIN-protected parent dashboard
network/blocklist-hosts.txt    DNS/hosts blocklist for native apps
deploy/                        Browser lock-down policies
tests/                         node --test suite
```
