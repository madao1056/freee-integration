const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// --- Path resolution (dev vs packaged) ---
// APP_ROOT: コード（src/, electron/, node_modules/）の場所
// DATA_ROOT: 設定ファイル（.env*, config/, service-account-key*）の場所
//   - dev: プロジェクトルート
//   - packaged: 保存済みプロジェクトパス or ダイアログで選択
const APP_ROOT = app.isPackaged
  ? app.getAppPath()
  : path.resolve(__dirname, '..');

let DATA_ROOT = path.resolve(__dirname, '..');

if (!app.isPackaged) {
  process.chdir(DATA_ROOT);
}

// パッケージ時は Electron 自体を Node.js として使う
const NODE_BIN = app.isPackaged ? process.execPath : 'node';
const NODE_ENV_EXTRA = app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {};

/**
 * パッケージ版: プロジェクトフォルダを解決
 * 1. userData に保存済みパスがあればそれを使う
 * 2. なければダイアログで選択させる
 * 3. フォールバック: Resources/（ビルド時コピー）
 */
function resolveDataRoot() {
  if (!app.isPackaged) return DATA_ROOT;

  const configFile = path.join(app.getPath('userData'), 'project-path.txt');

  // 保存済みパスを確認
  if (fs.existsSync(configFile)) {
    const saved = fs.readFileSync(configFile, 'utf-8').trim();
    if (saved && fs.existsSync(path.join(saved, '.env'))) {
      return saved;
    }
  }

  // ダイアログで選択
  const result = dialog.showOpenDialogSync({
    title: 'プロジェクトフォルダを選択',
    message: 'freee連携ツールの .env ファイルがあるフォルダを選択してください',
    properties: ['openDirectory'],
  });

  if (result && result[0] && fs.existsSync(path.join(result[0], '.env'))) {
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, result[0]);
    return result[0];
  }

  // フォールバック: Resources/（ビルド時コピー）
  return process.resourcesPath;
}

let mainWindow;
/** @type {import('child_process').ChildProcess|null} */
let ptyHost = null;
/** @type {import('child_process').ChildProcess|null} */
let currentProcess = null;

// --- PTY Host Management ---
// node-pty は Electron メインプロセス内では posix_spawnp が失敗するため、
// 別の Node.js プロセス (pty-host.js) で実行し、JSON IPC で通信する。

function spawnPtyHost() {
  const hostScript = path.join(__dirname, 'pty-host.js');
  ptyHost = spawn(NODE_BIN, [hostScript], {
    cwd: DATA_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...NODE_ENV_EXTRA, FREEE_DATA_ROOT: DATA_ROOT },
  });

  let buffer = '';
  ptyHost.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIdx);
      buffer = buffer.substring(newlineIdx + 1);
      try {
        const msg = JSON.parse(line);
        handlePtyMessage(msg);
      } catch {}
    }
  });

  ptyHost.stderr.on('data', (data) => {
    console.error('[pty-host stderr]', data.toString());
  });

  ptyHost.on('exit', (code) => {
    console.log('[pty-host] exited with code', code);
    // 再起動
    if (!mainWindow?.isDestroyed()) {
      setTimeout(() => spawnPtyHost(), 1000);
    }
  });

  ptyHost.on('error', (err) => {
    console.error('[pty-host] error:', err.message);
  });
}

function handlePtyMessage(msg) {
  switch (msg.type) {
    case 'ready':
      // 初期サイズで spawn 要求
      sendToPtyHost({ type: 'spawn', cols: 80, rows: 24 });
      break;
    case 'data':
      mainWindow?.webContents.send('pty-data', msg.data);
      break;
    case 'exit':
      mainWindow?.webContents.send('pty-data',
        `\r\n[Claude Code 終了 (code: ${msg.exitCode})] 再起動中...\r\n`);
      break;
    case 'spawned':
      console.log('[pty-host] PTY spawned, pid:', msg.pid);
      break;
  }
}

function sendToPtyHost(msg) {
  if (ptyHost && !ptyHost.killed) {
    ptyHost.stdin.write(JSON.stringify(msg) + '\n');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1e1e2e',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    spawnPtyHost();
  });
}

app.whenReady().then(() => {
  // パッケージ版: プロジェクトフォルダを解決して CWD を設定
  if (app.isPackaged) {
    DATA_ROOT = resolveDataRoot();
    process.chdir(DATA_ROOT);
  }

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (ptyHost) {
    sendToPtyHost({ type: 'kill' });
    ptyHost.kill();
    ptyHost = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (ptyHost) {
    sendToPtyHost({ type: 'kill' });
    ptyHost.kill();
    ptyHost = null;
  }
});

// --- IPC Handlers ---

// PTY input from renderer
ipcMain.on('pty-input', (_event, data) => {
  sendToPtyHost({ type: 'input', data });
});

// PTY resize
ipcMain.on('pty-resize', (_event, { cols, rows }) => {
  sendToPtyHost({ type: 'resize', cols, rows });
});

// プロファイル一覧を返す
ipcMain.handle('get-profiles', () => {
  const files = fs.readdirSync(DATA_ROOT);
  const profiles = files
    .filter(f => f.startsWith('.env.') && !f.endsWith('.example'))
    .map(f => f.replace('.env.', ''));

  let defaultProfile = '';
  const envPath = path.join(DATA_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^FREEE_DEFAULT_PROFILE=(.+)$/m);
    if (match) defaultProfile = match[1].trim();
  }

  return { profiles, defaultProfile };
});

// プロファイルの.envから特定キーの値を読む
ipcMain.handle('get-env-value', (_event, { profile, key }) => {
  const envPath = path.join(DATA_ROOT, `.env.${profile}`);
  if (!fs.existsSync(envPath)) return '';
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : '';
});

// コマンド実行（ボトムパネル用 — child_process.spawn）
ipcMain.handle('run-command', (_event, { command, args, profile }) => {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }

  const spawnArgs = [path.join(APP_ROOT, 'src/main.js'), command, ...args];
  if (profile) {
    spawnArgs.push('--profile', profile);
  }

  const child = spawn(NODE_BIN, spawnArgs, {
    cwd: DATA_ROOT,
    env: { ...process.env, ...NODE_ENV_EXTRA, FORCE_COLOR: '1', FREEE_DATA_ROOT: DATA_ROOT },
  });

  currentProcess = child;

  child.stdout.on('data', (data) => {
    mainWindow?.webContents.send('terminal-data', data.toString());
  });

  child.stderr.on('data', (data) => {
    mainWindow?.webContents.send('terminal-data', data.toString());
  });

  child.on('close', (code) => {
    currentProcess = null;
    mainWindow?.webContents.send('command-done', code);
  });

  child.on('error', (err) => {
    currentProcess = null;
    mainWindow?.webContents.send('terminal-data', `\nエラー: ${err.message}\n`);
    mainWindow?.webContents.send('command-done', 1);
  });

  return { pid: child.pid };
});

// ファイル読み込み（プレビュー用）
ipcMain.handle('read-file', (_event, { filePath }) => {
  const resolved = path.resolve(DATA_ROOT, filePath);
  if (!resolved.startsWith(DATA_ROOT)) {
    return { error: 'アクセス拒否' };
  }
  if (!fs.existsSync(resolved)) {
    return { error: 'ファイルが見つかりません' };
  }
  const stat = fs.statSync(resolved);
  if (stat.size > 2 * 1024 * 1024) {
    return { error: 'ファイルが大きすぎます (2MB超)' };
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  return { content, filePath: resolved, size: stat.size };
});

// 取引先一覧取得
ipcMain.handle('fetch-partners', async (_event, { profile }) => {
  const { loadProfile, getConfig, freeeApiRequest } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
  loadProfile(profile);
  const config = getConfig();
  return await freeeApiRequest(`/api/1/partners?company_id=${config.freeeCompanyId}&limit=100`);
});

// 見積書一覧取得
ipcMain.handle('fetch-quotations', async (_event, { profile }) => {
  const { loadProfile, getConfig, freeeApiRequest } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
  loadProfile(profile);
  const config = getConfig();
  return await freeeApiRequest(`/api/1/quotations?company_id=${config.freeeCompanyId}&quotation_status=all&limit=100`);
});

// 見積書詳細取得（/iv/ API）
ipcMain.handle('fetch-quotation-detail', async (_event, { id, profile }) => {
  const { loadProfile, getConfig, freeeApiRequest } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
  loadProfile(profile);
  const config = getConfig();
  return await freeeApiRequest(`/iv/quotations/${id}?company_id=${config.freeeCompanyId}`);
});

// 請求書一覧取得（見積書との紐付け確認用）
ipcMain.handle('fetch-invoices', async (_event, { profile }) => {
  const { loadProfile, getConfig, freeeApiRequest } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
  loadProfile(profile);
  const config = getConfig();
  return await freeeApiRequest(`/api/1/invoices?company_id=${config.freeeCompanyId}&limit=100`);
});

// 書類作成（請求書 or 見積書）
ipcMain.handle('create-document', async (_event, { type, data, profile }) => {
  const { loadProfile, getConfig, freeeApiRequest } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
  loadProfile(profile);
  const config = getConfig();
  const endpoint = type === 'invoice' ? '/iv/invoices' : '/iv/quotations';
  const body = { company_id: parseInt(config.freeeCompanyId), ...data };
  return await freeeApiRequest(endpoint, 'POST', body);
});

// レシートアップロード（ローカルファイル → freee ファイルボックス）
ipcMain.handle('upload-receipt', async (_event, { filePath, fileName, mimeType, profile }) => {
  try {
    const { loadProfile, getConfig, freeeApiUpload } = require(path.join(APP_ROOT, 'src/utils/freee_api.js'));
    loadProfile(profile);
    const config = getConfig();

    const fileBuffer = fs.readFileSync(filePath);
    const FormData = require('form-data');
    const form = new FormData();
    form.append('company_id', config.freeeCompanyId.toString());
    form.append('receipt', fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });

    const result = await freeeApiUpload('/api/1/receipts', form);
    return { success: true, receiptId: result.receipt?.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// プロジェクトパスを返す
ipcMain.handle('get-data-root', () => DATA_ROOT);

// プロジェクトパスを再選択（設定リセット）
ipcMain.handle('reset-project-path', () => {
  const configFile = path.join(app.getPath('userData'), 'project-path.txt');
  if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
  const newRoot = resolveDataRoot();
  if (newRoot !== DATA_ROOT) {
    DATA_ROOT = newRoot;
    process.chdir(DATA_ROOT);
    return { changed: true, path: DATA_ROOT };
  }
  return { changed: false, path: DATA_ROOT };
});

// 実行中のプロセスを停止
ipcMain.handle('kill-process', () => {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
    return true;
  }
  return false;
});
