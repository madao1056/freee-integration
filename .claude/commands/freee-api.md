---
description: freee APIリファレンス & ベストプラクティス。APIの使い方・エンドポイント・操作方法を即座に参照できる。
allowed-tools: Bash, Read, Grep, Glob
argument-hint: <操作内容 例: 見積書を作成, 取引先を変更, 口座一覧>
---

# freee API ベストプラクティス

ユーザーの要求: `$ARGUMENTS`

## 基本情報

- **事業所ID**: 12324013（合同会社ぼんど）
- **APIホスト**: `https://api.freee.co.jp`
- **認証**: OAuth 2.0 Bearer Token（401時に自動リフレッシュ）
- **共通クライアント**: `src/utils/freee_api.js`

## 重要: 2つのAPI体系

freeeには**2つの異なるAPI**がある。用途に応じて正しいパスを使うこと。

| API | パスプレフィックス | 用途 |
|-----|-------------------|------|
| **会計API** | `/api/1/` | 取引、取引先、勘定科目、口座、税区分、部門、タグ等 |
| **請求書API (IV)** | `/iv/` | 見積書、請求書、納品書の作成・更新・取得 |

**注意**: 見積書・請求書の**作成・更新**は `/iv/` を使う。`/api/1/quotations` や `/api/1/invoices` はGET（読み取り）のみ。

## API呼び出しパターン

```javascript
const { freeeApiRequest, getConfig } = require('./src/utils/freee_api');
const config = getConfig();
const companyId = config.freeeCompanyId; // 12324013

// 会計API（取引先、勘定科目など）
const result = await freeeApiRequest(`/api/1/ENDPOINT?company_id=${companyId}`);

// 請求書API（見積書・請求書の作成）
const result = await freeeApiRequest('/iv/ENDPOINT', 'POST', { company_id: companyId, ...data });
```

**注意**: URLに日本語を含める場合は `encodeURIComponent()` でエンコードすること。

---

## 請求書API (`/iv/`)

### 見積書 (Quotations)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/iv/quotations?company_id={id}` |
| 詳細取得 | GET | `/iv/quotations/{id}?company_id={id}` |
| テンプレート一覧 | GET | `/iv/quotations/templates?company_id={id}` |
| 作成 | POST | `/iv/quotations` |
| 更新 | PUT | `/iv/quotations/{id}` |

**必須フィールド**: `company_id`, `quotation_date`, `tax_entry_method`, `tax_fraction`, `withholding_tax_entry_method`, `partner_title`, `lines`

**デフォルトルール:**
- `expiration_date`（有効期限）: 指示がなければ `quotation_date` の **1ヵ月後** を自動設定する

**作成例:**
```javascript
{
  company_id: 12324013,
  quotation_date: "2026-02-20",       // 見積日（yyyy-MM-dd）
  expiration_date: "2026-03-20",      // 有効期限（デフォルト: 見積日+1ヵ月）
  partner_id: 111456641,              // 取引先ID（partner_codeでも可）
  partner_title: "御中",              // "御中" | "様" | "(空白)" | "（空白）"
  subject: "○○の件",                 // 件名
  tax_entry_method: "out",            // "out":税別, "in":税込
  tax_fraction: "omit",               // "omit":切り捨て, "round_up":切り上げ, "round":四捨五入
  withholding_tax_entry_method: "out", // 源泉徴収計算: "in":税込, "out":税別
  quotation_note: "備考",             // 備考（4000文字まで）
  memo: "社内メモ",                   // 社内メモ（2000文字まで）
  expiration_date: "2026-03-20",      // 有効期限
  delivery_deadline: "別途相談",      // 納品期限
  lines: [                            // 明細行
    {
      type: "item",                   // "item":品目行, "text":テキスト行
      description: "Webサイト制作",   // 摘要（品名）
      quantity: 1,                    // 数量（小数3桁まで）
      unit: "式",                     // 単位
      unit_price: "100000",           // 単価（文字列、負数可）
      tax_rate: 10,                   // 税率: 0 | 8 | 10
      reduced_tax_rate: false         // 軽減税率（tax_rate:8の時のみtrue可）
    },
    {
      type: "item",
      description: "サービス値引き",
      quantity: 1,
      unit: "式",
      unit_price: "-50000",           // マイナスで値引き行
      tax_rate: 10
    }
  ]
}
```

### 請求書 (Invoices)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/iv/invoices?company_id={id}` |
| 詳細取得 | GET | `/iv/invoices/{id}?company_id={id}` |
| テンプレート一覧 | GET | `/iv/invoices/templates?company_id={id}` |
| 作成 | POST | `/iv/invoices` |
| 更新 | PUT | `/iv/invoices/{id}` |

請求書のフィールド構造は見積書とほぼ同じ。`quotation_date` → `invoice_date`、`quotation_note` → `invoice_note` に読み替え。追加フィールド:
- `due_date`: 支払期日
- `payment_type`: `"transfer"` (振込) | `"direct_debit"` (引き落とし)

### 納品書 (Delivery Slips)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/iv/delivery_slips?company_id={id}` |
| 作成 | POST | `/iv/delivery_slips` |
| 更新 | PUT | `/iv/delivery_slips/{id}` |

---

## 会計API (`/api/1/`)

### 取引先 (Partners)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/api/1/partners?company_id={id}` |
| 詳細取得 | GET | `/api/1/partners/{id}?company_id={id}` |
| 作成 | POST | `/api/1/partners` |
| 更新 | PUT | `/api/1/partners/{id}` |
| 削除 | DELETE | `/api/1/partners/{id}?company_id={id}` |
| キーワード検索 | GET | `&keyword=` (URLエンコード必須) |

**主要フィールド:**
```javascript
{
  company_id: 12324013,
  name: "株式会社○○",             // 必須
  shortcut1: "略称",
  long_name: "正式名称",
  name_kana: "カブシキガイシャ○○",
  phone: "03-1234-5678",
  email: "info@example.com",
  partner_bank_account_attributes: {
    bank_name: "○○銀行",
    branch_name: "○○支店",
    account_type: "ordinary",       // ordinary/checking/savings
    account_number: "1234567",
    account_name: "カ）○○"
  }
}
```

### 取引 (Deals)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/api/1/deals?company_id={id}` |
| 詳細取得 | GET | `/api/1/deals/{id}?company_id={id}` |
| 作成 | POST | `/api/1/deals` |
| 更新 | PUT | `/api/1/deals/{id}` |
| 削除 | DELETE | `/api/1/deals/{id}?company_id={id}` |

**フィルタ**: `&type=income|expense`, `&partner_id=`, `&start_issue_date=`, `&end_issue_date=`

**作成例（支出）:**
```javascript
{
  company_id: 12324013,
  issue_date: "2026-02-20",
  type: "expense",                 // income:収入, expense:支出
  details: [
    {
      account_item_id: 994283808,  // 勘定科目ID
      tax_code: 21,                // 税区分コード
      amount: 5000,
      description: "USBケーブル"
    }
  ]
}
```

### 口座 (Walletables)

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/api/1/walletables?company_id={id}` |
| 詳細取得 | GET | `/api/1/walletables/{type}/{id}?company_id={id}` |
| 作成 | POST | `/api/1/walletables` |
| 更新 | PUT | `/api/1/walletables/{type}/{id}` |
| 削除 | DELETE | `/api/1/walletables/{type}/{id}?company_id={id}` |

**種別 (type)**: `bank_account`（銀行口座）, `credit_card`（クレカ）, `wallet`（その他）

**登録済み口座:**
- ID: 4552882 - 宮崎銀行（法人）国富支店 普通
- ID: 4595420 - 住信SBIネット銀行（法人）代表口座
- ID: 7368931 - 現金

### 勘定科目・税区分・その他

| エンドポイント | 概要 |
|---------------|------|
| `/api/1/account_items?company_id={id}` | 勘定科目一覧 |
| `/api/1/taxes/companies/{company_id}` | 税区分一覧 |
| `/api/1/sections?company_id={id}` | 部門一覧 |
| `/api/1/tags?company_id={id}` | メモタグ一覧 |
| `/api/1/receipts` | ファイルボックス |
| `/api/1/manual_journals` | 振替伝票 |
| `/api/1/expense_applications` | 経費精算 |
| `/api/1/trial_balance/profit_and_loss?company_id={id}` | 損益計算書 |
| `/api/1/trial_balance/balance_sheet?company_id={id}` | 貸借対照表 |
| `/api/1/users/me` | ログインユーザー情報 |

---

## よく使う税区分コード（会計API用）

| コード | 名称 |
|--------|------|
| 2 | 課税売上 10% |
| 6 | 課税売上 8%（軽減） |
| 21 | 課対仕入 10% |
| 23 | 課対仕入 10%（内税） |
| 25 | 課対仕入 8%（軽減） |
| 27 | 課対仕入 8%（内税・軽減） |
| 0 | 対象外 |

※正確な一覧は `GET /api/1/taxes/companies/12324013` で取得可能。

## 登録済み取引先

APIで確認: `GET /api/1/partners?company_id=12324013`

| ID | 名前 |
|----|------|
| 108840272 | 株式会社 Entime |
| 109998924 | くらしな |
| 109999039 | たいようこども園 |
| 109999135 | 合資会社 尾崎商店 |
| 109999269 | The Gift of Music |
| 111214946 | 惣菜屋 レザン |
| 111363431 | エシカルコミュニティLLP |
| 111363817 | 株式会社みやと |
| 111456641 | 協同組合 宮崎花市場 |

---

## ベストプラクティス

1. **API体系の選択**: 見積書・請求書・納品書の作成/更新は `/iv/`、それ以外は `/api/1/`
2. **URLエンコード**: 日本語パラメータは必ず `encodeURIComponent()` を使う
3. **ページネーション**: `limit`（最大100）と `offset` で制御。大量データはループで取得
4. **トークン管理**: 401エラーは `freee_api.js` が自動リフレッシュするので意識不要
5. **unit_price は文字列**: 請求書APIの `unit_price` は文字列型。負数で値引き行を表現可能
6. **tax_rate は数値**: 請求書APIの `tax_rate` は `0`, `8`, `10` のいずれか（税区分コードではない）
7. **partner_title は必須**: 見積書・請求書作成時に `"御中"`, `"様"`, `"(空白)"` のいずれかが必須
8. **日付フォーマット**: 常に `yyyy-MM-dd` 形式
9. **APIスキーマ参照**: 会計APIは `config/api-schema.json`、請求書APIは `https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml`

## エンドポイント検索方法

上記リファレンスに記載のないエンドポイントやフィールドの詳細を調べる手順。

### スキーマファイルの場所

| API | ローカルスキーマ | 形式 |
|-----|-----------------|------|
| 会計API (`/api/1/`) | `config/api-schema.json` | OpenAPI 3.0 JSON |
| 請求書API (`/iv/`) | `config/iv-api-schema.yml` | OpenAPI 3.0 YAML |

### 検索手順

**1. エンドポイントを探す:**
- 会計API: `config/api-schema.json` で `"/api/1/対象"` を検索
- 請求書API: `config/iv-api-schema.yml` で `"/対象"` またはオペレーション名を検索

**2. リクエストボディの構造を調べる:**
- スキーマ内の `$ref` を辿って `components/schemas/対象Request` や `対象CreateParams` を検索

**3. 検索コマンド例:**
```bash
# 請求書APIで見積書関連のスキーマを探す
grep -A 30 "QuotationRequest:" config/iv-api-schema.yml

# 会計APIで取引先の更新パラメータを探す
grep -A 50 "partnerUpdateParams" config/api-schema.json

# エンドポイント一覧を確認
grep '"/' config/api-schema.json | grep -v description
grep "^  \"/" config/iv-api-schema.yml
```

**4. リモートから最新スキーマを取得（ローカルが古い場合）:**
```bash
# 請求書APIスキーマを更新
curl -s "https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml" -o config/iv-api-schema.yml
```

---

## 実行方法

ユーザーの要求「$ARGUMENTS」に基づいて:

1. まず上記リファレンスから該当するエンドポイントとフィールドを特定する
2. リファレンスに記載がない場合、スキーマファイルを検索して詳細を確認する
3. 会計API（`/api/1/`）か請求書API（`/iv/`）かを正しく判断する
4. `src/utils/freee_api.js` の `freeeApiRequest()` を使ってNode.jsワンライナーで実行する
5. 結果をユーザーにわかりやすく報告する

### 実行テンプレート

```bash
cd /Users/hashiguchimasaki/project/freee && node -e "
const { freeeApiRequest, getConfig } = require('./src/utils/freee_api');
const config = getConfig();
async function main() {
  // 会計API例
  const result = await freeeApiRequest('/api/1/ENDPOINT?company_id=' + config.freeeCompanyId);
  // 請求書API例
  const result = await freeeApiRequest('/iv/ENDPOINT', 'POST', { company_id: config.freeeCompanyId, ...data });
  console.log(JSON.stringify(result, null, 2));
}
main().catch(e => console.error(e.message));
"
```
