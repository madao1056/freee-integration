# freee Integration

freee会計API + Google Sheets/Drive連携の自動化ツール。
Claude Codeのスキル（`/freee-api`）で、自然言語から見積書・請求書の作成やデータ操作が可能。

## 機能

- **見積書・請求書の作成/更新**（freee請求書API）
- **取引の登録**（収入・支出）
- **Google Sheetsへのエクスポート**（取引一覧、勘定科目、PL/BS）
- **Google Sheetsからのインポート**（取引の一括登録）
- **月次レポート生成**
- **Google Driveレシートアップロード**

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/madao1056/freee-integration.git
cd freee-integration
npm install
```

### 2. freee APIの準備

1. [freee開発者サイト](https://developer.freee.co.jp/)でアプリケーションを作成
2. OAuth 2.0の認証情報（Client ID / Client Secret）を取得
3. アクセストークン・リフレッシュトークンを取得

### 3. Google APIの準備

1. [GCPコンソール](https://console.cloud.google.com/)でプロジェクトを作成
2. Google Sheets API と Google Drive API を有効化
3. サービスアカウントを作成し、JSONキーをダウンロード
4. キーファイルをプロジェクトルートに `service-account-key.json` として配置
5. 連携するスプレッドシートにサービスアカウントのメールアドレスを共有設定

### 4. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を以下の通り編集:

```env
# freee API設定
FREEE_ACCESS_TOKEN=your-access-token
FREEE_REFRESH_TOKEN=your-refresh-token
FREEE_CLIENT_ID=your-client-id
FREEE_CLIENT_SECRET=your-client-secret
FREEE_COMPANY_ID=your-company-id

# Google Sheets API設定
SPREADSHEET_ID=your-spreadsheet-id
SHEET_NAME=インポート
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json

# Google Drive設定
DRIVE_ROOT_FOLDER_ID=your-drive-folder-id
```

### 5. 動作確認

```bash
node src/main.js api:test
```

## 使い方

### CLIコマンド

```bash
# freee → Sheets エクスポート
node src/main.js sheets:export <spreadsheet-id>

# Sheets → freee インポート（取引登録）
node src/main.js sheets:import <spreadsheet-id>

# 月次レポート生成
node src/main.js sheets:report <spreadsheet-id> [YYYY-MM]

# 請求書連携
node src/main.js sheets:invoice <spreadsheet-id> [export]

# 勘定科目一覧の取得
node src/main.js api:accounts

# Google Drive フォルダ確認
node src/main.js drive:check

# レシートアップロード
node src/main.js drive:upload [month]
```

### Claude Code スキル

Claude Codeから `/freee-api` コマンドで自然言語で操作可能:

```
/freee-api 見積書を作成
/freee-api 取引先一覧を取得
/freee-api 請求書の振込先を変更
```

スキルには以下が含まれる:
- 会計API（`/api/1/`）と請求書API（`/iv/`）の全エンドポイント
- リクエストボディの構造とフィールド定義
- 税区分コード、登録済み取引先/口座の一覧
- エンドポイント検索用のスキーマファイル参照手順

## ディレクトリ構成

```
src/
  main.js                # CLIエントリーポイント
  api/                   # freee API直接操作
  sheets/                # Google Sheets連携
    export_to_sheets.js  # エクスポート
    import_from_sheets.js # インポート
    monthly_report.js    # 月次レポート
    invoice.js           # 請求書連携
  drive/                 # Google Drive連携
  utils/
    freee_api.js         # API共通クライアント（トークン自動更新）
    sheets_helper.js     # Sheets操作ヘルパー
config/
  api-schema.json        # 会計API スキーマ（OpenAPI 3.0）
  iv-api-schema.yml      # 請求書API スキーマ（OpenAPI 3.0）
.claude/
  commands/
    freee-api.md         # Claude Code スキル
```

## 注意事項

- `.env` と `service-account-key.json` は **絶対にGitにコミットしない**（.gitignore済み）
- トークンは401エラー時に `freee_api.js` が自動リフレッシュする
- freee APIには会計API（`/api/1/`）と請求書API（`/iv/`）の2種類がある
