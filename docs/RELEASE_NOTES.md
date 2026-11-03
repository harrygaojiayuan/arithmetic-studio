算数练习室 v1.2.4 · Windows + macOS

新增经典 24 点：

- 四个数字均为 1–10，内置全部 566 种有解组合与参考解法（约 24 KB），随机抽取并打乱排列，运行时无需搜索求解。
- 点击数字 → 加减乘除 → 另一个数字完成合并，支持精确分数和负数中间结果，运算途中可撤回或重置。
- 四个数字合并得到 24 后自动计分并进入下一题，无需提交按钮；未得到 24 时短暂抖动后恢复本题原来的四个数字，不额外计错。
- 支持进度恢复、计时、独立排行榜和参考解法。

新增设置中的「检查更新」：

- 从本仓库的 GitHub 正式 Release 检查新版本，显示当前版本、检查结果和下载进度。
- Windows：下载完成并通过校验后，点击「安装并重启」完成升级。
- macOS：下载并校验通用安装镜像后，点击「打开安装镜像」，将新版 App 拖到 Applications 替换旧版。
- 仅在你检查或下载时联网；做题记录、个人设置及本机备份不会上传，更新不会删除原有记录。

下载：

- `ArithmeticStudio-1.2.4-windows-x64.exe`：Windows 10 / 11 x64 安装版。
- `ArithmeticStudio-1.2.4-windows-x64.zip`：Windows 免安装版，完整解压后运行。
- `ArithmeticStudio-1.2.4-macos-universal.dmg` / `.zip`：macOS 12+，支持 Apple Silicon 和 Intel。
- `SHA256SUMS.txt` / `SHA256SUMS-macos.txt`：下载校验值。
- `latest.yml` / `.exe.blockmap`：Windows 更新元数据。

保留原有四则运算、限时练习、排行榜与本地记录功能。Windows 数据位于 `%APPDATA%\ArithmeticStudio\data.json`，Mac 数据位于 `~/Library/Application Support/ArithmeticStudio/data.json`。

应用没有商业代码签名；Windows 首次运行可能提示未识别发布者，Mac 使用本地临时签名且未公证。
