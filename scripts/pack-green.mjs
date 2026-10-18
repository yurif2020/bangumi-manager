/**
 * 绿色版打包：把 Electron 运行时 + 应用代码组装成免安装目录，并打成 zip。
 *
 * 不使用 electron-builder —— 它在本机解压 winCodeSign 缓存时
 * 需要创建符号链接，普通用户权限会失败（"客户端没有所需的特权"）。
 * 这里直接用已安装的 electron 发行版，产物结构与应用运行时完全一致：
 *
 *   release/番剧管理/
 *     electron.exe         -> 重命名为 番剧管理.exe
 *     resources/app.asar   -> 应用代码（main / preload / dist / node_modules）
 *     其余 Electron 运行时文件
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const APP_NAME = pkg.build?.productName ?? '番剧管理';
const OUT_DIR = path.join(ROOT, 'release');
const APP_DIR = path.join(OUT_DIR, APP_NAME);
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'bgm-pack-'));

const ELECTRON_DIST = path.join(ROOT, 'node_modules/electron/dist');
const ASAR_CLI = path.join(ROOT, 'node_modules/@electron/asar/bin/asar.js');
const SEVEN_ZIP = path.join(ROOT, 'node_modules/7zip-bin/win/x64/7za.exe');

/** 复制目录（跳过指定名称） */
function copyDir(src, dest, skip = () => false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

function log(step) {
  console.log(`  ${step}`);
}

// ---- 1. 校验前置产物 ----
console.log(`[1/5] 检查构建产物`);
for (const required of ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.cjs']) {
  if (!fs.existsSync(path.join(ROOT, required))) {
    console.error(`\n缺少 ${required}，请先执行 npm run build`);
    process.exit(1);
  }
}
log('dist/ 与 dist-electron/ 就绪');

// ---- 2. 组装应用目录（将被封进 app.asar）----
console.log(`[2/5] 组装应用目录`);
const appRoot = path.join(STAGE, 'app');
fs.mkdirSync(appRoot, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(appRoot, 'package.json'));
copyDir(path.join(ROOT, 'dist'), path.join(appRoot, 'dist'));
copyDir(path.join(ROOT, 'dist-electron'), path.join(appRoot, 'dist-electron'));

// 运行期依赖必须带上完整传递依赖树（electron-store → conf → ajv …）
// 只复制 package.json 里的顶层依赖会让解压到任意目录后启动失败。
const nmRoot = path.join(ROOT, 'node_modules');

function listProductionDeps() {
  // 直接读 package-lock.json：npm.cmd 在 Node 24 下用 execFileSync 调用会抛 EINVAL，
  // 而 lock 文件已完整记录生产依赖树（含嵌套 node_modules）。
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages ?? {})
    .filter(([key, meta]) => key.startsWith('node_modules/') && !meta.dev && !meta.devOptional)
    .map(([key]) => key.slice('node_modules/'.length))
    .sort((a, b) => a.length - b.length);
}

const nmDest = path.join(appRoot, 'node_modules');
fs.mkdirSync(nmDest, { recursive: true });
let copied = 0;
for (const rel of listProductionDeps()) {
  const to = path.join(nmDest, rel);
  // 父级包复制时已连带其内部 node_modules，跳过可避免重复拷贝
  if (fs.existsSync(to)) continue;
  const from = path.join(nmRoot, rel);
  if (!fs.existsSync(from)) continue;
  copyDir(from, to);
  copied++;
}
if (!fs.existsSync(path.join(nmDest, 'electron-store'))) {
  console.error('\n运行期依赖缺失，请先执行 npm install');
  process.exit(1);
}
log(`应用代码 + ${copied} 个依赖包`);

// package.json 只保留运行必需字段（打包后不需要 devDependencies）
const slimPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  type: pkg.type,
  dependencies: pkg.dependencies ?? {},
};
fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify(slimPkg, null, 2));

// ---- 3. 打 asar ----
console.log(`[3/5] 打包 app.asar`);
const asarPath = path.join(STAGE, 'app.asar');
execFileSync(process.execPath, [ASAR_CLI, 'pack', appRoot, asarPath], { stdio: 'inherit' });
const asarMb = (fs.statSync(asarPath).size / 1024 / 1024).toFixed(1);
log(`app.asar ${asarMb} MB`);

// ---- 4. 组装绿色目录 ----
console.log(`[4/5] 组装绿色目录`);
if (fs.existsSync(APP_DIR)) fs.rmSync(APP_DIR, { recursive: true, force: true });
fs.mkdirSync(APP_DIR, { recursive: true });

// Electron 运行时：跳过默认应用，保留 locales 与必要 dll
copyDir(ELECTRON_DIST, APP_DIR, (name) => name === 'default_app.asar');
fs.mkdirSync(path.join(APP_DIR, 'resources'), { recursive: true });
fs.copyFileSync(asarPath, path.join(APP_DIR, 'resources', 'app.asar'));

// 主程序改名，让任务栏与进程名显示中文
const exeSrc = path.join(APP_DIR, 'electron.exe');
const exeDest = path.join(APP_DIR, `${APP_NAME}.exe`);
if (fs.existsSync(exeDest)) fs.rmSync(exeDest);
fs.renameSync(exeSrc, exeDest);

// 附带「已看」推送脚本，方便其他程序调用
fs.writeFileSync(
  path.join(APP_DIR, '推送已看.cmd'),
  [
    '@echo off',
    'rem 用法: 推送已看.cmd <番剧ID> [集数]',
    'rem   推送已看.cmd 400602 5     表示番剧 400602 第 5 集已看',
    'rem   推送已看.cmd 400602       表示推进一集',
    'if "%~2"=="" (',
    '  start "" "${APP_NAME}.exe" --watched %1',
    ') else (',
    '  start "" "${APP_NAME}.exe" --watched %1 --ep %2',
    ')',
    '',
  ]
    .join('\r\n')
    .replace(/\$\{APP_NAME\}/g, APP_NAME),
  'utf8',
);
log(`release/${APP_NAME}/`);

// ---- 5. 打 zip ----
console.log(`[5/5] 压缩`);
const zipPath = path.join(OUT_DIR, `${APP_NAME}-${pkg.version}-win-x64.zip`);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
execFileSync(SEVEN_ZIP, ['a', '-tzip', '-mx=5', zipPath, APP_DIR], { cwd: OUT_DIR, stdio: 'ignore' });

fs.rmSync(STAGE, { recursive: true, force: true });

const exeSize = (fs.statSync(exeDest).size / 1024 / 1024).toFixed(0);
const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`\n完成：`);
console.log(`  目录  ${path.relative(ROOT, APP_DIR)}/  （双击 ${APP_NAME}.exe 运行）`);
console.log(`  压缩  ${path.relative(ROOT, zipPath)}  ${zipSize} MB`);
console.log(`  主程序 ${exeSize} MB（Electron 运行时，Linux 下约 180 MB，Windows 下含 WebView 组件）`);
