import Cocoa
import WebKit

final class PracticeStore {
    let fileURL: URL
    var values: [String: String]

    init() throws {
        let support = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = support.appendingPathComponent("ArithmeticStudio", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("data.json")
        if FileManager.default.fileExists(atPath: fileURL.path) {
            values = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: fileURL))
        } else {
            values = [:]
        }
    }

    func save() throws {
        let data = try JSONEncoder().encode(values)
        try data.write(to: fileURL, options: .atomic)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var store: PracticeStore!
    var isClosing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            store = try PracticeStore()
            createMenu()
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
            configuration.userContentController.add(self, name: "arithmeticStorage")
            let resources = Bundle.main.resourceURL!
            let bridge = try String(contentsOf: resources.appendingPathComponent("storage-bridge.js"), encoding: .utf8)
            let initial = String(data: try JSONEncoder().encode(store.values), encoding: .utf8)!
            configuration.userContentController.addUserScript(WKUserScript(
                source: "window.__ARITHMETIC_INITIAL_DATA__ = \(initial);\n" + bridge,
                injectionTime: .atDocumentStart, forMainFrameOnly: true))

            webView = WKWebView(frame: .zero, configuration: configuration)
            webView.navigationDelegate = self
            webView.allowsBackForwardNavigationGestures = false
            webView.underPageBackgroundColor = NSColor(srgbRed: 0.969, green: 0.973, blue: 0.949, alpha: 1)
            let available = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1200, height: 900)
            window = NSWindow(contentRect: NSRect(x: 0, y: 0,
                width: min(1100, available.width - 60), height: min(820, available.height - 60)),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered, defer: false)
            window.title = "算数练习室"
            window.contentMinSize = NSSize(width: 380, height: 590)
            window.appearance = NSAppearance(named: .aqua)
            window.backgroundColor = NSColor(srgbRed: 0.969, green: 0.973, blue: 0.949, alpha: 1)
            window.contentView = webView
            window.center()
            window.setFrameAutosaveName("ArithmeticStudioMainWindow")
            window.isReleasedWhenClosed = false
            let html = try String(contentsOf: resources.appendingPathComponent("index.html"), encoding: .utf8)
            webView.loadHTMLString(html, baseURL: resources)
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } catch {
            let alert = NSAlert()
            alert.messageText = "无法打开算数练习室"
            alert.informativeText = "应用文件或本地数据无法读取。\n\(error.localizedDescription)"
            alert.alertStyle = .warning
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func createMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于算数练习室", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏算数练习室", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出算数练习室", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        editItem.title = "编辑"
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)

        let windowItem = NSMenuItem()
        windowItem.title = "窗口"
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        menu.addItem(windowItem)
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = menu
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String,
              let key = body["key"] as? String,
              key.hasPrefix("arithmetic-studio.") else { return }
        if action == "set", let value = body["value"] as? String {
            store.values[key] = value
        } else if action == "remove" {
            store.values.removeValue(forKey: key)
        } else { return }
        do { try store.save() } catch {
            webView.evaluateJavaScript("window.dispatchEvent(new Event('arithmetic-storage-error'))", completionHandler: nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let webView = webView, let store = store, !isClosing else { return .terminateNow }
        isClosing = true
        // Capture the latest in-memory state before quitting, including messages still in transit.
        webView.evaluateJavaScript("window.arithmeticStorage.snapshot()") { value, _ in
            if let snapshot = value as? [String: String] {
                store.values = snapshot
                try? store.save()
            }
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || (url.isFileURL && url.path.hasPrefix(Bundle.main.resourceURL!.path)) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard let resources = Bundle.main.resourceURL,
              let html = try? String(contentsOf: resources.appendingPathComponent("index.html"), encoding: .utf8),
              let initialData = try? JSONEncoder().encode(store.values),
              let initial = String(data: initialData, encoding: .utf8),
              let bridge = try? String(contentsOf: resources.appendingPathComponent("storage-bridge.js"), encoding: .utf8) else { return }
        webView.configuration.userContentController.removeAllUserScripts()
        webView.configuration.userContentController.addUserScript(WKUserScript(
            source: "window.__ARITHMETIC_INITIAL_DATA__ = \(initial);\n" + bridge,
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.loadHTMLString(html, baseURL: resources)
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
