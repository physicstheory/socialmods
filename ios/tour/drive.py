"""Drives the SafeScroll app in the iPhone Simulator (via idb) and screenshots each step.
Run by .github/workflows/ios-tour.yml. Every step is best-effort: a step that can't
find its button logs a warning and the tour carries on."""
import base64, json, os, subprocess, sys, time

UDID, BID = os.environ["UDID"], os.environ["BID"]
OUT = "tour"
os.makedirs(OUT, exist_ok=True)
PIN = '"pinSalt":"s","pinHash":"1f884ca61b18b4dcde9cc304095322b1c5b15422400c4796cf0bbadbea5f00aa"'
CREATORS = '"friendAllowlist":["nasa","sciencesam","bakewithmia"]'
LATER = int((time.time() + 7200) * 1000)
TODAY = time.strftime("%Y-%m-%d")
n = 0

def sh(*args, timeout=60):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except Exception as e:
        print("  !", args[:3], e); return subprocess.CompletedProcess(args, 1, "", str(e))

def idb(*args): return sh("idb", *args, "--udid", UDID)

def shot(name, wait=3):
    global n
    time.sleep(wait); n += 1
    sh("xcrun", "simctl", "io", UDID, "screenshot", f"{OUT}/{n:02d}-{name}.png")
    print(f"shot {n:02d}-{name}")

def elements():
    r = idb("ui", "describe-all", "--json")
    try: return json.loads(r.stdout)
    except Exception: return []

def find(text, exact=False, timeout=12):
    t = text.lower(); end = time.time() + timeout
    while time.time() < end:
        for e in elements():
            label = (e.get("AXLabel") or "").strip().lower()
            if (label == t) if exact else (t in label):
                return e
        time.sleep(1)
    print(f"  ! couldn't find '{text}'"); return None

def center(e):
    f = e.get("frame") or {}
    return f.get("x", 0) + f.get("width", 0) / 2, f.get("y", 0) + f.get("height", 0) / 2

def tap(text, exact=False, timeout=12):
    e = find(text, exact, timeout)
    if e: x, y = center(e); idb("ui", "tap", str(round(x)), str(round(y))); return e
    return None

def tap_xy(x, y): idb("ui", "tap", str(round(x)), str(round(y)))
def typ(s): idb("ui", "text", s)
def swipe(x1, y1, x2, y2): idb("ui", "swipe", str(x1), str(y1), str(x2), str(y2), "--duration", "0.3")

def launch(store, welcome, *extra):
    sh("xcrun", "simctl", "terminate", UDID, BID)
    seed = base64.b64encode(store.encode()).decode()
    sh("xcrun", "simctl", "launch", UDID, BID, "--seed-store", seed, "--welcome-done", welcome, *extra)

def step(title):
    print(f"\n== {title}")

# ---------------------------------------------------------------- Home Screen
step("Home Screen")
idb("ui", "button", "HOME"); time.sleep(2)
shot("home-screen", 2)
icon = find("SafeScroll", exact=True, timeout=4)
if not icon:  # new apps land on a later page
    for _ in range(3):
        swipe(350, 450, 50, 450); time.sleep(1)
        icon = find("SafeScroll", exact=True, timeout=3)
        if icon: break
shot("home-screen-safescroll-icon", 1)

# ---------------------------------------------------------------- First open
step("First open")
sh("xcrun", "simctl", "spawn", UDID, "defaults", "delete", BID)  # brand-new install state
if icon: x, y = center(icon); tap_xy(x, y)
else: sh("xcrun", "simctl", "launch", UDID, BID)
shot("first-open-setup", 8)
if tap("Parent PIN"): typ("123456")
if tap("Confirm PIN"): typ("123456")
if tap("Child's age"): typ("14")
idb("ui", "button", "HOME") if False else None
shot("setup-filled-in", 1)
country = tap("Country")
shot("country-picker", 2)
if country:
    tap("Australia", exact=True, timeout=5)
    tap("Done", exact=True, timeout=3)
tap("Create PIN and continue")
shot("after-setup-settings", 4)
swipe(200, 700, 200, 250); shot("settings-for-you-card", 2)
swipe(200, 700, 200, 150); shot("settings-apps-and-features", 2)
swipe(200, 700, 200, 150); shot("settings-content-filters", 2)

# ---------------------------------------------------------------- Welcome
step("Welcome (14, Australia)")
tap("Done", exact=True)
shot("welcome-14-australia", 4)
tap("Start watching")
shot("start-watching-home-no-creators", 8)

# ---------------------------------------------------------------- Cog and menu
step("Cog")
tap("Settings", exact=True)
shot("cog-opens-settings", 5)
tap("More", timeout=4) or tap_xy(36, 80)
shot("settings-menu", 2)
idb("ui", "key", "41")  # escape any menu
tap("Done", exact=True, timeout=4)

# ---------------------------------------------------------------- 14 in Australia, with approved creators
step("Approved creators (14, Australia)")
S14 = f'{{{PIN},"age":14,"region":"AU","overrides":{{{CREATORS}}}}}'
launch(S14, "YES"); shot("home-with-approved-creators", 8)
tap("@nasa"); shot("tap-approved-creator-nasa", 15)
tap("For You", timeout=4); shot("for-you-tile-is-off", 3)
launch(S14, "YES", "--open", "https://www.tiktok.com/explore"); shot("explore-blocked-14", 10)
launch(S14, "YES", "--open", "https://www.tiktok.com/login"); shot("login-blocked-14-australia", 10)
launch(S14, "YES", "--open", "https://www.tiktok.com/live"); shot("live-blocked-14", 10)

# ---------------------------------------------------------------- 17, For You on: TikTok's own buttons
step("TikTok buttons (17)")
S17 = f'{{{PIN},"age":17,"region":"default","overrides":{{"disableForYou":false,{CREATORS}}}}}'
launch(S17, "YES"); shot("tiktok-for-you-17", 20)
swipe(200, 650, 200, 150); shot("swipe-to-next-video", 6)
disc = tap("Discover", exact=True); shot("tap-discover", 10)
launch(S17, "YES"); time.sleep(15)
inbox = tap("Inbox", exact=True); shot("tap-inbox", 8)
launch(S17, "YES"); time.sleep(15)
tap("Profile", exact=True); shot("tap-profile", 8)
launch(S17, "YES"); time.sleep(15)
if disc and inbox:  # the + sits between Discover and Inbox
    (dx, dy), (ix, iy) = center(disc), center(inbox); tap_xy((dx + ix) / 2, dy)
shot("tap-plus-upload", 8)

# ---------------------------------------------------------------- Limits
step("Limits")
used = f'"fypUsage":{{"{TODAY}":{{"minutes":30,"posts":20}}}}'
launch(f'{{{PIN},"age":17,"region":"default",{used},"overrides":{{"disableForYou":false}}}}', "YES")
shot("for-you-time-used-up", 12)
tap("Go to Following feed", timeout=5); shot("tap-go-to-following", 10)
now = time.localtime(); start = time.strftime("%H:%M", time.localtime(time.time() - 600)); end = time.strftime("%H:%M", time.localtime(time.time() + 3600))
launch(f'{{{PIN},"age":17,"region":"default","overrides":{{"disableForYou":false,"bedtime":{{"start":"{start}","end":"{end}"}}}}}}', "YES")
shot("bedtime", 12)
launch(f'{{{PIN},"age":11,"region":"AU","overrides":{{}}}}', "YES"); shot("under-13-everything-blocked", 10)

# ---------------------------------------------------------------- PIN lock
step("PIN lock")
launch(S17, "YES", "--show-settings"); shot("settings-locked-pin", 6)
if tap("Parent PIN", timeout=5): typ("000000"); tap("Unlock", exact=True); shot("wrong-pin", 2)
if tap("Parent PIN", timeout=5): typ("123456"); tap("Unlock", exact=True); shot("right-pin-unlocked", 3)

print(f"\n{n} screenshots")
