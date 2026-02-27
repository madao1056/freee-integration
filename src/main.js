#!/usr/bin/env node
// freee連携ツール - メインエントリーポイント

const path = require('path');
const fs = require('fs');

// ヘルプメッセージ
function showHelp() {
  console.log(`
========================================
  freee API 連携ツール
========================================

使用方法:
  node main.js <command> [options]

利用可能なコマンド:

📊 Google Sheets連携:
  sheets:import <spreadsheet-id>     スプレッドシートからfreeeに取引登録
  sheets:export <spreadsheet-id>     freeeデータをスプレッドシートにエクスポート
  sheets:report <spreadsheet-id> [YYYY-MM]  月次経費レポート生成
  sheets:invoice <spreadsheet-id> [export]  請求書連携（import/export）
  sheets:sample <spreadsheet-id>     スプレッドシートにサンプルデータ追加

📄 Google Drive連携:
  drive:check                        Driveフォルダ構造を確認
  drive:upload [month]               レシートをfreeeファイルボックスにアップロード

🔧 freee API:
  api:test                          freee API動作確認
  api:companies                     事業所情報取得
  api:accounts                      勘定科目一覧取得
  api:audit [year] [--sheets id]    確定申告データ品質チェック

💬 Lark連携:
  lark:test                        Lark Bot接続テスト
  lark:notify                      未処理明細をLarkに通知
  lark:base:init                   Lark Base作成・テーブル初期化
  lark:base:sync                   freeeデータをLark Baseに同期
  lark:base:status                 Lark Base同期状況確認

⚙️  設定・テスト:
  auth:test                         Google認証テスト
  setup                            初期セットアップガイド

例:
  node main.js sheets:import <your-spreadsheet-id>
  node main.js sheets:report <your-spreadsheet-id> 2026-01
  node main.js sheets:invoice <your-spreadsheet-id> export
  node main.js drive:upload 2025.12
  node main.js api:audit 2025
  node main.js api:audit 2025 --sheets <spreadsheet-id>
  node main.js api:test

詳細なドキュメント:
  docs/README.md               - プロジェクト概要
  docs/SERVICE_ACCOUNT_SETUP.md - 認証設定手順
`);
}

// 初期セットアップガイド
function showSetup() {
  console.log(`
========================================
  初期セットアップガイド
========================================

1. Google認証設定:
   docs/SERVICE_ACCOUNT_SETUP.md を参照

2. 認証テスト:
   node main.js auth:test

3. freee API テスト:
   node main.js api:test

4. スプレッドシート連携テスト:
   node main.js sheets:sample <スプレッドシートID>
   node main.js sheets:import <スプレッドシートID>

5. Drive連携テスト:
   node main.js drive:check
   node main.js drive:upload

設定ファイル:
  - service-account-key.json (Google認証)
  - .env (環境変数)
`);
}

// コマンド実行
async function runCommand(command, args) {
  const rootDir = path.resolve(__dirname, '..');
  process.chdir(rootDir);

  switch (command) {
    // Google Sheets
    case 'sheets:import':
      if (!args[0]) {
        console.error('エラー: スプレッドシートIDが必要です');
        process.exit(1);
      }
      process.argv[2] = args[0];
      require('./sheets/import_from_sheets.js');
      break;

    case 'sheets:export':
      if (!args[0]) {
        console.error('エラー: スプレッドシートIDが必要です');
        process.exit(1);
      }
      process.argv[2] = args[0];
      require('./sheets/export_to_sheets.js');
      break;

    case 'sheets:report':
      if (!args[0]) {
        console.error('エラー: スプレッドシートIDが必要です');
        process.exit(1);
      }
      process.argv[2] = args[0];
      if (args[1]) process.argv[3] = args[1];
      require('./sheets/monthly_report.js');
      break;

    case 'sheets:invoice':
      if (!args[0]) {
        console.error('エラー: スプレッドシートIDが必要です');
        process.exit(1);
      }
      process.argv[2] = args[0];
      if (args[1]) process.argv[3] = args[1];
      require('./sheets/invoice.js');
      break;

    case 'sheets:sample':
      if (!args[0]) {
        console.error('エラー: スプレッドシートIDが必要です');
        process.exit(1);
      }
      require('./sheets/add_sample_data.js');
      break;

    // Google Drive
    case 'drive:check':
      require('./drive/check_drive_folders.js');
      break;

    case 'drive:upload':
      if (args[0]) process.argv[2] = args[0];
      require('./drive/upload_receipts.js');
      break;

    // freee API
    case 'api:test':
      require('./api/test_api.js');
      break;

    case 'api:companies':
      require('./api/get_companies.js');
      break;

    case 'api:accounts':
      require('./api/get_account_items.js');
      break;

    case 'api:audit':
      // 引数をprocess.argvに渡す（年度、--sheets オプション）
      process.argv = ['node', 'tax_audit.js', ...args];
      require('./api/tax_audit.js');
      break;

    // Lark連携
    case 'lark:test': {
      const { getToken, sendText } = require('./utils/lark');
      const chatId = process.env.LARK_CHAT_ID;
      console.log('Lark Bot 接続テスト...');
      const token = await getToken();
      console.log('   ✓ token取得成功');
      if (chatId) {
        await sendText(chatId, '✓ freee-integration Bot 接続テスト成功');
        console.log('   ✓ メッセージ送信成功');
      } else {
        console.log('   ⚠ LARK_CHAT_IDが未設定のためメッセージ送信をスキップ');
      }
      console.log('   Lark連携は正常です');
      break;
    }

    case 'lark:notify': {
      const lark = require('./utils/lark');
      const { freeeApiRequest, getConfig: getFreeeConfig } = require('./utils/freee_api');
      const cfg = getFreeeConfig();
      const larkChatId = process.env.LARK_CHAT_ID;
      if (!larkChatId) {
        console.error('エラー: LARK_CHAT_IDが設定されていません');
        process.exit(1);
      }

      console.log('未処理の口座明細を取得中...');
      const wallets = await freeeApiRequest(`/api/1/walletables?company_id=${cfg.freeeCompanyId}`);
      const acctRes = await freeeApiRequest(`/api/1/account_items?company_id=${cfg.freeeCompanyId}`);
      const acctMap = {};
      for (const a of acctRes.account_items) acctMap[a.id] = a.name;

      let unprocessed = 0;
      for (const w of (wallets.walletables || [])) {
        const txns = await freeeApiRequest(
          `/api/1/wallet_txns?company_id=${cfg.freeeCompanyId}&walletable_id=${w.id}&walletable_type=${w.type}&limit=100`
        );
        for (const t of (txns.wallet_txns || [])) {
          if (!t.deal_id) {
            await lark.notifyDeal(larkChatId, {
              date: t.date,
              account: '未分類',
              amount: t.amount,
              description: t.description || '（摘要なし）',
              partner: w.name,
              status: '提案'
            });
            unprocessed++;
            // API制限考慮
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }

      if (unprocessed === 0) {
        await lark.sendText(larkChatId, '✓ 未処理の口座明細はありません');
        console.log('未処理明細なし');
      } else {
        console.log(`${unprocessed}件の未処理明細をLarkに通知しました`);
      }
      break;
    }

    // Lark Base連携
    case 'lark:base:init': {
      const base = require('./lark/base');
      console.log('========================================');
      console.log('  Lark Base 初期化');
      console.log('========================================\n');
      const result = await base.initBase();
      console.log('\n========================================');
      console.log('  初期化完了');
      console.log('========================================');
      console.log(`Base URL: ${result.url}`);
      console.log('次のステップ: node main.js lark:base:sync');
      break;
    }

    case 'lark:base:sync': {
      const base = require('./lark/base');
      console.log('========================================');
      console.log('  Lark Base データ同期');
      console.log('========================================\n');

      console.log('1. 取引一覧を同期中...');
      const dealCount = await base.syncDeals();

      console.log('\n2. 口座明細を同期中...');
      const walletCount = await base.syncWalletTxns();

      console.log('\n3. 月次サマリーを同期中...');
      const summaryCount = await base.syncMonthlySummary();

      console.log('\n========================================');
      console.log('  同期完了');
      console.log('========================================');
      console.log(`取引: ${dealCount}件 / 口座明細: ${walletCount}件 / サマリー: ${summaryCount}件`);
      break;
    }

    case 'lark:base:status': {
      const base = require('./lark/base');
      console.log('========================================');
      console.log('  Lark Base 同期状況');
      console.log('========================================\n');
      await base.showStatus();
      break;
    }

    // 設定・テスト
    case 'auth:test':
      require('./utils/test_service_account.js');
      if (args[0]) process.argv[2] = args[0];
      break;

    case 'setup':
      showSetup();
      break;

    default:
      console.error(`不明なコマンド: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// メイン処理
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help') {
  showHelp();
  process.exit(0);
}

runCommand(command, args.slice(1)).catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});
