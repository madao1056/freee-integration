// サービスアカウント認証テストスクリプト
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_FILE = './service-account-key.json';

async function testServiceAccount() {
  console.log('========================================');
  console.log('  サービスアカウント認証テスト');
  console.log('========================================\n');

  // 1. ファイルの存在確認
  console.log('1. service-account-key.json の確認...');
  const keyPath = path.resolve(SERVICE_ACCOUNT_FILE);
  
  if (!fs.existsSync(keyPath)) {
    console.error('   ✗ ファイルが見つかりません');
    console.log('\n必要な手順:');
    console.log('1. Google Cloud Console にアクセス');
    console.log('   https://console.cloud.google.com/');
    console.log('2. 「APIとサービス」→「認証情報」');
    console.log('3. 「認証情報を作成」→「サービスアカウント」');
    console.log('4. JSONキーをダウンロード');
    console.log('5. service-account-key.json として保存\n');
    console.log('詳細は SERVICE_ACCOUNT_SETUP.md を参照してください');
    process.exit(1);
  }
  
  console.log('   ✓ ファイルが見つかりました\n');

  // 2. JSONファイルの内容確認
  console.log('2. JSONファイルの検証...');
  let keyFile;
  try {
    keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !keyFile[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`必須フィールドが不足: ${missingFields.join(', ')}`);
    }
    
    if (keyFile.type !== 'service_account') {
      throw new Error('typeがservice_accountではありません');
    }
    
    console.log('   ✓ JSONファイルは有効です');
    console.log(`   プロジェクトID: ${keyFile.project_id}`);
    console.log(`   サービスアカウント: ${keyFile.client_email}\n`);
    
  } catch (error) {
    console.error(`   ✗ エラー: ${error.message}`);
    process.exit(1);
  }

  // 3. 認証テスト
  console.log('3. Google Sheets API 認証テスト...');
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    
    const authClient = await auth.getClient();
    console.log('   ✓ 認証成功\n');
    
    // 4. API接続テスト
    console.log('4. Google Sheets API 接続テスト...');
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // スプレッドシートIDがあればテスト読み取り
    const testSpreadsheetId = process.argv[2];
    if (testSpreadsheetId) {
      console.log(`   スプレッドシートID: ${testSpreadsheetId}`);
      
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: testSpreadsheetId
        });
        
        console.log(`   ✓ スプレッドシートにアクセス成功`);
        console.log(`   タイトル: ${response.data.properties.title}`);
        console.log(`   シート数: ${response.data.sheets.length}\n`);
        
        // シート名一覧
        console.log('   シート一覧:');
        response.data.sheets.forEach(sheet => {
          console.log(`   - ${sheet.properties.title}`);
        });
        
      } catch (error) {
        console.error(`   ✗ スプレッドシートアクセスエラー: ${error.message}`);
        console.log('\n可能性のある原因:');
        console.log('1. スプレッドシートIDが間違っている');
        console.log('2. サービスアカウントにスプレッドシートが共有されていない');
        console.log(`\n以下のメールアドレスにスプレッドシートを共有してください:`);
        console.log(`${keyFile.client_email}`);
      }
    } else {
      console.log('   ✓ API接続準備完了');
      console.log('\nスプレッドシートIDを指定してテスト:');
      console.log('node test_service_account.js [スプレッドシートID]');
    }
    
  } catch (error) {
    console.error(`   ✗ 認証エラー: ${error.message}`);
    
    if (error.message.includes('Google Sheets API has not been used')) {
      console.log('\nGoogle Sheets APIを有効にしてください:');
      console.log('1. https://console.cloud.google.com/');
      console.log('2. 「APIとサービス」→「ライブラリ」');
      console.log('3. 「Google Sheets API」を検索して有効化');
    }
    
    process.exit(1);
  }

  // 5. 結果サマリー
  console.log('\n========================================');
  console.log('  テスト結果');
  console.log('========================================');
  console.log('✓ サービスアカウントキーは正常です');
  console.log('✓ Google Sheets APIに接続可能です');
  console.log('\n重要: スプレッドシートに以下のメールを共有してください:');
  console.log(`→ ${keyFile.client_email}`);
  console.log('\n次のステップ:');
  console.log('node import_from_sheets.js [スプレッドシートID]');
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// 実行
testServiceAccount();