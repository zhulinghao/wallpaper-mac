# Electron macOS Wallpaper Engine

一个基于 Electron 构建的强大 macOS 动态壁纸引擎，支持将图片、视频或 HTML 网页设置为桌面壁纸。

## 核心功能

- **控制中心 (Dashboard)**：提供独立的控制面板，可为每个显示器单独管理壁纸。
- **丰富的媒体支持**：
  - **图片**：支持 JPG, PNG, GIF, WebP 等常见格式。
  - **视频**：支持 MP4, WebM, MKV, MOV (自动静音循环播放)。
  - **HTML**：支持将任意本地 HTML 文件设置为交互式壁纸。
- **自动保存状态**：应用重启后，自动恢复上次设置的壁纸配置。
- **历史记录**：自动记录最近使用的壁纸，方便快速切换回之前的喜爱内容。
- **多显示器支持**：自动检测接入的显示器，并支持多屏独立设置。
- **在线画廊**：内置在线资源库，可一键下载包括《绝区零》、《原神》、《鸣潮》等热门游戏的高清静态与动态壁纸。

## 安装与运行

1. 安装依赖：
   ```bash
   pnpm install
   ```

2. 启动应用：
   ```bash
   pnpm start
   ```

3. 打包应用 (macOS)：
   ```bash
   pnpm run build
   ```
   *注意：打包后的 `.dmg` 或 `.app` 文件位于 `dist` 目录下。*

## 常见问题 (Troubleshooting)

### 1. 提示“应用已损坏”或“无法打开”

如果你将应用发送给朋友，打开时出现“已损坏”提示，这是由于 macOS 的安全机制（Gatekeeper）拦截了未签名的应用。

**解决方法：**

1.  打开终端 (Terminal)。
2.  输入以下命令（注意将路径替换为实际 App 路径）：
    ```bash
    sudo xattr -rd com.apple.quarantine /Applications/"Wallpaper Mac.app"
    ```
3.  输入密码并回车即可修复。

### 2. 爬虫脚本说明

项目中包含一个 `src/crawler.js` 脚本，用于从网络抓取最新的壁纸资源。

- 运行爬虫：
  ```bash
  node src/crawler.js
  ```
- 爬虫支持从米哈游官方社区（米游社）抓取最新的高清壁纸，并自动合并到 `src/online-wallpapers.json` 中。
