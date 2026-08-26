/**
 * dsh-plugin-version-management — host entry (persistent plugin form).
 *
 * Capabilities:
 * - registers the `dsh_plugin_snapshot` / `dsh_plugin_restore` model tools;
 * - serves the settings-page API under /dsh-pvm/* HTTP routes;
 * - discovers the DSH profile directory and a writable snapshot root at
 *   runtime (no hard-coded machine paths — portable for other users).
 *
 * Restore semantics: full restore replaces third-party bundles/dependencies
 * with the snapshot state (official @deepseek-ai/* rows are kept); a subset
 * restore only touches the selected plugin names.
 */
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'dsh-plugin-version-management'
export const inject = ['tools', 'webServer', 'timer']

const RESTORE_PS1 = [
  '# dsh-plugin-version-management offline restore launcher (ASCII only).',
  '# 1) runs dsh-plugin-restore-merge.js: backs up the profile package.json',
  '#    and rewrites its bundles/dependencies from dsh-plugin-snapshot.json;',
  '# 2) runs "pnpm install" inside the profile directory;',
  '# 3) prints fallback "dsh plugin add" commands for a manual reinstall.',
  '# Usage:',
  '#   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-plugin-restore.ps1',
  'param(',
  '  [string]$SnapshotJson = ""',
  ')',
  '$ErrorActionPreference = "Continue"',
  '$Here = Split-Path -Parent $MyInvocation.MyCommand.Path',
  'if ($SnapshotJson -eq "") {',
  '  $SnapshotJson = Join-Path $Here "dsh-plugin-snapshot.json"',
  '}',
  'if (-not (Test-Path $SnapshotJson)) {',
  '  Write-Host "[ERROR] Snapshot JSON not found: $SnapshotJson"',
  '  exit 1',
  '}',
  '$MergeJs = Join-Path $Here "dsh-plugin-restore-merge.js"',
  'if (-not (Test-Path $MergeJs)) {',
  '  Write-Host "[ERROR] Merge script not found: $MergeJs"',
  '  exit 1',
  '}',
  '$node = $null',
  '$c = Get-Command node.exe -ErrorAction SilentlyContinue',
  'if ($c) { $node = $c.Source }',
  'if (-not $node) {',
  '  $c = Get-Command node -ErrorAction SilentlyContinue',
  '  if ($c) { $node = $c.Source }',
  '}',
  'if (-not $node) {',
  '  Write-Host "[ERROR] node.exe not found on PATH"',
  '  exit 1',
  '}',
  '& $node $MergeJs $SnapshotJson',
  'if ($LASTEXITCODE -ne 0) {',
  '  Write-Host "[ERROR] merge failed with exit code $LASTEXITCODE"',
  '  exit $LASTEXITCODE',
  '}',
  '$snap = Get-Content $SnapshotJson -Raw | ConvertFrom-Json',
  '$ProfileDir = $snap.profilePath',
  'if (-not (Test-Path $ProfileDir)) {',
  '  Write-Host "[ERROR] profile directory missing: $ProfileDir"',
  '  exit 1',
  '}',
  'Push-Location $ProfileDir',
  'try {',
  '  $pnpm = $null',
  '  $c = Get-Command pnpm.cmd -ErrorAction SilentlyContinue',
  '  if ($c) { $pnpm = $c.Source }',
  '  if (-not $pnpm) {',
  '    $c = Get-Command pnpm -ErrorAction SilentlyContinue',
  '    if ($c) { $pnpm = $c.Source }',
  '  }',
  '  if (-not $pnpm) {',
  '    $c = Get-Command corepack.cmd -ErrorAction SilentlyContinue',
  '    if ($c) { $pnpm = $c.Source }',
  '  }',
  '  if ($pnpm) {',
  '    & $pnpm install',
  '  } else {',
  '    Write-Host "[WARN] pnpm not found on PATH - package.json updated but plugins not installed yet"',
  '  }',
  '} finally {',
  '  Pop-Location',
  '}',
  'Write-Host ""',
  'Write-Host "Fallback - reinstall one by one (network required):"',
  'foreach ($p in $snap.dependencies.PSObject.Properties) {',
  '  $v = [string]$p.Value',
  '  $v = $v -replace "[\\^~]", ""',
  '  Write-Host ("  dsh plugin add " + $p.Name + "@" + $v)',
  '}',
  'Write-Host ""',
  'Write-Host "Done. Restart DSH to load the restored plugins."',
].join('\n')

const RESTORE_MERGE_JS = [
  '// dsh-plugin-version-management offline merge (run by dsh-plugin-restore.ps1).',
  '// Backs up the current profile package.json, then rewrites its bundle list',
  '// and dependencies from the snapshot. Current official @deepseek-ai/* rows',
  '// are kept; every third-party row comes from the snapshot.',
  '"use strict"',
  'const fs = require("fs")',
  'const path = require("path")',
  'const args = process.argv.slice(2)',
  'const snapshotPath = args[0]',
  'if (!snapshotPath || !fs.existsSync(snapshotPath)) {',
  '  console.error("[ERROR] snapshot json missing: " + snapshotPath)',
  '  process.exit(1)',
  '}',
  'function readJson(p, what) {',
  '  let text',
  '  try {',
  '    text = fs.readFileSync(p, "utf8")',
  '    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)',
  '    return JSON.parse(text)',
  '  } catch (e) {',
  '    console.error("[ERROR] cannot parse " + what + " " + p + ": " + e.message)',
  '    process.exit(1)',
  '  }',
  '}',
  'let snap = readJson(snapshotPath, "snapshot")',
  'if (!snap || snap.format !== "dsh-plugin-snapshot") {',
  '  console.error("[ERROR] not a dsh-plugin-snapshot file")',
  '  process.exit(1)',
  '}',
  'const profileDir = snap.profilePath',
  'if (!profileDir || !fs.existsSync(profileDir)) {',
  '  console.error("[ERROR] profile directory missing: " + profileDir)',
  '  process.exit(1)',
  '}',
  'const pkgPath = path.join(profileDir, "package.json")',
  'if (!fs.existsSync(pkgPath)) {',
  '  console.error("[ERROR] package.json missing: " + pkgPath)',
  '  process.exit(1)',
  '}',
  'let pkg = readJson(pkgPath, "package.json")',
  'const here = path.dirname(snapshotPath)',
  'const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")',
  'const backup = path.join(here, "package.json.bak-" + stamp)',
  'fs.writeFileSync(backup, JSON.stringify(pkg, null, 2) + "\\n", "utf8")',
  'console.log("[OK] current package.json backed up to: " + backup)',
  'const bundles = (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) ? pkg.dsh.profile.bundles : []',
  'const deps = (pkg.dependencies && typeof pkg.dependencies === "object") ? pkg.dependencies : {}',
  'const baseBundles = bundles.filter(function (b) { return typeof b === "string" && b.indexOf("@deepseek-ai/") === 0 })',
  'const snapBundles = (Array.isArray(snap.bundles) ? snap.bundles : []).filter(function (b) { return typeof b === "string" && b.indexOf("@deepseek-ai/") !== 0 })',
  'pkg.dsh.profile.bundles = baseBundles.concat(snapBundles)',
  'const baseDeps = {}',
  'Object.keys(deps).forEach(function (k) { if (k.indexOf("@deepseek-ai/") === 0) baseDeps[k] = deps[k] })',
  'const newDeps = {}',
  'Object.keys(snap.dependencies || {}).forEach(function (k) { newDeps[k] = snap.dependencies[k] })',
  'Object.keys(baseDeps).forEach(function (k) { if (!(k in newDeps)) newDeps[k] = baseDeps[k] })',
  'pkg.dependencies = newDeps',
  'fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\\n", "utf8")',
  'console.log("[OK] package.json restored with " + snapBundles.length + " third-party bundle(s)")',
].join('\n')

let ENV = null
let restoreState = null

function isOfficial(n) {
  return typeof n === 'string' && n.startsWith('@deepseek-ai/')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function timestamp() {
  const d = new Date()
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

function humanTime() {
  const d = new Date()
  return '' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function parseJson(text) {
  if (typeof text === 'string' && text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  return JSON.parse(text)
}

async function readJsonFile(p) {
  return parseJson(await readFile(p, 'utf8'))
}

async function probeDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return path.join(homedir(), '.dsh')
}

async function discoverProfile(dshHome) {
  if (!dshHome) return null
  const profilesDir = path.join(dshHome, 'profiles')
  let entries = []
  try {
    entries = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    return null
  }
  const candidates = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules') continue
    const pkgPath = path.join(profilesDir, e.name, 'package.json')
    try {
      const j = await readJsonFile(pkgPath)
      if (j && j.dsh && j.dsh.profile && Array.isArray(j.dsh.profile.bundles)) {
        candidates.push({ dir: path.join(profilesDir, e.name), third: j.dsh.profile.bundles.filter((b) => !isOfficial(b)).length })
      }
    } catch {
      /* skip */
    }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.third - a.third)
  return candidates[0].dir
}

function sessionCwdOf(agent) {
  try {
    const c = agent && agent.session && agent.session.header && agent.session.header.cwd
    return typeof c === 'string' && c ? c : null
  } catch {
    return null
  }
}

function currentSessionCwd(agents) {
  if (!agents) return null
  try {
    const c = sessionCwdOf(agents.currentInitiator())
    if (c) return c
  } catch {
    /* ignore */
  }
  try {
    for (const ag of agents.list()) {
      const c = sessionCwdOf(ag)
      if (c) return c
    }
  } catch {
    /* ignore */
  }
  return null
}

async function resolveWorkRoot(ctx, dshHome) {
  const candidates = []
  const cwd = currentSessionCwd(ctx.get('agents'))
  if (cwd) candidates.push(cwd)
  const sp = ctx.get('sandboxPolicy')
  if (sp && sp.workspaceRoot) candidates.push(sp.workspaceRoot)
  const wr = ctx.get('workspaceRegistry')
  if (wr) {
    try {
      const ws = wr.list()
      if (Array.isArray(ws) && ws.length) {
        ws.slice().sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1)).forEach((w) => {
          if (w && typeof w.path === 'string' && w.path && !candidates.includes(w.path)) candidates.push(w.path)
        })
      }
    } catch {
      /* ignore */
    }
  }
  if (dshHome && !candidates.includes(dshHome)) candidates.push(dshHome)
  for (const c of candidates) {
    if (!c) continue
    const root = path.join(c, 'dsh-plugin-version-management')
    try {
      await mkdir(root, { recursive: true })
      await writeFile(path.join(root, '.probe'), 'ok', 'utf8')
      return root
    } catch {
      /* try next */
    }
  }
  return null
}

async function ensureEnv(ctx) {
  if (ENV) return ENV
  const dshHome = await probeDshHome()
  const profileDir = await discoverProfile(dshHome)
  if (!profileDir) throw new Error('cannot locate dsh profile directory (dshHome=' + String(dshHome) + ')')
  const workRoot = await resolveWorkRoot(ctx, dshHome)
  if (!workRoot) throw new Error('cannot locate a writable directory for snapshots')
  ENV = {
    dshHome,
    profileDir,
    pkgJson: path.join(profileDir, 'package.json'),
    nodeModules: path.join(profileDir, 'node_modules'),
    workRoot,
  }
  return ENV
}

async function installedVersion(E, name) {
  const rel = name.startsWith('@') ? name.replace('/', path.sep) : name
  const p = path.join(E.nodeModules, rel, 'package.json')
  try {
    const j = await readJsonFile(p)
    return typeof j.version === 'string' ? j.version : null
  } catch {
    return null
  }
}

async function collectPlugins(ctx) {
  const E = await ensureEnv(ctx)
  const pkg = await readJsonFile(E.pkgJson)
  const bundles = (pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)) ? pkg.dsh.profile.bundles : []
  const deps = (pkg.dependencies && typeof pkg.dependencies === 'object') ? pkg.dependencies : {}
  const names = bundles.filter((b) => !isOfficial(b))
  const plugins = []
  for (const nm of names) {
    plugins.push({
      name: nm,
      required: typeof deps[nm] === 'string' ? deps[nm] : null,
      installed: await installedVersion(E, nm),
    })
  }
  let dshVersion = null
  const versionCandidates = [
    path.join(E.dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    path.join(E.profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  ]
  for (const vp of versionCandidates) {
    try {
      dshVersion = (await readJsonFile(vp)).version || null
    } catch {
      /* try next */
    }
    if (dshVersion) break
  }
  return { dshHome: E.dshHome, profilePath: E.profileDir, dshVersion, bundles, dependencies: deps, plugins }
}

function clip(s, n) {
  s = String(s)
  return s.length > n ? s.slice(0, n - 3) + '...' : s
}

function buildTxt(snap) {
  const L = []
  const NAME_W = 35
  const REQ_W = 47
  L.push('================================================================')
  L.push('  DSH Plugin Version Snapshot  (dsh-plugin-version-management)')
  L.push('================================================================')
  L.push('')
  L.push('Created at   : ' + snap.createdAt)
  L.push('DSH version  : ' + (snap.dshVersion || 'unknown'))
  L.push('Plugin count : ' + snap.pluginCount)
  L.push('Profile path : ' + snap.profilePath)
  L.push('Format       : ' + snap.format + ' (schema v' + snap.schemaVersion + ')')
  L.push('')
  L.push('Plugin list (required version / installed version):')
  L.push('----------------------------------------------------------------')
  L.push('  #  ' + 'name'.padEnd(NAME_W) + 'required'.padEnd(REQ_W) + 'installed')
  snap.plugins.forEach((p, i) => {
    const nm = clip(p.name, NAME_W).padEnd(NAME_W)
    const rq = clip(p.required === null ? '-' : p.required, REQ_W - 3).padEnd(REQ_W)
    L.push('  ' + String(i + 1).padEnd(3) + nm + rq + (p.installed || '-'))
  })
  L.push('')
  L.push('How to restore:')
  L.push('  1. In-page  : DSH settings -> Plugin Version Recovery -> pick this')
  L.push('     snapshot -> Restore.')
  L.push('  2. Offline  : right-click dsh-plugin-restore.ps1 -> Run with PowerShell,')
  L.push('     or in a terminal run:')
  L.push('       powershell -NoProfile -ExecutionPolicy Bypass -File "<folder>\\dsh-plugin-restore.ps1"')
  L.push('  3. Restart DSH after the restore completes.')
  return L.join('\n')
}

async function createSnapshot(ctx) {
  const E = await ensureEnv(ctx)
  const info = await collectPlugins(ctx)
  const folderName = 'snapshot-' + timestamp()
  const folderPath = path.join(E.workRoot, folderName)
  await mkdir(folderPath, { recursive: true })
  const snapshot = {
    format: 'dsh-plugin-snapshot',
    schemaVersion: 1,
    tool: 'dsh-plugin-version-management',
    createdAt: humanTime(),
    dshVersion: info.dshVersion,
    pluginCount: info.plugins.length,
    profilePath: E.profileDir,
    bundles: info.bundles,
    dependencies: info.dependencies,
    plugins: info.plugins,
  }
  const jsonPath = path.join(folderPath, 'dsh-plugin-snapshot.json')
  const txtPath = path.join(folderPath, 'dsh-plugin-snapshot.txt')
  const ps1Path = path.join(folderPath, 'dsh-plugin-restore.ps1')
  const mergePath = path.join(folderPath, 'dsh-plugin-restore-merge.js')
  await writeFile(jsonPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
  await writeFile(txtPath, buildTxt(snapshot), 'utf8')
  await writeFile(ps1Path, RESTORE_PS1, 'utf8')
  await writeFile(mergePath, RESTORE_MERGE_JS, 'utf8')
  return { folderName, folderPath, snapshot }
}

async function listSnapshots(ctx) {
  const E = await ensureEnv(ctx)
  let entries = []
  try {
    entries = await readdir(E.workRoot, { withFileTypes: true })
  } catch {
    entries = []
  }
  const out = []
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('snapshot-')) continue
    let meta = null
    try {
      const j = await readJsonFile(path.join(E.workRoot, e.name, 'dsh-plugin-snapshot.json'))
      meta = { createdAt: j.createdAt || null, pluginCount: j.pluginCount || null, dshVersion: j.dshVersion || null }
    } catch {
      meta = null
    }
    out.push({ folderName: e.name, folderPath: path.join(E.workRoot, e.name), meta })
  }
  out.sort((a, b) => (a.folderName < b.folderName ? 1 : -1))
  return out
}

async function readSnapshotByFolder(ctx, folderName) {
  const E = await ensureEnv(ctx)
  return readJsonFile(path.join(E.workRoot, folderName, 'dsh-plugin-snapshot.json'))
}

function computeMerge(current, snap, names) {
  const curBundles = current.bundles
  const curDeps = current.dependencies
  const snapBundles = Array.isArray(snap.bundles) ? snap.bundles : []
  const snapDeps = (snap.dependencies && typeof snap.dependencies === 'object') ? snap.dependencies : {}
  const wantAll = !Array.isArray(names) || names.length === 0
  const selected = wantAll ? null : {}
  if (!wantAll) {
    for (const n of names) selected[n] = true
  }
  const thirdSnap = snapBundles.filter((b) => !isOfficial(b) && (wantAll || selected[b]))
  const baseBundles = curBundles.filter((b) => isOfficial(b))
  let thirdBundles
  if (wantAll) {
    thirdBundles = thirdSnap
  } else {
    const curThird = curBundles.filter((b) => !isOfficial(b) && !selected[b])
    thirdBundles = curThird.concat(thirdSnap)
  }
  const newDeps = {}
  Object.keys(curDeps).forEach((k) => {
    if (isOfficial(k)) newDeps[k] = curDeps[k]
  })
  if (wantAll) {
    Object.keys(snapDeps).forEach((k) => {
      if (!isOfficial(k)) newDeps[k] = snapDeps[k]
    })
  } else {
    Object.keys(curDeps).forEach((k) => {
      if (!isOfficial(k) && !selected[k]) newDeps[k] = curDeps[k]
    })
    Object.keys(snapDeps).forEach((k) => {
      if (!isOfficial(k) && selected[k]) newDeps[k] = snapDeps[k]
    })
  }
  const changes = []
  Object.keys(newDeps).forEach((k) => {
    if (isOfficial(k)) return
    const before = curDeps[k]
    if (before === undefined) changes.push({ name: k, action: 'add', from: null, to: newDeps[k] })
    else if (before !== newDeps[k]) changes.push({ name: k, action: 'update', from: before, to: newDeps[k] })
  })
  Object.keys(curDeps).forEach((k) => {
    if (isOfficial(k)) return
    if (!(k in newDeps)) changes.push({ name: k, action: 'remove', from: curDeps[k], to: null })
  })
  return { bundles: baseBundles.concat(thirdBundles), dependencies: newDeps, changes }
}

async function prepareRestore(ctx, args) {
  const E = await ensureEnv(ctx)
  args = args || {}
  if (args.source === 'upload') {
    const snap = parseJson(args.content)
    if (!snap || snap.format !== 'dsh-plugin-snapshot') return { ok: false, error: 'not a valid dsh-plugin-snapshot file' }
    const folderName = 'snapshot-upload-' + timestamp()
    const folderPath = path.join(E.workRoot, folderName)
    await mkdir(folderPath, { recursive: true })
    await writeFile(path.join(folderPath, 'dsh-plugin-snapshot.json'), JSON.stringify(snap, null, 2) + '\n', 'utf8')
    await writeFile(path.join(folderPath, 'dsh-plugin-snapshot.txt'), buildTxt(snap), 'utf8')
    await writeFile(path.join(folderPath, 'dsh-plugin-restore.ps1'), RESTORE_PS1, 'utf8')
    await writeFile(path.join(folderPath, 'dsh-plugin-restore-merge.js'), RESTORE_MERGE_JS, 'utf8')
    args = { source: 'folder', folder: folderName, names: args.names }
  }
  if (!args.folder) return { ok: false, error: 'no snapshot folder given' }
  const snap = await readSnapshotByFolder(ctx, args.folder)
  const current = await collectPlugins(ctx)
  const merge = computeMerge(current, snap, args.names)
  return { ok: true, folder: args.folder, changes: merge.changes, currentCount: current.plugins.length, snapshotCount: snap.pluginCount, createdAt: snap.createdAt }
}

async function startApply(ctx, snap, names, folderName) {
  const E = await ensureEnv(ctx)
  const current = await collectPlugins(ctx)
  const merge = computeMerge(current, snap, names)
  const fallback = []
  Object.keys(snap.dependencies || {}).forEach((k) => {
    if (isOfficial(k)) return
    const v = String(snap.dependencies[k]).replace(/^[\^~]/, '')
    fallback.push('dsh plugin add ' + k + '@' + v)
  })
  if (merge.changes.length === 0) {
    return { ok: true, status: 'noop', changes: [], fallback, message: 'no changes needed - plugin state already matches the snapshot' }
  }
  const rawCurrent = await readFile(E.pkgJson, 'utf8')
  const backupPath = path.join(E.workRoot, folderName || 'backups', 'backups', 'package.json.bak-' + timestamp())
  await mkdir(path.dirname(backupPath), { recursive: true })
  await writeFile(backupPath, rawCurrent, 'utf8')
  const pkgObj = parseJson(rawCurrent)
  pkgObj.dsh.profile.bundles = merge.bundles
  pkgObj.dependencies = merge.dependencies
  await writeFile(E.pkgJson, JSON.stringify(pkgObj, null, 2) + '\n', 'utf8')
  restoreState = { running: true, phase: 'install', log: '', exitCode: null, error: null, startedAt: humanTime(), finishedAt: null }
  const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  let proc
  try {
    proc = spawn(cmd, ['install'], { cwd: E.profileDir, shell: process.platform === 'win32' })
  } catch (e) {
    restoreState.running = false
    restoreState.error = String(e && e.message || e)
    restoreState.finishedAt = humanTime()
    return { ok: true, status: 'running', changes: merge.changes, fallback, backupPath, startedAt: restoreState.startedAt }
  }
  let log = ''
  proc.stdout.on('data', (d) => {
    log = (log + String(d)).slice(-20000)
    restoreState.log = log
  })
  proc.stderr.on('data', (d) => {
    log = (log + String(d)).slice(-20000)
    restoreState.log = log
  })
  proc.on('close', (code) => {
    restoreState.running = false
    restoreState.exitCode = code
    restoreState.log = log
    restoreState.finishedAt = humanTime()
  })
  proc.on('error', (e) => {
    restoreState.running = false
    restoreState.error = String(e && e.message || e)
    restoreState.log = log
    restoreState.finishedAt = humanTime()
  })
  return { ok: true, status: 'running', changes: merge.changes, fallback, backupPath, startedAt: restoreState.startedAt }
}

async function startApplyFromArgs(ctx, args) {
  args = args || {}
  if (args.source === 'upload') {
    const prep = await prepareRestore(ctx, args)
    if (!prep.ok) return prep
    args = { source: 'folder', folder: prep.folder, names: args.names }
  }
  let folder = args.folder
  if (!folder) {
    const list = await listSnapshots(ctx)
    if (!list.length) return { ok: false, error: 'no snapshots found - create one first with dsh_plugin_snapshot' }
    folder = list[0].folderName
  }
  const snap = await readSnapshotByFolder(ctx, folder)
  return startApply(ctx, snap, Array.isArray(args.names) ? args.names : [], folder)
}

function waitForRestoreDone(timer, maxMs) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const iv = timer.interval(() => {
      if (!restoreState || restoreState.running === false) {
        iv()
        resolve()
      } else if (Date.now() - t0 > maxMs) {
        iv()
        resolve()
      }
    }, 1000)
  })
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  const host = req.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 2 * 1024 * 1024) throw new Error('body too large')
    chunks.push(c)
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'))
}

function registerRoute(ctx, method, routePath, handler) {
  return ctx.webServer.register({
    kind: 'exact',
    path: routePath,
    handler: async (req, res) => {
      try {
        if (method === 'POST') {
          if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'untrusted origin' })
        } else if (req.method !== method) {
          res.writeHead(405)
          res.end()
          return
        }
        await handler(req, res)
      } catch (e) {
        sendJson(res, 500, { ok: false, error: (e && e.message) || String(e) })
      }
    },
  })
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = [
      registerRoute(ctx, 'GET', '/dsh-pvm/list-plugins', async (_req, res) => {
        try {
          sendJson(res, 200, { ok: true, info: await collectPlugins(ctx) })
        } catch (e) {
          sendJson(res, 500, { ok: false, error: (e && e.message) || String(e) })
        }
      }),
      registerRoute(ctx, 'POST', '/dsh-pvm/create-snapshot', async (_req, res) => {
        const r = await createSnapshot(ctx)
        sendJson(res, 200, { ok: true, folderName: r.folderName, folderPath: r.folderPath, createdAt: r.snapshot.createdAt, pluginCount: r.snapshot.pluginCount })
      }),
      registerRoute(ctx, 'GET', '/dsh-pvm/list-snapshots', async (_req, res) => {
        sendJson(res, 200, { ok: true, snapshots: await listSnapshots(ctx) })
      }),
      registerRoute(ctx, 'POST', '/dsh-pvm/read-snapshot', async (req, res) => {
        const args = await readJsonBody(req)
        sendJson(res, 200, { ok: true, snapshot: await readSnapshotByFolder(ctx, args.folder) })
      }),
      registerRoute(ctx, 'POST', '/dsh-pvm/restore-preview', async (req, res) => {
        const args = await readJsonBody(req)
        sendJson(res, 200, await prepareRestore(ctx, args))
      }),
      registerRoute(ctx, 'POST', '/dsh-pvm/restore-apply', async (req, res) => {
        const args = await readJsonBody(req)
        sendJson(res, 200, await startApplyFromArgs(ctx, args))
      }),
      registerRoute(ctx, 'GET', '/dsh-pvm/restore-status', async (_req, res) => {
        const st = restoreState
        if (!st) return sendJson(res, 200, { running: false, logTail: '' })
        sendJson(res, 200, {
          running: st.running,
          phase: st.phase,
          logTail: st.log.slice(-4000),
          exitCode: st.exitCode,
          error: st.error,
          startedAt: st.startedAt,
          finishedAt: st.finishedAt,
        })
      }),
    ]
    return () => {
      for (const d of disposers) d()
    }
  }, 'dsh-plugin-version-management: http routes')

  ctx.tools.register({
    name: 'dsh_plugin_snapshot',
    description: 'Create a DSH plugin version snapshot (JSON + human-readable TXT + offline PowerShell restore script) under the workspace folder dsh-plugin-version-management. Use it when the user wants to snapshot/backup all installed DSH plugins and their versions.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute() {
      try {
        const r = await createSnapshot(ctx)
        return 'snapshot created: ' + r.folderName + ' (' + r.snapshot.pluginCount + ' plugins)\nfolder: ' + r.folderPath + '\nprofile: ' + r.snapshot.profilePath + '\nfiles: dsh-plugin-snapshot.json / dsh-plugin-snapshot.txt / dsh-plugin-restore.ps1 / dsh-plugin-restore-merge.js'
      } catch (e) {
        return 'snapshot failed: ' + String((e && e.message) || e)
      }
    },
  })

  ctx.tools.register({
    name: 'dsh_plugin_restore',
    description: 'Restore DSH plugins from a version snapshot: rewrites the profile package.json (bundles + dependencies), runs pnpm install, and reports the result. Args: folder (optional snapshot folder name, default latest), names (optional array of plugin names to restore only those), check (true = only report the running restore status), waitMs (max wait for pnpm install in ms, default 300000). Remind the user to restart DSH afterwards.',
    parameters: {
      folder: { type: 'string' },
      names: { type: 'array', items: { type: 'string' } },
      check: { type: 'boolean' },
      waitMs: { type: 'number' },
    },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) {
      try {
        args = args || {}
        if (args.check === true) {
          const st = restoreState
          if (!st) return 'no restore in progress'
          return JSON.stringify({ running: st.running, phase: st.phase, exitCode: st.exitCode, error: st.error, startedAt: st.startedAt, finishedAt: st.finishedAt, logTail: st.log.slice(-4000) })
        }
        const start = await startApplyFromArgs(ctx, args)
        if (start.ok === false) {
          return 'restore did not start: ' + String(start.error || JSON.stringify(start))
        }
        if (start.status === 'noop') return String(start.message || 'no changes needed')
        const waitMs = typeof args.waitMs === 'number' ? args.waitMs : 300000
        await waitForRestoreDone(ctx.timer, waitMs)
        const st = restoreState || {}
        let msg = 'plugin restore started: ' + start.changes.length + ' row change(s)\n'
        msg += 'package.json rewritten: ' + ENV.pkgJson + '\n'
        msg += 'backup: ' + start.backupPath + '\n'
        if (st.running === false) {
          if (st.exitCode === 0) msg += 'pnpm install finished OK.\n'
          else msg += 'pnpm install exited with ' + st.exitCode + (st.error ? '\nerror: ' + st.error : '') + '\n'
        } else {
          msg += 'pnpm install still running in background; call dsh_plugin_restore with check=true later.\n'
        }
        if (st.exitCode !== 0 && start.fallback && start.fallback.length) {
          msg += 'fallback reinstall commands (network):\n' + start.fallback.map((f) => '  ' + f).join('\n') + '\n'
        }
        msg += 'IMPORTANT: restart DSH to load the restored plugins.'
        return msg
      } catch (e) {
        return 'restore failed: ' + String((e && e.message) || e)
      }
    },
  })
}
