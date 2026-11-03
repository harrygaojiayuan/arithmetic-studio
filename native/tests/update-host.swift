import Cocoa

// Compiled only by the Mac integration test, never shipped in the application.
final class UpdateTestDelegate: NSObject, NSApplicationDelegate {
    let updater = PracticeUpdater()
    var configuration: [String: String] = [:]
    var states: [String] = []
    func report(_ value: [String: Any]) {
        let data = try! JSONSerialization.data(withJSONObject:value)
        try! data.write(to:URL(fileURLWithPath:configuration["report"]!), options:.atomic)
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        configuration = try! JSONDecoder().decode([String:String].self,
            from:Data(contentsOf:Bundle.main.url(forResource:"update-test", withExtension:"json")!))
        if updater.currentVersion == "9.0.1" {
            report(["ok":true, "relaunched":true, "version":updater.currentVersion])
            NSApp.terminate(nil)
            return
        }
        updater.onChange = { [weak self] state in
            guard let self = self, let status = state["status"] as? String else { return }
            self.states.append(status)
            try? JSONSerialization.data(withJSONObject:self.states).write(
                to:URL(fileURLWithPath:self.configuration["states"]!), options:.atomic)
            if status == "available" { self.updater.action("install") }
            if status == "error" {
                self.report(["ok":false, "status":status, "version":self.updater.currentVersion])
                NSApp.terminate(nil)
            }
        }
        updater.action("check")
    }
}

@main struct UpdateTestHost {
    static func main() {
        let application = NSApplication.shared
        let delegate = UpdateTestDelegate()
        application.setActivationPolicy(.accessory)
        application.delegate = delegate
        application.run()
        withExtendedLifetime(delegate) {}
    }
}
