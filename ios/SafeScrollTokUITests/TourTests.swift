import XCTest

/// Taps through the real app in the iPhone Simulator and saves a screenshot at each step
/// into $TOUR_DIR (set via TEST_RUNNER_TOUR_DIR). Steps are best-effort: if a button
/// isn't found the tour carries on, so one TikTok change doesn't lose every screenshot.
final class TourTests: XCTestCase {
    private var count = 0
    private let dir = ProcessInfo.processInfo.environment["TOUR_DIR"] ?? NSTemporaryDirectory()
    private let pin = "\"pinSalt\":\"s\",\"pinHash\":\"1f884ca61b18b4dcde9cc304095322b1c5b15422400c4796cf0bbadbea5f00aa\""
    private let creators = "\"friendAllowlist\":[\"nasa\",\"sciencesam\",\"bakewithmia\"]"

    override func setUp() { continueAfterFailure = true }

    private func wait(_ seconds: Double) { Thread.sleep(forTimeInterval: seconds) }

    private func shot(_ name: String, after seconds: Double = 2) {
        wait(seconds)
        count += 1
        let file = String(format: "%02d-%@", count, name)
        let screenshot = XCUIScreen.main.screenshot()
        // Kept in the test results; the workflow extracts them with xcresulttool.
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = file
        attachment.lifetime = .keepAlways
        add(attachment)
        try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(file + ".png"))
    }

    private func launch(_ store: String?, welcomeDone: Bool, _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        var args: [String] = []
        if let store { args += ["--seed-store", Data(store.utf8).base64EncodedString()] }
        args += ["--welcome-done", welcomeDone ? "YES" : "NO"] + extra
        app.launchArguments = args
        app.launch()
        return app
    }

    /// Any element whose accessibility label contains the text (works inside web pages too).
    private func element(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    @discardableResult
    private func tap(_ el: XCUIElement, timeout: Double = 10) -> Bool {
        guard el.waitForExistence(timeout: timeout), el.isHittable else { return false }
        el.tap()
        return true
    }

    private func store(age: Int, region: String, _ extra: String = "", overrides: String = "") -> String {
        "{\(pin),\"age\":\(age),\"region\":\"\(region)\"\(extra.isEmpty ? "" : "," + extra),\"overrides\":{\(overrides)}}"
    }

    func testTour() {
        // ---------- Home Screen ----------
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCUIDevice.shared.press(.home)
        shot("home-screen")
        let icon = springboard.icons["SafeTok"]
        for _ in 0..<4 where !(icon.exists && icon.isHittable) { springboard.swipeLeft(); wait(1) }
        shot("home-screen-safescroll-icon", after: 1)

        // ---------- First open: setup ----------
        var app = XCUIApplication()
        if icon.exists && icon.isHittable { icon.tap() } else { app = launch("{}", welcomeDone: false) }
        shot("first-open-setup", after: 6)
        let pins = app.secureTextFields
        if tap(pins.element(boundBy: 0)) { app.typeText("123456") }
        if tap(pins.element(boundBy: 1)) { app.typeText("123456") }
        if tap(app.textFields.firstMatch) { app.typeText("14") }
        shot("setup-filled-in", after: 1)
        if tap(element(app, "Country"), timeout: 3) || tap(app.webViews.otherElements["Other / not listed"], timeout: 3) {
            shot("country-picker", after: 1)
            let wheel = app.pickerWheels.firstMatch
            if wheel.waitForExistence(timeout: 3) { wheel.adjust(toPickerWheelValue: "Australia") }
            tap(app.buttons["Done"], timeout: 3)
        }
        tap(app.buttons["Create PIN and continue"])

        // ---------- Welcome ----------
        shot("welcome-after-setup", after: 4)
        if !tap(app.buttons["Start watching"], timeout: 4) { tap(app.buttons["Watch without an account"], timeout: 2) }
        shot("start-watching", after: 8)

        // ---------- Cog, settings, menu ----------
        if tap(app.buttons["Settings"]) {
            shot("cog-opens-settings", after: 5)
            app.swipeUp(); shot("settings-scrolled-for-you", after: 2)
            app.swipeUp(); shot("settings-scrolled-apps", after: 2)
            app.swipeUp(); app.swipeUp(); shot("settings-scrolled-filters", after: 2)
            if tap(app.navigationBars.buttons.element(boundBy: 0), timeout: 3) {
                shot("settings-menu", after: 1)
                tap(app.buttons["Back to TikTok"], timeout: 3)
            }
        }

        // ---------- 14 in Australia with approved creators ----------
        let s14 = store(age: 14, region: "AU", overrides: creators)
        app = launch(s14, welcomeDone: true)
        shot("home-approved-creators-14-australia", after: 8)
        if tap(element(app, "@nasa")) { shot("tap-approved-creator-nasa", after: 15) }
        app = launch(s14, welcomeDone: true, ["--open", "https://www.tiktok.com/explore"]); shot("explore-blocked-14", after: 10)
        app = launch(s14, welcomeDone: true, ["--open", "https://www.tiktok.com/login"]); shot("login-blocked-14-australia", after: 10)
        app = launch(s14, welcomeDone: true, ["--open", "https://www.tiktok.com/live"]); shot("live-blocked-14", after: 10)

        // ---------- 17, For You on: TikTok's own buttons ----------
        let s17 = store(age: 17, region: "default", overrides: "\"disableForYou\":false,\(creators)")
        app = launch(s17, welcomeDone: true); shot("tiktok-for-you-17", after: 20)
        app.swipeUp(); shot("swipe-up-next-video", after: 6)
        if tap(element(app, "Discover")) { shot("tap-discover", after: 10) }
        app = launch(s17, welcomeDone: true); wait(15)
        if tap(element(app, "Inbox")) { shot("tap-inbox", after: 8) }
        app = launch(s17, welcomeDone: true); wait(15)
        if tap(element(app, "Profile")) { shot("tap-profile", after: 8) }

        // ---------- Limits ----------
        let today = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
        app = launch(store(age: 17, region: "default", "\"fypUsage\":{\"\(today)\":{\"minutes\":30,\"posts\":20}}",
                           overrides: "\"disableForYou\":false"), welcomeDone: true)
        shot("for-you-time-used-up", after: 12)
        if tap(element(app, "Go to Following")) { shot("tap-go-to-following", after: 10) }
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        let start = f.string(from: Date().addingTimeInterval(-600)), end = f.string(from: Date().addingTimeInterval(3600))
        app = launch(store(age: 17, region: "default", overrides: "\"disableForYou\":false,\"bedtime\":{\"start\":\"\(start)\",\"end\":\"\(end)\"}"), welcomeDone: true)
        shot("bedtime", after: 12)
        app = launch(store(age: 11, region: "AU"), welcomeDone: true); shot("under-13-everything-blocked", after: 10)

        // ---------- PIN lock ----------
        app = launch(s17, welcomeDone: true, ["--show-settings"]); shot("settings-locked", after: 6)
        if tap(app.secureTextFields.firstMatch) {
            app.typeText("000000"); tap(app.buttons["Unlock"]); shot("wrong-pin", after: 2)
            tap(app.secureTextFields.firstMatch); app.typeText("123456"); tap(app.buttons["Unlock"]); shot("right-pin-unlocked", after: 3)
        }
    }
}
