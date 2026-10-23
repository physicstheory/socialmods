import SwiftUI
import UIKit
import WebKit

/// Which top-level pages the app will open.
enum Gate {
    static let tiktokHosts = ["tiktok.com", "tiktokv.com", "tiktokv.us", "tiktokw.us", "tiktokcdn.com",
                              "tiktokcdn-us.com", "ttwstatic.com", "byteoversea.com", "ibytedtos.com"]
    /// Sign-in providers TikTok offers ("Continue with Apple / Google / Facebook / X / LINE / Kakao").
    static let loginHosts = ["appleid.apple.com", "accounts.google.com", "facebook.com", "twitter.com", "x.com",
                             "access.line.me", "kauth.kakao.com", "accounts.kakao.com"]

    enum Decision { case allow, blockAccounts, block(String) }

    static func matches(_ host: String, _ list: [String]) -> Bool {
        list.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func check(_ url: URL, accountsAllowed: Bool) -> Decision {
        switch url.scheme?.lowercased() ?? "" {
        case BundleSchemeHandler.scheme, "about", "blob", "data": return .allow
        case "https", "http": break
        default: return .block("Opening other apps is turned off.") // tiktok://, snssdk…://, itms-apps://
        }
        let host = url.host?.lowercased() ?? ""
        if matches(host, tiktokHosts) {
            let p = url.path.lowercased()
            if !accountsAllowed && (p.hasPrefix("/login") || p.hasPrefix("/signup")) { return .blockAccounts }
            return .allow
        }
        if matches(host, loginHosts) { return accountsAllowed ? .allow : .blockAccounts }
        return .block("Links outside TikTok stay closed.")
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

    let webView: WKWebView
    @Published var canGoBack = false
    @Published var popup: PopupItem?
    private(set) var hasLoaded = false
    private var observation: NSKeyValueObservation?

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
        scripts.addUserScript(WKUserScript(source: Resources.contentScript, injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true, in: .defaultClient))
        return config
    }

    func load(_ url: URL) {
        hasLoaded = true
        webView.load(URLRequest(url: url))
    }

    func goHome() { load(Browser.homeURL) }

    func signOut(then done: (() -> Void)? = nil) {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
            DispatchQueue.main.async {
                self.load(AppModel.shared.startURL)
                done?()
            }
        }
    }

    private func blockedPageURL(_ reason: String) -> URL {
        URL(string: "safescroll://app/blocked/blocked.html?reason=\(reason)&site=tiktok")!
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        // Embedded frames (players, captcha, sign-in widgets) are left alone; only whole-page moves are checked.
        if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
        switch Gate.check(url, accountsAllowed: AppModel.shared.accountsAllowed) {
        case .allow:
            decisionHandler(.allow)
        case .blockAccounts:
            decisionHandler(.cancel)
            webView.load(URLRequest(url: blockedPageURL("blockAccounts")))
        case .block(let message):
            decisionHandler(.cancel)
            AppModel.shared.flash(message)
        }
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
            switch Gate.check(url, accountsAllowed: AppModel.shared.accountsAllowed) {
            case .allow: self.webView.load(action.request)
            case .blockAccounts: self.webView.load(URLRequest(url: blockedPageURL("blockAccounts")))
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
