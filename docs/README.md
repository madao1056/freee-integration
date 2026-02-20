# freee API 連携ツール

## 概要
freee会計APIと連携して、スプレッドシートやGoogle Driveからデータを自動登録するツール

## 主要な勘定科目（194件中）

### よく使う勘定科目
| 勘定科目 | ID | ショートカット | 用途 |
|---------|-----|--------------|------|
| 現金 | 994283801 | GENKIN | 現金取引 |
| 売掛金 | 994283580 | URIKAKE | 売上の未回収分 |
| 買掛金 | 994283635 | KAIKAKE | 仕入の未払い分 |
| 売上高 | 994283672 | URIAGE | 売上計上 |
| 仕入高 | 994283678 | SHIIREDA | 商品仕入 |
| 給料 | 994283686 | KYUURYOU | 給与支払い |
| 消耗品費 | 994283703 | SHOUMOU | 事務用品等 |
| 通信費 | 994283700 | TSUUSHIN | 電話・インターネット |
| 旅費交通費 | 994283699 | RYOHI | 交通費・出張費 |
| 会議費 | 994283698 | KAIGI | 会議・打合せ費用 |
| 広告宣伝費 | 994283696 | KOUKOKU | 広告・マーケティング |
| 支払手数料 | 994283709 | SHIHARAI | 各種手数料 |
| 地代家賃 | 994283711 | CHIDAI | オフィス家賃 |
| 水道光熱費 | 994283706 | SUIDOU | 電気・水道・ガス |

## 利用可能な機能

### 1. スプレッドシート連携
- Googleスプレッドシートから経費データを読み取り
- freee APIで自動的に取引登録
- バッチ処理対応

### 2. レシート画像アップロード
- Google Driveからレシート画像を取得
- freeeのファイルボックスにアップロード
- OCR機能による自動読み取り（freee側）

### 3. 取引登録
- 収入・支出の登録
- 振替伝票の作成
- 請求書の作成

## セットアップ

### 必要な情報
- freee APIアクセストークン: `6wQ2FPL3q5r6ADH2a0q_-4Urr8Vx6atDX-CSHWXz5Gc`
- 事業所ID: `12324013`（合同会社ぼんど）

### Google連携に必要な追加設定
1. Google Sheets API の有効化
2. Google Drive API の有効化
3. サービスアカウントまたはOAuth認証の設定

## 使い方

### 勘定科目一覧の取得
```bash
node get_account_items.js
```

### スプレッドシートから取引登録
```bash
node import_from_sheets.js [スプレッドシートID]
```

### レシート画像をアップロード
```bash
node upload_receipts.js [フォルダパス]
```

## ファイル構成
- `test_api.js` - API動作確認
- `get_account_items.js` - 勘定科目取得
- `account_items.json` - 勘定科目データ
- `import_from_sheets.js` - スプレッドシート連携（作成予定）
- `upload_receipts.js` - レシートアップロード（作成予定）