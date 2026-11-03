import Cocoa
import CryptoKit

// Public release metadata and a DMG download only; never reads practice data.
final class PracticeUpdater: NSObject, URLSessionDownloadDelegate {
    let currentVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    let releaseBase = "https://github.com/harrygaojiayuan/arithmetic-studio/releases/download/"
    var state: [String: Any] = [:]
    var onChange: (([String: Any]) -> Void)?
    var assetURL: URL?
    var expectedDigest: String?
    var downloadedURL: URL?
    var downloadTask: URLSessionDownloadTask?
    lazy var network: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 600
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()

    override init() {
        super.init()
        state = ["currentVersion":currentVersion, "supported":true, "status":"idle", "message":"从 GitHub 检查最新正式版本。", "progress":0, "installLabel":"打开安装镜像"]
    }
    func update(_ values: [String: Any]) {
        state.merge(values) { _, new in new }
        onChange?(state)
    }
    func fail(_ message: String = "更新失败，请检查网络连接后重试。练习记录不受影响。") {
        update(["status":"error", "progress":0, "message":message])
    }
    func action(_ action: String) {
        if action == "check" { check() }
        else if action == "download" { download() }
        else if action == "install", state["status"] as? String == "downloaded", let file = downloadedURL {
            if NSWorkspace.shared.open(file) {
                update(["message":"安装镜像已打开。将新版本拖到 Applications 替换旧版，练习记录会保留。"])
            } else { fail("无法打开安装镜像，请重新下载后重试。") }
        }
    }
    func check() {
        if ["checking","downloading","downloaded"].contains(state["status"] as? String ?? "") { return }
        update(["status":"checking", "message":"正在检查 GitHub…", "progress":0])
        var request = URLRequest(url: URL(string:"https://api.github.com/repos/harrygaojiayuan/arithmetic-studio/releases/latest")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField:"Accept")
        request.setValue("ArithmeticStudio/\(currentVersion)", forHTTPHeaderField:"User-Agent")
        network.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                guard error == nil, (response as? HTTPURLResponse)?.statusCode == 200,
                      let data = data, let release = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any],
                      release["draft"] as? Bool == false, release["prerelease"] as? Bool == false,
                      let tag = release["tag_name"] as? String,
                      tag.range(of:"^v?[0-9]+\\.[0-9]+\\.[0-9]+$", options:.regularExpression) != nil else { self.fail(); return }
                let version = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
                if version.compare(self.currentVersion, options:.numeric) != .orderedDescending {
                    self.update(["status":"current", "message":"当前已是最新版本。"]); return
                }
                let name = "ArithmeticStudio-\(version)-macos-universal.dmg"
                guard let assets = release["assets"] as? [[String:Any]],
                      let asset = assets.first(where: { $0["name"] as? String == name }),
                      let digest = asset["digest"] as? String,
                      digest.range(of:"^sha256:[0-9a-fA-F]{64}$", options:.regularExpression) != nil else {
                    self.fail("新版本的 Mac 安装文件尚未准备好，请稍后重试。"); return
                }
                self.assetURL = URL(string:self.releaseBase + tag + "/" + name)
                self.expectedDigest = String(digest.dropFirst(7)).lowercased()
                self.update(["status":"available", "version":version, "message":"发现新版本 \(version)。"])
            }
        }.resume()
    }
    func download() {
        guard state["status"] as? String == "available", let url = assetURL else { return }
        update(["status":"downloading", "progress":0, "message":"正在下载更新，请稍候…"])
        downloadTask = network.downloadTask(with:url)
        downloadTask?.resume()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let percent = totalBytesExpectedToWrite > 0 ? min(100, Int(totalBytesWritten * 100 / totalBytesExpectedToWrite)) : 0
        update(["progress":percent])
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard (downloadTask.response as? HTTPURLResponse)?.statusCode == 200 else { fail(); return }
        do {
            let data = try Data(contentsOf:location)
            let actual = SHA256.hash(data:data).map { String(format:"%02x", $0) }.joined()
            guard actual == expectedDigest else { fail("更新文件校验失败，请重新检查并下载。"); return }
            let directory = try FileManager.default.url(for:.cachesDirectory, in:.userDomainMask, appropriateFor:nil, create:true)
                .appendingPathComponent("ArithmeticStudio/Updates/\(UUID().uuidString)", isDirectory:true)
            try FileManager.default.createDirectory(at:directory, withIntermediateDirectories:true)
            let destination = directory.appendingPathComponent(assetURL!.lastPathComponent)
            try FileManager.default.moveItem(at:location, to:destination)
            downloadedURL = destination
            update(["status":"downloaded", "progress":100, "message":"下载和校验已完成。打开安装镜像，将新版本拖到 Applications 即可更新。"])
        } catch { fail() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { fail() }
        downloadTask = nil
    }
}
