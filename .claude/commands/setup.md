# 対話型初期セットアップ

ユーザーがこのプロジェクトを初めて使う際に、ステップバイステップで初期設定を案内する。
**必ず1ステップずつ進め、各ステップの完了をユーザーに確認してから次へ進む。**

## 進め方のルール

1. 以下のステップを**1つずつ**提示する（一度に全部出さない）
2. 各ステップで**何をすればいいか**と**なぜ必要か**を簡潔に説明する
3. ユーザーが詰まったら具体的にヘルプする（URL表示、コマンド実行など）
4. 各ステップ完了後、実際に動作確認できるものは確認コマンドを実行して結果を見せる
5. 日本語で案内する
6. 現在の進捗を「ステップ X/8」の形式で常に表示する

## ステップ一覧

### ステップ 1/8: 前提条件の確認

以下を確認:
- Node.js v18以上がインストールされているか → `node -v` を実行して確認
- npm v9以上がインストールされているか → `npm -v` を実行して確認
- プロジェクトフォルダにいるか確認

問題があれば、Node.jsのインストール方法を案内する。

### ステップ 2/8: 依存パッケージのインストール

`npm install` を実行。
`package.json` が存在するか、`node_modules` が既にあるか確認してから実行する。

完了したら「dotenv, googleapis, form-data がインストールされました」と伝える。

### ステップ 3/8: freee開発者アプリの作成

ユーザーに以下を案内:

1. freee開発者サイト（https://developer.freee.co.jp/）にアクセス
2. freeeアカウントでログイン
3. 「マイアプリ一覧」→「新規作成」
4. 設定:
   - アプリ名: `freee-integration`
   - アプリタイプ: **プライベート**
   - コールバックURL: `urn:ietf:wg:oauth:2.0:oob`
5. 作成後、**Client ID** と **Client Secret** をメモするよう伝える

「Client IDとClient Secretは取得できましたか？」と確認する。

### ステップ 4/8: freeeアクセストークンの取得

2つの方法を提示し、ユーザーに選んでもらう:

**方法A（簡単・お試し用）**: freee開発者サイトの「お試し」タブからトークンを取得
- メリット: 簡単。クリックするだけ
- デメリット: リフレッシュトークンなし。期限切れたら再取得が必要

**方法B（推奨・自動更新対応）**: OAuth認証フロー
- メリット: リフレッシュトークン付き。期限切れても自動更新
- デメリット: 手順が少し多い

ユーザーの選択に応じて具体的な手順を案内する。

方法Bの場合:
1. 認可URLを生成して提示（Client IDを埋め込む）
2. ブラウザで認可→認可コードをもらう
3. curlコマンドでトークン交換（Client ID/Secret/認可コードを埋め込んだコマンドを生成）
4. レスポンスからaccess_tokenとrefresh_tokenを抜き出す

### ステップ 5/8: 事業所IDの確認と.env作成

1. `.env.example` から `.env` をコピー（既に存在する場合はスキップ）
2. ここまでに取得した値（Client ID, Client Secret, Access Token, Refresh Token）を `.env` に書き込む
3. 事業所IDを確認するため、以下のコマンドを提案:

```bash
node src/main.js api:companies
```

もしくはcurlで直接確認:
```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" "https://api.freee.co.jp/api/1/companies"
```

4. 返ってきた事業所IDを `.env` の `FREEE_COMPANY_ID` に書き込む

### ステップ 6/8: freee API動作確認

```bash
node src/main.js api:test
```

を実行し、結果を確認する。成功すれば freee API連携は完了。

失敗した場合:
- 401 → トークンの値を再確認
- 403 → 事業所IDを再確認
- ネットワークエラー → インターネット接続を確認

### ステップ 7/8: Google API設定（オプション）

**ユーザーに聞く**: 「Google Sheets/Drive連携も設定しますか？freee APIだけ使えれば十分ですか？」

不要なら → ステップ8へスキップ

必要なら以下を案内:

1. GCPコンソール（https://console.cloud.google.com/）でプロジェクト作成
2. Google Sheets API と Google Drive API を有効化
3. サービスアカウント作成 → JSONキーダウンロード
4. `service-account-key.json` としてプロジェクトルートに配置
5. スプレッドシートの共有設定にサービスアカウントのメールを追加
6. `.env` に `SPREADSHEET_ID` を設定

詳細な手順は `docs/SERVICE_ACCOUNT_SETUP.md` を参照するよう案内。

設定後、以下で確認:
```bash
node src/main.js auth:test
```

### ステップ 8/8: セットアップ完了！

以下を表示して案内する:

- 設定済み機能の一覧（freee API ✓、Google Sheets ✓/-, Google Drive ✓/-）
- よく使うコマンドの一覧
- 「エクスポート」「インポート」キーワードの説明
- `api:audit` コマンドの紹介

「何か試してみたいことはありますか？」と聞く。

## 中断・再開

途中で中断した場合、`.env` ファイルの内容を見て「どこまで完了しているか」を判定し、
そのステップから再開する。判定基準:

- `.env` が存在しない → ステップ1から
- `FREEE_CLIENT_ID` が空 → ステップ3から
- `FREEE_ACCESS_TOKEN` が空 → ステップ4から
- `FREEE_COMPANY_ID` が空 → ステップ5から
- `api:test` が未成功 → ステップ6から
- `service-account-key.json` がない & Sheets使いたい → ステップ7から
- 全部設定済み → ステップ8（完了表示）
