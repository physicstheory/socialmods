import SwiftUI
import UIKit
import WebKit

/// Which top-level pages the app will open.
enum Gate {
    static let tiktokHosts = ["tiktok.com", "tiktokv.com", "tiktokv.us", "tiktokw.us", "tiktokcdn.com",
                              "tiktokcdn-us.com", "ttwstatic.com", "byteoversea.com", "ibytedtos.com",
                              "snapchat.com", "snap.com"] // Snapchat's own rules (chat, log in, Snap Map) are applied by the filter scripts
    /// Sign-in providers TikTok offers ("Continue with Apple / Google / Facebook / X / LINE / Kakao").
    static let snapchatHosts = ["snapchat.com", "snap.com"]
    /// Snapchat's log in / sign up site and its web chat, which need an account.
    static let snapchatAccountHosts = ["accounts.snapchat.com", "web.snapchat.com"]
    static let loginHosts = ["appleid.apple.com", "accounts.google.com", "facebook.com", "twitter.com", "x.com",
                             "access.line.me", "kauth.kakao.com", "accounts.kakao.com"]

    enum Decision { case allow, blockAccounts, block(String) }

    static func matches(_ host: String, _ list: [String]) -> Bool {
        list.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// Snapchat only opens from SafeScroll itself (home screen or settings menu), or from
    /// a page that's already Snapchat — never by following a link out of TikTok.
    /// `byApp` is true when SafeScroll itself asked for this page (settings menu, start page).
    static func check(_ url: URL, from current: URL?, byApp: Bool = false, accountsAllowed: Bool) -> Decision {
        let host = url.host?.lowercased() ?? ""
        if matches(host, snapchatHosts) && !byApp {
            let fromHost = current?.host?.lowercased() ?? ""
            let fromApp = current == nil || current?.scheme == BundleSchemeHandler.scheme
            if !fromApp && !matches(fromHost, snapchatHosts) {
                return .block("Open Snapchat from SafeScroll's home screen or settings.")
            }
        }
        return check(url, accountsAllowed: accountsAllowed)
    }

    static func check(_ url: URL, accountsAllowed: Bool) -> Decision {
        switch url.scheme?.lowercased() ?? "" {
        case BundleSchemeHandler.scheme, "about", "blob", "data": return .allow
        case "https", "http": break
        default: return .block("Opening other apps is turned off.") // tiktok://, snssdk…://, itms-apps://
        }
        let host = url.host?.lowercased() ?? ""
        if matches(host, snapchatAccountHosts) && !accountsAllowed { return .blockAccounts }
        if matches(host, tiktokHosts) {
            let p = url.path.lowercased()
            if !accountsAllowed && (p.hasPrefix("/login") || p.hasPrefix("/signup")) { return .blockAccounts }
            return .allow
        }
        if matches(host, loginHosts) { return accountsAllowed ? .allow : .blockAccounts }
        return .block("Links outside TikTok stay closed.")
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
        decisionHandler(.grant) // iOS still shows its own camera/microphone prompt the first time
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

    func signOut(then done: (() -> Void)? = nil) {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
            DispatchQueue.main.async {
                self.load(AppModel.shared.startURL)
                done?()
            }
        }
    }

    private func blockedPageURL(_ reason: String, for url: URL) -> URL {
        let site = Gate.matches(url.host?.lowercased() ?? "", Gate.snapchatHosts) ? "snapchat" : "tiktok"
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
        switch Gate.check(url, from: webView.url, byApp: byApp, accountsAllowed: AppModel.shared.accountsAllowed) {
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
