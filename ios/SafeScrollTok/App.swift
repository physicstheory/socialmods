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
    lazy var browser = Browser()

    var accountsAllowed: Bool { config["accountsAllowed"] as? Bool ?? false }
    /// Where the app opens: TikTok's For You if it's on, otherwise Following. SafeScroll's own
    /// home page (approved creators) only when there's no account and For You is off.
    var startURL: URL {
        let forYou = config["forYou"] as? [String: Any]
        if forYou?["enabled"] as? Bool == true { return URL(string: "https://www.tiktok.com/foryou")! }
        if accountsAllowed { return URL(string: "https://www.tiktok.com/following")! }
        return Browser.homeURL
    }
    var minAccountAge: Int { (config["minAccountAge"] as? NSNumber)?.intValue ?? 13 }

    private init() {
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

/// Shown once after setup: connect a TikTok account, or watch without one.
struct WelcomeView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 60))
                .foregroundStyle(.linearGradient(colors: [.blue, .indigo], startPoint: .top, endPoint: .bottom))
            Text(model.accountsAllowed ? "Connect to TikTok" : "Ready to watch")
                .font(.title.bold())
            if model.accountsAllowed {
                Text("Log in or create an account. TikTok opens inside this app with your filters and limits on.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button { start("https://www.tiktok.com/login") } label: {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large).padding(.top, 8)
                Button { start("https://www.tiktok.com/signup") } label: {
                    Text("Create an account").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered).controlSize(.large)
                Button("Watch without an account") { start(nil) }.padding(.top, 4)
            } else {
                Text("Where you live, TikTok accounts start at \(model.minAccountAge), so this app runs without one. Public videos still play with all your filters on.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button { start(nil) } label: { Text("Start watching").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large).padding(.top, 8)
            }
            Spacer()
        }
        .padding(28)
    }

    private func start(_ link: String?) {
        model.browser.load(link.flatMap(URL.init(string:)) ?? model.startURL)
        model.welcomeDone = true
    }
}

struct MainView: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var browser: Browser

    var body: some View {
        // Just TikTok's own mobile site, with its own bottom bar (Home, Friends, +, Inbox, Profile).
        // Swipe from the left edge to go back.
        WebViewHost(webView: browser.webView)
            .background(Color.black.ignoresSafeArea())
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
        .animation(.easeInOut, value: model.toast)
        .sheet(isPresented: $model.showSettings) { SettingsSheet(browser: browser) }
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
        }
        .onAppear {
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
                            Button { browser.load(AppModel.shared.startURL); dismiss() } label: { Label("Back to TikTok", systemImage: "play.rectangle") }
                            Button { browser.goHome(); dismiss() } label: { Label("Approved creators", systemImage: "person.2") }
                            Button { browser.webView.reload(); dismiss() } label: { Label("Reload page", systemImage: "arrow.clockwise") }
                            Button("Sign out of TikTok", role: .destructive) { confirmSignOut = true }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) { Button("Done") { dismiss() } }
                }
                .confirmationDialog("Sign out of TikTok in this app?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                    Button("Sign out", role: .destructive) { browser.signOut { dismiss() } }
                }
        }
    }
}
