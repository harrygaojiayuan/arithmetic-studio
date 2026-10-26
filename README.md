# 算数练习室

中文算数练习软件，提供 Windows 桌面版和 macOS App。打包后的 App 可完全离线使用，不需要浏览器、账号、Python 或 Node.js 运行环境。

## Windows 下载与安装

从本仓库的 [Releases](https://github.com/harrygaojiayuan/arithmetic-studio/releases) 下载最新版本。仓库已公开，可直接访问下载页。

- **安装版 `.exe`**：按向导安装，从桌面快捷方式或开始菜单打开「算数练习室」。
- **免安装 `.zip`**：先完整解压，再双击 `ArithmeticStudio.exe`。同目录下的运行文件需要一起保留。

适用于 Windows 10 / 11 x64。设置、成绩和进行中的练习保存在 `%APPDATA%\ArithmeticStudio\data.json`，与应用安装目录分离；更新应用不会覆盖数据。

程序没有商业代码签名证书，首次运行可能显示未识别发布者提示。下载页提供 `SHA256SUMS.txt`，可用 PowerShell 的 `Get-FileHash` 核对。

## 从源码运行与构建 Windows 版

安装 Node.js 24 或更高版本，在项目目录执行：

```sh
npm ci
npm start
```

在 Windows 上构建安装包和免安装压缩包：

```sh
npm run build:win
```

输出文件在 `release/`。`desktop/` 实现原生窗口和本机 JSON 存储；`dist/` 是与 Mac 版共用的练习界面和算术逻辑。

GitHub Actions 会在每次提交时运行测试。推送 `v*` 版本标签或手动运行工作流时，会在 Windows 环境中构建应用、实际启动打包后的 `.exe`，验证答题、正误颜色、进度恢复、自动结算和排行榜；通过后上传构建文件。版本标签构建还会把下载文件发布到 Releases。

## 打开 Mac App

从 [Releases](https://github.com/harrygaojiayuan/arithmetic-studio/releases) 下载 `macos-universal.dmg`，将「算数练习室.app」拖入 Applications 文件夹。也可以下载 Mac 版 `.zip`，解压后打开 App。支持 macOS 12 及以上版本，适用于 Apple Silicon（M 系列）和 Intel Mac。

Mac 版有本地临时签名，未进行 Apple Developer ID 签名和公证，下载后首次打开可能显示无法验证开发者的提示。

Mac App 的设置、成绩和进行中的练习保存在 `~/Library/Application Support/ArithmeticStudio/data.json`，关闭 App 后仍会保留，更新 App 不会覆盖数据。倒计时在 App 关闭期间仍然继续；重新打开时恢复练习，已经到时则自动结算。

## 从源码构建 Mac App

在本目录执行 `python3 native/build_app.py`。需要 macOS 的 Xcode Command Line Tools 和 Node.js（仅构建时检查脚本语法）。默认构建适用于 Apple Silicon Mac 的 `.app`；加上 `--arch universal` 可同时支持 Intel Mac。应用运行时无需安装这些工具。

执行 `python3 native/package_macos.py` 可构建通用版 App，并在 `release/` 生成 `.dmg`、`.zip` 和 Mac 校验值文件。

`native/main.swift` 负责原生窗口、应用菜单和本地文件存储，`native/build_app.py` 将所有页面资源打包进 App。应用不会请求外部网页。

## 浏览器预览（可选）

在有 Python 3 的电脑上执行 `npm run preview`，然后打开 http://127.0.0.1:5173。浏览器预览与桌面 App 的数据各自独立。

## 功能

- 首页有竖向排列的「开始运算」「排行榜」「设置」三个按钮。
- 分别设置两个数的位数（1–6 位），选择加、减、乘、除。
- 每次开始前选择练习时长，首次默认 10 分钟，可输入 1–120 整数分钟。
- 提交后判断正误，自动出下一题；超时后自动结束，禁止继续计分。
- 答对时整个页面短暂变为淡绿色；答错时变为淡红色并抖动，显示正确答案。遵循系统减少动态效果偏好。
- 减法支持负数；除法必须被除数大于除数、能整除，答案为整数。被除数排除 1 和所有质数；除数仅排除 1，允许质数。两侧数字仍符合设定的位数；除法左侧位数不能少于右侧，设置会联动调整。
- 结算显示答对数、做题数、正确率、实际用时，可展开回顾错题。
- 排行榜按左右位数、运算符、时长分别比较，显示练习时间与题数。
- 相同模式和时长下，答对数优先，再比较正确率，最后按完成时间先后排名。
- 整除规则启用前的除法成绩仍保留在数据文件中，但不参与新规则排行榜。旧规则下正在进行的除法练习会先结算，再开始新规则练习。
- 提前结束可以查看结果，但不参与排行榜。
- Windows / Mac App 的数据保存在本机文件中；浏览器预览使用 localStorage。重新打开后继续倒计时。
- 支持手机和电脑，支持 Enter 提交及键盘操作。

这是个人本地排行榜，不会跨设备同步。Windows / Mac App 的成绩与浏览器预览各自独立。浏览器版本清除浏览器数据会删除记录；桌面 App 更新应用文件不会影响本地成绩。

## 验证

`npm test` 验证位数生成、四则运算、除法大除小与整除、输入解析、到期判断、排行榜隔离，以及桌面数据持久化接口。

`npm run check` 检查 JavaScript 语法。
