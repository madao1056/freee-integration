// 請求書連携スクリプト（インポート/エクスポート）
const { google } = require('googleapis');
require('dotenv').config();
const { freeeApiRequest, getConfig } = require('../utils/freee_api');
const { authenticateGoogleSheets, createSheet, writeToSheet, formatHeader } = require('../utils/sheets_helper');

const config = getConfig();
const companyId = config.freeeCompanyId;

// 請求書シートの列定義
const INVOICE_HEADERS = ['発行日', '取引先名', '件名', '金額（税抜）', '税率(%)', '消費税', '合計', '備考', 'ステータス'];

// 勘定科目マッピング（収入用）
// ※事業所ごとにIDが異なる。`node src/main.js api:accounts` で自分の事業所のIDを取得して書き換えること
const INCOME_ACCOUNT_MAP = {
  '売上高': 994283672
};

// 税区分マッピング（売上用）
const INCOME_TAX_CODE_MAP = {
  '10': 2,    // 課税売上 10%
  '8': 6,     // 課税売上 8%（軽減）
  '0': 0      // 対象外
};

/**
 * 請求書テンプレートシートを作成
 */
async function createInvoiceTemplate(sheetsApi, spreadsheetId) {
  const sheetTitle = '請求書';

  // 既存チェック
  const spreadsheet = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets.find(
    s => s.properties.title === sheetTitle
  );

  if (exists) {
    console.log('   「請求書」シートは既に存在します');
    return;
  }

  const sheetId = await createSheet(sheetsApi, spreadsheetId, sheetTitle);

  // サンプルデータ
  const sampleRows = [
    ['2026-02-01', 'テスト株式会社', 'Webサイト制作', 100000, 10, 10000, 110000, '2月分', '未処理'],
    ['2026-02-15', 'サンプル合同会社', 'コンサルティング', 50000, 10, 5000, 55000, '', '未処理']
  ];

  await writeToSheet(sheetsApi, spreadsheetId, sheetTitle, INVOICE_HEADERS, sampleRows);
  await formatHeader(sheetsApi, spreadsheetId, sheetId, INVOICE_HEADERS.length);
  console.log('   ✓ 「請求書」テンプレートシートを作成しました');
}

/**
 * 請求書シートからデータ読み取り → freeeに収入取引として登録
 */
async function importInvoices(sheetsApi, spreadsheetId) {
  console.log('========================================');
  console.log('  請求書インポート（Sheets → freee）');
  console.log('========================================\n');

  // テンプレートがなければ作成
  await createInvoiceTemplate(sheetsApi, spreadsheetId);

  // シートからデータ取得
  console.log('\n1. 請求書データ取得中...');
  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId,
    range: '請求書!A:I'
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    console.log('   処理対象のデータがありません');
    return;
  }

  // 未処理レコードを抽出
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    const status = row[8] || '未処理';
    if (status === '処理済') continue;

    records.push({
      issueDate: row[0].replace(/\//g, '-'),
      partnerName: row[1] || '',
      subject: row[2] || '',
      amount: parseInt(row[3]) || 0,
      taxRate: row[4] || '10',
      vat: parseInt(row[5]) || 0,
      total: parseInt(row[6]) || 0,
      description: row[7] || '',
      rowIndex: i + 1
    });
  }

  console.log(`   ✓ ${records.length}件の未処理請求書を取得\n`);

  if (records.length === 0) {
    console.log('処理対象の請求書がありません');
    return;
  }

  // freeeに収入取引として登録
  console.log('2. freee APIに登録中...\n');
  let successCount = 0;
  let errorCount = 0;

  for (const record of records) {
    console.log(`   処理中: ${record.issueDate} ${record.partnerName} ¥${record.total.toLocaleString()}`);

    try {
      const taxCode = INCOME_TAX_CODE_MAP[record.taxRate] || 2;
      const accountItemId = INCOME_ACCOUNT_MAP['売上高'];

      const dealData = {
        company_id: companyId,
        issue_date: record.issueDate,
        type: 'income',
        details: [
          {
            account_item_id: accountItemId,
            tax_code: taxCode,
            amount: record.total,
            description: record.subject ? `${record.subject}${record.description ? ' / ' + record.description : ''}` : record.description
          }
        ]
      };

      const response = await freeeApiRequest('/api/1/deals', 'POST', dealData);
      console.log(`   ✓ 登録成功 (取引ID: ${response.deal.id})`);

      // ステータス更新
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `請求書!I${record.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['処理済']] }
      });

      successCount++;
    } catch (error) {
      console.error(`   ✗ 登録失敗: ${error.message}`);

      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: `請求書!I${record.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[`エラー: ${error.message.substring(0, 50)}`]] }
      });

      errorCount++;
    }

    console.log('');
  }

  // 結果サマリー
  console.log('========================================');
  console.log('  インポート完了');
  console.log('========================================');
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${errorCount}件`);
  console.log(`合計: ${records.length}件`);
}

/**
 * freeeの請求書データをスプレッドシートにエクスポート
 */
async function exportInvoices(sheetsApi, spreadsheetId) {
  console.log('========================================');
  console.log('  請求書エクスポート（freee → Sheets）');
  console.log('========================================\n');

  // 1. freee APIから請求書一覧を取得
  console.log('1. freee APIから請求書データ取得中...');

  const allInvoices = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await freeeApiRequest(
      `/api/1/invoices?company_id=${companyId}&limit=${limit}&offset=${offset}`
    );
    const invoices = res.invoices || [];
    allInvoices.push(...invoices);

    if (invoices.length < limit) break;
    offset += limit;
  }

  console.log(`   ✓ 請求書: ${allInvoices.length}件\n`);

  if (allInvoices.length === 0) {
    console.log('請求書データがありません');
    return;
  }

  // 2. 取引先一覧を取得（名前解決用）
  console.log('2. 取引先情報取得中...');
  const partnerRes = await freeeApiRequest(`/api/1/partners?company_id=${companyId}&limit=100`);
  const partners = partnerRes.partners || [];
  const partnerMap = {};
  for (const p of partners) {
    partnerMap[p.id] = p.name;
  }
  console.log(`   ✓ 取引先: ${partners.length}件\n`);

  // 3. データ変換
  const exportHeaders = [
    '請求書ID', '請求書番号', '発行日', '支払期日',
    '取引先', '件名', '小計', '消費税', '合計',
    'ステータス', '入金ステータス'
  ];

  // ステータスマッピング
  const invoiceStatusMap = {
    'draft': '下書き',
    'applying': '申請中',
    'remanded': '差戻し',
    'rejected': '却下',
    'approved': '承認済み',
    'issued': '発行済み',
    'unsubmitted': '送付待ち'
  };

  const paymentStatusMap = {
    'empty': '未設定',
    'unsettled': '未入金',
    'settled': '入金済み'
  };

  const exportRows = allInvoices.map(inv => [
    inv.id,
    inv.invoice_number || '',
    inv.issue_date || '',
    inv.due_date || '',
    partnerMap[inv.partner_id] || String(inv.partner_id || ''),
    inv.title || '',
    inv.sub_total || 0,
    inv.total_vat || 0,
    inv.total_amount || 0,
    invoiceStatusMap[inv.invoice_status] || inv.invoice_status || '',
    paymentStatusMap[inv.payment_status] || inv.payment_status || ''
  ]);

  // 4. スプレッドシートに書き込み
  console.log('3. スプレッドシートに出力中...');
  const sheetTitle = '請求書一覧';
  const sheetId = await createSheet(sheetsApi, spreadsheetId, sheetTitle);
  const rowCount = await writeToSheet(sheetsApi, spreadsheetId, sheetTitle, exportHeaders, exportRows);
  await formatHeader(sheetsApi, spreadsheetId, sheetId, exportHeaders.length);

  console.log(`   ✓ ${rowCount}件の請求書をエクスポート`);

  // 5. 結果サマリー
  console.log('\n========================================');
  console.log('  エクスポート完了');
  console.log('========================================');
  console.log(`スプレッドシート: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  console.log(`シート: ${sheetTitle}`);
  console.log(`請求書数: ${allInvoices.length}件`);
}

/**
 * メイン処理
 */
async function main() {
  const spreadsheetId = process.argv[2] || config.spreadsheetId;
  const mode = process.argv[3]; // 'export' or undefined(=import)

  if (!spreadsheetId) {
    console.error('エラー: スプレッドシートIDが指定されていません');
    console.log('使用方法:');
    console.log('  node main.js sheets:invoice <スプレッドシートID>          # インポート');
    console.log('  node main.js sheets:invoice <スプレッドシートID> export   # エクスポート');
    process.exit(1);
  }

  // Google Sheets認証
  console.log('Google Sheets認証中...');
  const { sheetsApi } = await authenticateGoogleSheets();
  console.log('✓ 認証成功\n');

  if (mode === 'export') {
    await exportInvoices(sheetsApi, spreadsheetId);
  } else {
    await importInvoices(sheetsApi, spreadsheetId);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});
