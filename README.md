# dsh-plugin-version-management

> DSH 插件版本快照与快速回滚工具：一键快照所有已安装插件（JSON + 人读 TXT + 离线恢复脚本），上传快照即可恢复整个插件环境。

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-0084ff?style=flat-square)](https://github.com/topics/dsh-plugin)
[![license](https://img.shields.io/github/license/lw-storm/dsh-plugin-version-management?style=flat-square)](LICENSE)
[![version](https://img.shields.io/npm/v/dsh-plugin-version-management?style=flat-square)](https://www.npmjs.com/package/dsh-plugin-version-management)

## Screenshots / 截图

_Settings → 插件版本恢复：查看当前已安装插件、生成快照、浏览历史快照、上传恢复。_


_快照生成完成：JSON + 人读 TXT + 离线 PowerShell 恢复脚本，全部保存在一个文件夹里。_


_恢复预览：逐条确认差异（新增 / 更新 / 移除），支持勾选部分插件或一键全部恢复。_

## Features / 功能

- **版本快照** — 记录全部已装第三方插件的名称、要求版本、实际安装版本，保存为一个文件夹（含 `dsh-plugin-snapshot.json` / `dsh-plugin-snapshot.txt` / 离线恢复脚本）
- **一键恢复** — 上传或选择快照 → 勾选插件逐步确认，或一键全部恢复（写回 `package.json` + 自动 `pnpm install`）
- **设置页 UI** — 设置 → 「插件版本恢复」（当前插件清单 / 生成快照 / 历史快照 / 上传恢复）
- **对话工具** — `dsh_plugin_snapshot`（生成快照）、`dsh_plugin_restore`（恢复，支持指定快照/指定插件）
- **路径自动探测** — 无硬编码机器路径，自动发现 DSH profile 目录与可写工作区，任何机器可用
- **离线灾难恢复** — 每个快照自带 PowerShell 脚本，DSH 崩了也能脱离 UI 恢复

## How it works / 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│  1. collectPlugins()                                        │
│     reads profile/package.json → bundles + dependencies     │
│     scans node_modules for actually-installed versions      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. createSnapshot()                                        │
│     writes dsh-plugin-snapshot.json + .txt + .ps1 + .js     │
│     into workspace/dsh-plugin-version-management/snapshot-* │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. restore (apply)                                         │
│     computeMerge() → diff current vs snapshot               │
│     rewrite package.json bundles + dependencies             │
│     spawn pnpm install in profile dir                       │
│     (backup of old package.json saved first)                │
└─────────────────────────────────────────────────────────────┘
```

快照只覆盖**第三方安装插件**（bundles 中非 `@deepseek-ai/*` 的条目）；官方基础包保持现状，避免破坏 DSH 核心运行环境。

## Installation / 安装

### From GitHub repository

```bash
dsh plugin --profile web add github:lw-storm/dsh-plugin-version-management
```

### From local directory (development)

```bash
dsh plugin --profile web add "./pkg"
```

安装完成后**重启 DSH** 生效（设置页刷新浏览器即可看到新分区）。

## Usage / 使用

### Via settings page (UI)

1. DSH 设置 → 「插件版本恢复」
2. 点击「生成版本快照」→ 快照保存在工作区 `dsh-plugin-version-management\snapshot-<时间>\`
3. 恢复：选择历史快照或上传 `dsh-plugin-snapshot.json` → 预览差异 → 恢复所选 / 一键全部恢复
4. 重启 DSH 生效

### Via chat tools (AI 调用)

**生成快照：**

```
帮我生成一个插件版本快照
```

AI 会调用 `dsh_plugin_snapshot` 工具，返回快照文件夹路径和插件数量。

**恢复快照：**

```
用最新快照恢复所有插件
```

AI 会调用 `dsh_plugin_restore` 工具，重写 `package.json` 并运行 `pnpm install`。

## Disaster recovery / 灾难恢复

当所有插件被清空、DSH 无法启动时：

1. 先修好 DSH 启动问题（删掉问题插件 / 清空插件列表）
2. 装回本插件（一条命令，见上）
3. DSH 设置 → 「插件版本恢复」→ 选择快照 → 一键恢复 → 重启

**或**不用本插件，直接运行快照文件夹里的离线脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<快照文件夹>\dsh-plugin-restore.ps1"
```

## FAQ / 常见问题

**Q: 快照存在哪里？**
A: 优先存在当前工作区 `dsh-plugin-version-management\` 文件夹下；如果工作区不可写，会回退到 `%DSH_HOME%\dsh-plugin-version-management\`。

**Q: 恢复会影响官方插件吗？**
A: 不会。`@deepseek-ai/*` 的包和 bundles 会原样保留，只动第三方插件。

**Q: 恢复失败了怎么办？**
A: 每次恢复前都会自动备份当前的 `package.json` 到快照文件夹的 `backups/` 目录。可以手动恢复备份，或用快照里的离线脚本重试。

**Q: 支持多 profile 吗？**
A: 插件装在哪个 profile 下就管理哪个 profile 的插件。如果同时用多个 profile，每个都要单独装本插件。

**Q: 快照里的版本是精确版本号吗？**
A: 是的。`installed` 字段读自 `node_modules/<pkg>/package.json` 的实际版本，而不是 package.json 里的 semver 范围。

## Notes / 注意

- 恢复会修改 `%DSH_HOME%\profiles\<profile>\package.json` 并执行 `pnpm install`（需要网络或 pnpm 缓存）
- 包为纯 JavaScript，无构建步骤；安装后本插件自身也会进入快照清单，形成闭环
- 预发布版本（`-rc.*`）兼容：peerDependencies 使用显式预发布分支写法

## License / 许可证

MIT © [lw-storm](https://github.com/lw-storm)
