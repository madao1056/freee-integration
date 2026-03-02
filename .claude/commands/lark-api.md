---
description: Lark APIリファレンス & ベストプラクティス。Lark Bot・Lark Baseの操作方法を即座に参照できる。
allowed-tools: Bash, Read, Grep, Glob
argument-hint: <操作内容 例: Base作成, メッセージ送信, 権限付与>
---

# Lark API ベストプラクティス

ユーザーの要求: `$ARGUMENTS`

## 基本情報

- **APIホスト**: `https://open.larksuite.com`
- **認証**: tenant_access_token（Bot認証）
- **共通クライアント**: `src/utils/lark.js`
- **Lark Base連携**: `src/lark/base.js`, `src/lark/base_config.js`
- **設定ファイル**: `.lark_base_config.json`（app_token, table_id保存）

### 環境変数（`.env`）

| 変数 | 用途 |
|------|------|
| `LARK_APP_ID` | BotアプリID |
| `LARK_APP_SECRET` | Botアプリシークレット |
| `LARK_CHAT_ID` | 通知先チャットID |

---

## 重要: Bot作成リソースの権限問題

Lark Botが作成したリソース（Base等）は**Botの親フォルダ配下**に格納される。
そのため、`full_access`権限を付与しても**ユーザーは削除できない**。

### 解決策: オーナー譲渡を必ず実行する

Botがリソースを作成した直後に、以下の2ステップを**必ず**実行すること:

1. `full_access`権限をメンバーに付与
2. **オーナーを譲渡**（`transfer_owner`）

```javascript
const { grantAccessToChatMembers } = require('./src/utils/lark');

// Base作成直後に呼ぶ（LARK_CHAT_IDのメンバー全員に権限付与＋オーナー譲渡）
await grantAccessToChatMembers(appToken, 'bitable');
```

### 手動でオーナー譲渡する場合

```javascript
// 1. full_access付与
await larkApiRequest(
  `/open-apis/drive/v1/permissions/${token}/members?type=bitable&need_notification=false`,
  'POST',
  { member_type: 'openid', member_id: userOpenId, perm: 'full_access' }
);

// 2. オーナー譲渡（これがないと削除不可）
await larkApiRequest(
  `/open-apis/drive/v1/permissions/${token}/members/transfer_owner?type=bitable&need_notification=false`,
  'POST',
  { member_type: 'openid', member_id: userOpenId }
);
```

### 注意事項

- `full_access`だけでは**不十分**。Botの親フォルダ制約により削除権限が付かない
- `transfer_owner`により、リソースのオーナーがBotからユーザーに移り、削除・移動が可能になる
- `grantAccessToChatMembers()`は`base.js`の`initBase()`内で自動呼出し済み
- 今後Botで新しいリソース（ドキュメント、スプレッドシート等）を作成する場合も同様に権限付与＋オーナー譲渡を行うこと

---

## API呼び出しパターン

```javascript
const { larkApiRequest, getToken } = require('./src/utils/lark');

// GET
const res = await larkApiRequest('/open-apis/ENDPOINT', 'GET', {});

// POST
const res = await larkApiRequest('/open-apis/ENDPOINT', 'POST', { key: 'value' });
```

---

## メッセージ送信

```javascript
const { sendText, sendCard, notifyDeal, notifySummary } = require('./src/utils/lark');
const chatId = process.env.LARK_CHAT_ID;

// テキスト
await sendText(chatId, 'メッセージ');

// カード（仕訳提案）
await notifyDeal(chatId, { date, account, amount, description, partner, status });

// サマリーカード
await notifySummary(chatId, 'タイトル', ['行1', '行2']);
```

---

## Lark Base (Bitable) API

### Base管理

| 操作 | メソッド | パス |
|------|---------|------|
| 作成 | POST | `/open-apis/bitable/v1/apps` |
| リネーム | PUT | `/open-apis/bitable/v1/apps/{app_token}` |

**注意**: Base削除のAPIエンドポイントは存在しない。削除はLark UI上でのみ可能（オーナー権限が必要）。

### テーブル管理

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/open-apis/bitable/v1/apps/{app_token}/tables` |
| 作成 | POST | `/open-apis/bitable/v1/apps/{app_token}/tables` |
| 削除 | DELETE | `/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}` |

### レコード操作

| 操作 | メソッド | パス |
|------|---------|------|
| 一覧取得 | GET | `/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records` |
| バッチ作成 | POST | `.../records/batch_create` |
| バッチ削除 | POST | `.../records/batch_delete` |

**制限**: バッチ操作は500件/リクエストまで。

### 権限管理

| 操作 | メソッド | パス |
|------|---------|------|
| 権限一覧 | GET | `/open-apis/drive/v1/permissions/{token}/members?type=bitable` |
| 権限付与 | POST | `/open-apis/drive/v1/permissions/{token}/members?type=bitable` |
| 権限更新 | PUT | `/open-apis/drive/v1/permissions/{token}/members/{member_id}?type=bitable` |
| オーナー譲渡 | POST | `/open-apis/drive/v1/permissions/{token}/members/transfer_owner?type=bitable` |

### チャットメンバー取得

```javascript
const res = await larkApiRequest(
  `/open-apis/im/v1/chats/${chatId}/members?page_size=50`, 'GET', {}
);
// res.data.items → [{ member_id, name, member_id_type }]
```

---

## CLIコマンド

```bash
# Bot接続テスト
node src/main.js lark:test

# 未処理口座明細をLarkに通知
node src/main.js lark:notify

# Base作成・テーブル初期化（権限自動付与＋オーナー譲渡込み）
node src/main.js lark:base:init

# freeeデータをBaseに同期
node src/main.js lark:base:sync

# 同期状況確認
node src/main.js lark:base:status
```

---

## freee → Lark Base 同期テーブル定義

### 取引一覧

| フィールド | 型 | 説明 |
|-----------|---|------|
| `freee_detail_key` | Text | `"deal_id_detailIndex"` でユニーク識別 |
| `freee_deal_id` | Number | freee取引ID |
| `明細行` | Number | 明細行インデックス（0-based） |
| `日付` | DateTime | 取引日 |
| `種別` | SingleSelect | 収入 / 支出 |
| `取引先` | Text | 取引先名 |
| `勘定科目` | Text | 勘定科目名 |
| `金額` | Number | 金額 |
| `消費税` | Number | 消費税額 |
| `税区分` | Text | 税区分名（動的取得） |
| `摘要` | Text | 摘要 |
| `ステータス` | SingleSelect | 決済済 / 未決済 |

### 口座明細

| フィールド | 型 | 説明 |
|-----------|---|------|
| `freee_txn_id` | Number | wallet_txn.id でユニーク識別 |
| `日付` | DateTime | 取引日 |
| `口座名` | Text | 口座名 |
| `口座種別` | SingleSelect | bank_account / credit_card / wallet |
| `入出金` | SingleSelect | 入金 / 出金 |
| `金額` | Number | 金額 |
| `摘要` | Text | 摘要 |
| `ステータス` | SingleSelect | 消込待ち / 消込済み / 無視 / 消込中 / 対象外 |
| `freee_deal_id` | Number | 紐付け取引ID |

### 月次サマリー

| フィールド | 型 | 説明 |
|-----------|---|------|
| `年月` | Text | YYYY-MM |
| `収入合計` | Number | 収入合計 |
| `支出合計` | Number | 支出合計 |
| `差引` | Number | 収入 - 支出 |
| `取引件数` | Number | 取引数 |

---

## ベストプラクティス

1. **Bot作成リソースは必ずオーナー譲渡**: `full_access`だけでは親フォルダ制約で削除不可。`transfer_owner`を必ず実行
2. **バッチ上限は500件**: レコード作成・削除は500件ずつ分割
3. **API Rate Limit**: 連続呼び出し時は300-500msのsleep推奨
4. **Base削除はAPIでは不可**: Lark UI上でオーナーが削除。APIではテーブル・レコード削除のみ可能
5. **ページネーション**: `page_size`（最大500）と`page_token`で制御
6. **テーブル定義変更時**: `lark:base:init`で再作成が必要（既存Baseのスキーマ変更APIは限定的）

---

## 実行方法

ユーザーの要求「$ARGUMENTS」に基づいて:

1. 上記リファレンスから該当するAPIエンドポイントを特定する
2. `src/utils/lark.js`の関数を使ってNode.jsワンライナーで実行する
3. **リソース作成時は`grantAccessToChatMembers()`で権限付与＋オーナー譲渡を忘れない**
4. 結果をユーザーにわかりやすく報告する

### 実行テンプレート

```bash
node -e "
require('dotenv').config();
const { larkApiRequest } = require('./src/utils/lark');
(async () => {
  const res = await larkApiRequest('/open-apis/ENDPOINT', 'METHOD', {});
  console.log(JSON.stringify(res.data, null, 2));
})().catch(e => console.error(e.message));
"
```
