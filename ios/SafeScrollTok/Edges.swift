import SwiftUI
import UIKit
import WebKit

/// Copies the page's top and bottom rows of pixels a few times a second, so the strips under
/// the clock and below the page can show them stretched. Whatever the page is (a video, a white
/// menu, Snapchat's tab bar), the strips match it exactly, with nothing to guess from the page's code.
/// Also keeps the web view on the phone's own Light / Dark setting. Main thread only.
final class EdgeSampler: ObservableObject {
    @Published private(set) var top: UIImage?
    @Published private(set) var bottom: UIImage?
    private weak var webView: WKWebView?
    private var timer: Timer?
    private var busySince: Date?

    func start(_ webView: WKWebView) {
        self.webView = webView
        followPhoneTheme()
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// The app window takes its Light / Dark look from the top of the page (for the clock's colour),
    /// so the web views are pinned to the phone's real setting instead.
    private func followPhoneTheme() {
        let style = UIScreen.main.traitCollection.userInterfaceStyle
        let model = AppModel.shared
        let scheme: ColorScheme = style == .dark ? .dark : .light
        if model.systemScheme != scheme { model.systemScheme = scheme }
        for view in [webView, model.browser.popup?.webView].compactMap({ $0 }) where view.overrideUserInterfaceStyle != style {
            view.overrideUserInterfaceStyle = style
        }
    }

    private func tick() {
        followPhoneTheme()
        // A snapshot that never comes back (the page's process restarting) mustn't stop the strips for good.
        guard let webView, webView.window != nil, webView.bounds.height > 4,
              busySince.map({ Date().timeIntervalSince($0) > 2 }) ?? true else { return }
        busySince = Date()
        let width = webView.bounds.width, height = webView.bounds.height
        snapshotRow(of: webView, y: 0, width: width) { [weak self] top in
            self?.snapshotRow(of: webView, y: height - 1, width: width) { bottom in
                self?.update(top: top, bottom: bottom)
            }
        }
    }

    private func snapshotRow(of webView: WKWebView, y: CGFloat, width: CGFloat, done: @escaping (UIImage?) -> Void) {
        let config = WKSnapshotConfiguration()
        config.rect = CGRect(x: 0, y: y, width: width, height: 1)
        config.afterScreenUpdates = false
        webView.takeSnapshot(with: config) { image, _ in done(image) }
    }

    private func update(top: UIImage?, bottom: UIImage?) {
        busySince = nil
        if let top {
            self.top = top
            let dark = top.isMostlyDark
            if AppModel.shared.topIsDark != dark { AppModel.shared.topIsDark = dark }
        }
        if let bottom { self.bottom = bottom }
    }
}

/// The two strips, sized to the clock area and the home-bar area.
struct EdgeStrips: View {
    @ObservedObject var sampler: EdgeSampler

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                strip(sampler.top).frame(height: geo.safeAreaInsets.top)
                Spacer(minLength: 0)
                strip(sampler.bottom).frame(height: geo.safeAreaInsets.bottom)
            }
            .ignoresSafeArea()
        }
    }

    @ViewBuilder private func strip(_ image: UIImage?) -> some View {
        if let image {
            Image(uiImage: image).resizable().interpolation(.none)
        } else {
            Color(uiColor: .systemBackground)
        }
    }
}

extension UIImage {
    /// Average brightness of the image, judged the way the eye sees it.
    var isMostlyDark: Bool {
        guard let cg = cgImage else { return false }
        let samples = 16
        var pixels = [UInt8](repeating: 0, count: samples * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let ctx = CGContext(data: buffer.baseAddress, width: samples, height: 1, bitsPerComponent: 8,
                                      bytesPerRow: samples * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: samples, height: 1))
            return true
        }
        guard drawn else { return false }
        var total = 0.0
        for i in 0..<samples {
            total += 0.299 * Double(pixels[i * 4]) + 0.587 * Double(pixels[i * 4 + 1]) + 0.114 * Double(pixels[i * 4 + 2])
        }
        return total / Double(samples) < 140
    }
}
