# freee-rule — 共有セットアップガイド

freee会計の自動登録ルール（user_matchers）を Claude Code から管理し、口座明細の自動仕訳を効率化するシステムです。

```
「この手数料のルール追加して」→ Claude Code が freee API で自動登録ルールを作成
```

---

## Claude Code のインストール（まだ入っていない方へ）

このシステムは **Claude Code**（Anthropic公式のCLIツール）を使います。
既にインストール済みの方は「Claude Code への指示」まで読み飛ばしてください。

### 1. Node.js をインストール

Claude Code の動作には **Node.js v18以上** が必要です。

```bash
node --version
```

上記コマンドでバージョンが表示されない、または v18 未満の場合:

| OS | コマンド |
|----|---------|
| macOS（Homebrew） | `brew install node` |
| macOS（公式） | https://nodejs.org/ からLTS版をダウンロード |
| Ubuntu / Debian | `curl -fsSL https://deb.nodesource.com/setup_lts.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| Windows | https://nodejs.org/ からLTS版をダウンロード＆インストール |

### 2. Claude Code をインストール

```bash
npm install -g @anthropic-ai/claude-code
```

インストール確認:
```bash
claude --version
```

### 3. 認証（初回のみ）

| プラン | 方法 |
|--------|------|
| **Claude Max（推奨）** | `claude` を起動 → ブラウザが開く → Anthropic アカウントでログイン（https://claude.ai で加入） |
| **Claude Pro / Team** | 同上。ブラウザでログイン |
| **Anthropic API キー** | 環境変数 `ANTHROPIC_API_KEY` を設定: `export ANTHROPIC_API_KEY=sk-ant-xxxxx`（https://console.anthropic.com で発行） |

### 4. 初回起動

```bash
claude
```

ターミナルで対話型インターフェースが起動すれば準備完了。`/exit` で一旦終了してOK。

---

## Claude Code への指示

**Claude Code が使える状態になったら**: ターミナルで `claude` を起動し、以下のように指示してください。

```
このファイルを読んで、freee-ruleをセットアップして
```

---

## Step 0: 前提条件チェック

**Claude Code は、セットアップ開始前に以下の全項目を確認してください。**
1つでも未達の場合は、該当セクションの手順に従ってユーザーを案内してください。

### 0-1. Claude Code / Node.js

```bash
claude --version && node --version
```

未インストールの場合は冒頭のインストールセクションに従う。

### 0-2. freee アカウント + OAuth アプリ

freee 会計のアカウントと、API連携用のOAuthアプリが必要です。
AskUserQuestion で「freee のアカウントとOAuthアプリはありますか？」と確認する。

**新規作成の場合**:

1. https://app.secure.freee.co.jp/ でfreee会計アカウント作成
2. https://app.secure.freee.co.jp/developers にアクセス
3. 「新しいアプリを作成」→ アプリ名: 「自動仕訳管理」（任意）
4. コールバックURL: `urn:ietf:wg:oauth:2.0:oob`（CLIアプリ用）
5. 以下を控える:
   - **Client ID**
   - **Client Secret**
6. OAuth認可で **Access Token** と **Refresh Token** を取得:
   - ブラウザで `https://accounts.secure.freee.co.jp/public_api/authorize?client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code` にアクセス
   - 認可後に表示される認可コードを使って、POSTリクエストでトークン取得
7. freee の「事業所設定」から **Company ID** を確認

**注意**: `user_matchers` API は法人プランのアカウントが必要です。個人事業主プロファイル（personal）では 403 エラーになります。

### 0-3. Lark Suite アカウント + アプリ（オプション）

Lark 連携（通知・Base同期）を使う場合に必要です。自動登録ルール管理のみであれば不要。

1. https://www.larksuite.com/ でアカウント作成
2. https://open.larksuite.com/app でカスタムアプリ作成
3. 以下を控える:
   - **App ID** / **App Secret**
4. Permissions で `bitable:app` と `im:message` を追加
5. Publish してアプリを有効化

### 0-4. Google Service Account（オプション）

Google Sheets 連携（エクスポート/インポート）を使う場合に必要です。

1. https://console.cloud.google.com/ でプロジェクト作成
2. Google Sheets API と Google Drive API を有効化
3. サービスアカウントを作成 → JSON キーファイルをダウンロード
4. ダウンロードしたファイルを `service-account-key.json` として保存
5. 連携するスプレッドシートにサービスアカウントのメールアドレスを共有（閲覧者以上）

---

## Step 1: プロジェクト作成

### 1-1. ディレクトリ構造

```bash
mkdir -p ~/project/freee/src/utils
mkdir -p ~/project/freee/src/api
mkdir -p ~/project/freee/src/sheets
mkdir -p ~/project/freee/src/drive
mkdir -p ~/project/freee/src/lark
mkdir -p ~/project/freee/config
```

### 1-2. package.json

```json
{
  "name": "freee-integration",
  "version": "1.0.0",
  "description": "freee会計APIと連携して、口座明細の自動仕訳ルールを管理するツール",
  "private": true,
  "bin": {
    "freee": "./src/main.js"
  },
  "scripts": {
    "start": "node src/main.js",
    "test": "node src/main.js api:test"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "form-data": "^4.0.5",
    "googleapis": "^169.0.0"
  }
}
```

### 1-3. 依存パッケージのインストール

```bash
cd ~/project/freee && npm install
```

### 1-4. 環境変数ファイル

AskUserQuestion で以下の情報を聞いてください。

#### `.env`（共通設定）

```
FREEE_DEFAULT_PROFILE=bond
LARK_APP_ID=<Lark App ID>
LARK_APP_SECRET=<Lark App Secret>
LARK_CHAT_ID=<Lark Chat ID（通知先、省略可）>
```

#### `.env.bond`（法人プロファイル — user_matchers API 利用に必須）

```
FREEE_PROFILE_NAME=<事業者名>
FREEE_ACCESS_TOKEN=<OAuth Access Token>
FREEE_COMPANY_ID=<freee Company ID>
FREEE_REFRESH_TOKEN=<OAuth Refresh Token>
FREEE_CLIENT_ID=<OAuth Client ID>
FREEE_CLIENT_SECRET=<OAuth Client Secret>
SPREADSHEET_ID=<Google Spreadsheet ID（省略可）>
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json
DRIVE_ROOT_FOLDER_ID=<Google Drive フォルダID（省略可）>
```

複数事業がある場合は `.env.personal` 等のプロファイルを追加で作成。
ただし `user_matchers` API は法人プロファイルでのみ利用可能。

### 1-5. Google Service Account キー（オプション）

Step 0-4 でダウンロードした JSON キーファイルを配置:

```bash
cp ~/Downloads/your-service-account-key.json ~/project/freee/service-account-key.json
```

### 1-6. .gitignore

```
node_modules/
.env
.env.*
!.env.example
service-account-key.json
service-account-key.*.json
credentials.json
token.json
client_id.json
.lark_base_config.json
.lark_base_config.*.json
processed_receipts.json
processed_receipts.*.json
test_results.json
account_items.json
*.log
*.tmp
temp/
debug/
dist/
build/
*.dmg
.DS_Store
.vscode/
.idea/
```

---

## Step 2: コアスクリプトの作成

### 2-1. freee API クライアント (`src/utils/freee_api.js`)

```javascript
// freee API 共通クライアント
// 全スクリプト共通のAPIリクエスト関数 + トークン自動更新 + マルチプロファイル
const https = require('https');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// データルート: パッケージ版では FREEE_DATA_ROOT 環境変数を使用
function getDataRoot() {
  return process.env.FREEE_DATA_ROOT || process.cwd();
}

// デフォルトで .env をロード（共通設定）
dotenv.config({ path: path.join(getDataRoot(), '.env'), quiet: true });

/** @type {string|null} アクティブなプロファイル名 */
let _currentProfile = null;

/**
 * プロファイルをロード
 * .env（共通）を先にロード済みの状態で、.env.{name} を上書きロード
 * @param {string} [name] - プロファイル名。省略時は FREEE_DEFAULT_PROFILE を使用
 * @returns {string} ロードしたプロファイル名
 */
function loadProfile(name) {
  const profileName = name || process.env.FREEE_DEFAULT_PROFILE;
  if (!profileName) {
    return '';
  }

  const profileEnvPath = path.resolve(getDataRoot(), `.env.${profileName}`);
  if (!fs.existsSync(profileEnvPath)) {
    throw new Error(`プロファイル設定ファイルが見つかりません: .env.${profileName}`);
  }

  dotenv.config({ path: profileEnvPath, override: true, quiet: true });
  _currentProfile = profileName;
  return profileName;
}

/**
 * 現在のプロファイル名を返す
 * @returns {string|null}
 */
function getCurrentProfile() {
  return _currentProfile;
}

/**
 * 共通設定を取得
 * @returns {{ freeeToken: string, freeeCompanyId: number, spreadsheetId: string, serviceAccountKeyFile: string, driveRootFolderId: string }}
 */
function getConfig() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account-key.json';
  return {
    freeeToken: process.env.FREEE_ACCESS_TOKEN,
    freeeCompanyId: parseInt(process.env.FREEE_COMPANY_ID),
    spreadsheetId: process.env.SPREADSHEET_ID,
    serviceAccountKeyFile: path.resolve(getDataRoot(), keyFile),
    driveRootFolderId: process.env.DRIVE_ROOT_FOLDER_ID
  };
}

/**
 * .envファイルのトークンを更新
 * @param {string} newAccessToken
 * @param {string} newRefreshToken
 */
function updateEnvTokens(newAccessToken, newRefreshToken) {
  const envFileName = _currentProfile ? `.env.${_currentProfile}` : '.env';
  const envPath = path.resolve(getDataRoot(), envFileName);
  if (!fs.existsSync(envPath)) return;

  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /FREEE_ACCESS_TOKEN=.*/,
    `FREEE_ACCESS_TOKEN=${newAccessToken}`
  );
  if (newRefreshToken) {
    envContent = envContent.replace(
      /FREEE_REFRESH_TOKEN=.*/,
      `FREEE_REFRESH_TOKEN=${newRefreshToken}`
    );
  }
  fs.writeFileSync(envPath, envContent);

  process.env.FREEE_ACCESS_TOKEN = newAccessToken;
  if (newRefreshToken) {
    process.env.FREEE_REFRESH_TOKEN = newRefreshToken;
  }
}

/**
 * トークンをリフレッシュ
 * @returns {Promise<string>} 新しいアクセストークン
 */
function refreshToken() {
  return new Promise((resolve, reject) => {
    const clientId = process.env.FREEE_CLIENT_ID;
    const clientSecret = process.env.FREEE_CLIENT_SECRET;
    const refreshTokenValue = process.env.FREEE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshTokenValue) {
      reject(new Error('トークンリフレッシュに必要な環境変数が設定されていません（FREEE_CLIENT_ID, FREEE_CLIENT_SECRET, FREEE_REFRESH_TOKEN）'));
      return;
    }

    const postData = JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue
    });

    const options = {
      hostname: 'accounts.secure.freee.co.jp',
      path: '/public_api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.access_token) {
            console.log('   ✓ トークンを自動更新しました');
            updateEnvTokens(response.access_token, response.refresh_token);
            resolve(response.access_token);
          } else {
            reject(new Error(`トークンリフレッシュ失敗 ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * freee APIリクエスト（JSON）
 * 401エラー時にトークン自動リフレッシュしてリトライ
 * @param {string} apiPath - APIパス（例: /api/1/deals）
 * @param {string} [method='GET'] - HTTPメソッド
 * @param {object|null} [data=null] - リクエストボディ
 * @returns {Promise<object>}
 */
function freeeApiRequest(apiPath, method = 'GET', data = null) {
  return _doRequest(apiPath, method, data, false);
}

/**
 * freee APIアップロード（multipart/form-data）
 * @param {string} apiPath - APIパス（例: /api/1/receipts）
 * @param {FormData} formData - form-dataインスタンス
 * @returns {Promise<object>}
 */
function freeeApiUpload(apiPath, formData) {
  return _doUpload(apiPath, formData, false);
}

/**
 * freee の認証付きURLからファイルをダウンロード（リダイレクト追従）
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
function freeeDownloadFile(url) {
  return _doDownload(url, false);
}

function _doDownload(url, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('FREEE_ACCESS_TOKENが設定されていません。'));
      return;
    }
    let redirects = 0;
    const handle = (currentUrl) => {
      const parsed = new URL(currentUrl);
      const opts = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': '*/*'
        }
      };
      const req = https.request(opts, async (res) => {
        if (res.statusCode === 401 && !isRetry) {
          res.resume();
          try {
            await refreshToken();
            const result = await _doDownload(url, true);
            resolve(result);
          } catch (e) {
            reject(new Error(`認証エラー（リフレッシュも失敗）: ${e.message}`));
          }
          return;
        }
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (++redirects > 5) return reject(new Error('Too many redirects'));
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).toString();
          res.resume();
          return handle(next);
        }
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => reject(new Error(`Download failed: HTTP ${res.statusCode} ${body.slice(0, 200)}`)));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'application/octet-stream'
        }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    };
    handle(url);
  });
}

/**
 * 内部: JSONリクエスト実行
 */
function _doRequest(apiPath, method, data, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('FREEE_ACCESS_TOKENが設定されていません。.envファイルを確認してください。'));
      return;
    }

    const options = {
      hostname: 'api.freee.co.jp',
      path: apiPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        if (res.statusCode === 401 && !isRetry) {
          try {
            await refreshToken();
            const result = await _doRequest(apiPath, method, data, true);
            resolve(result);
          } catch (refreshError) {
            reject(new Error(`認証エラー（トークンリフレッシュも失敗）: ${refreshError.message}`));
          }
          return;
        }

        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 内部: multipart/form-dataアップロード実行
 */
function _doUpload(apiPath, formData, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('FREEE_ACCESS_TOKENが設定されていません。'));
      return;
    }

    const options = {
      hostname: 'api.freee.co.jp',
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        if (res.statusCode === 401 && !isRetry) {
          try {
            await refreshToken();
            const result = await _doUpload(apiPath, formData, true);
            resolve(result);
          } catch (refreshError) {
            reject(new Error(`認証エラー（トークンリフレッシュも失敗）: ${refreshError.message}`));
          }
          return;
        }

        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`Upload Error ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    formData.pipe(req);
  });
}

module.exports = {
  getConfig,
  freeeApiRequest,
  freeeApiUpload,
  freeeDownloadFile,
  refreshToken,
  updateEnvTokens,
  loadProfile,
  getCurrentProfile
};
```

### 2-2. CLIエントリーポイント (`src/main.js`)

```javascript
#!/usr/bin/env node
// freee連携ツール - メインエントリーポイント

const path = require('path');
const fs = require('fs');
const { loadProfile, getCurrentProfile } = require('./utils/freee_api');

// ヘルプメッセージ
function showHelp() {
  console.log(`
========================================
  freee API 連携ツール
========================================

使用方法:
  node main.js <command> [options]

利用可能なコマンド:

  api:test                          freee API動作確認
  api:companies                     事業所情報取得
  api:accounts                      勘定科目一覧取得
  api:audit [year] [--sheets id]    確定申告データ品質チェック

  sheets:import <spreadsheet-id>     スプレッドシートからfreeeに取引登録
  sheets:export <spreadsheet-id>     freeeデータをスプレッドシートにエクスポート
  sheets:report <spreadsheet-id> [YYYY-MM]  月次レポート生成
  sheets:invoice <spreadsheet-id> [export]  請求書連携

  drive:check                        Driveフォルダ構造を確認
  drive:upload [month]               レシートアップロード

  lark:test                        Lark Bot接続テスト
  lark:notify                      未処理明細をLarkに通知

  --profile <name>             使用するプロファイルを指定

例:
  node main.js api:test --profile bond
  node main.js api:test --profile personal
  node main.js api:test
`);
}

// 初期セットアップガイド
function showSetup() {
  console.log(`
========================================
  初期セットアップガイド
========================================

1. Google認証設定:
   docs/SERVICE_ACCOUNT_SETUP.md を参照

2. 認証テスト:
   node main.js auth:test

3. freee API テスト:
   node main.js api:test

4. スプレッドシート連携テスト:
   node main.js sheets:sample <スプレッドシートID>
   node main.js sheets:import <スプレッドシートID>

5. Drive連携テスト:
   node main.js drive:check
   node main.js drive:upload

設定ファイル:
  - service-account-key.json (Google認証)
  - .env (環境変数)
`);
}

// コマンド実行
async function runCommand(command, args) {
  const rootDir = path.resolve(__dirname, '..');
  process.chdir(rootDir);

  switch (command) {
    case 'api:test':
      require('./api/test_api.js');
      break;

    case 'api:companies':
      require('./api/get_companies.js');
      break;

    case 'api:accounts':
      require('./api/get_account_items.js');
      break;

    case 'setup':
      showSetup();
      break;

    default:
      console.error(`不明なコマンド: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// --profile オプションを抽出
function extractProfileOption(argv) {
  const args = [...argv];
  const idx = args.indexOf('--profile');
  let profileName = null;
  if (idx !== -1 && idx + 1 < args.length) {
    profileName = args[idx + 1];
    args.splice(idx, 2);
  }
  return { profileName, args };
}

// メイン処理
const { profileName, args } = extractProfileOption(process.argv.slice(2));
const command = args[0];

if (!command || command === 'help' || command === '--help') {
  showHelp();
  process.exit(0);
}

try {
  const loaded = loadProfile(profileName || undefined);
  if (loaded) {
    const displayName = process.env.FREEE_PROFILE_NAME || loaded;
    console.log(`[${displayName}] プロファイル: ${loaded}\n`);
  }
} catch (e) {
  console.error('プロファイルエラー:', e.message);
  process.exit(1);
}

runCommand(command, args.slice(1)).catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});
```

---

## Step 3: Claude Code スキル登録

### 3-1. コマンドディレクトリの作成

```bash
mkdir -p PROJECT_DIR/.claude/commands
```

### 3-2. コマンドファイルの作成

以下の内容で `PROJECT_DIR/.claude/commands/freee-rule.md` を作成する。

**Claude Code へ**: テンプレート内の `PROJECT_DIR` は Step 1-1 で作成したディレクトリの絶対パスに置換すること。

````markdown
# freee 自動登録ルール管理

freee会計の自動登録ルール（user_matchers）APIを使って、口座明細の自動仕訳ルールを管理するスキル。

## ルーティング

**「freeeのルール」「自動仕訳」「自動登録ルール」等の文脈で自動的にこのスキルで処理する。**

例:
- 「freeeのルール一覧見せて」→ ルール一覧取得
- 「この取引先のルール追加して」→ ルール作成
- 「明細パターンからルール提案して」→ 分析→提案→作成

## 基本情報

- **API Base**: `https://api.freee.co.jp/api/1/user_matchers`
- **プロジェクト**: `PROJECT_DIR`
- **共通クライアント**: `src/utils/freee_api.js`（トークン自動リフレッシュ対応）
- **プロファイル**: `bond`（法人）※ personalは権限なし
- **company_id**: `getConfig().freeeCompanyId` で取得

## API仕様

### エンドポイント

| 操作 | メソッド | パス |
|------|----------|------|
| 一覧取得 | GET | `/api/1/user_matchers?company_id={id}` |
| 個別取得 | GET | `/api/1/user_matchers/{id}?company_id={id}` |
| 作成 | POST | `/api/1/user_matchers` |
| 更新 | PUT | `/api/1/user_matchers/{id}` |
| 削除 | DELETE | `/api/1/user_matchers/{id}?company_id={id}` |

### 作成リクエスト（POST）必須パラメータ

```javascript
{
  company_id: config.freeeCompanyId,  // 必須
  act: 1,                             // 必須: 0=推測, 1=確定登録
  active: true,                       // 必須: ルール有効/無効
  condition: 1,                       // 必須: 1=含む, 2=完全一致
  description: "手数料",               // 必須: マッチする明細キーワード
  entry_side_str: "expense",           // 必須: "income"=入金, "expense"=出金
  priority: 1,                         // 必須: 優先順位（数字）
  account_item_name: "支払手数料",      // act=0,1の場合必須: 勘定科目名
  tax_name: "課対仕入10%"              // act=0,1の場合必須: 税区分名
}
```

### オプションパラメータ

```javascript
{
  partner_name: "取引先名",            // 取引先の指定
  item_name: "品目名",                // 品目の指定
  section_name: "部門名",             // 部門の指定
  min_amount: 1000,                   // 最小金額フィルター
  max_amount: 100000,                 // 最大金額フィルター
  deal_description: "取引の備考",      // 取引に付与する備考
  qualified_invoice_setting: "non_qualified"  // インボイス設定
}
```

### よく使う勘定科目

| 科目名 | 用途例 |
|--------|--------|
| 売上高 | クライアント入金 |
| 役員報酬 | 給与振込 |
| 給料手当 | スタッフ給与 |
| 外注費 | 外部委託 |
| 支払手数料 | 振込手数料、税務顧問料 |
| 法定福利費 | 社会保険料、年金 |
| 租税公課 | 国税等 |
| 受取利息 | 銀行利息 |
| 通信費 | サーバー、回線 |
| 消耗品費 | 備品等 |
| 地代家賃 | 事務所賃料 |

### よく使う税区分

| 税区分名 | 用途 |
|----------|------|
| 課税売上10% | 売上（入金） |
| 課対仕入10% | 経費（出金・課税対象） |
| 対象外 | 給与・社会保険・税金 |
| 非課売上 | 受取利息等 |

## 操作パターン

### 1. ルール一覧の確認

```javascript
const { loadProfile, getConfig, freeeApiRequest } = require("PROJECT_DIR/src/utils/freee_api");
process.env.FREEE_DATA_ROOT = "PROJECT_DIR";
loadProfile("bond");
const config = getConfig();

const res = await freeeApiRequest("/api/1/user_matchers?company_id=" + config.freeeCompanyId);
```

### 2. 明細パターン分析 → ルール提案

口座明細を取得し、まだルール化されていないパターンを特定して提案する。

```javascript
// 口座明細を取得
const txns = await freeeApiRequest("/api/1/wallet_txns?company_id=" + config.freeeCompanyId + "&limit=100&order=desc");

// 既存ルールを取得
const rules = await freeeApiRequest("/api/1/user_matchers?company_id=" + config.freeeCompanyId);

// 差分を分析して提案
```

### 3. ルール作成

```javascript
const res = await freeeApiRequest("/api/1/user_matchers", "POST", {
  company_id: config.freeeCompanyId,
  act: 1,
  active: true,
  condition: 1,
  description: "キーワード",
  entry_side_str: "expense",
  priority: 10,
  account_item_name: "支払手数料",
  tax_name: "課対仕入10%"
});
console.log("作成完了 id:", res.id);
```

### 4. ルール削除

```javascript
await freeeApiRequest("/api/1/user_matchers/{id}?company_id=" + config.freeeCompanyId, "DELETE");
```

## スクリプト実行パターン

node -e での実行時、`!` がエスケープされる問題があるため、**外部ファイル（/tmp/freee_*.js）に書き出してから `node /tmp/freee_*.js` で実行する**こと。

## 注意事項

- personalプロファイルはこのAPIへのアクセス権限がない（403）
- ルール作成時、同じ description で重複作成可能なので注意
- `condition: 1`（含む）が基本。完全一致が必要な場合のみ `condition: 2`
- `act: 1`（確定登録）で作ると自動で経理に反映される。慎重に設定する場合は `act: 0`（推測）
- `priority` は数字が小さいほど優先。同じキーワードにマッチする複数ルールがある場合に効く
````

---

## Step 4: 動作確認

### 4-1. freee API 接続テスト

```bash
cd ~/project/freee
node src/main.js api:test --profile bond
```

**期待出力**:
```
[事業者名] プロファイル: bond

freee API 接続テスト...
   ✓ 認証OK
   ✓ 事業所取得OK
```

### 4-2. 自動登録ルール一覧取得テスト

```bash
cd ~/project/freee
node -e "
const { freeeApiRequest, loadProfile, getConfig } = require('./src/utils/freee_api');
process.env.FREEE_DATA_ROOT = process.cwd();
loadProfile('bond');
const config = getConfig();
freeeApiRequest('/api/1/user_matchers?company_id=' + config.freeeCompanyId).then(r => {
  const matchers = r.user_matchers || [];
  console.log('自動登録ルール取得OK:', matchers.length + '件');
  matchers.slice(0, 5).forEach(m => console.log(' -', m.description, '→', m.account_item_name));
}).catch(e => console.error('エラー:', e.message));
"
```

**期待出力**:
```
自動登録ルール取得OK: 12件
 - 振込手数料 → 支払手数料
 - AWS → 通信費
 - さくらインターネット → 通信費
 ...
```

### 4-3. ルール作成テスト（推測モード）

安全にテストするため `act: 0`（推測モード）で作成し、確認後に削除します。

```bash
cat > /tmp/freee_rule_test.js << 'SCRIPT'
const { freeeApiRequest, loadProfile, getConfig } = require('./src/utils/freee_api');
process.env.FREEE_DATA_ROOT = process.cwd();
loadProfile('bond');
const config = getConfig();

(async () => {
  // テスト用ルール作成（推測モード）
  const res = await freeeApiRequest('/api/1/user_matchers', 'POST', {
    company_id: config.freeeCompanyId,
    act: 0,
    active: true,
    condition: 1,
    description: 'SETUP_TEST_RULE',
    entry_side_str: 'expense',
    priority: 999,
    account_item_name: '消耗品費',
    tax_name: '課対仕入10%'
  });
  console.log('ルール作成OK id:', res.user_matcher.id);

  // 作成したルールを削除
  await freeeApiRequest('/api/1/user_matchers/' + res.user_matcher.id + '?company_id=' + config.freeeCompanyId, 'DELETE');
  console.log('ルール削除OK（テスト完了）');
})().catch(e => console.error('エラー:', e.message));
SCRIPT

cd ~/project/freee && node /tmp/freee_rule_test.js
```

**期待出力**:
```
ルール作成OK id: 12345
ルール削除OK（テスト完了）
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `FREEE_ACCESS_TOKEN が未設定` | `.env` / `.env.bond` にトークンがない | Step 0-2 の手順で OAuth トークンを取得 |
| 401 エラーが繰り返される | Refresh Token が期限切れ | freee Developer で再認可して新しいトークンを取得 |
| 403 エラー (user_matchers) | personal プロファイルで実行した | `--profile bond` で法人プロファイルを指定する |
| 同じルールが重複作成される | description の重複チェックがない | 作成前に一覧取得して既存ルールと照合する |
| `act: 1` で意図しない自動仕訳 | 確定登録モードで作成した | テスト時は `act: 0`（推測）で作成し、確認後に `act: 1` に更新 |
| `loadProfile` でエラー | `.env.bond` ファイルがない | プロファイル名と .env ファイル名を一致させる |
| `node -e` で `!` がエスケープされる | シェルのヒストリ展開 | `/tmp/freee_*.js` に書き出してから `node /tmp/freee_*.js` で実行 |
| `condition: 1` で想定外マッチ | 「含む」検索で広すぎる | `condition: 2`（完全一致）に変更、または description を具体的にする |
| priority 競合 | 同一キーワードに複数ルール | priority の数字が小さいほど優先。重複を一覧で確認し調整 |

---

## システム構成図

```
ユーザー: 「振込手数料のルール追加して」
  |
  v
Claude Code: /freee-rule スキル実行
  |
  +---> freee API（OAuth2 + 自動リフレッシュ）
  |       |
  |       +--- GET  /api/1/user_matchers    → 既存ルール一覧取得
  |       +--- POST /api/1/user_matchers    → 新規ルール作成
  |       +--- PUT  /api/1/user_matchers/id → ルール更新
  |       +--- DELETE /api/1/user_matchers/id → ルール削除
  |       |
  |       +--- GET  /api/1/wallet_txns      → 口座明細取得（パターン分析用）
  |       +--- GET  /api/1/account_items    → 勘定科目一覧取得
  |
  +---> src/utils/freee_api.js
          |
          +--- loadProfile("bond")  → .env.bond ロード
          +--- getConfig()          → company_id 等取得
          +--- freeeApiRequest()    → API呼び出し（401時自動リフレッシュ）
          +--- refreshToken()       → トークン更新 & .env書き戻し

ファイル構成:
  PROJECT_DIR/
  ├── .env                    # 共通設定（デフォルトプロファイル、Lark設定）
  ├── .env.bond               # 法人プロファイル（freee認証情報）
  ├── .env.personal           # 個人プロファイル（user_matchers非対応）
  ├── .claude/commands/
  │   └── freee-rule.md       # このスキル定義
  ├── src/
  │   ├── main.js             # CLIエントリーポイント
  │   └── utils/
  │       └── freee_api.js    # API共通クライアント
  └── package.json
```

---

## ライセンス

このセットアップガイドは自由に共有・改変可能です。
