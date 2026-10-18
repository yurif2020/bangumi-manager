# 番剧管理 · Bangumi Manager

一个简洁的 [Bangumi](https://bgm.tv/) 番剧管理桌面端：搜索动画、管理在看进度、按季度浏览索引，并支持其他程序推送「某集已看」。

数据来自 [next.bgm.tv](https://next.bgm.tv/) / Bangumi 官方 API v0，进度实时同步到你的账号。

## 功能

- **快速搜索**：中文名、原名都能搜，`Ctrl+K` 聚焦搜索框，`Esc` 退出
- **五种收藏状态**：在看 / 想看 / 看过 / 搁置 / 抛弃，一键互转
- **进度管理**：逐集打勾、`下一集 +1`、跳集、撤销、补满全季；进度与网页端一致
- **季度索引**：按季度浏览番剧，支持按评分 / 热度 / 排名排序
- **外部推送**：URL Scheme 与命令行参数两种方式，见下文
- **托盘常驻**：关闭窗口收到托盘，可设置开机自启（静默启动）
- **默认走系统代理**：也可切换直连或手动填写代理

## 安装与运行

```bash
npm install
npm run dev      # 开发（热更新）
npm run build    # 类型检查 + 构建
npm run dist     # 打包成 Windows 安装包（输出到 release/）
```

需要 Node.js 18+。

## 登录

首次启动会提示登录，点「网页登录」会打开内置登录窗口：

1. 在内置窗口里用 Bangumi 账号登录（也可用第三方登录）
2. 登录成功后窗口自动关闭，同时抓取 **Cookie** 与 **Access Token** 两份凭据
3. 凭据用系统安全存储（`safeStorage`）加密后保存在用户目录，不会明文落盘

> 若网页登录异常，可在登录页展开「粘贴 Access Token」手动填入
> （在 <https://next.bgm.tv/demo/access-token> 生成）。

## 外部程序接入：推送「某集已看」

两种方式任选，第二种对脚本更友好。

### 1. URL Scheme

```
bgmtv-helper://watched?subject=400602&ep=5      # 番剧 400602 第 5 集已看
bgmtv-helper://watched/400602/5                 # 同上，路径写法
bgmtv-helper://watched?subject=400602           # 推到下一集
bgmtv-helper://watched?episodeId=1227087        # 只知道单集 ID 时
```

### 2. 命令行参数

```bash
"番剧管理.exe" --watched 400602 --ep 5
"番剧管理.exe" --watched 400602:5
"番剧管理.exe" --watched subject=400602 --ep 5
"番剧管理.exe" --episode 1227087
```

- `--watched` 指定番剧，`--ep` 指定集数（省略表示推进一集）
- `--episode` 指定单集 ID（与 `--watched` 可同时给，用于精确匹配）
- 程序已在运行时，新启动的实例会把参数转发给已运行实例后立刻退出，不会重复开窗

推送成功后主窗口会前置并弹出提示；网络异常时该操作进入本地队列，恢复后自动重放。

## 代理

默认使用系统代理（与浏览器一致）。在「设置 → 网络代理」可切换：

- **跟随系统**（默认）
- **直连**
- **手动**：填写形如 `http=127.0.0.1:7897;https=127.0.0.1:7897` 的规则

修改后立即生效，「测试连接」会报告当前出口 IP 与延迟。

## 数据与隐私

- 凭据：`%APPDATA%/番剧管理/credentials.bin`（加密）
- 设置：`%APPDATA%/番剧管理/settings.json`
- 待同步队列：`%APPDATA%/番剧管理/queue.json`

所有写操作直接调用 Bangumi 官方接口，不经过第三方服务器。

## 常见问题

**季度索引加载较慢？**
一季度最多有几百部动画，需要按月分页拉取（已并发请求），首次加载约 3–10 秒，之后切换排序是本地排序、瞬间完成。

**进度和网页端对不上？**
点顶部「刷新」重新拉取。本程序的进度以单集观看状态为准（与网页端一致）。

**切换「看过」时提示补满进度，但我选了取消？**
只有选择「确定」才会把剩余集数逐集标记为已看；取消则只改收藏状态。

**开机自启在开发模式下不生效？**
`npm run dev` 运行时宿主是 `electron.exe`，系统登录项无法绑定。打包安装后即可正常使用。

**URL Scheme 打不开程序？**
安装包会用安装器注册 `bgmtv-helper://`。若被其他程序占用，可在 Windows「默认应用 → 按协议」中手动指定。

## 技术栈

Electron 33 + React 18 + TypeScript + Vite + Tailwind CSS。
主进程按 `auth / bgm / bridge / cache / ipc / store / sync` 分模块，渲染进程按 `views / components / hooks` 分层。

## 友情链接
[LINUX DO](https://linux.do/) — 真诚分享、友好讨论的技术社区，本项目的交流与反馈也发布于此

## 许可

[MIT](LICENSE)。本项目与 Bangumi（bgm.tv）官方无关联，仅使用其公开 API。
