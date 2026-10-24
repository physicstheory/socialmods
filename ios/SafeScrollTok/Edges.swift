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
        if let top = top?.edgeStrip() {
            self.top = top
            let dark = top.isMostlyDark
            if AppModel.shared.topIsDark != dark { AppModel.shared.topIsDark = dark }
        }
        if let bottom = bottom?.edgeStrip() { self.bottom = bottom }
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
            Image(uiImage: image).resizable().interpolation(.high)
        } else {
            Color(uiColor: .systemBackground)
        }
    }
}

extension UIImage {
    /// What a strip shows for this row of the page: one flat colour when the row is nearly all one
    /// colour (menus, plain pages, tab bars), so a stray line or icon edge can't smudge it; otherwise
    /// the row softened (videos and photos).
    func edgeStrip() -> UIImage? {
        guard let cg = cgImage else { return nil }
        let width = max(1, min(cg.width, 400))
        var pixels = [UInt8](repeating: 0, count: width * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let ctx = CGContext(data: buffer.baseAddress, width: width, height: 1, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            ctx.interpolationQuality = .none
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: 1))
            return true
        }
        guard drawn else { return nil }
        let bin = { (i: Int) in Int(pixels[i * 4] >> 4) << 8 | Int(pixels[i * 4 + 1] >> 4) << 4 | Int(pixels[i * 4 + 2] >> 4) }
        var counts = [Int: Int]()
        for i in 0..<width { counts[bin(i), default: 0] += 1 }
        guard let top = counts.max(by: { $0.value < $1.value }), top.value * 10 >= width * 8 else { return softened() }
        var sum = (r: 0, g: 0, b: 0)
        for i in 0..<width where bin(i) == top.key {
            sum.r += Int(pixels[i * 4]); sum.g += Int(pixels[i * 4 + 1]); sum.b += Int(pixels[i * 4 + 2])
        }
        let n = CGFloat(top.value * 255)
        let colour = UIColor(red: CGFloat(sum.r) / n, green: CGFloat(sum.g) / n, blue: CGFloat(sum.b) / n, alpha: 1)
        return UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { ctx in
            colour.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }

    /// The row squeezed to a few pixels wide (averaging as it goes), so thin details like a line or
    /// a logo's edge don't turn into stripes when stretched, while the colours still line up with the page.
    func softened(width: Int = 24) -> UIImage? {
        guard let cg = cgImage,
              let ctx = CGContext(data: nil, width: width, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: 1))
        return ctx.makeImage().map { UIImage(cgImage: $0) }
    }

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
