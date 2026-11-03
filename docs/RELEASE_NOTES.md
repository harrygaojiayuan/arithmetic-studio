算数练习室 v1.2.5 · Windows + macOS

两个系统统一为一键更新：

- 设置中检查 GitHub 新版本后，点击一次「安装新版本」，后台下载、校验、安装并自动重启，无需再点一次安装。
- Windows 使用静默安装更新；Mac 使用 Sparkle 自动替换 App、重启，不再打开镜像要求拖动。
- Mac 更新包使用 Ed25519 签名，下载后必须通过校验；被篡改的包不会安装。
- 下载期间可以继续使用，显示下载进度；离线或失败时可重试。系统需要管理员权限时仍会显示系统授权提示。
- 做题记录、个人设置和本机备份不会上传，更新保留原有数据。

升级说明：Windows 可直接覆盖安装。Mac 1.2.4 及更早版本首次升到此版仍需替换一次 App；从 1.2.5 开始，后续更新会自动完成。无需卸载旧版或删除数据。

下载：

- `ArithmeticStudio-1.2.5-windows-x64.exe`：Windows 10 / 11 x64 安装版。
- `ArithmeticStudio-1.2.5-windows-x64.zip`：Windows 免安装版。
- `ArithmeticStudio-1.2.5-macos-universal.dmg` / `.zip`：macOS 12+，支持 Apple Silicon 和 Intel。
- `latest.yml`、`.exe.blockmap`、`appcast.xml`：自动更新元数据。
- `SHA256SUMS*.txt`：安装文件校验值；验证报告随发布提供。

保留经典 24 点、四则运算、限时练习、排行榜与本地记录功能。
