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
