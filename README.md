# dsh-plugin-version-management

DSH 插件版本快照与快速回滚工具：一键快照所有已安装插件（JSON + 人读 TXT + 离线恢复脚本），上传快照即可恢复整个插件环境。

## 功能

- **版本快照**：记录全部已装第三方插件的名称、要求版本、实际安装版本，保存为一个文件夹（含 `dsh-plugin-snapshot.json` / `dsh-plugin-snapshot.txt` / 离线恢复脚本）
- **一键恢复**：上传或选择快照 → 勾选插件逐步确认，或一键全部恢复（写回 `package.json` + 自动 `pnpm install`）
- **设置页 UI**：设置 → 「插件版本恢复」（当前插件清单 / 生成快照 / 历史快照 / 上传恢复）
- **对话工具**：`dsh_plugin_snapshot`（生成快照）、`dsh_plugin_restore`（恢复，支持指定快照/指定插件）
- **路径自动探测**：无硬编码机器路径，自动发现 DSH profile 目录与可写工作区，任何机器可用

## 安装

发布到 GitHub 后（仓库根就是本目录）：

```bash
dsh plugin --profile web add github:<你的用户名>/dsh-plugin-version-management
# 或完整地址：
dsh plugin --profile web add git+https://github.com/<你的用户名>/dsh-plugin-version-management.git
```

本地目录直接安装（开发调试用）：

```bash
dsh plugin --profile web add "D:\...\dsh-plugin-version-management\pkg"
```

安装完成后**重启 DSH** 生效（设置页刷新浏览器即可看到新分区）。

## 发布到 GitHub

本目录已是一个独立的包仓库。推送方式任选：

1. **命令行**（已安装 git 时）：
   ```bash
   git init
   git add .
   git commit -m "dsh-plugin-version-management v1.0.0"
   git remote add origin https://github.com/<你的用户名>/dsh-plugin-version-management.git
   git push -u origin main
   ```
2. **网页上传**：GitHub 新建仓库 → 上传本目录全部文件 → 完成。无需安装任何软件。

也可发布到 npm：`npm publish`，之后 `dsh plugin add dsh-plugin-version-management`。

## 使用

1. DSH 设置 → 「插件版本恢复」→「生成版本快照」；或在对话中让 AI 调用 `dsh_plugin_snapshot`
2. 快照保存在工作区 `dsh-plugin-version-management\snapshot-<时间>\` 文件夹内
3. 恢复：设置页上传/选择快照 → 恢复所选 / 一键全部恢复（会写回 `package.json` 并运行 `pnpm install`，请重启 DSH 生效）

## 灾难恢复（所有插件被清空、DSH 无法启动后）

1. 先修好 DSH 启动问题（删掉问题插件 / 清空插件列表）
2. 装回本插件（一条命令，见上）
3. DSH 设置 → 「插件版本恢复」→ 选择快照 → 一键恢复 → 重启

**或**不用本插件：直接运行快照文件夹里的离线脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<快照文件夹>\dsh-plugin-restore.ps1"
```

## 注意

- 快照只覆盖**第三方安装插件**（bundles 中非 `@deepseek-ai/*` 的条目）；官方基础包保持现状
- 恢复会修改 `%DSH_HOME%\profiles\<profile>\package.json` 并执行 `pnpm install`（网络或 pnpm 缓存）
- 包为纯 JavaScript，无构建步骤；安装后本插件自身也会进入快照清单，形成闭环
