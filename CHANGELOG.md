# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-27

### Added

- Initial release of `dsh-plugin-version-management`.
- `dsh_plugin_snapshot` tool: creates a version snapshot of all installed DSH plugins (JSON + human-readable TXT + offline PowerShell restore script).
- `dsh_plugin_restore` tool: restores plugins from a snapshot — rewrites `package.json` (bundles + dependencies) and runs `pnpm install`.
- Settings page UI under **插件版本恢复** (Plugin Version Recovery): view current plugins, create snapshots, browse snapshot history, upload and restore from a snapshot file.
- HTTP API under `/dsh-pvm/*` for the client UI.
- Auto-discovery of DSH profile directory and writable workspace — no hard-coded machine paths.
- Offline restore script (`dsh-plugin-restore.ps1` + `dsh-plugin-restore-merge.js`) bundled inside every snapshot folder for disaster recovery.
