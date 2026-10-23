# SafeScroll in Safari: install straight from the iPhone (free, no laptop)

SafeScroll runs on **TikTok's real website in Safari**. The page is TikTok's own, with SafeScroll's filters and limits added on top and a small ⚙ cog in the top-right corner for settings. It uses the free **Userscripts** app from the App Store, so there's no laptop, no Apple ID sign-in and no weekly renewal.

## Install (about 5 minutes, all on your son's iPhone)
1. **Get Userscripts.** Install **Userscripts** (by Justin Wasack) from the App Store. It's free.
2. **Set its folder.** Open the Userscripts app once, tap **Set Userscripts Directory**, and pick a folder. "On My iPhone → Userscripts" is fine; make a new folder if needed.
3. **Turn it on in Safari.** Settings → Apps → Safari → **Extensions** → **Userscripts** → On. Under **Permissions**, set **All Websites** (or tiktok.com) to **Allow**.
4. **Install SafeScroll.** In Safari, open
   **https://github.com/physicstheory/socialmods/raw/HEAD/userscript/safescroll.user.js**
   Tap the **extensions button** in the address bar (the puzzle piece or **AA** icon) → **Userscripts** → **Install**.
   *If no Install button appears:* tap Share → **Save to Files** and save it into the Userscripts folder from step 2.
5. **Set it up.** Go to **tiktok.com** in Safari. SafeScroll's setup opens by itself. Create your parent PIN, enter his age and country (14, Australia), and tap **Create PIN and continue**. Tap **Done** when finished.
6. **Optional Home Screen icon:** on tiktok.com, tap Share → **Add to Home Screen**. If there's an **Open as Web App** switch, turn it **off**, so it opens in Safari, where SafeScroll runs.

## What's the same as the extension and the app
- **Content filters** on captions, hashtags and comments.
- **For You:** off, or on with age limits (daily time, posts, hours, forced breaks).
- **Accounts and friending:** log in and sign up blocked under 16 in Australia; approved-accounts-only friending; friend suggestions, Explore and LIVE hidden.
- **Time:** daily screen time and bedtime.
- **Settings:** the same parent settings screen and PIN, behind the ⚙ cog.

## Lock it down (recommended)
Screen Time on his phone. Settings → Screen Time → Content & Privacy Restrictions:
- **Remove the real TikTok app:** delete it, then set **iTunes & App Store Purchases → Installing Apps** to **Don't Allow**, so it can't come back.
- **Keep SafeScroll's Safari setup in place:** set **Deleting Apps** to **Don't Allow**, so Userscripts stays installed.
- **Close the other routes:** block other browsers he could use without SafeScroll, using **App Limits** or by not allowing installs.

**Know the gaps:**
- **Userscripts can be switched off.** It can be turned off under Settings → Safari → Extensions, and Screen Time can't lock that switch. Check now and then that the cog is still showing on TikTok.
- **It's TikTok's mobile website,** so some things (like recording videos) are more limited than in the TikTok app.

## Updating
Userscripts checks the same link for new versions. To update by hand, open the link from step 4 again and tap **Install**.
