# サービスアカウントキー (service-account-key.json) 作成手順

## 概要
サービスアカウントは、アプリケーションがGoogleのAPIにアクセスするための認証方法です。
人間の操作なしで自動的に認証できるため、スクリプトの自動化に最適です。

## 手順

### 1. Google Cloud Consoleにアクセス
https://console.cloud.google.com/

### 2. プロジェクトを作成または選択
- 新規プロジェクト作成: 「プロジェクトを選択」→「新しいプロジェクト」
- プロジェクト名: `freee-integration` (任意)

### 3. Google Sheets APIを有効化
1. 左メニューから「APIとサービス」→「ライブラリ」
2. 検索ボックスに「Google Sheets API」と入力
3. 「Google Sheets API」をクリック
4. 「有効にする」ボタンをクリック

### 4. サービスアカウントを作成

#### 4.1 認証情報ページへ移動
- 「APIとサービス」→「認証情報」

#### 4.2 サービスアカウントを作成
1. 「+ 認証情報を作成」→「サービスアカウント」
2. サービスアカウントの詳細:
   - **サービスアカウント名**: `freee-sheets-reader`
   - **サービスアカウントID**: 自動生成される（例: freee-sheets-reader@project-id）
   - **説明**: freee連携用のスプレッドシート読み取り（任意）
3. 「作成して続行」をクリック

#### 4.3 ロール（役割）の選択（オプション）
- スキップ可能（「続行」をクリック）
- または「基本」→「閲覧者」を選択

#### 4.4 ユーザーアクセス（オプション）
- スキップ可能（「完了」をクリック）

### 5. JSONキーファイルをダウンロード

#### 5.1 サービスアカウントの詳細ページ
1. 作成したサービスアカウントの名前をクリック
2. 「キー」タブをクリック

#### 5.2 新しいキーを作成
1. 「鍵を追加」→「新しい鍵を作成」
2. キーのタイプ: **JSON** を選択
3. 「作成」をクリック

#### 5.3 ファイルの保存
- 自動的にJSONファイルがダウンロードされる
- ファイル名を `service-account-key.json` に変更
- `/Users/hashiguchimasaki/project/freee/` フォルダに保存

### 6. スプレッドシートへのアクセス権限付与

#### 6.1 サービスアカウントのメールアドレスを確認
JSONファイル内の `client_email` フィールドを確認:
```
例: freee-sheets-reader@your-project-id.iam.gserviceaccount.com
```

#### 6.2 スプレッドシートで共有設定
1. Google スプレッドシートを開く
2. 右上の「共有」ボタンをクリック
3. サービスアカウントのメールアドレスを入力
4. 権限: 「閲覧者」を選択（書き込みが必要な場合は「編集者」）
5. 「送信」をクリック

## JSONファイルの構造

`service-account-key.json` の内容例:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "freee-sheets-reader@your-project-id.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

## 重要なセキュリティ注意事項

⚠️ **警告**: このファイルは秘密鍵を含むため、以下に注意:

1. **GitHubにアップロードしない**
   - `.gitignore` に `service-account-key.json` を追加

2. **他人と共有しない**
   - このファイルを持つ人は誰でもあなたのサービスアカウントとしてAPIにアクセスできる

3. **定期的にローテーション**
   - セキュリティのため、定期的に新しいキーを作成し古いキーを削除

## テスト方法

サービスアカウントキーが正しく設定されているか確認:

```bash
# テストスクリプトを実行
node test_service_account.js
```

## トラブルシューティング

### エラー: "The caller does not have permission"
→ スプレッドシートにサービスアカウントのメールアドレスが共有されていない

### エラー: "API has not been enabled for the project"
→ Google Sheets APIが有効になっていない

### エラー: "Invalid grant: Not a valid email or user ID"
→ JSONファイルが破損している可能性。再ダウンロード

### エラー: "ENOENT: no such file or directory"
→ `service-account-key.json` のパスが間違っている

## 次のステップ

1. `service-account-key.json` をプロジェクトフォルダに配置
2. スプレッドシートIDを取得
3. 以下を実行:

```bash
node import_from_sheets.js [スプレッドシートID]
```