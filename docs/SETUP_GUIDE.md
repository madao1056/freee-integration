# 初期セットアップガイド

このツールを自分の環境で使えるようにするための完全ガイドです。
上から順に進めれば、全機能が使えるようになります。

> **AIと一緒に進めたい場合**: Claude Codeで「初期設定を始めてください」と入力すると、対話形式でステップバイステップで案内します。

---

## 目次

1. [前提条件](#1-前提条件)
2. [プロジェクトのセットアップ](#2-プロジェクトのセットアップ)
3. [freee APIの準備](#3-freee-apiの準備)
4. [Google APIの準備](#4-google-apiの準備)
5. [Lark連携の準備](#5-lark連携の準備)
6. [環境変数の設定](#6-環境変数の設定)
7. [動作確認](#7-動作確認)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 前提条件

以下がインストールされていることを確認してください。

| ソフトウェア | 最低バージョン | 確認コマンド |
|---|---|---|
| Node.js | v18以上 | `node -v` |
| npm | v9以上 | `npm -v` |

---

## 2. プロジェクトのセットアップ

```bash
# 任意の複製したフォルダに移動（エディタ内でターミナルを立ち上げる場合は不要）
cd /path/to/your/freee

# 依存パッケージのインストール
npm install
```

インストールされるパッケージ:
- `dotenv` — 環境変数の読み込み
- `googleapis` — Google Sheets / Drive API
- `form-data` — ファイルアップロード用

---

## 3. freee APIの準備

### 3-1. freeeアカウントの確認

freee会計を利用中であることが前提です。
まだの場合は https://www.freee.co.jp/ で無料トライアルを開始してください。

### 3-2. freee開発者アプリの作成

1. **freee開発者サイト**にアクセス: https://developer.freee.co.jp/
2. freeeアカウントでログイン
3. 「マイアプリ一覧」→「新規作成」

| 設定項目 | 入力値 |
|---|---|
| アプリ名 | `freee-integration`（任意） |
| 概要 | 会計データ連携ツール（任意） |
| アプリタイプ | **プライベート** |
| コールバックURL | `urn:ietf:wg:oauth:2.0:oob` |

4. 作成後、以下の値をメモ:
   - **Client ID** → `.env` の `FREEE_CLIENT_ID`
   - **Client Secret** → `.env` の `FREEE_CLIENT_SECRET`

### 3-3. アクセストークンの取得

#### 方法A: freee開発者サイトのお試し機能（簡単）

1. 作成したアプリの詳細ページを開く
2. 「お試し」タブを選択
3. 「アクセストークンを取得」をクリック
4. 表示されたアクセストークンをコピー → `.env` の `FREEE_ACCESS_TOKEN`

> この方法で取得したトークンはリフレッシュトークンが付かないため、期限切れ時に再取得が必要です。

#### 方法B: OAuth認証フロー（推奨・自動更新対応）

1. ブラウザで以下のURLにアクセス（`YOUR_CLIENT_ID` は実際の値に置き換え）:

```
https://accounts.secure.freee.co.jp/public_api/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&prompt=consent
```

2. freeeアカウントで認証し、「許可」をクリック
3. 表示された**認可コード**をコピー

4. ターミナルで以下を実行（3つの値を置き換え）:

```bash
curl -X POST "https://accounts.secure.freee.co.jp/public_api/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "code": "YOUR_AUTHORIZATION_CODE",
    "redirect_uri": "urn:ietf:wg:oauth:2.0:oob"
  }'
```

5. レスポンスから以下をメモ:
   - `access_token` → `.env` の `FREEE_ACCESS_TOKEN`
   - `refresh_token` → `.env` の `FREEE_REFRESH_TOKEN`

> 方法Bで取得すると、トークン期限切れ時に自動更新されます。

### 3-4. 事業所IDの確認

アクセストークン取得後、以下のコマンドで確認できます:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://api.freee.co.jp/api/1/companies"
```

レスポンスの `id` が事業所IDです → `.env` の `FREEE_COMPANY_ID`

> セットアップ完了後は `node src/main.js api:companies` でも確認できます。

---

## 4. Google APIの準備

Google Sheets / Drive連携が不要な場合、このセクションはスキップ可能です。
（freee APIのみの機能は使えます）

### 4-1. Google Cloudプロジェクトの作成

1. https://console.cloud.google.com/ にアクセス
2. 「プロジェクトを選択」→「新しいプロジェクト」
3. プロジェクト名: `freee-integration`（任意）

### 4-2. APIの有効化

1. 左メニュー「APIとサービス」→「ライブラリ」
2. 以下の2つのAPIを検索して「有効にする」:
   - **Google Sheets API**
   - **Google Drive API**（Drive連携を使う場合）

### 4-3. サービスアカウントの作成

1. 「APIとサービス」→「認証情報」→「+ 認証情報を作成」→「サービスアカウント」
2. 設定:
   - サービスアカウント名: `freee-sheets`（任意）
   - 説明: freee連携用（任意）
3. 「作成して続行」→ ロール設定はスキップ → 「完了」

### 4-4. JSONキーのダウンロード

1. 作成したサービスアカウントをクリック
2. 「キー」タブ → 「鍵を追加」→「新しい鍵を作成」
3. **JSON** を選択 →「作成」
4. ダウンロードされたファイルを `service-account-key.json` にリネーム
5. プロジェクトルートに配置

### 4-5. スプレッドシートの共有設定

1. 連携したいGoogle スプレッドシートを開く
2. 「共有」ボタンをクリック
3. `service-account-key.json` 内の `client_email` の値を入力
4. 権限: **編集者**を選択
5. 「送信」

### 4-6. スプレッドシートIDの確認

スプレッドシートのURLからIDを取得:

```
https://docs.google.com/spreadsheets/d/【この部分がID】/edit
```

→ `.env` の `SPREADSHEET_ID`

### 4-7. Google Driveフォルダ（オプション）

レシートアップロード機能を使う場合:

1. Google Driveでフォルダを作成
2. フォルダを開いた時のURLからIDを取得:
   ```
   https://drive.google.com/drive/folders/【この部分がID】
   ```
3. フォルダもサービスアカウントに共有設定

→ `.env` の `DRIVE_ROOT_FOLDER_ID`

---

## 5. Lark連携の準備

Lark Botによる仕訳提案通知を使う場合に設定します。（オプション）

### 5-1. Larkアプリの作成

1. https://open.larksuite.com/ にアクセス
2. 「Create Custom App」をクリック
3. 設定:
   - Name: `freee-integration`
   - Description: `freee会計データの自動仕訳提案・経費管理を行うBot`
   - Icon: 任意の画像

4. 作成後、以下の値をメモ:
   - **App ID** → `.env` の `LARK_APP_ID`
   - **App Secret** → `.env` の `LARK_APP_SECRET`

### 5-2. Bot機能の有効化

1. アプリの **「Features」** → **「Bot」** を有効にする

### 5-3. 権限の追加

**「Permissions」** で以下を検索して追加:

| 権限 | 用途 |
|---|---|
| `im:message:send_as_bot` | Botからメッセージ送信 |
| `im:chat:readonly` | グループチャット情報の読み取り |
| `im:resource` | 画像・ファイル送信 |

### 5-4. アプリの公開

1. **「Version Management & Release」** → **「Create a version」**
2. App version: `1.0.0`
3. Default feature (mobile/desktop): **Bot**
4. Submit → 管理者として承認

### 5-5. チャットIDの取得

アプリ公開後、接続テストを実行するとチャットIDが自動取得されます:

```bash
node src/main.js lark:test
```

または、`.env` に `LARK_APP_ID` と `LARK_APP_SECRET` を設定した状態で以下を実行:

```bash
node -e "
const { sendTextToEmail } = require('./src/utils/lark');
sendTextToEmail('あなたのLarkメールアドレス', 'テスト').then(r => console.log('chat_id:', r.data.chat_id));
"
```

表示された `chat_id` を `.env` の `LARK_CHAT_ID` に設定してください。

---

## 6. 環境変数の設定

### 6-1. .envファイルの作成

```bash
cp .env.example .env
```

### 7-2. 値を入力

`.env` を開いて、これまで取得した値を入力:

```env
# freee API設定（必須）
FREEE_ACCESS_TOKEN=取得したアクセストークン
FREEE_COMPANY_ID=事業所ID（数字）
FREEE_REFRESH_TOKEN=取得したリフレッシュトークン
FREEE_CLIENT_ID=アプリのClient ID
FREEE_CLIENT_SECRET=アプリのClient Secret

# Google Sheets設定（Sheets連携を使う場合）
SPREADSHEET_ID=スプレッドシートID
SHEET_NAME=インポート
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json

# Google Drive設定（Drive連携を使う場合）
DRIVE_ROOT_FOLDER_ID=DriveフォルダID

# Lark設定（Lark連携を使う場合）
LARK_APP_ID=LarkアプリのApp ID
LARK_APP_SECRET=LarkアプリのApp Secret
LARK_CHAT_ID=通知先のチャットID
```

### 設定の優先度

| 機能 | 必要な設定 |
|---|---|
| freee API全般 | `FREEE_ACCESS_TOKEN`, `FREEE_COMPANY_ID` |
| トークン自動更新 | 上記 + `FREEE_CLIENT_ID`, `FREEE_CLIENT_SECRET`, `FREEE_REFRESH_TOKEN` |
| Sheets連携 | 上記 + `SPREADSHEET_ID`, `service-account-key.json` |
| Drive連携 | 上記 + `DRIVE_ROOT_FOLDER_ID` |
| Lark連携 | `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_CHAT_ID` |

---

## 7. 動作確認

上から順に実行して、各機能の接続を確認してください。

### 7-1. freee API接続テスト

```bash
node src/main.js api:test
```

成功すると事業所情報が表示されます。

### 7-2. 事業所情報の確認

```bash
node src/main.js api:companies
```

### 7-3. 勘定科目一覧

```bash
node src/main.js api:accounts
```

### 7-4. Google認証テスト（Sheets連携を使う場合）

```bash
node src/main.js auth:test
```

### 7-5. freeeデータのエクスポート

```bash
node src/main.js sheets:export YOUR_SPREADSHEET_ID
```

### 7-6. Lark接続テスト（Lark連携を使う場合）

```bash
node src/main.js lark:test
```

成功するとLarkにテストメッセージが届きます。

### 7-7. 未処理明細のLark通知テスト

```bash
node src/main.js lark:notify
```

口座の未処理明細がカード形式でLarkに通知されます。

### 7-8. 全コマンド一覧の確認

```bash
node src/main.js help
```

---

## 8. トラブルシューティング

### freee API関連

| エラー | 原因 | 対処 |
|---|---|---|
| `FREEE_ACCESS_TOKENが設定されていません` | `.env`が未作成 or 値が空 | `.env`ファイルを確認 |
| `API Error 401` | トークン期限切れ | リフレッシュトークンがあれば自動更新される。なければ再取得 |
| `トークンリフレッシュも失敗` | Client ID/Secret/Refresh Tokenが不正 | freee開発者サイトで値を再確認 |
| `API Error 403` | 事業所IDが不正 or 権限不足 | `FREEE_COMPANY_ID`を確認。`api:companies`で正しいIDを確認 |

### Google API関連

| エラー | 原因 | 対処 |
|---|---|---|
| `サービスアカウントキーファイルが見つかりません` | `service-account-key.json`が存在しない | ファイルをプロジェクトルートに配置 |
| `The caller does not have permission` | スプレッドシートの共有設定不足 | サービスアカウントのメールを共有設定に追加 |
| `API has not been enabled` | Google Sheets APIが無効 | GCPコンソールでAPIを有効化 |

### Lark関連

| エラー | 原因 | 対処 |
|---|---|---|
| `LARK_APP_ID / LARK_APP_SECRET が設定されていません` | `.env`未設定 | `.env`にLark設定を追加 |
| `Lark token取得失敗` | App ID/Secretが不正 | Lark管理画面で値を再確認 |
| メッセージが届かない | アプリ未公開 or 権限不足 | バージョンを公開し、`im:message:send_as_bot` 権限を確認 |

### その他

| エラー | 原因 | 対処 |
|---|---|---|
| `Cannot find module` | 依存パッケージ未インストール | `npm install` を実行 |
| `ECONNREFUSED` | ネットワーク接続の問題 | インターネット接続を確認 |

---

## 次のステップ

セットアップが完了したら、以下のことができます:

- **「エクスポート」** — freeeデータをスプレッドシートに出力
- **「インポート」** — スプレッドシートからfreeeに取引を登録
- **`node src/main.js api:audit`** — 確定申告前のデータ品質チェック
- **`node src/main.js lark:notify`** — 未処理明細をLarkに通知して確認
- **`/freee-api 見積書を作成`** — Claude Codeから自然言語でAPI操作
