// サービスアカウントの権限とスコープを確認するスクリプト
const { google } = require('googleapis');
const path = require('path');

const SERVICE_ACCOUNT_FILE = './service-account-key.json';

async function checkPermissions() {
  console.log('========================================');
  console.log('  サービスアカウント権限確認');
  console.log('========================================\n');

  try {
    // 1. 異なるスコープで認証テスト
    console.log('1. 各種スコープでの認証テスト...\n');

    // 基本的なスプレッドシート読み取りスコープ
    console.log('   a) 読み取り専用スコープ:');
    try {
      const authReadOnly = new google.auth.GoogleAuth({
        keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
      await authReadOnly.getClient();
      console.log('      ✓ spreadsheets.readonly - OK');
    } catch (error) {
      console.log(`      ✗ spreadsheets.readonly - ${error.message}`);
    }

    // 完全なスプレッドシートアクセス
    console.log('   b) 読み書きスコープ:');
    try {
      const authFullSheets = new google.auth.GoogleAuth({
        keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      await authFullSheets.getClient();
      console.log('      ✓ spreadsheets - OK');
    } catch (error) {
      console.log(`      ✗ spreadsheets - ${error.message}`);
    }

    // Driveファイル作成スコープ
    console.log('   c) Drive作成スコープ:');
    try {
      const authDriveFile = new google.auth.GoogleAuth({
        keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });
      await authDriveFile.getClient();
      console.log('      ✓ drive.file - OK');
    } catch (error) {
      console.log(`      ✗ drive.file - ${error.message}`);
    }

    // Drive完全アクセス
    console.log('   d) Drive完全スコープ:');
    try {
      const authDriveFull = new google.auth.GoogleAuth({
        keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      await authDriveFull.getClient();
      console.log('      ✓ drive - OK');
    } catch (error) {
      console.log(`      ✗ drive - ${error.message}`);
    }

    console.log('\n2. 最小権限でのスプレッドシート作成テスト...\n');

    // 最小権限での作成テスト
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // まずは最小限のスプレッドシート作成を試す
    try {
      const result = await sheets.spreadsheets.create({
        resource: {
          properties: {
            title: 'テスト用スプレッドシート_' + Date.now()
          }
        }
      });

      console.log('   ✓ スプレッドシート作成成功！');
      console.log(`   ID: ${result.data.spreadsheetId}`);
      console.log(`   URL: https://docs.google.com/spreadsheets/d/${result.data.spreadsheetId}/edit\n`);

      // 作成したスプレッドシートにデータを追加
      console.log('3. データ書き込みテスト...');
      await sheets.spreadsheets.values.update({
        spreadsheetId: result.data.spreadsheetId,
        range: 'A1:D2',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [
            ['日付', '項目', '金額', 'ステータス'],
            ['2025/01/20', 'テスト', '1000', '作成完了']
          ]
        }
      });

      console.log('   ✓ データ書き込み成功！\n');

      console.log('========================================');
      console.log('  結果: 正常に動作します');
      console.log('========================================');
      console.log('サービスアカウントは正しく設定されています。');
      console.log('スプレッドシートの作成と編集が可能です。\n');

      return result.data.spreadsheetId;

    } catch (createError) {
      console.log(`   ✗ 作成エラー: ${createError.message}\n`);
      
      if (createError.message.includes('insufficient authentication scopes')) {
        console.log('権限スコープが不足しています。');
        console.log('必要なスコープ:');
        console.log('- https://www.googleapis.com/auth/spreadsheets');
        console.log('- https://www.googleapis.com/auth/drive.file');
      } else if (createError.message.includes('Access denied')) {
        console.log('アクセスが拒否されました。');
        console.log('Google Cloud Console でサービスアカウントの権限を確認してください。');
      }
    }

    console.log('\n4. 代替案: 既存スプレッドシートへのアクセステスト...\n');
    console.log('既存のスプレッドシートIDを指定してテストできます:');
    console.log('node check_permissions.js [スプレッドシートID]');

    // 引数でスプレッドシートIDが指定されている場合はアクセステスト
    const testSpreadsheetId = process.argv[2];
    if (testSpreadsheetId) {
      console.log(`\n指定されたスプレッドシート (${testSpreadsheetId}) へのアクセステスト:`);
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: testSpreadsheetId
        });
        console.log(`   ✓ 読み取り成功: ${response.data.properties.title}`);
      } catch (accessError) {
        console.log(`   ✗ アクセスエラー: ${accessError.message}`);
        console.log('   → サービスアカウントにスプレッドシートを共有してください');
        console.log(`   → freee-sheets-reader@freee-482012.iam.gserviceaccount.com`);
      }
    }

  } catch (error) {
    console.error('致命的エラー:', error.message);
  }
}

// 実行
checkPermissions();