# Install SafeScroll on your iPhone (from a Windows PC)

**You need:** a Windows PC, your iPhone and its USB-C cable, and your Apple ID.

## First time (about 10 minutes)
1. **On the PC, install:**
   - **iTunes** from [apple.com/itunes](https://www.apple.com/itunes/download/win64). *Not* the Microsoft Store version.
   - **Sideloadly** from [sideloadly.io](https://sideloadly.io/).
2. **Download and double-click [Install-SafeScroll.cmd](https://github.com/physicstheory/socialmods/raw/HEAD/windows/Install-SafeScroll.cmd).** If Windows warns about it, click **More info → Run anyway**. It downloads the newest app and opens Sideloadly next to the file.
3. **In Sideloadly:** plug in and unlock the iPhone, drag **SafeScroll.ipa** onto Sideloadly, type your Apple ID email, and click **Start**. Then type the code that appears on your phone.
4. **On the iPhone (first time only):**
   - Settings → Privacy & Security → **Developer Mode** → On → restart → **Turn On**
   - Settings → General → **VPN & Device Management** → your Apple ID → **Trust**
5. **Tap the SafeScroll icon.** That's it. From now on, just tap the icon to open it.

## Keep it working (free Apple ID apps stop opening after 7 days)
**Easiest:** in Sideloadly, right-click the app in its list (or open **Advanced options**) and turn on **automatic refresh**. Then leave Sideloadly running on the PC. It renews the app over Wi-Fi when the iPhone and PC are on the same network.

**Or by hand:** once a week, double-click **Install-SafeScroll.cmd** again and click **Start**. That also picks up any updates. Your settings and login stay.

## If something goes wrong
| You see | Fix |
|---|---|
| iPhone not listed in Sideloadly | Unplug and replug it, unlock it, tap **Trust**. Still missing: reinstall iTunes from apple.com, not the Microsoft Store. |
| "Untrusted Developer" | Step 4, second line. |
| No **Developer Mode** in Settings | It appears after the first Sideloadly install. Do step 3 first. |
| App won't open after a week | Renew it (see above). |

Full details: [ios/README.md](ios/README.md).
