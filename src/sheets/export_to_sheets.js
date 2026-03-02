// freee API → Google Sheets エクスポートスクリプト
const { google } = require('googleapis');
require('dotenv').config({ quiet: true });
const { freeeApiRequest, getConfig } = require('../utils/freee_api');
const { authenticateGoogleSheets, createSheet, writeToSheet, formatHeader } = require('../utils/sheets_helper');

// 設定
const config = getConfig();
const spreadsheetId = process.argv[2] || config.spreadsheetId;
const companyId = config.freeeCompanyId;

// 取引一覧を全件取得（ページネーション対応）
async function fetchAllDeals() {
  const allDeals = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await freeeApiRequest(
      `/api/1/deals?company_id=${companyId}&limit=${limit}&offset=${offset}`
    );
    const deals = res.deals || [];
    allDeals.push(...deals);

    if (deals.length < limit) break;
    offset += limit;
  }

  return allDeals;
}

// 取引先一覧を全件取得
async function fetchAllPartners() {
  const allPartners = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await freeeApiRequest(
      `/api/1/partners?company_id=${companyId}&limit=${limit}&offset=${offset}`
    );
    const partners = res.partners || [];
    allPartners.push(...partners);

    if (partners.length < limit) break;
    offset += limit;
  }

  return allPartners;
}

// 勘定科目一覧を取得
async function fetchAccountItems() {
  const res = await freeeApiRequest(
    `/api/1/account_items?company_id=${companyId}`
  );
  return res.account_items || [];
}

// 試算表（損益計算書）を取得
async function fetchTrialPL(fiscalYear) {
  const year = fiscalYear || new Date().getFullYear();
  const res = await freeeApiRequest(
    `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=${year}`
  );
  return res.trial_pl || {};
}

// 試算表（貸借対照表）を取得
async function fetchTrialBS(fiscalYear) {
  const year = fiscalYear || new Date().getFullYear();
  const res = await freeeApiRequest(
    `/api/1/reports/trial_bs?company_id=${companyId}&fiscal_year=${year}`
  );
  return res.trial_bs || {};
}

// --- データ変換 ---

// 税区分コードマッピング
const TAX_CODE_NAMES = {
  0: '対象外', 2: '課税売上 10%', 6: '課税売上 8%（軽減）',
  21: '課対仕入 10%', 22: '課対仕入 8%（軽減）',
  23: '課税売上 10%（内税）', 24: '課税売上 8%（内税・軽減）',
  136: '課対仕入 10%（内税）', 189: '課対仕入 8%（内税・軽減）',
  1: '非課税売上', 3: '非課税仕入', 7: '不課税', 8: '輸出免税'
};

// 取引データの変換（勘定科目一覧・取引先一覧を参照）
function transformDeals(deals, accountItems, partners) {
  const headers = ['取引ID', '発生日', '種別', '取引先', '金額', '消費税', '勘定科目', '税区分', '備考', 'ステータス'];
  const rows = [];

  // 勘定科目ID→名前マッピング
  const accountMap = {};
  for (const item of accountItems) {
    accountMap[item.id] = item.name;
  }

  // 取引先ID→名前マッピング
  const partnerMap = {};
  for (const p of partners) {
    partnerMap[p.id] = p.name;
  }

  for (const deal of deals) {
    const type = deal.type === 'income' ? '収入' : '支出';
    const status = deal.status === 'settled' ? '決済済' : '未決済';

    // 取引先名: partner_id → レシートメタデータ → 空
    let partnerName = '';
    if (deal.partner_id && partnerMap[deal.partner_id]) {
      partnerName = partnerMap[deal.partner_id];
    } else if (deal.receipts && deal.receipts.length > 0) {
      const meta = deal.receipts[0].receipt_metadatum;
      if (meta && meta.partner_name) {
        partnerName = meta.partner_name;
      }
    }

    for (const detail of (deal.details || [])) {
      rows.push([
        deal.id,
        deal.issue_date,
        type,
        partnerName,
        detail.amount,
        detail.vat || 0,
        accountMap[detail.account_item_id] || String(detail.account_item_id),
        TAX_CODE_NAMES[detail.tax_code] || String(detail.tax_code),
        detail.description || '',
        status
      ]);
    }
  }

  return { headers, rows };
}

// 勘定科目の変換
function transformAccountItems(items) {
  const headers = ['勘定科目ID', '勘定科目名', 'ショートカット', 'カテゴリ', '税区分', '残高方向', '対応する収入取引', '検索可能'];
  const rows = items.map(item => [
    item.id,
    item.name,
    item.shortcut || '',
    item.account_category || '',
    item.tax_name || '',
    item.dc_balance || '',
    item.corresponding_income_name || '',
    item.searchable ? 'はい' : 'いいえ'
  ]);

  return { headers, rows };
}

// 取引先の変換
function transformPartners(partners) {
  const headers = ['取引先ID', '取引先名', 'コード', '取引先区分', '電話番号', 'メールアドレス', '住所'];
  const rows = partners.map(p => [
    p.id,
    p.name,
    p.code || '',
    p.org_code ? '法人' : '個人',
    p.phone || '',
    p.email || '',
    p.address_attributes ? `${p.address_attributes.prefecture_code || ''} ${p.address_attributes.street_name1 || ''}` : ''
  ]);

  return { headers, rows };
}

// 試算表の変換
function transformTrialReport(report, reportType) {
  const balances = report.balances || [];
  let headers;

  if (reportType === 'PL') {
    headers = ['勘定科目名', 'カテゴリ', '借方金額', '貸方金額', '借方合計', '貸方合計'];
  } else {
    headers = ['勘定科目名', 'カテゴリ', '期首残高', '借方金額', '貸方金額', '期末残高'];
  }

  const rows = balances.map(b => {
    if (reportType === 'PL') {
      return [
        b.account_item_name || '',
        b.account_category_name || '',
        b.debit_amount || 0,
        b.credit_amount || 0,
        b.debit_total || 0,
        b.credit_total || 0
      ];
    } else {
      return [
        b.account_item_name || '',
        b.account_category_name || '',
        b.opening_balance || 0,
        b.debit_amount || 0,
        b.credit_amount || 0,
        b.closing_balance || 0
      ];
    }
  });

  return { headers, rows };
}

// メイン処理
async function main() {
  console.log('========================================');
  console.log('  freee → Google Sheets エクスポート');
  console.log('========================================\n');

  if (!spreadsheetId) {
    console.error('エラー: スプレッドシートIDが指定されていません');
    console.log('使用方法: node main.js sheets:export <スプレッドシートID>');
    process.exit(1);
  }

  // 1. Google Sheets認証
  console.log('1. Google Sheets認証中...');
  const { sheetsApi } = await authenticateGoogleSheets();
  console.log('   ✓ 認証成功\n');

  // 2. freee APIからデータ取得
  console.log('2. freee APIからデータ取得中...');

  const [deals, accountItems, partners] = await Promise.all([
    fetchAllDeals().then(d => { console.log(`   ✓ 取引: ${d.length}件`); return d; }),
    fetchAccountItems().then(a => { console.log(`   ✓ 勘定科目: ${a.length}件`); return a; }),
    fetchAllPartners().then(p => { console.log(`   ✓ 取引先: ${p.length}件`); return p; })
  ]);

  let trialPL = null;
  let trialBS = null;
  try {
    [trialPL, trialBS] = await Promise.all([
      fetchTrialPL(),
      fetchTrialBS()
    ]);
    console.log('   ✓ 試算表（PL/BS）取得完了');
  } catch (e) {
    console.log(`   ⚠ 試算表の取得をスキップ: ${e.message}`);
  }

  console.log('');

  // 3. スプレッドシートにエクスポート
  console.log('3. スプレッドシートにエクスポート中...');
  console.log(`   スプレッドシートID: ${spreadsheetId}\n`);

  const exportTasks = [
    {
      sheetTitle: '取引一覧',
      data: transformDeals(deals, accountItems, partners)
    },
    {
      sheetTitle: '勘定科目',
      data: transformAccountItems(accountItems)
    },
    {
      sheetTitle: '取引先',
      data: transformPartners(partners)
    }
  ];

  if (trialPL) {
    exportTasks.push({
      sheetTitle: '損益計算書',
      data: transformTrialReport(trialPL, 'PL')
    });
  }

  if (trialBS) {
    exportTasks.push({
      sheetTitle: '貸借対照表',
      data: transformTrialReport(trialBS, 'BS')
    });
  }

  for (const task of exportTasks) {
    try {
      const sheetId = await createSheet(sheetsApi, spreadsheetId, task.sheetTitle);
      const rowCount = await writeToSheet(
        sheetsApi, spreadsheetId, task.sheetTitle,
        task.data.headers, task.data.rows
      );
      await formatHeader(sheetsApi, spreadsheetId, sheetId, task.data.headers.length);
      console.log(`   ✓ ${task.sheetTitle}: ${rowCount}件のデータを書き込み`);
    } catch (error) {
      console.error(`   ✗ ${task.sheetTitle}: エラー - ${error.message}`);
    }
  }

  // 4. 結果サマリー
  console.log('\n========================================');
  console.log('  エクスポート完了');
  console.log('========================================');
  console.log(`スプレッドシート: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  console.log(`\nエクスポートしたシート:`);
  exportTasks.forEach(t => {
    console.log(`  - ${t.sheetTitle} (${t.data.rows.length}件)`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});
