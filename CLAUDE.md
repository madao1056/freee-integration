# freee-integration

freee会計APIとGoogle Sheets/Driveを連携する自動化ツール。

## プロジェクト概要

- **言語**: JavaScript (Node.js)
- **事業所**: `.env` の `FREEE_COMPANY_ID` を参照
- **スプレッドシートID**: `.env` の `SPREADSHEET_ID` を参照
- **認証**: freee OAuth 2.0 + Google サービスアカウント + Lark Bot

## ディレクトリ構成

```
src/
  main.js              # CLIエントリーポイント
  api/                 # freee API直接操作（テスト・取得）
  sheets/
    export_to_sheets.js  # freee → Sheets エクスポート
    import_from_sheets.js # Sheets → freee インポート
    monthly_report.js    # 月次レポート生成
    invoice.js           # 請求書連携
  drive/               # Google Drive連携（レシートアップロード等）
  utils/
    freee_api.js         # API共通クライアント（トークン自動更新付き）
    sheets_helper.js     # Sheets操作ヘルパー
    lark.js              # Lark Bot共通クライアント（通知・カード送信）
```

## ユーザーキーワード操作

### 「初期設定を始めてください」「初期設定」と入力された場合

このプロジェクトを初めて使うユーザー向けに、対話型のセットアップを開始する。

**動作:**

1. `/setup` コマンド（`.claude/commands/setup.md`）の手順に従い、**1ステップずつ**案内する
2. 各ステップで「何をすべきか」「なぜ必要か」を丁寧に説明する
3. ユーザーの完了報告を待ってから次のステップに進む
4. 可能な箇所は実際にコマンドを実行して動作確認する
5. 詰まった場合は `docs/SETUP_GUIDE.md` の該当セクションも参照する

**中断・再開:** `.env`の設定状況を確認し、完了済みステップを自動判定して途中から再開する。

**テキストで読みたい場合:** 「`docs/SETUP_GUIDE.md` に全手順がまとまっています」と案内する。

### 「エクスポート」と入力された場合

freeeのデータをGoogle Sheetsにエクスポートする。以下の手順をステップバイステップで実行すること。

**手順:**

1. **環境確認** - `.env`ファイルの`FREEE_ACCESS_TOKEN`と`FREEE_COMPANY_ID`が設定されているか確認
2. **スプレッドシートID確認** - ユーザーにエクスポート先のスプレッドシートIDを確認（`.env`の`SPREADSHEET_ID`を使用）
3. **コマンド実行** - 以下を実行:
   ```bash
   node src/main.js sheets:export <スプレッドシートID>
   ```
4. **結果確認** - 出力ログを確認し、以下のシートが作成されたことを報告:
   - **取引一覧**: 取引ID, 発生日, 種別, 取引先, 金額, 消費税, 勘定科目, 税区分, 備考, ステータス
   - **勘定科目**: 勘定科目ID, 名前, ショートカット, カテゴリ等
   - **取引先**: 取引先ID, 名前, コード, 区分等
   - **損益計算書** (PL): 勘定科目別の借方/貸方金額
   - **貸借対照表** (BS): 勘定科目別の期首残高/期末残高
5. **エラー時** - トークン期限切れの場合は自動リフレッシュされる。それでも失敗した場合は`.env`の`FREEE_CLIENT_ID`/`FREEE_CLIENT_SECRET`/`FREEE_REFRESH_TOKEN`を確認

### 「インポート」と入力された場合

Google Sheetsのデータをfreeeに取引登録する。以下の手順をステップバイステップで実行すること。

**手順:**

1. **環境確認** - `.env`ファイルの`FREEE_ACCESS_TOKEN`と`FREEE_COMPANY_ID`が設定されているか確認
2. **スプレッドシートID確認** - ユーザーにインポート元のスプレッドシートIDを確認（`.env`の`SPREADSHEET_ID`を使用）
3. **シートのフォーマット確認** - 「インポート」シートに以下の列構成でデータが入っていることを確認:

   | 列 | A | B | C | D | E | F | G | H |
   |---|---|---|---|---|---|---|---|---|
   | 内容 | 日付 | 勘定科目 | 金額 | 取引先 | 摘要 | 税区分 | 部門 | ステータス |
   | 例 | 2026/01/15 | 消耗品費 | 5000 | Amazon | USBケーブル | 課対仕入 10%（内税） | | 未処理 |

   **利用可能な勘定科目**: 現金, 売上高, 仕入高, 給料, 消耗品費, 通信費, 旅費交通費, 交通費, 会議費, 広告宣伝費, 支払手数料, 地代家賃, 水道光熱費, 接待交際費, 事務用品費

   **利用可能な税区分**: 課対仕入 10%, 課対仕入 10%（内税）, 課対仕入 8%（軽減）, 課対仕入 8%（内税・軽減）, 課税売上 10%, 課税売上 8%（軽減）, 非課税売上, 非課税仕入, 不課税, 対象外

4. **コマンド実行** - 以下を実行:
   ```bash
   node src/main.js sheets:import <スプレッドシートID>
   ```
5. **結果確認** - 出力ログを確認し、成功/失敗件数を報告。処理済のレコードはH列が「処理済」に自動更新される
6. **エラー時** - 勘定科目名が一致しない場合は`src/sheets/import_from_sheets.js`の`ACCOUNT_ITEM_MAP`を確認。新しい勘定科目を追加する必要がある場合は`api:accounts`コマンドで勘定科目IDを取得

## その他のコマンド

```bash
# 月次レポート
node src/main.js sheets:report <spreadsheet-id> [YYYY-MM]

# 請求書連携
node src/main.js sheets:invoice <spreadsheet-id> [export]

# Driveフォルダ確認
node src/main.js drive:check

# レシートアップロード
node src/main.js drive:upload [month]

# API動作確認
node src/main.js api:test

# 勘定科目一覧
node src/main.js api:accounts

# 確定申告データ品質チェック
node src/main.js api:audit [year] [--sheets spreadsheet-id]

# Lark Bot接続テスト
node src/main.js lark:test

# 未処理口座明細をLarkに通知
node src/main.js lark:notify
```

## 注意事項

- トークンは401エラー時に`freee_api.js`が自動リフレッシュする
- スプレッドシートにはサービスアカウントのメールアドレスを共有設定すること
- `.env`と`service-account-key.json`はgitignore対象
