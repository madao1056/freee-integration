# freee 請求書・見積もり管理 — 共有セットアップガイド

freee請求書の作成 + Lark収益計算テーブルへの連携を一括で行うシステムです。

```
請求書を作って → Claude Code が freee API で発行 → Lark Base に収益記録
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
このファイルを読んで、freee請求書管理システムをセットアップして
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
3. 「新しいアプリを作成」→ アプリ名: 「請求書管理」（任意）
4. コールバックURL: `urn:ietf:wg:oauth:2.0:oob`（CLIアプリ用）
5. 以下を控える:
   - **Client ID**
   - **Client Secret**
6. OAuth認可で **Access Token** と **Refresh Token** を取得:
   - ブラウザで `https://accounts.secure.freee.co.jp/public_api/authorize?client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code` にアクセス
   - 認可後に表示される認可コードを使って、POSTリクエストでトークン取得
7. freee の「事業所設定」から **Company ID** を確認

### 0-3. Lark Suite アカウント + アプリ

Lark 収益計算テーブルとの連携に必要です。

**新規作成の場合**:

1. https://www.larksuite.com/ でアカウント作成
2. https://open.larksuite.com/app でカスタムアプリ作成
3. 以下を控える:
   - **App ID** / **App Secret**
4. Permissions で `bitable:app` と `im:message` を追加
5. Publish してアプリを有効化
6. Lark Base を作成し、URLから **Base App Token** を控える

### 0-4. Google Service Account（スプレッドシート連携用）

freee の作業時間データを Google Sheets から取得する場合に必要。

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
mkdir -p ~/project/freee/src/lark
```

### 1-2. package.json

```json
{
  "name": "freee-integration",
  "version": "1.0.0",
  "description": "freee会計APIと連携して請求書作成・収益管理を行うツール",
  "private": true,
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
FREEE_DEFAULT_PROFILE=personal
LARK_APP_ID=<Lark App ID>
LARK_APP_SECRET=<Lark App Secret>
LARK_CHAT_ID=<Lark Chat ID（通知先、省略可）>
```

#### `.env.personal`（個人事業 or メインプロファイル）

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

複数事業（法人 + 個人事業など）がある場合は `.env.bond` 等のプロファイルを追加で作成。

### 1-5. Google Service Account キー

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
.config.json
*.log
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

function getDataRoot() {
  return process.env.FREEE_DATA_ROOT || process.cwd();
}

dotenv.config({ path: path.join(getDataRoot(), '.env'), quiet: true });

let _currentProfile = null;

function loadProfile(name) {
  const profileName = name || process.env.FREEE_DEFAULT_PROFILE;
  if (!profileName) return '';

  const profileEnvPath = path.resolve(getDataRoot(), `.env.${profileName}`);
  if (!fs.existsSync(profileEnvPath)) {
    throw new Error(`プロファイル設定ファイルが見つかりません: .env.${profileName}`);
  }

  dotenv.config({ path: profileEnvPath, override: true, quiet: true });
  _currentProfile = profileName;
  return profileName;
}

function getCurrentProfile() {
  return _currentProfile;
}

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

function updateEnvTokens(newAccessToken, newRefreshToken) {
  const envFileName = _currentProfile ? `.env.${_currentProfile}` : '.env';
  const envPath = path.resolve(getDataRoot(), envFileName);
  if (!fs.existsSync(envPath)) return;

  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/FREEE_ACCESS_TOKEN=.*/, `FREEE_ACCESS_TOKEN=${newAccessToken}`);
  if (newRefreshToken) {
    envContent = envContent.replace(/FREEE_REFRESH_TOKEN=.*/, `FREEE_REFRESH_TOKEN=${newRefreshToken}`);
  }
  fs.writeFileSync(envPath, envContent);

  process.env.FREEE_ACCESS_TOKEN = newAccessToken;
  if (newRefreshToken) process.env.FREEE_REFRESH_TOKEN = newRefreshToken;
}

function refreshToken() {
  return new Promise((resolve, reject) => {
    const clientId = process.env.FREEE_CLIENT_ID;
    const clientSecret = process.env.FREEE_CLIENT_SECRET;
    const refreshTokenValue = process.env.FREEE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshTokenValue) {
      reject(new Error('トークンリフレッシュに必要な環境変数が未設定（FREEE_CLIENT_ID, FREEE_CLIENT_SECRET, FREEE_REFRESH_TOKEN）'));
      return;
    }

    const postData = JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue
    });

    const req = https.request({
      hostname: 'accounts.secure.freee.co.jp',
      path: '/public_api/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.access_token) {
            updateEnvTokens(response.access_token, response.refresh_token);
            resolve(response.access_token);
          } else {
            reject(new Error(`トークンリフレッシュ失敗 ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function freeeApiRequest(apiPath, method = 'GET', data = null) {
  return _doRequest(apiPath, method, data, false);
}

function freeeApiUpload(apiPath, formData) {
  return _doUpload(apiPath, formData, false);
}

function freeeDownloadFile(url) {
  return _doDownload(url, false);
}

function _doDownload(url, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) { reject(new Error('FREEE_ACCESS_TOKENが未設定')); return; }
    let redirects = 0;
    const handle = (currentUrl) => {
      const parsed = new URL(currentUrl);
      const req = https.request({
        hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': '*/*' }
      }, async (res) => {
        if (res.statusCode === 401 && !isRetry) {
          res.resume();
          try { await refreshToken(); resolve(await _doDownload(url, true)); }
          catch (e) { reject(new Error(`認証エラー: ${e.message}`)); }
          return;
        }
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (++redirects > 5) return reject(new Error('Too many redirects'));
          res.resume();
          return handle(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, currentUrl).toString());
        }
        if (res.statusCode !== 200) {
          let body = ''; res.on('data', c => body += c);
          res.on('end', () => reject(new Error(`Download failed: HTTP ${res.statusCode} ${body.slice(0, 200)}`)));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'application/octet-stream' }));
      });
      req.on('error', reject);
      req.end();
    };
    handle(url);
  });
}

function _doRequest(apiPath, method, data, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) { reject(new Error('FREEE_ACCESS_TOKENが未設定。.envを確認。')); return; }
    const req = https.request({
      hostname: 'api.freee.co.jp', path: apiPath, method,
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        if (res.statusCode === 401 && !isRetry) {
          try { await refreshToken(); resolve(await _doRequest(apiPath, method, data, true)); }
          catch (e) { reject(new Error(`認証エラー（リフレッシュ失敗）: ${e.message}`)); }
          return;
        }
        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(response);
          else reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(response)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data && method !== 'GET') req.write(JSON.stringify(data));
    req.end();
  });
}

function _doUpload(apiPath, formData, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) { reject(new Error('FREEE_ACCESS_TOKENが未設定')); return; }
    const req = https.request({
      hostname: 'api.freee.co.jp', path: apiPath, method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, ...formData.getHeaders() }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        if (res.statusCode === 401 && !isRetry) {
          try { await refreshToken(); resolve(await _doUpload(apiPath, formData, true)); }
          catch (e) { reject(new Error(`認証エラー（リフレッシュ失敗）: ${e.message}`)); }
          return;
        }
        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(response);
          else reject(new Error(`Upload Error ${res.statusCode}: ${JSON.stringify(response)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    formData.pipe(req);
  });
}

module.exports = { getConfig, freeeApiRequest, freeeApiUpload, freeeDownloadFile, refreshToken, updateEnvTokens, loadProfile, getCurrentProfile };
```

### 2-2. Lark API クライアント (`src/utils/lark.js`)

```javascript
// Lark 共通クライアント
const https = require('https');
const FormData = require('form-data');
require('dotenv').config({ quiet: true });

async function getToken() {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('LARK_APP_ID / LARK_APP_SECRET が未設定');

  const data = JSON.stringify({ app_id: appId, app_secret: appSecret });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.larksuite.com',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.code === 0 && result.tenant_access_token) resolve(result.tenant_access_token);
        else reject(new Error(`Lark token取得失敗: ${result.msg}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function larkApiRequest(path, method, body) {
  const token = await getToken();
  const postData = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.larksuite.com', path, method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Length': Buffer.byteLength(postData) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = JSON.parse(data);
        if (result.code === 0) resolve(result);
        else reject(new Error(`Lark API Error ${result.code}: ${result.msg}`));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = { getToken, larkApiRequest };
```

---

## Step 3: Claude Code スキル登録

### 3-1. コマンドディレクトリの作成

```bash
mkdir -p PROJECT_DIR/.claude/commands
```

### 3-2. コマンドファイルの作成

以下の内容で `PROJECT_DIR/.claude/commands/freee-invoice.md` を作成する。

**Claude Code へ**: テンプレート内の `PROJECT_DIR` は Step 1-1 で作成したディレクトリの絶対パスに置換すること。Lark Base の App Token / Table ID はユーザーに AskUserQuestion で確認する。

````markdown
# freee 請求書・見積もり管理

freee請求書の作成 + Lark収益計算テーブルへの連携を一括で行うスキル。

## ルーティング

「請求書」「インボイス」「見積もり」等の文脈で自動的にこのスキルで処理する。

## freee API

- **API**: `POST /iv/invoices`（請求書作成）
- **更新**: `PUT /iv/invoices/{id}`（全フィールド再送、部分更新不可）
- **取得**: `GET /iv/invoices/{id}?company_id={id}`
- **一覧**: `GET /iv/invoices?company_id={id}`
- **プロジェクト**: `PROJECT_DIR`
- **共通クライアント**: `src/utils/freee_api.js`（トークン自動リフレッシュ対応）

### 請求書作成

```javascript
const { freeeApiRequest, loadProfile } = require("PROJECT_DIR/src/utils/freee_api");
loadProfile("personal");

const invoice = await freeeApiRequest("/iv/invoices", "POST", {
  company_id: COMPANY_ID,
  partner_id: PARTNER_ID,
  issue_date: "YYYY-MM-DD",
  billing_date: "YYYY-MM-DD",
  payment_date: "YYYY-MM-DD",
  payment_type: "transfer",
  subject: "件名",
  tax_entry_method: "out",
  tax_fraction: "omit",
  withholding_tax_entry_method: "out",
  partner_title: "御中",
  lines: [{
    type: "item",
    description: "項目名",
    unit: "式",
    quantity: 1,
    unit_price: "30000.0",
    tax_rate: 10,
    reduced_tax_rate: false,
    withholding: false
  }]
});
```

## Lark 収益計算テーブル

- **Base App Token**: LARK_BASE_APP_TOKEN
- **Table ID**: LARK_TABLE_ID
- **Lark API Client**: `PROJECT_DIR/src/utils/lark.js`

### レコード作成

```javascript
const { larkApiRequest } = require("PROJECT_DIR/src/utils/lark");
const APP = "LARK_BASE_APP_TOKEN";
const TBL = "LARK_TABLE_ID";
const ts = (y,m,d) => new Date(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}T00:00:00Z`).getTime();

await larkApiRequest(
  `/open-apis/bitable/v1/apps/${APP}/tables/${TBL}/records`, "POST",
  { fields: { "Project name": "案件名", "ステータス": "請求書発行済", "見積(税込)": 33000 } }
);
```

## ワークフロー

1. ユーザーから請求情報を聞く（取引先、金額、項目）
2. freee API で請求書作成
3. Lark 収益計算テーブルにレコード作成/更新
4. 結果報告（freee請求書URL + Larkレコード）
````

---

## Step 4: 動作確認

### 4-1. freee API 接続テスト

```bash
cd ~/project/freee
node -e "
const { freeeApiRequest, loadProfile } = require('./src/utils/freee_api');
loadProfile();
freeeApiRequest('/api/1/users/me').then(r => {
  console.log('freee API 接続OK');
  console.log('ユーザー:', r.user.display_name);
}).catch(e => console.error('エラー:', e.message));
"
```

### 4-2. Lark API 接続テスト

```bash
cd ~/project/freee
node -e "
const { getToken } = require('./src/utils/lark');
getToken().then(() => console.log('Lark API 接続OK')).catch(e => console.error('エラー:', e.message));
"
```

### 4-3. 請求書一覧取得テスト

```bash
cd ~/project/freee
node -e "
const { freeeApiRequest, loadProfile, getConfig } = require('./src/utils/freee_api');
loadProfile();
const { freeeCompanyId } = getConfig();
freeeApiRequest('/iv/invoices?company_id=' + freeeCompanyId + '&limit=3').then(r => {
  console.log('請求書一覧取得OK');
  (r.invoices || []).forEach(inv => console.log(' -', inv.invoice_number, inv.subject));
}).catch(e => console.error('エラー:', e.message));
"
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `FREEE_ACCESS_TOKEN が未設定` | .env / .env.{profile} にトークンがない | Step 0-2 の手順で OAuth トークンを取得 |
| 401 エラーが繰り返される | Refresh Token が期限切れ | freee Developer で再認可して新しいトークンを取得 |
| `unit_price` で 400 エラー | 数値型で渡している | **文字列型**で渡す: `"30000.0"` |
| Lark token 取得失敗 | LARK_APP_ID / SECRET が間違い | .env を確認 |
| `loadProfile` でエラー | `.env.{profile}` ファイルがない | プロファイル名と .env ファイル名を一致させる |
| Google Sheets 取得失敗 | サービスアカウント未共有 | スプレッドシートにサービスアカウントのメールを共有 |
| `POST /api/1/invoices` で 404 | 旧エンドポイント | 新エンドポイント `POST /iv/invoices` を使用 |

---

## システム構成図

```
ユーザー: 「請求書作って」
  |
  v
Claude Code: /freee-invoice スキル実行
  |
  +---> freee API（OAuth2 + 自動リフレッシュ）
  |       POST /iv/invoices → 請求書発行
  |       → 請求書URL: https://invoice.secure.freee.co.jp/reports/invoices/{ID}
  |
  +---> Lark Base API（Tenant Token認証）
  |       POST /records → 収益計算テーブルにレコード作成
  |       PUT /records/{id} → 既存レコード更新
  |
  +---> Google Sheets API（Service Account認証、オプション）
          作業時間・項目データの取得
```

---

## カスタマイズ

### 取引先を追加する場合

1. freee で取引先を確認: `GET /api/1/partners?company_id={id}`
2. スキルファイルの取引先テンプレートセクションに追記
3. Lark の Partner 名を決めてマッピングを追加

### 別のプロファイル（法人など）を追加する場合

1. `.env.bond` 等のプロファイルファイルを `.env.personal` をベースに作成
2. freee の法人アカウントで OAuth トークンを取得
3. `loadProfile("bond")` で切り替えて使用

---

## ライセンス

このセットアップガイドは自由に共有・改変可能です。
