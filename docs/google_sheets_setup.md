# Google Sheets API 連携セットアップ手順

## 必要なAPI
1. **Google Sheets API v4** - スプレッドシートのデータ読み取り・書き込み
2. **Google Drive API v3** - ファイルのアクセス権限確認（オプション）

## セットアップ手順

### 1. Google Cloud Consoleでプロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成または既存プロジェクトを選択
3. プロジェクト名: `freee-integration` （例）

### 2. APIの有効化

```bash
# Google Cloud CLIを使用する場合
gcloud services enable sheets.googleapis.com
gcloud services enable drive.googleapis.com
```

または、Consoleから手動で有効化：
1. 「APIとサービス」→「ライブラリ」
2. 「Google Sheets API」を検索して有効化
3. 「Google Drive API」を検索して有効化（オプション）

### 3. 認証方法の選択

## 方法A: サービスアカウント（推奨・自動化向け）

### 手順：
1. **サービスアカウント作成**
   - 「APIとサービス」→「認証情報」
   - 「認証情報を作成」→「サービスアカウント」
   - サービスアカウント名: `freee-sheets-reader`
   - 役割: 「編集者」または「閲覧者」

2. **キーファイルの作成**
   - 作成したサービスアカウントをクリック
   - 「キー」タブ→「鍵を追加」→「新しい鍵を作成」
   - JSON形式を選択してダウンロード
   - ファイル名: `service-account-key.json`

3. **スプレッドシートへのアクセス権付与**
   - サービスアカウントのメールアドレスをコピー
   - （例: `freee-sheets-reader@project-id.iam.gserviceaccount.com`）
   - 対象のスプレッドシートを開く
   - 「共有」からサービスアカウントのメールアドレスを追加
   - 「閲覧者」または「編集者」権限を付与

## 方法B: OAuth 2.0（ユーザー認証向け）

### 手順：
1. **OAuth同意画面の設定**
   - 「APIとサービス」→「OAuth同意画面」
   - ユーザータイプ: 「外部」または「内部」
   - アプリ名、サポートメール等を設定

2. **OAuth 2.0クライアントID作成**
   - 「APIとサービス」→「認証情報」
   - 「認証情報を作成」→「OAuthクライアントID」
   - アプリケーションタイプ: 「デスクトップアプリ」
   - クライアントIDとシークレットをダウンロード
   - ファイル名: `credentials.json`

## 必要なnpmパッケージ

```bash
# パッケージインストール
npm init -y
npm install googleapis
npm install @google-cloud/local-auth  # OAuth用（方法Bの場合）
```

## 環境変数設定

`.env`ファイルを作成：
```env
# Google認証
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json
# または
GOOGLE_OAUTH_CLIENT_FILE=./credentials.json

# スプレッドシート情報
SPREADSHEET_ID=your-spreadsheet-id-here
SHEET_NAME=シート1

# freee API
FREEE_ACCESS_TOKEN=6wQ2FPL3q5r6ADH2a0q_-4Urr8Vx6atDX-CSHWXz5Gc
FREEE_COMPANY_ID=12324013
```

## スプレッドシートのフォーマット例

推奨フォーマット（A1から開始）：

| 日付 | 勘定科目 | 金額 | 取引先 | 摘要 | 税区分 | 部門 | ステータス |
|------|---------|------|--------|------|--------|------|-----------|
| 2025/01/15 | 通信費 | 5000 | NTT | インターネット料金 | 課税仕入 10% | | 未処理 |
| 2025/01/16 | 旅費交通費 | 1200 | JR東日本 | 打合せ交通費 | 課税仕入 10% | | 未処理 |

## テスト用スプレッドシートID取得方法

1. Google スプレッドシートを開く
2. URLから抽出：
   ```
   https://docs.google.com/spreadsheets/d/【ここがスプレッドシートID】/edit
   ```
   例: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

## 次のステップ

1. 上記のいずれかの認証方法を設定
2. スプレッドシートIDを取得
3. `import_from_sheets.js`スクリプトを実行

## トラブルシューティング

### エラー: "The caller does not have permission"
→ サービスアカウントにスプレッドシートの共有権限を付与

### エラー: "API has not been enabled"
→ Google Sheets APIを有効化

### エラー: "Invalid spreadsheet ID"
→ スプレッドシートIDを確認