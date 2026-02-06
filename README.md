<div align="center">

**简体中文** | [English](./README_EN.md)

</div>

# LyciaMusic

LyciaMusic 是一个基于 **Tauri v2 + Vue 3 + TypeScript + Rust** 的桌面本地音乐播放器，当前版本为 **v1.2.0**。项目重点是本地曲库管理、播放体验、统计分析和桌面集成能力。

![LyciaMusic 预览](app.png)

## 项目现状

- 开发阶段：Alpha（功能可用，持续迭代中）
- 主要适配：Windows（界面、托盘、媒体控制均以 Windows 体验为主）
- 语言：中文优先，内置英文 README

## 主要功能

- 本地曲库扫描与增量更新（按文件 `mtime + size` 检测变更）
- 曲库与侧边栏目录解耦（`library_folders` / `sidebar_folders`）
- 音乐播放控制：播放、暂停、继续、拖动进度、音量、切换输出设备
- 系统媒体控制集成（播放信息同步、上一首/下一首事件）
- 歌词支持：音频标签歌词 + 同名 `.lrc` 文件读取
- 桌面歌词浮窗：可拖动、锁定、置顶、翻译/音译显示
- 统计页：曲库规模、音质分布、格式分布、听歌行为分析
- 文件工具箱（4 步）：预处理、外部标签编辑、批量重命名、刷新入库
- 系统托盘与单实例运行

## 支持情况

- 曲库扫描格式：`mp3`、`flac`、`wav`
- 工具箱重命名预览格式：`mp3`、`flac`、`wav`、`m4a`、`ogg`
- 数据存储：SQLite（自动迁移字段）

## 界面截图

<details>
<summary><strong>点击展开</strong></summary>

### 首页
<img src="./screenshots/shouye.png" width="100%">

### 歌曲列表
<img src="./screenshots/shouye2.png" width="100%">

### 播放详情
<img src="./screenshots/playdetail.png" width="100%">

### 设置
<img src="./screenshots/setting.png" width="100%">

</details>

## 技术栈

- 前端：Vue 3、Vue Router、TypeScript、Vite、Tailwind CSS 4
- 后端：Rust、Tauri v2
- 音频：`rodio`、`cpal`
- 元数据：`lofty`
- 数据库：`rusqlite`（bundled SQLite）

## 快速开始

### 环境要求

- Node.js `>= 18`
- Rust（stable）
- Windows WebView2（Windows 10/11 默认可用）

### 安装与启动

```bash
git clone https://github.com/Billy636/MyMusic.git
cd MyMusic
npm install
```

开发模式：

```bash
npm run tauri dev
```

构建产物：

```bash
npm run tauri build
```

仅前端调试：

```bash
npm run dev
```

## 目录结构

```plaintext
.
├─ src/                        # Vue 前端
│  ├─ components/              # UI 组件（播放器、设置、统计、弹层等）
│  ├─ composables/             # 核心状态与业务逻辑
│  ├─ router/                  # 路由定义
│  ├─ types/                   # 类型定义
│  └─ views/                   # 页面视图（Home/Favorites/Recent/Settings 等）
├─ src-tauri/                  # Rust + Tauri 后端
│  ├─ src/
│  │  ├─ lib.rs                # 命令注册、托盘、初始化
│  │  ├─ player.rs             # 播放引擎与系统媒体控制
│  │  ├─ database.rs           # SQLite 初始化与迁移
│  │  ├─ statistics.rs         # 曲库/行为统计
│  │  ├─ toolbox.rs            # 工具箱（重命名/外部程序）
│  │  └─ music/                # 扫描、封面、歌词、文件操作
│  └─ tauri.conf.json          # 应用配置
├─ screenshots/                # README 截图资源
└─ README_EN.md                # 英文说明
```

## 已知限制

- 当前代码路径与命令对 Windows 支持最完整，macOS/Linux 仍需补齐测试与适配
- 设置页中部分选项仍是占位交互（UI 已有、后端能力待接入）
- 快捷键设置页尚未完成

## 许可证

项目配置为 MIT 许可。

---
更新日期：2026-02-06
