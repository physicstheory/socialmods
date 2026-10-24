import SwiftUI
import WebKit

@main
struct SafeScrollApp: App {
    @StateObject private var model = AppModel.shared
    var body: some Scene {
        WindowGroup { RootView().environmentObject(model) }
    }
}

/// App-wide state. Only touched on the main thread.
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published var setupDone: Bool
    @Published var welcomeDone: Bool { didSet { UserDefaults.standard.set(welcomeDone, forKey: "welcomeDone") } }
    @Published var showSettings = false
    @Published var toast: String?
    @Published private(set) var config: [String: Any] = [:]
    /// Whether the top of the page is dark, so the clock and battery stay readable over it.
    @Published var topIsDark = false
    /// The phone's own Light / Dark setting. Web pages and settings always follow this.
    @Published var systemScheme: ColorScheme = UIScreen.main.traitCollection.userInterfaceStyle == .dark ? .dark : .light
    lazy var browser = Browser()
    let edges = EdgeSampler()

    var accountsAllowed: Bool { config["accountsAllowed"] as? Bool ?? false }
    /// Where the app opens: the page you were last on, if the current rules still allow it,
    /// otherwise SafeTok's home screen.
    var startURL: URL {
        if !LastPage.wasOnHome, let last = LastPage.url, canResume(last) { return last }
        return Browser.homeURL
    }

    func canResume(_ url: URL) -> Bool {
        if url.scheme == BundleSchemeHandler.scheme { return true }
        guard case .allow = Gate.check(url, accountsAllowed: accountsAllowed) else { return false }
        if let platform = Gate.platform(for: url), (config["blockedPlatforms"] as? [String] ?? []).contains(platform) { return false }
        return true
    }
    var minAccountAge: Int { (config["minAccountAge"] as? NSNumber)?.intValue ?? 13 }
    var snapchatBlocked: Bool { (config["blockedPlatforms"] as? [String] ?? []).contains("snapchat") }
    /// Where "Snapchat" in SafeScroll opens: Snapchat's full web app (chat and snaps) when chat is allowed,
    /// otherwise Spotlight when For You is on, otherwise Snapchat's home page.
    var snapchatURL: URL {
        if accountsAllowed && config["disableDMs"] as? Bool != true { return SnapchatWeb.signInURL }
        let forYou = config["forYou"] as? [String: Any]
        return URL(string: forYou?["enabled"] as? Bool == true ? "https://www.snapchat.com/spotlight" : "https://www.snapchat.com/")!
    }

    private init() {
        // Simulator/Xcode only (screenshots): --welcome-done YES|NO
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--welcome-done"), i + 1 < args.count {
            UserDefaults.standard.set(args[i + 1] == "YES", forKey: "welcomeDone")
        }
        setupDone = SettingsStore.shared.data["pinHash"] != nil
        welcomeDone = UserDefaults.standard.bool(forKey: "welcomeDone")
        refresh()
        SettingsStore.shared.onChange = { [weak self] _ in
            DispatchQueue.main.async { self?.refresh() }
        }
    }

    func refresh() {
        let data = SettingsStore.shared.data
        let wasAllowed = accountsAllowed
        config = Policy.effective(age: data["age"], overrides: data["overrides"], region: data["region"])
        setupDone = data["pinHash"] != nil
        // If the age or country changes so accounts are no longer allowed, sign out automatically.
        if wasAllowed && !accountsAllowed && welcomeDone { browser.signOut() }
    }

    func flash(_ message: String) {
        toast = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            if self?.toast == message { self?.toast = nil }
        }
    }
}

/// Setup and the welcome screen only ever show once. After that the app opens
/// straight into TikTok with the saved settings (kept in UserDefaults and the
/// web view's own cookie store, so they survive closing the app and restarts).
struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        if !model.setupDone {
            SettingsWebView().ignoresSafeArea(edges: .bottom) // first run: PIN, age and country
        } else if !model.welcomeDone {
            WelcomeView()
        } else {
            MainView(browser: model.browser)
        }
    }
}

/// "SafeTok" in its own font (Lilita One) with the icon's cyan and pink offset.
struct Wordmark: View {
    var size: CGFloat
    var body: some View {
        let text = Text("SafeTok").font(.custom("LilitaOne", size: size))
        ZStack {
            text.foregroundStyle(Color(red: 0.145, green: 0.957, blue: 0.933)).offset(x: -size / 22, y: -size / 30)
            text.foregroundStyle(Color(red: 0.996, green: 0.173, blue: 0.333)).offset(x: size / 22, y: size / 30)
            text.foregroundStyle(.primary)
        }
        .accessibilityElement().accessibilityLabel("SafeTok")
    }
}

/// Shown once after setup.
struct WelcomeView: View {
    @EnvironmentObject var model: AppModel
    private let pink = Color(red: 0.996, green: 0.173, blue: 0.333)
    private let cyan = Color(red: 0.145, green: 0.957, blue: 0.933)

    var body: some View {
        ZStack {
            LinearGradient(colors: [cyan.opacity(0.16), .clear, pink.opacity(0.14)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer(minLength: 12)
                Image("Logo")
                    .resizable().frame(width: 108, height: 108)
                    .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
                    .shadow(color: pink.opacity(0.25), radius: 18, y: 8)
                VStack(spacing: 2) {
                    Text("Welcome to").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                    Wordmark(size: 48)
                }
                Text("TikTok, Snapchat, Instagram, Threads and Facebook in one place, with your family's rules built in.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 16) {
                    feature("checkmark.shield.fill", "\(model.config["tierLabel"] as? String ?? "Age") rules",
                            "Filters, For You limits and bedtime follow the age set in Settings.")
                    feature("arrow.uturn.backward.circle.fill", "Picks up where you left off",
                            "SafeTok reopens the app and page you were last on.")
                    if model.accountsAllowed {
                        feature("key.fill", "Stays signed in",
                                "Sign in once in each app. Your iPhone's Passwords can fill in the details.")
                    } else {
                        feature("lock.fill", "No accounts yet",
                                "Where you live, accounts start at \(model.minAccountAge). Public videos still play.")
                    }
                }
                .padding(20)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding(.top, 6)
                Spacer(minLength: 12)
                Button { start() } label: {
                    Text("Get started").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).controlSize(.large).tint(pink)
            }
            .padding(.horizontal, 26).padding(.vertical, 20)
        }
    }

    private func feature(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol).font(.title3).foregroundStyle(pink).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func start() {
        model.browser.goHome()
        model.welcomeDone = true
    }
}

struct MainView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var browser: Browser

    var body: some View {
        ZStack {
            // The strips under the clock and below the page show the page's own top and bottom
            // rows of pixels, so TikTok and Snapchat run edge to edge like their real apps.
            EdgeStrips(sampler: model.edges)
            // Just TikTok's own mobile site, with its own bottom bar (Home, Friends, +, Inbox, Profile).
            // Swipe from the left edge to go back.
            WebViewHost(webView: browser.webView)
        }
        // Only the clock and battery colour follows the page; the pages themselves follow the phone's theme.
        .preferredColorScheme(model.topIsDark ? .dark : .light)
        // Small cog for parent settings, top-right on every screen.
        .overlay(alignment: .topTrailing) {
            Button { model.showSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(.top, 4)
            .padding(.trailing, 12)
            .accessibilityLabel("Settings")
        }
        .overlay(alignment: .top) {
            if let toast = model.toast {
                Text(toast)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.top, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        // Simulator/Xcode only (screenshots): --show-url prints the page address at the bottom.
        .overlay(alignment: .bottom) {
            if ProcessInfo.processInfo.arguments.contains("--show-url") {
                Text((browser.navigationLog + ["now: " + (browser.currentURL?.absoluteString ?? "")]).joined(separator: "\n"))
                    .font(.system(size: 9, design: .monospaced)).lineLimit(16)
                    .padding(6).background(.black.opacity(0.75)).foregroundStyle(.white)
                    .padding(.bottom, 90)
            }
        }
        .animation(.easeInOut, value: model.toast)
        .sheet(isPresented: $model.showSettings) {
            SettingsSheet(browser: browser).preferredColorScheme(model.systemScheme)
        }
        .sheet(item: $browser.popup) { item in
            NavigationStack {
                WebViewHost(webView: item.webView)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(item.webView.url?.host ?? "Sign in")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) { Button("Close") { browser.popup = nil } }
                    }
            }
            .preferredColorScheme(model.systemScheme)
        }
        .onAppear {
            model.edges.start(browser.webView)
            // Launch arguments (only settable from Xcode or the simulator), used to take screenshots:
            //   --open <url>      open this page instead of the usual start page
            //   --show-settings   open the settings sheet
            let args = ProcessInfo.processInfo.arguments
            if !browser.hasLoaded {
                if let i = args.firstIndex(of: "--open"), i + 1 < args.count, let url = URL(string: args[i + 1]) {
                    browser.load(url)
                } else {
                    browser.load(model.startURL)
                }
            }
            if args.contains("--show-settings") { model.showSettings = true }
        }
        .onDisappear { model.edges.stop() }
    }
}

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let browser: Browser
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            SettingsWebView()
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Parent settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Menu {
                            Button { browser.load(AppModel.shared.startURL); dismiss() } label: { Label("Jump back in", systemImage: "arrow.uturn.backward") }
                            Button { browser.goHome(); dismiss() } label: { Label("SafeTok home", systemImage: "house") }
                            if !AppModel.shared.snapchatBlocked {
                                Button { browser.openSnapchat(); dismiss() } label: { Label("Open Snapchat", systemImage: "camera") }
                            }
                            Button { browser.webView.reload(); dismiss() } label: { Label("Reload page", systemImage: "arrow.clockwise") }
                            Button {
                                browser.copyReport { dismiss(); AppModel.shared.flash("Report copied. Paste it to Claude.") }
                            } label: { Label("Copy page report", systemImage: "doc.on.clipboard") }
                            Button("Sign out of all apps", role: .destructive) { confirmSignOut = true }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) { Button("Done") { dismiss() } }
                }
                .confirmationDialog("Sign out of TikTok, Snapchat and the Meta apps in SafeTok?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                    Button("Sign out", role: .destructive) { browser.signOut { dismiss() } }
                }
        }
    }
}
