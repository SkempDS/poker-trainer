# 桌面版封装（B2 方案）

把 `..\德州扑克.html` 打成一个可直接双击的 Windows 桌面程序。
产物是 **188 KB 的单文件 exe**，里面内嵌了整个游戏（HTML + JS + 数据），
用本机已有的 Chrome / Edge 以 `--app` 应用窗口模式打开，无地址栏、无标签栏。

## 为什么是这个方案

| | 本方案 | 对比：Electron |
|---|---|---|
| 产物大小 | 188 KB | 90~150 MB |
| 分发前提 | 对方机器有 Chrome 或 Edge | 无（自带运行时） |
| 首启动 | 秒开 | 慢（便携版每次全量解压） |
| 任务栏图标 | 浏览器的图标 | 可自定义 |
| 控制面板卸载项 | 无（用 `卸载.bat`） | 有 |

Windows 10/11 自带 Edge，所以「要求有浏览器」实际上不构成门槛。
选它是因为体积差 500 倍，且不需要任何构建工具链。

## 目录内容

```
launcher.cs        启动器源码（C# 5，单文件，无外部依赖）
make_icon.py       从 PNG 生成 7 尺寸 icon.ico
make_dist.py       一键构建：重打游戏本体 → 生成图标 → 编译 → 组包 → 打 zip
test_launcher.py   58 项测试
使用说明.txt        随包分发的用户说明
卸载.bat           随包分发的卸载脚本
icon.ico           由 make_icon.py 生成
dist\              构建产物（发布目录 + zip）
```

## 构建

```powershell
cd D:\QLDownload\dsh\plugin_check\poker\desktop
$env:PYTHONIOENCODING = 'utf-8'
& "C:\Users\WIN\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" make_dist.py
```

构建会顺带重跑 `..\build.py`，所以改了 `game\` 下的任何源码都会反映到 exe 里。

编译器是系统自带的 .NET Framework 4.0 C# 5（`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`），
不需要装 SDK、不需要联网。

## 启动器行为

1. **决定用哪份 HTML** — exe 同目录有 `poker.html` 就用它（便于热改），否则用内嵌资源。
   内嵌时解到 `%LOCALAPPDATA%\TexasHoldem\poker.html`，先比 sha256，
   相同就跳过写入（所以第二次启动不重写盘）。
2. **找浏览器** — 顺序：`--browser` 参数 → `POKER_BROWSER` 环境变量 →
   注册表 `App Paths\chrome.exe`（HKLM 再 HKCU）→ 同法 msedge → 常见安装路径。
3. **建快捷方式** — 桌面与开始菜单各一个 `德州扑克.lnk`，目标指回 exe。
   已存在但目标不对（比如移动了文件夹）会自动重写。失败不阻断启动。
4. **启动浏览器** — 命令行由 `BuildArguments()` 统一生成：

```
--app="file:///.../poker.html" --user-data-dir="...\profile"
--no-first-run --no-default-browser-check --disable-features=Translate
--window-size=1366,860
```

`--user-data-dir` 指向独立 profile，所以不会污染用户平时的 Chrome 配置，
也不会和已开着的 Chrome 抢同一个实例锁。

命令行参数：`--dry-run`（只打印将要做的事，不落盘）、`--browser <路径>`、
`--no-shortcut`、`--data-dir <目录>`、`--extract-only <目录>`（只解出并校验 sha256）、`--help`。

## 测试

```powershell
& "...\python.exe" test_launcher.py
```

58 项，覆盖：产物体积、解出内容 sha256 与源一致且幂等、浏览器探测的 5 条分支、
快捷方式、发布目录与 zip 的条目、调试残留，以及**传给浏览器的完整命令行**
（参数、引号闭合、profile 落在 data 目录下、URL 与 htmlPath 同指一个文件）。

### 关于 GUI 无法截图

本机没有交互式桌面会话（`Get-Process | ? MainWindowHandle -ne 0` 返回 0 个），
任何 GUI 窗口都不会显示，`--app` 模式的窗口无法用截图验证。

替代验证分两层：
- 命令行层：`--dry-run` 报出 `args` 字段，逐条断言（见 `t12_browser_arguments`）。
- 页面层：用 Chrome `--headless=new` 加载启动器解出的那份 `poker.html` 并截图，
  确认「嵌入 → 解出 → 浏览器渲染」全链路成立。

## 已知限制

- 任务栏与窗口图标是浏览器的，不是游戏自己的 —— `--app` 模式的固有行为。
- 没有控制面板卸载项，用 `卸载.bat`（内含路径校验，只删 `TexasHoldem` 目录）。
- 依赖对方机器装有 Chrome 或 Edge。
- 未做代码签名，SmartScreen 首次运行可能提示「更多信息 → 仍要运行」。
  不过 exe 只有 188 KB 且无网络行为，触发概率较低。
