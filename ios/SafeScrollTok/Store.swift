import Foundation
import JavaScriptCore
import WebKit

/// Files bundled with the app: the browser extension folder (filters, policy,
/// settings UI) and the app-only pages in Web/.
enum Resources {
    static let extensionRoot = Bundle.main.url(forResource: "extension", withExtension: nil)!
    static let appRoot = Bundle.main.url(forResource: "Web", withExtension: nil)!

    static func extensionFile(_ path: String) -> String {
        (try? String(contentsOf: extensionRoot.appendingPathComponent(path), encoding: .utf8)) ?? ""
    }

    static func appFile(_ path: String) -> String {
        (try? String(contentsOf: appRoot.appendingPathComponent(path), encoding: .utf8)) ?? ""
    }

    /// Everything injected into TikTok pages, in the same order the extension's manifest uses.
    static var contentScript: String {
        [appFile("chrome-shim.js"),
         extensionFile("src/filters.js"),
         extensionFile("src/policy.js"),
         extensionFile("src/sites.js"),
         extensionFile("src/content.js")].joined(separator: "\n;\n")
    }
}

/// Runs the extension's own policy.js so the app and the extension can never disagree on the rules.
enum Policy {
    private static let context: JSContext = {
        let ctx = JSContext()!
        ctx.exceptionHandler = { _, err in print("policy.js error:", err?.toString() ?? "?") }
        ctx.evaluateScript(Resources.extensionFile("src/policy.js"))
        return ctx
    }()

    static func effective(age: Any?, overrides: Any?, region: Any?) -> [String: Any] {
        guard let fn = context.objectForKeyedSubscript("SafeScrollPolicy")?.objectForKeyedSubscript("effectiveSettings") else { return [:] }
        let args: [Any] = [age ?? 0, overrides ?? [String: Any](), region ?? "default"]
        return fn.call(withArguments: args)?.toDictionary() as? [String: Any] ?? [:]
    }
}

final class WeakWebView {
    weak var value: WKWebView?
    init(_ value: WKWebView) { self.value = value }
}

/// Stand-in for chrome.storage.local: a JSON dictionary saved in UserDefaults.
/// Changes are pushed to every registered web view, like chrome.storage.onChanged.
final class SettingsStore {
    static let shared = SettingsStore()

    private let defaultsKey = "safescroll.storage.v1"
    private(set) var data: [String: Any] = [:]
    private var targets: [(webView: WeakWebView, world: WKContentWorld)] = []
    var onChange: ((Set<String>) -> Void)?

    private init() {
        if let raw = UserDefaults.standard.data(forKey: defaultsKey),
           let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            data = obj
        }
    }

    func get(_ keys: Any?) -> [String: Any] {
        switch keys {
        case let key as String:
            return data[key].map { [key: $0] } ?? [:]
        case let keys as [String]:
            var out = [String: Any]()
            for key in keys { if let value = data[key] { out[key] = value } }
            return out
        case let defaults as [String: Any]:
            var out = defaults
            for key in defaults.keys { if let value = data[key] { out[key] = value } }
            return out
        default:
            return data
        }
    }

    func set(_ items: [String: Any]) {
        guard !items.isEmpty else { return }
        var changes = [String: Any]()
        for (key, value) in items {
            changes[key] = ["oldValue": data[key] ?? NSNull(), "newValue": value]
            data[key] = value
        }
        persist()
        broadcast(changes)
    }

    func remove(_ keys: [String]) {
        var changes = [String: Any]()
        for key in keys where data[key] != nil {
            changes[key] = ["oldValue": data[key]!, "newValue": NSNull()]
            data[key] = nil
        }
        guard !changes.isEmpty else { return }
        persist()
        broadcast(changes)
    }

    func register(_ webView: WKWebView, world: WKContentWorld) {
        targets.removeAll { $0.webView.value == nil }
        targets.append((WeakWebView(webView), world))
    }

    private func persist() {
        if let raw = try? JSONSerialization.data(withJSONObject: data) {
            UserDefaults.standard.set(raw, forKey: defaultsKey)
        }
    }

    private func broadcast(_ changes: [String: Any]) {
        if let json = try? JSONSerialization.data(withJSONObject: changes),
           let payload = String(data: json, encoding: .utf8) {
            let js = "window.__safescrollChanged && window.__safescrollChanged(\(payload))"
            targets.removeAll { $0.webView.value == nil }
            for target in targets {
                guard let webView = target.webView.value else { continue }
                // In the page world, only the app's own pages hear about changes, never TikTok's scripts.
                if target.world == .page && webView.url?.scheme != BundleSchemeHandler.scheme { continue }
                webView.evaluateJavaScript(js, in: nil, in: target.world, completionHandler: nil)
            }
        }
        onChange?(Set(changes.keys))
    }
}
