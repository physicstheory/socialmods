import SwiftUI
import UIKit
import WebKit

/// Which top-level pages the app will open.
enum Gate {
    struct Service {
        let id: String, name: String, hosts: [String]
    }
    static let tiktok = Service(id: "tiktok", name: "TikTok", hosts: [
        "tiktok.com", "tiktokv.com", "tiktokv.us", "tiktokw.us", "tiktokcdn.com", "tiktokcdn-us.com",
        "ttwstatic.com", "byteoversea.com", "ibytedtos.com"])
    static let snapchat = Service(id: "snapchat", name: "Snapchat", hosts: ["snapchat.com", "snap.com"])
    /// Instagram, Threads, Facebook and Messenger share Meta's log-in and link pages, so they count as one.
    static let meta = Service(id: "meta", name: "that app", hosts: [
        "instagram.com", "cdninstagram.com", "threads.net", "threads.com", "facebook.com", "fbcdn.net",
        "fbsbx.com", "messenger.com"])
    static let services = [tiktok, snapchat, meta]

    /// Snapchat's log in / sign up site and its web chat, which need an account.
    static let snapchatAccountHosts = ["accounts.snapchat.com", "web.snapchat.com"]
    /// Sign-in providers TikTok offers ("Continue with Apple / Google / Facebook / X / LINE / Kakao").
    static let loginHosts = ["appleid.apple.com", "accounts.google.com", "facebook.com", "twitter.com", "x.com",
                             "access.line.me", "kauth.kakao.com", "accounts.kakao.com"]
    /// Log in and sign up pages on Meta's sites, closed when accounts aren't allowed yet.
    static let metaAccountPaths = ["/accounts/login", "/accounts/emailsignup", "/accounts/signup", "/login", "/reg", "/r.php", "/signup"]

    enum Decision { case allow, blockAccounts, block(String) }

    static func matches(_ host: String, _ list: [String]) -> Bool {
        list.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func service(for url: URL?) -> Service? {
        let host = url?.host?.lowercased() ?? ""
        return services.first { matches(host, $0.hosts) }
    }

    /// Each service only opens from SafeTok itself (home screen or settings menu), or from a page of the same
    /// service — never by following a link from one app into another (TikTok → Instagram, Snapchat → TikTok).
    /// `byApp` is true when SafeTok itself asked for this page; `crossCheck` is false for sign-in pop-ups.
    static func check(_ url: URL, from current: URL?, byApp: Bool = false, crossCheck: Bool = true, accountsAllowed: Bool) -> Decision {
        if crossCheck && !byApp, let target = service(for: url) {
            let fromApp = current == nil || current?.scheme == BundleSchemeHandler.scheme
            if !fromApp, let from = service(for: current), from.id != target.id {
                return .block("Open \(target.name) from SafeTok's home screen.")
            }
        }
        return check(url, accountsAllowed: accountsAllowed)
    }

    static func check(_ url: URL, accountsAllowed: Bool) -> Decision {
        switch url.scheme?.lowercased() ?? "" {
        case BundleSchemeHandler.scheme, "about", "blob", "data": return .allow
        case "https", "http": break
        default: return .block("Opening other apps is turned off.") // tiktok://, snssdk…://, instagram://, itms-apps://
        }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        if matches(host, snapchatAccountHosts) && !accountsAllowed { return .blockAccounts }
        if matches(host, tiktok.hosts) {
            if !accountsAllowed && (path.hasPrefix("/login") || path.hasPrefix("/signup")) { return .blockAccounts }
            return .allow
        }
        if matches(host, meta.hosts) {
            if !accountsAllowed && metaAccountPaths.contains(where: { path.hasPrefix($0) }) { return .blockAccounts }
            return .allow
        }
        if matches(host, snapchat.hosts) { return .allow } // chat, log in and Snap Map rules: see sites.js
        if matches(host, loginHosts) { return accountsAllowed ? .allow : .blockAccounts }
        return .block("Links to other websites stay closed.")
    }

    /// The filter rules' name for the platform a page belongs to (policy.js PLATFORMS).
    static func platform(for url: URL) -> String? {
        let host = url.host?.lowercased() ?? ""
        for (id, hosts) in [("tiktok", tiktok.hosts), ("snapchat", snapchat.hosts), ("instagram", ["instagram.com"]),
                            ("threads", ["threads.net", "threads.com"]), ("messenger", ["messenger.com"]),
                            ("facebook", ["facebook.com"])] where matches(host, hosts) {
            return id == "facebook" && path(url).hasPrefix("/messages") ? "messenger" : id
        }
        return nil
    }
    private static func path(_ url: URL) -> String { url.path.lowercased() }
}

/// The last app page you were on (for "Jump back in" on SafeTok's home), and whether you were last on
/// SafeTok's home itself, kept with the settings so the app reopens where you left off.
enum LastPage {
    static let key = "lastPage"
    static let homeKey = "lastOnHome"

    static func remember(_ url: URL) {
        let store = SettingsStore.shared
        if url.scheme == BundleSchemeHandler.scheme {
            // SafeTok's home (not blocked pages or settings); the last app page stays for "Jump back in".
            if url.path.hasPrefix("/_app/home"), store.data[homeKey] as? Bool != true { store.set([homeKey: true]) }
            return
        }
        guard Gate.service(for: url) != nil, !isAccountPage(url) else { return }
        if store.data[key] as? String != url.absoluteString || store.data[homeKey] as? Bool != false {
            store.set([key: url.absoluteString, homeKey: false])
        }
    }

    static func forget() { SettingsStore.shared.remove([key, homeKey]) }

    static var url: URL? { (SettingsStore.shared.data[key] as? String).flatMap(URL.init(string:)) }
    static var wasOnHome: Bool { SettingsStore.shared.data[homeKey] as? Bool == true }

    /// Log-in and sign-up pages aren't worth reopening; the app's main page is.
    static func isAccountPage(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? "", path = url.path.lowercased()
        return host == "accounts.snapchat.com" || Gate.metaAccountPaths.contains { path.hasPrefix($0) }
            || path.hasPrefix("/signup") || path.hasPrefix("/login")
    }
}

/// Instagram, Threads, Facebook and Messenger only get the camera and microphone on pages for making a
/// post or story, and iOS asks first. Everywhere else on Meta's sites they're switched off, so a page
/// can't listen or watch in the background. (Picking photos and videos to post still works: that uses
/// the iPhone's own photo picker.)
enum MetaMedia {
    static let postingPaths = ["/create", "/reels/create", "/stories/create", "/composer", "/compose", "/camera"]

    static func decision(origin host: String, page: URL?) -> WKPermissionDecision? {
        guard Gate.matches(host.lowercased(), Gate.meta.hosts) || Gate.service(for: page)?.id == "meta" else { return nil }
        let path = page?.path.lowercased() ?? ""
        return postingPaths.contains(where: { path.hasPrefix($0) || path.contains($0 + "/") }) ? .prompt : .deny
    }
}

/// Snapchat's web app (chat, snaps, calls, stories) only opens in desktop browsers, so its pages are
/// asked for as Safari on a Mac. Web/snapchat-web.js then lays them out at the phone's width.
enum SnapchatWeb {
    static let hosts = ["web.snapchat.com", "accounts.snapchat.com"]
    static let safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
    static let chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

    /// Which browser to look like and how to lay the page out: safari|chrome - phone|desktop.
    /// Simulator/Xcode only, for finding what Snapchat accepts: --snap-web chrome-desktop
    static let variant: String = {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--snap-web"), i + 1 < args.count { return args[i + 1] }
        return "safari-phone"
    }()
    static var userAgent: String { variant.hasPrefix("chrome") ? chrome : safari }
    /// Desktop layout: the page is laid out like a laptop screen and scaled to fit (pinch to zoom).
    static var desktopLayout: Bool { variant.contains("desktop") }
    /// "Sticky": stay a desktop browser on every snapchat.com page, not just the web app and log in.
    static var sticky: Bool { variant.contains("sticky") }

    static func wants(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        if sticky && Gate.matches(host, ["snapchat.com", "snap.com", "sc-static.net"]) { return true }
        return Gate.matches(host, hosts) || (host == "www.snapchat.com" && url.path.lowercased().hasPrefix("/web"))
    }

    /// Snapchat's log-in page, continuing to the web app. Signed out, web.snapchat.com itself just sends
    /// you to Snapchat's public home page; signed in, this goes straight through to your chats.
    static let signInURL = URL(string: "https://accounts.snapchat.com/accounts/v2/login?continue=https%3A%2F%2Fweb.snapchat.com%2F")!

    /// Where web.snapchat.com sends you when you're signed out.
    static func isSignedOutLanding(_ url: URL) -> Bool {
        url.host?.lowercased() == "www.snapchat.com" && url.path.lowercased().hasPrefix("/web")
    }

    /// The page script, told which layout to use.
    static var script: String {
        "window.__safescrollSnapLayout = \"\(desktopLayout ? "desktop" : "phone")\"; window.__safescrollSnapSticky = \(sticky);\n"
            + Resources.appFile("snapchat-web.js")
    }
}

/// Native alert / confirm / prompt for web pages, plus camera and microphone access.
class WebUIDelegate: NSObject, WKUIDelegate {
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        Dialogs.present(alert) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        Dialogs.present(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText; $0.keyboardType = .numberPad; $0.isSecureTextEntry = true }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        Dialogs.present(alert) { completionHandler(nil) }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        if let meta = MetaMedia.decision(origin: origin.host, page: webView.url) {
            if meta == .deny { AppModel.shared.flash("Camera and microphone are off here") }
            return decisionHandler(meta)
        }
        decisionHandler(.grant) // TikTok and Snapchat; iOS still shows its own prompt the first time
    }
}

enum Dialogs {
    static func present(_ controller: UIViewController, otherwise fallback: () -> Void) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard var top = scene?.keyWindow?.rootViewController else { return fallback() }
        while let next = top.presentedViewController { top = next }
        top.present(controller, animated: true)
    }
}

struct PopupItem: Identifiable {
    let id = UUID()
    let webView: WKWebView
}

/// The single TikTok web view, with the filter scripts injected into an isolated world.
/// WebKit calls all of these methods on the main thread.
final class Browser: WebUIDelegate, ObservableObject, WKNavigationDelegate {
    static let homeURL = URL(string: "safescroll://app/_app/home.html")!
    static let logNavigation = ProcessInfo.processInfo.arguments.contains("--show-url")

    let webView: WKWebView
    @Published var canGoBack = false
    @Published var currentURL: URL?
    /// Simulator only (--show-url): the last few pages asked for, D = desktop identity, M = iPhone.
    @Published var navigationLog: [String] = []
    @Published var popup: PopupItem?
    private(set) var hasLoaded = false
    /// The page SafeScroll itself just asked for, so it's let through even from a TikTok page.
    private var requestedByApp: URL?
    /// Recent switches between the iPhone and desktop browser identity, to stop a site bouncing between them.
    private var identitySwitches: [Date] = []
    /// When the app last sent a signed-out visit to Snapchat's web app on to its log-in page.
    private var lastSnapchatSignIn: Date?
    private var observation: NSKeyValueObservation?
    private var urlObservation: NSKeyValueObservation?

    override init() {
        webView = WKWebView(frame: .zero, configuration: Browser.makeConfiguration())
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) { webView.isInspectable = true } // Safari → Develop menu, for fixing selectors
        SettingsStore.shared.register(webView, world: .defaultClient)
        SettingsStore.shared.register(webView, world: .page)
        observation = webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
            DispatchQueue.main.async { self?.canGoBack = view.canGoBack }
        }
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] view, _ in
            DispatchQueue.main.async { self?.currentURL = view.url }
        }
    }

    static func makeConfiguration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps you logged in between launches
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "Version/17.5 Mobile/15E148 Safari/604.1" // look like iPhone Safari
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        let scripts = config.userContentController
        scripts.addScriptMessageHandler(Bridge.shared, contentWorld: .defaultClient, name: "safescroll")
        scripts.addScriptMessageHandler(Bridge.shared, contentWorld: .page, name: "safescroll")
        scripts.addUserScript(WKUserScript(source: SnapchatWeb.script, injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true, in: .page))
        scripts.addUserScript(WKUserScript(source: Resources.contentScript, injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true, in: .defaultClient))
        return config
    }

    func load(_ url: URL) {
        hasLoaded = true
        requestedByApp = url
        webView.load(URLRequest(url: url))
    }

    func goHome() { load(Browser.homeURL) }

    /// Opening Snapchat from SafeScroll's settings menu: straight to Spotlight or Snapchat's home page.
    func openSnapchat() { load(AppModel.shared.snapchatURL) }

    /// Signs out of every app in SafeTok (clears their cookies and site data) and goes to SafeTok's home.
    func signOut(then done: (() -> Void)? = nil) {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
            DispatchQueue.main.async {
                LastPage.forget()
                self.goHome()
                done?()
            }
        }
    }

    private func blockedPageURL(_ reason: String, for url: URL) -> URL {
        let site = Gate.platform(for: url) ?? "tiktok"
        return URL(string: "safescroll://app/blocked/blocked.html?reason=\(reason)&site=\(site)")!
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        if let url = action.request.url, SnapchatWeb.desktopLayout && SnapchatWeb.wants(url) {
            preferences.preferredContentMode = .desktop
        }
        decide(webView, action) { decisionHandler($0, preferences) }
    }

    private func decide(_ webView: WKWebView, _ action: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if Browser.logNavigation && webView === self.webView && action.targetFrame?.isMainFrame != false {
            let mode = webView.customUserAgent == SnapchatWeb.userAgent ? "D" : "M"
            navigationLog = Array((navigationLog + ["\(mode) \(url.absoluteString.prefix(90))"]).suffix(7))
        }
        // Embedded frames (players, captcha, sign-in widgets) are left alone; only whole-page moves are checked.
        if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
        let byApp = webView === self.webView && url == requestedByApp
        if byApp { requestedByApp = nil }
        switch Gate.check(url, from: webView.url, byApp: byApp, crossCheck: webView === self.webView,
                          accountsAllowed: AppModel.shared.accountsAllowed) {
        case .allow:
            if webView === self.webView && sendToSnapchatSignIn(url) { return decisionHandler(.cancel) }
            if webView === self.webView && switchIdentityIfNeeded(for: action, byApp: byApp) { return decisionHandler(.cancel) }
            decisionHandler(.allow)
        case .blockAccounts:
            decisionHandler(.cancel)
            webView.load(URLRequest(url: blockedPageURL("blockAccounts", for: url)))
        case .block(let message):
            decisionHandler(.cancel)
            AppModel.shared.flash(message)
        }
    }

    /// Signed out, Snapchat's web app sends you to its public home page; go to its log-in page instead
    /// (once in a while, so a log-in that doesn't stick can't loop).
    private func sendToSnapchatSignIn(_ url: URL) -> Bool {
        let config = AppModel.shared.config
        guard SnapchatWeb.isSignedOutLanding(url), AppModel.shared.accountsAllowed, config["disableDMs"] as? Bool != true,
              lastSnapchatSignIn.map({ $0.timeIntervalSinceNow < -20 }) ?? true else { return false }
        lastSnapchatSignIn = Date()
        load(SnapchatWeb.signInURL)
        return true
    }

    /// Snapchat's web app gets the desktop browser identity; everything else the iPhone one.
    /// Changing it means asking for the page again, which only works for plain page loads (not form posts).
    private func switchIdentityIfNeeded(for action: WKNavigationAction, byApp: Bool) -> Bool {
        guard let url = action.request.url, (action.request.httpMethod ?? "GET") == "GET" else { return false }
        let wantDesktop = SnapchatWeb.wants(url)
        guard wantDesktop != (webView.customUserAgent == SnapchatWeb.userAgent) else { return false }
        identitySwitches = identitySwitches.filter { $0.timeIntervalSinceNow > -8 } + [Date()]
        if identitySwitches.count > 4 { return false } // the site keeps bouncing; leave it as it is
        webView.customUserAgent = wantDesktop ? SnapchatWeb.userAgent : nil
        if byApp { requestedByApp = url }
        webView.load(action.request)
        return true
    }

    /// Remembers the page you're on, so SafeTok reopens where you left off.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView, let url = webView.url else { return }
        LastPage.remember(url)
    }

    // MARK: New windows open inside the app

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = action.request.url
        let host = url?.host?.lowercased() ?? ""
        let blank = url == nil || url?.absoluteString == "about:blank" || url?.absoluteString.isEmpty == true
        // Sign-in windows need to stay connected to the page that opened them, so they get a real in-app popup.
        if AppModel.shared.accountsAllowed && (blank || Gate.matches(host, Gate.loginHosts)) {
            let child = WKWebView(frame: .zero, configuration: configuration)
            child.navigationDelegate = self
            child.uiDelegate = self
            SettingsStore.shared.register(child, world: .defaultClient)
            popup = PopupItem(webView: child)
            return child
        }
        // Everything else (share links, "open in new tab") loads in the main view.
        if let url {
            switch Gate.check(url, from: webView.url, accountsAllowed: AppModel.shared.accountsAllowed) {
            case .allow: self.webView.load(action.request)
            case .blockAccounts: self.webView.load(URLRequest(url: blockedPageURL("blockAccounts", for: url)))
            case .block(let message): AppModel.shared.flash(message)
            }
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup?.webView { popup = nil }
    }
}

struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// The settings screen: the extension's options page, PIN gate included.
struct SettingsWebView: UIViewRepresentable {
    func makeCoordinator() -> WebUIDelegate { WebUIDelegate() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(Bridge.shared, contentWorld: .page, name: "safescroll")
        config.userContentController.addUserScript(WKUserScript(source: Resources.appFile("chrome-shim.js"),
                                                                injectionTime: .atDocumentStart,
                                                                forMainFrameOnly: true, in: .page))
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.tag = Bridge.settingsTag
        webView.uiDelegate = context.coordinator
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        SettingsStore.shared.register(webView, world: .page)
        webView.load(URLRequest(url: URL(string: "safescroll://app/options/options.html")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
