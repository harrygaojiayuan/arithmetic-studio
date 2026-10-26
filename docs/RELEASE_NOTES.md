算数练习室，可离线运行。支持 Windows 10 / 11 x64，以及 macOS 12 及以上的 Apple Silicon（M 系列）和 Intel Mac。

下载选择：

- `windows-x64.exe`：Windows 安装版，按向导安装后从开始菜单或桌面打开。
- `windows-x64.zip`：Windows 免安装版，完整解压后双击 `ArithmeticStudio.exe`。请保留同目录下的所有文件。
- `macos-universal.dmg`：Mac 通用安装镜像，打开后将「算数练习室.app」拖入 Applications 文件夹。
- `macos-universal.zip`：Mac 通用版 App 压缩包，解压后打开。
- `SHA256SUMS.txt` / `SHA256SUMS-macos.txt`：对应平台安装包和压缩包的校验值。
- `Windows-smoke-test.json`：GitHub Windows 环境实际启动应用后的验证报告。
- `Mac-build-verification.json`：Mac 两种架构编译、应用签名、DMG 完整性和 ZIP 解压验证报告。

所有原有功能都已保留，包括题目参数设置、默认 10 分钟的可调倒计时、个人排行榜、错题回顾，以及答对变绿、答错变红并抖动。

除法规则：被除数大于除数且能整除；被除数排除 1 和所有质数，除数只排除 1，允许质数。

Windows 数据保存在 `%APPDATA%\ArithmeticStudio\data.json`，Mac 数据保存在 `~/Library/Application Support/ArithmeticStudio/data.json`。更新应用文件不会删除个人成绩。

此版本没有商业代码签名证书，Windows 可能会显示未识别的发布者提示。仅从本仓库下载并核对校验值。

Mac 版使用本地临时签名，未使用 Apple Developer ID 签名、也未公证；macOS 首次打开下载的 App 时可能提示无法验证开发者。
