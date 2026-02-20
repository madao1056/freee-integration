// スプレッドシートにサンプルデータを自動入力するスクリプト
const { google } = require('googleapis');
const path = require('path');

const SERVICE_ACCOUNT_FILE = './service-account-key.json';
const SPREADSHEET_ID = '15ew2ysd7XREZQW4IxxGVmueQ5plFQ_xy-ISkG3s-P9Y';

async function addSampleData() {
  console.log('========================================');
  console.log('  スプレッドシートにサンプルデータ追加');
  console.log('========================================\n');

  try {
    // 1. 認証
    console.log('1. Google認証中...');
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    console.log('   ✓ 認証成功\n');

    // 2. ヘッダー行とサンプルデータを準備
    console.log('2. サンプルデータを準備中...');
    
    const sampleData = [
      // ヘッダー行
      ['日付', '勘定科目', '金額', '取引先', '摘要', '税区分', '部門', 'ステータス'],
      
      // サンプルデータ行
      ['2025/01/15', '通信費', '5000', 'NTT東日本', 'インターネット料金 12月分', '課税仕入 10%', '', '未処理'],
      ['2025/01/16', '旅費交通費', '1200', 'JR東日本', '顧客打合せ交通費', '課税仕入 10%', '', '未処理'],
      ['2025/01/17', '消耗品費', '2500', 'Amazon', 'プリンター用紙・文房具', '課税仕入 10%', '', '未処理'],
      ['2025/01/18', '会議費', '3000', 'スターバックス', 'クライアント打合せ', '課税仕入 10%', '', '未処理'],
      ['2025/01/19', '広告宣伝費', '15000', 'Google', 'Google Ads 12月分', '課税仕入 10%', '', '未処理'],
      ['2025/01/20', '支払手数料', '440', '三菱UFJ銀行', '振込手数料', '課税仕入 10%', '', '未処理'],
      ['2025/01/21', '地代家賃', '120000', '不動産会社', 'オフィス家賃 1月分', '課税仕入 10%', '', '未処理'],
      ['2025/01/22', '水道光熱費', '8500', '東京電力', '電気代 12月分', '課税仕入 10%', '', '未処理']
    ];

    console.log(`   ✓ ${sampleData.length - 1}件のサンプルデータを準備\n`);

    // 3. スプレッドシートにデータを書き込み
    console.log('3. スプレッドシートに書き込み中...');
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1:H9', // A1からH9まで（ヘッダー + 8行のデータ）
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: sampleData
      }
    });

    console.log('   ✓ データ書き込み成功\n');

    // 4. 表のフォーマットを設定
    console.log('4. 表のフォーマット設定中...');

    const formatRequests = [
      // ヘッダー行のフォーマット（背景色、太字、ボーダー）
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 8
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 1.0 },
              textFormat: { 
                bold: true,
                foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }
              },
              borders: {
                top: { style: 'SOLID', width: 2 },
                bottom: { style: 'SOLID', width: 2 },
                left: { style: 'SOLID', width: 1 },
                right: { style: 'SOLID', width: 1 }
              }
            }
          },
          fields: 'userEnteredFormat'
        }
      },
      // データ行のボーダー
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 1,
            endRowIndex: 9,
            startColumnIndex: 0,
            endColumnIndex: 8
          },
          cell: {
            userEnteredFormat: {
              borders: {
                top: { style: 'SOLID', width: 1 },
                bottom: { style: 'SOLID', width: 1 },
                left: { style: 'SOLID', width: 1 },
                right: { style: 'SOLID', width: 1 }
              }
            }
          },
          fields: 'userEnteredFormat.borders'
        }
      },
      // 金額列（C列）を右寄せ・数値フォーマット
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 1,
            endRowIndex: 9,
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              numberFormat: { type: 'NUMBER', pattern: '¥#,##0' }
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment,numberFormat)'
        }
      },
      // 日付列（A列）の書式設定
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 1,
            endRowIndex: 9,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: 'DATE', pattern: 'yyyy/mm/dd' }
            }
          },
          fields: 'userEnteredFormat.numberFormat'
        }
      },
      // 列幅を自動調整
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 8
          }
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: formatRequests
      }
    });

    console.log('   ✓ フォーマット設定完了\n');

    // 5. 結果表示
    console.log('========================================');
    console.log('  サンプルデータ追加完了！');
    console.log('========================================');
    console.log(`スプレッドシートURL:`);
    console.log(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit\n`);

    console.log('追加したデータ:');
    sampleData.slice(1).forEach((row, index) => {
      console.log(`  ${index + 1}. ${row[0]} - ${row[1]} ¥${parseInt(row[2]).toLocaleString()} (${row[3]})`);
    });

    console.log('\n次のステップ:');
    console.log('1. スプレッドシートで内容を確認');
    console.log('2. 以下のコマンドでfreeeに取り込み:');
    console.log(`   node import_from_sheets.js ${SPREADSHEET_ID}`);
    console.log('\n⚠️  実際のfreee取り込みを実行すると、本当に取引データが登録されます！');

  } catch (error) {
    console.error('エラー:', error.message);
    
    if (error.message.includes('The caller does not have permission')) {
      console.log('\n権限エラー: サービスアカウントに書き込み権限がありません。');
      console.log('スプレッドシートの共有設定で「編集者」権限を付与してください。');
      console.log('メールアドレス: freee-sheets-reader@freee-482012.iam.gserviceaccount.com');
    }
  }
}

// 実行
addSampleData();