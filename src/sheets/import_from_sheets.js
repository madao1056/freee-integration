// Google Sheets からfreee APIへのデータ連携スクリプト
const { google } = require('googleapis');
require('dotenv').config();
const { freeeApiRequest, getConfig } = require('../utils/freee_api');
const { authenticateGoogleSheets } = require('../utils/sheets_helper');

// 設定
const config = getConfig();
const CONFIG = {
  spreadsheetId: process.env.SPREADSHEET_ID || process.argv[2],
  sheetName: process.env.SHEET_NAME || 'インポート',
  freeeCompanyId: config.freeeCompanyId
};

// 勘定科目マッピング（勘定科目名 → freee ID）
const ACCOUNT_ITEM_MAP = {
  '現金': 994283801,
  '売上高': 994283672,
  '仕入高': 994283678,
  '給料': 994283686,
  '消耗品費': 994283703,
  '通信費': 994283700,
  '旅費交通費': 994283699,
  '交通費': 994283699,
  '会議費': 994283698,
  '広告宣伝費': 994283696,
  '支払手数料': 994283709,
  '地代家賃': 994283711,
  '水道光熱費': 994283706,
  '接待交際費': 994283697,
  '事務用品費': 994283704
};

// 税区分マッピング（名称 → freee税区分コード）
const TAX_CODE_MAP = {
  '課対仕入 10%': 21,
  '課対仕入 10%（内税）': 136,
  '課対仕入 8%（軽減）': 22,
  '課対仕入 8%（内税・軽減）': 189,
  '課税売上 10%': 2,
  '課税売上 8%（軽減）': 6,
  '非課税売上': 1,
  '非課税仕入': 3,
  '不課税': 7,
  '対象外': 0
};

// スプレッドシートからデータ取得
async function getSheetData(sheetsApi) {
  try {
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A:H`
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('データが見つかりませんでした');
      return [];
    }

    // ヘッダー行を取得
    const headers = rows[0];
    console.log('ヘッダー:', headers);

    // データ行を処理
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const record = {
        date: row[0],
        accountItem: row[1],
        amount: parseInt(row[2]) || 0,
        partner: row[3] || '',
        description: row[4] || '',
        taxType: row[5] || '',
        section: row[6] || '',
        status: row[7] || '未処理',
        rowIndex: i + 1
      };

      if (record.status !== '処理済') {
        data.push(record);
      }
    }

    return data;
  } catch (error) {
    console.error('スプレッドシート読み取りエラー:', error.message);
    throw error;
  }
}

// freeeに取引を登録
async function createDeal(record) {
  const issueDate = record.date.replace(/\//g, '-');

  const accountItemId = ACCOUNT_ITEM_MAP[record.accountItem];
  if (!accountItemId) {
    throw new Error(`勘定科目 "${record.accountItem}" が見つかりません`);
  }

  const taxCode = TAX_CODE_MAP[record.taxType] || 136;

  const dealData = {
    company_id: CONFIG.freeeCompanyId,
    issue_date: issueDate,
    type: 'expense',
    details: [
      {
        account_item_id: accountItemId,
        tax_code: taxCode,
        amount: record.amount,
        description: record.description
      }
    ]
  };

  if (record.partner) {
    dealData.details[0].description = `${record.partner} - ${record.description}`;
  }

  try {
    const response = await freeeApiRequest('/api/1/deals', 'POST', dealData);
    return response.deal;
  } catch (error) {
    console.error('取引登録エラー:', error.message);
    throw error;
  }
}

// ステータスを更新（Google Sheets）
async function updateStatus(sheetsApi, rowIndex, status) {
  try {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!H${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[status]]
      }
    });
  } catch (error) {
    console.error(`行 ${rowIndex} のステータス更新エラー:`, error.message);
  }
}

// メイン処理
async function main() {
  console.log('========================================');
  console.log('  Google Sheets → freee API 連携');
  console.log('========================================\n');

  if (!CONFIG.spreadsheetId) {
    console.error('エラー: スプレッドシートIDが指定されていません');
    console.log('使用方法: node main.js sheets:import <スプレッドシートID>');
    console.log('または、.envファイルにSPREADSHEET_IDを設定してください');
    process.exit(1);
  }

  try {
    // 1. Google認証
    console.log('1. Google Sheets認証中...');
    const { sheetsApi } = await authenticateGoogleSheets();
    console.log('   ✓ 認証成功\n');

    // 2. スプレッドシートからデータ取得
    console.log('2. スプレッドシートからデータ取得中...');
    console.log(`   スプレッドシートID: ${CONFIG.spreadsheetId}`);
    const records = await getSheetData(sheetsApi);
    console.log(`   ✓ ${records.length}件の未処理レコードを取得\n`);

    if (records.length === 0) {
      console.log('処理対象のレコードがありません');
      return;
    }

    // 3. freeeに登録
    console.log('3. freee APIに登録中...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const record of records) {
      console.log(`   処理中: ${record.date} ${record.accountItem} ¥${record.amount.toLocaleString()}`);

      try {
        const deal = await createDeal(record);
        console.log(`   ✓ 登録成功 (取引ID: ${deal.id})`);

        await updateStatus(sheetsApi, record.rowIndex, '処理済');
        successCount++;
      } catch (error) {
        console.error(`   ✗ 登録失敗: ${error.message}`);
        await updateStatus(sheetsApi, record.rowIndex, `エラー: ${error.message}`);
        errorCount++;
      }

      console.log('');
    }

    // 4. 結果サマリー
    console.log('========================================');
    console.log('  処理完了');
    console.log('========================================');
    console.log(`成功: ${successCount}件`);
    console.log(`失敗: ${errorCount}件`);
    console.log(`合計: ${records.length}件`);

  } catch (error) {
    console.error('エラー:', error.message);

    if (error.message.includes('サービスアカウントキーファイル')) {
      console.log('\n設定手順:');
      console.log('1. Google Cloud Consoleでサービスアカウントを作成');
      console.log('2. JSONキーファイルをダウンロード');
      console.log('3. service-account-key.jsonとして保存');
      console.log('4. スプレッドシートにサービスアカウントのメールアドレスを共有');
      console.log('\n詳細は google_sheets_setup.md を参照してください');
    }

    process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 実行
main();
