import CryptoKit
import Foundation
import SwiftUI
import WebKit

/// Answers the chrome.* shim's calls from web pages (see Web/chrome-shim.js).
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    static let shared = Bridge()
    static let settingsTag = 4242

    /// Keys the filter scripts running on TikTok may update (screen-time counters).
    private let counterKeys: Set<String> = ["usage", "fypUsage"]

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let fromAppPage = message.frameInfo.securityOrigin.protocol == BundleSchemeHandler.scheme
        // TikTok's own scripts run in the page world; ignore anything they send.
        if message.world == .page && !fromAppPage { return replyHandler(nil, "not allowed") }
        // Only the settings screen (behind the parent PIN) may change rules or the PIN.
        let canChangeSettings = fromAppPage && message.webView?.tag == Bridge.settingsTag

        guard let body = message.body as? [String: Any], let op = body["op"] as? String else {
            return replyHandler(nil, "bad message")
        }
        let store = SettingsStore.shared
        switch op {
        case "get":
            replyHandler(store.get(body["keys"]), nil)
        case "set":
            let items = body["items"] as? [String: Any] ?? [:]
            store.set(canChangeSettings ? items : items.filter { counterKeys.contains($0.key) })
            replyHandler(nil, nil)
        case "remove":
            if canChangeSettings { store.remove(body["keys"] as? [String] ?? []) }
            replyHandler(nil, nil)
        case "sha256":
            let input = body["input"] as? String ?? ""
            replyHandler(SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined(), nil)
        case "openSettings":
            DispatchQueue.main.async { AppModel.shared.showSettings = true }
            replyHandler(nil, nil)
        case "edges":
            let top = Bridge.rgb(body["top"] as? String), bottom = Bridge.rgb(body["bottom"] as? String)
            DispatchQueue.main.async {
                let model = AppModel.shared
                if let top { model.edgeTop = Color(red: top.r, green: top.g, blue: top.b); model.topIsDark = top.isDark }
                if let bottom { model.edgeBottom = Color(red: bottom.r, green: bottom.g, blue: bottom.b) }
            }
            replyHandler(nil, nil)
        case "open":
            if let url = (body["url"] as? String).flatMap(URL.init(string:)) {
                DispatchQueue.main.async { AppModel.shared.browser.load(url) }
            }
            replyHandler(nil, nil)
        default:
            replyHandler(nil, "unknown op \(op)")
        }
    }
}

extension Bridge {
    /// Parses "rgb(r, g, b)" / "rgba(r, g, b, a)" from getComputedStyle.
    static func rgb(_ css: String?) -> (r: Double, g: Double, b: Double, isDark: Bool)? {
        guard let css, let open = css.firstIndex(of: "("), let close = css.lastIndex(of: ")") else { return nil }
        let parts = css[css.index(after: open)..<close].split(separator: ",")
            .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count >= 3 else { return nil }
        let (r, g, b) = (parts[0], parts[1], parts[2])
        return (r / 255, g / 255, b / 255, 0.299 * r + 0.587 * g + 0.114 * b < 140)
    }
}

/// Serves bundled files at safescroll://app/… so pages like the settings screen
/// and the blocked page load inside the same web views as TikTok.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "safescroll"

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        let root: URL
        if path.hasPrefix("/_app/") {
            root = Resources.appRoot
            path.removeFirst("/_app/".count)
        } else {
            root = Resources.extensionRoot
            path = String(path.drop { $0 == "/" })
        }
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let body = try? Data(contentsOf: file) else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        let headers = ["Content-Type": Self.mimeType(file.pathExtension), "Cache-Control": "no-store"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(body)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        default: return "application/octet-stream"
        }
    }
}
