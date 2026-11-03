import Cocoa
import Sparkle

// Sparkle verifies signed archives and manages replacement, authorization and relaunch.
// The user opts in once using our settings panel. No practice data enters this service.
final class PracticeUpdater: NSObject, SPUUserDriver {
    let currentVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    var state: [String: Any] = [:]
    var onChange: (([String: Any]) -> Void)?
    private var updateReply: ((SPUUserUpdateChoice) -> Void)?
    private var installRequested = false
    private var expectedBytes: UInt64 = 0
    private var receivedBytes: UInt64 = 0
    private var started = false
    private lazy var engine = SPUUpdater(hostBundle: Bundle.main, applicationBundle: Bundle.main,
                                        userDriver: self, delegate: nil)

    override init() {
        super.init()
        state = ["currentVersion":currentVersion, "supported":true, "status":"idle",
                 "message":"从 GitHub 检查最新正式版本。", "progress":0]
    }
    private func update(_ values: [String: Any]) {
        state.merge(values) { _, new in new }
        onChange?(state)
    }
    private func fail() {
        installRequested = false
        updateReply = nil
        update(["status":"error", "progress":0,
                "message":"更新未完成，请检查网络或安装权限后重试。原有练习记录会保留。"])
    }
    func action(_ action: String) {
        if action == "check" { check() }
        else if action == "install", state["status"] as? String == "available", let reply = updateReply {
            updateReply = nil
            installRequested = true
            update(["status":"downloading", "progress":0,
                    "message":"正在后台下载更新，完成后将自动安装并重启…"])
            reply(.install)
        }
    }
    private func check() {
        guard !["checking","available","downloading","preparing","installing"].contains(state["status"] as? String ?? "") else { return }
        do {
            if !started { try engine.start(); started = true }
            guard engine.canCheckForUpdates else { return }
            installRequested = false
            update(["status":"checking", "message":"正在检查 GitHub…", "progress":0])
            engine.checkForUpdates()
        } catch { fail() }
    }
    func show(_ request: SPUUpdatePermissionRequest, reply: @escaping (SUUpdatePermissionResponse) -> Void) {
        reply(SUUpdatePermissionResponse(automaticUpdateChecks:false, sendSystemProfile:false))
    }
    func showUserInitiatedUpdateCheck(cancellation: @escaping () -> Void) {}
    func showUpdateFound(with appcastItem: SUAppcastItem, state: SPUUserUpdateState,
                         reply: @escaping (SPUUserUpdateChoice) -> Void) {
        guard !appcastItem.isInformationOnlyUpdate else { reply(.dismiss); fail(); return }
        updateReply = reply
        update(["status":"available", "version":appcastItem.displayVersionString,
                "message":"发现新版本 \(appcastItem.displayVersionString)。点击安装后将自动下载、安装并重启。"])
    }
    func showUpdateReleaseNotes(with downloadData: SPUDownloadData) {}
    func showUpdateReleaseNotesFailedToDownloadWithError(_ error: Error) {}
    func showUpdateNotFoundWithError(_ error: Error, acknowledgement: @escaping () -> Void) {
        update(["status":"current", "message":"当前已是最新版本。"])
        acknowledgement()
    }
    func showUpdaterError(_ error: Error, acknowledgement: @escaping () -> Void) {
        fail()
        acknowledgement()
    }
    func showDownloadInitiated(cancellation: @escaping () -> Void) {
        expectedBytes = 0; receivedBytes = 0
        update(["status":"downloading", "progress":0,
                "message":"正在后台下载更新，完成后将自动安装并重启…"])
    }
    func showDownloadDidReceiveExpectedContentLength(_ expectedContentLength: UInt64) {
        expectedBytes = expectedContentLength
    }
    func showDownloadDidReceiveData(ofLength length: UInt64) {
        receivedBytes += length
        let progress = expectedBytes > 0 ? min(100, Int(Double(receivedBytes) / Double(expectedBytes) * 100)) : 0
        update(["progress":progress])
    }
    func showDownloadDidStartExtractingUpdate() {
        update(["status":"preparing", "progress":100, "message":"正在校验并准备安装更新…"])
    }
    func showExtractionReceivedProgress(_ progress: Double) {}
    func showReady(toInstallAndRelaunch reply: @escaping (SPUUserUpdateChoice) -> Void) {
        guard installRequested else { reply(.dismiss); return }
        update(["status":"installing", "message":"正在安装更新，应用将自动重新启动…"])
        reply(.install)
    }
    func showInstallingUpdate(withApplicationTerminated applicationTerminated: Bool,
                              retryTerminatingApplication: @escaping () -> Void) {
        update(["status":"installing", "message":"正在保存练习进度并重启…"])
    }
    func showUpdateInstalledAndRelaunched(_ relaunched: Bool, acknowledgement: @escaping () -> Void) {
        installRequested = false
        acknowledgement()
    }
    func dismissUpdateInstallation() { updateReply = nil }
}
