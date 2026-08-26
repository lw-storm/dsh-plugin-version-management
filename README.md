# dsh-plugin-version-management

DSH 插件版本快照与快速回滚工具：一键快照所有已安装插件（JSON + 人读 TXT + 离线恢复脚本），上传快照即可恢复整个插件环境。

## 功能

- **版本快照**：记录全部已装第三方插件的名称、要求版本、实际安装版本，保存为一个文件夹（含 `dsh-plugin-snapshot.json` / `dsh-plugin-snapshot.txt` / 离线恢复脚本）
- **一键恢复**：上传或选择快照 → 勾选插件逐步确认，或一键全部恢复（写回 `package.json` + 自动 `pnpm install`）
- **设置页 UI**：设置 → 「插件版本恢复」（当前插件清单 / 生成快照 / 历史快照 / 上传恢复）
- **对话工具**：`dsh_plugin_snapshot`（生成快照）、`dsh_plugin_restore`（恢复，支持指定快照/指定插件）
- **路径自动探测**：无硬编码机器路径，自动发现 DSH profile 目录与可写工作区，任何机器可用



## 注意

- 快照只覆盖**第三方安装插件**（bundles 中非 `@deepseek-ai/*` 的条目）；官方基础包保持现状
- 恢复会修改 `%DSH_HOME%\profiles\<profile>\package.json` 并执行 `pnpm install`（网络或 pnpm 缓存）
- 包为纯 JavaScript，无构建步骤；安装后本插件自身也会进入快照清单，形成闭环
