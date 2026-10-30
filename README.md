# 德州扑克 · 单机练习工具

一个纯前端的德州扑克练习套件：**对局游戏** + **赔率计算器**，另有配套的 **169 手牌分档数据** 与两份 Word 手册。

全部离线运行，双击 HTML 即可用，不联网、不装依赖、不上传任何数据。

![技术栈](https://img.shields.io/badge/stack-原生%20JS%20%2B%20Python-2f9e5a)
![依赖](https://img.shields.io/badge/runtime-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue)

### 在线直接用（手机 / 平板也能玩）

不想下载就用 GitHub Pages 的版本，浏览器打开即玩：

| 工具 | 在线地址 |
| --- | --- |
| 对局游戏 | <https://skempds.github.io/poker-trainer/德州扑克.html> |
| 赔率计算器 | <https://skempds.github.io/poker-trainer/德州扑克-赔率计算器.html> |

> 手机上的牌桌布局还在适配中（座位用百分比绝对定位，窄屏会挤），目前**赔率计算器在手机上体验完整**，对局游戏建议用电脑。

---

## 有什么

| 文件 | 说明 |
| --- | --- |
| `德州扑克.html` | **对局游戏**。2~6 人桌，1~5 个 AI 对手，起始筹码与盲注开局前自由设置，带逐决策点复盘 |
| `德州扑克-赔率计算器.html` | **赔率计算器**。翻前/翻牌/转牌/河牌四阶段实时算胜率、底池赔率、补牌 |
| `desktop/dist/德州扑克-桌面版.zip` | 桌面启动包（188 KB），双击启动浏览器应用模式，不是 Electron |
| `169种起手牌分档表.docx` | 169 手牌六档分级表（676 万局模拟） |
| `德州扑克胜率数据手册.docx` | 对撞表、位置范围表、多人底池衰减、翻后场景 |

两个 HTML 都是**单文件**（约 90~120 KB），把 CSS、JS、169 表数据全部内联，可以单独发给别人，不依赖本仓库其他文件。

## 快速开始

### 对局游戏

双击 `德州扑克.html` → 设置起始筹码 / 小盲 / 大盲 / AI 人数 → 开始。

- 点右侧滑块或用输入框手填金额加注，「½ 池 / 1 池 / 全下」是快捷按钮
- 每手结束点右上「复盘」，对每个决策点给出「不知道对手底牌视角下」的理论最优选择与依据
- 对局记录里 AI 的思路会在**这一手结束后**才公布，不会提前泄露对手底牌

### 赔率计算器

双击 `德州扑克-赔率计算器.html` → 点手牌 → 按阶段补公共牌 → 填底池和跟注额。

- 对手人数支持 1~9（下拉选 1~8，或选「自定义」手填）
- 对手范围可按位置预设（UTG 偏紧 / BTN 偏松 / BB 防守），也能手写 `QQ+,AKs,A6o`
- 补牌按「出这张后胜率抬高 ≥4 个百分点」算，所以听花是真的 9 张

### 桌面版

解压 `desktop/dist/德州扑克-桌面版.zip`，把里面的文件夹放到任意位置，双击 `德州扑克.exe`。

用 Windows 自带的 Edge/Chrome 的 `--app` 模式全屏打开，所以体积只有 188 KB 而不是 Electron 的 90~150 MB。详见 `desktop/README.md`。

---

## 原理

### AI 怎么决策

两级：**翻前查表，翻后模拟**。

- **翻前**：169 手牌归一化后查 `data_169.json` 的实测胜率，再对照位置开池范围（`data_ranges.json`）决定加注/跟注/弃牌
- **翻后**：蒙特卡洛模拟。按对手本手的加注次数反推其手牌范围，抽 N 次牌算胜率，和底池赔率门槛比较

AI 有四种性格（紧凶 / 松凶 / 紧弱 / 松弱），差别在开池松紧、跟注松紧、诈唬频率、下注激进度。**复盘功能不用性格参数、不用随机诈唬**，走中立策略，所以同一局面每次分析结果一致。

### 胜率怎么算

真牌力评估，不是估算：

- 7 张牌评估器把牌型编码成一个整数，直接比大小，跑 200016 组随机牌与 Python 版逐组比对**零差异**
- 蒙特卡洛用固定种子，同一局面重复算结果完全一致，数字不会跳

### 底盘数据

`data_169.json` 是 169 手牌对随机手牌的胜率，每手 40000 次模拟，共 676 万局。`data_ranges.json` 是位置开池范围、对撞表、范围对范围、多人底池衰减、翻后场景。

---

## 目录结构

```
poker/
├── 德州扑克.html                构建产物（对局游戏）
├── 德州扑克-赔率计算器.html      构建产物（赔率计算器）
├── build.py                     游戏构建脚本
├── data_169.json                169 手牌胜率与分档
├── data_ranges.json             位置范围与各类统计
├── evaluator.py                 Python 牌力评估器
├── mc_engine.py                 Python 蒙特卡洛引擎
├── gen_169.py / gen_ranges.py   数据生成脚本
├── classify.py                  六档分级打分
├── make_doc1.py / make_doc2.py  Word 文档生成
│
├── game/                        对局游戏源码（分文件）
│   ├── core.js                  牌局引擎：发牌、下注轮、边池、摊牌
│   ├── equity.js                169 表查询、范围展开、蒙特卡洛
│   ├── ai.js                    AI 决策
│   ├── review.js                复盘用中立策略
│   ├── ui.js / styles.css       界面
│   ├── domstub.js               自建 DOM 桩件（测试用）
│   └── test_*.js / probe_*.js   测试与自查脚本
│
├── odds/                        赔率计算器源码
│   ├── odds.js                  赔率与补牌计算核心
│   ├── odds_ui.js / styles.css  界面
│   └── test_odds*.js            测试
│
└── desktop/                     桌面启动包
    ├── launcher.cs              C# 启动器（单文件，无依赖）
    ├── make_dist.py             构建脚本
    └── dist/                    打包产物
```

## 重新构建

需要 Python 3 与 Node.js。

```bash
# 对局游戏
python build.py

# 赔率计算器
python odds/build_odds.py

# 桌面启动包（需要 Windows 自带的 csc.exe）
python desktop/make_dist.py
```

## 跑测试

```bash
# 游戏本体
node game/test_core.js 2000        # 自对弈不变量
node game/test_edge.js             # 边池、加注权、单挑按钮
node game/test_ui.js               # 界面 + 复盘
node game/test_built.js            # 直接测构建产物
node game/test_parity.js           # JS 与 Python 评估器比对

# 赔率计算器
node odds/test_odds.js
node odds/test_odds_ui.js

# 桌面启动器（Python）
python desktop/test_launcher.py
```

## 已知限制

- **AI 不是 GTO 解**，是按胜率和底池赔率算期望值的启发式策略，打久了能摸出套路
- **胜率表只对随机手牌**，翻前查表的数字没有考虑对手范围收紧
- **桌面版依赖浏览器**：需要机器上装了 Edge 或 Chrome；任务栏图标是浏览器自己的
- **未做代码签名**，Windows SmartScreen 可能弹「未知发布者」提示，选「仍要运行」即可
- 不支持联机对战，纯单机

## 许可

代码用 MIT。`data_169.json` / `data_ranges.json` 是用本仓库的脚本算出来的模拟数据，随便用。
