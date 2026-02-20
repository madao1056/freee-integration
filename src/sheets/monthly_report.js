// 月次経費レポート生成スクリプト
require('dotenv').config();
const { freeeApiRequest, getConfig } = require('../utils/freee_api');
const { authenticateGoogleSheets, createSheet, writeToSheet, formatHeader } = require('../utils/sheets_helper');

const config = getConfig();
const companyId = config.freeeCompanyId;

// 税区分コードマッピング
const TAX_CODE_NAMES = {
  0: '対象外', 2: '課税売上 10%', 6: '課税売上 8%（軽減）',
  21: '課対仕入 10%', 22: '課対仕入 8%（軽減）',
  23: '課税売上 10%（内税）', 24: '課税売上 8%（内税・軽減）',
  136: '課対仕入 10%（内税）', 189: '課対仕入 8%（内税・軽減）',
  1: '非課税売上', 3: '非課税仕入', 7: '不課税', 8: '輸出免税'
};

/**
 * 指定月の取引をfreee APIから取得
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function fetchDealsForMonth(startDate, endDate) {
  const allDeals = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await freeeApiRequest(
      `/api/1/deals?company_id=${companyId}&limit=${limit}&offset=${offset}&start_issue_date=${startDate}&end_issue_date=${endDate}`
    );
    const deals = res.deals || [];
    allDeals.push(...deals);

    if (deals.length < limit) break;
    offset += limit;
  }

  return allDeals;
}

/**
 * 勘定科目一覧を取得
 */
async function fetchAccountItems() {
  const res = await freeeApiRequest(`/api/1/account_items?company_id=${companyId}`);
  return res.account_items || [];
}

/**
 * 取引先一覧を取得
 */
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

/**
 * 勘定科目別集計
 */
function aggregateByAccount(deals, accountMap) {
  const summary = {};

  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      const accountName = accountMap[detail.account_item_id] || String(detail.account_item_id);
      if (!summary[accountName]) {
        summary[accountName] = { expense: 0, income: 0, count: 0 };
      }
      if (deal.type === 'income') {
        summary[accountName].income += detail.amount;
      } else {
        summary[accountName].expense += detail.amount;
      }
      summary[accountName].count++;
    }
  }

  return summary;
}

/**
 * 取引先別集計
 */
function aggregateByPartner(deals, partnerMap) {
  const summary = {};

  for (const deal of deals) {
    let partnerName = '（取引先なし）';
    if (deal.partner_id && partnerMap[deal.partner_id]) {
      partnerName = partnerMap[deal.partner_id];
    } else if (deal.receipts && deal.receipts.length > 0) {
      const meta = deal.receipts[0].receipt_metadatum;
      if (meta && meta.partner_name) {
        partnerName = meta.partner_name;
      }
    }

    if (!summary[partnerName]) {
      summary[partnerName] = { expense: 0, income: 0, count: 0 };
    }

    for (const detail of (deal.details || [])) {
      if (deal.type === 'income') {
        summary[partnerName].income += detail.amount;
      } else {
        summary[partnerName].expense += detail.amount;
      }
      summary[partnerName].count++;
    }
  }

  return summary;
}

/**
 * メイン処理
 */
async function main() {
  const spreadsheetId = process.argv[2] || config.spreadsheetId;
  const monthArg = process.argv[3]; // YYYY-MM

  console.log('========================================');
  console.log('  月次経費レポート生成');
  console.log('========================================\n');

  if (!spreadsheetId) {
    console.error('エラー: スプレッドシートIDが指定されていません');
    console.log('使用方法: node main.js sheets:report <スプレッドシートID> [YYYY-MM]');
    process.exit(1);
  }

  // 対象月を決定
  const now = new Date();
  let year, month;
  if (monthArg && /^\d{4}-\d{2}$/.test(monthArg)) {
    [year, month] = monthArg.split('-').map(Number);
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  console.log(`対象期間: ${startDate} ～ ${endDate}\n`);

  // 1. Google Sheets認証
  console.log('1. Google Sheets認証中...');
  const { sheetsApi } = await authenticateGoogleSheets();
  console.log('   ✓ 認証成功\n');

  // 2. freee APIからデータ取得
  console.log('2. freee APIからデータ取得中...');

  const [deals, accountItems, partners] = await Promise.all([
    fetchDealsForMonth(startDate, endDate).then(d => { console.log(`   ✓ 取引: ${d.length}件`); return d; }),
    fetchAccountItems().then(a => { console.log(`   ✓ 勘定科目: ${a.length}件`); return a; }),
    fetchAllPartners().then(p => { console.log(`   ✓ 取引先: ${p.length}件`); return p; })
  ]);

  console.log('');

  // マッピング作成
  const accountMap = {};
  for (const item of accountItems) {
    accountMap[item.id] = item.name;
  }
  const partnerMap = {};
  for (const p of partners) {
    partnerMap[p.id] = p.name;
  }

  // 3. 集計
  console.log('3. データ集計中...');
  const accountSummary = aggregateByAccount(deals, accountMap);
  const partnerSummary = aggregateByPartner(deals, partnerMap);

  // 全体集計
  let totalExpense = 0;
  let totalIncome = 0;
  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      if (deal.type === 'income') {
        totalIncome += detail.amount;
      } else {
        totalExpense += detail.amount;
      }
    }
  }
  console.log(`   支出合計: ¥${totalExpense.toLocaleString()}`);
  console.log(`   収入合計: ¥${totalIncome.toLocaleString()}`);
  console.log(`   差引: ¥${(totalIncome - totalExpense).toLocaleString()}\n`);

  // 4. スプレッドシートに出力
  const sheetTitle = `経費レポート_${year}年${month}月`;
  console.log(`4. スプレッドシートに出力中...`);
  console.log(`   シート名: ${sheetTitle}\n`);

  const sheetId = await createSheet(sheetsApi, spreadsheetId, sheetTitle);

  // サマリーセクション + 勘定科目別 + 取引先別 をまとめて書き込み
  const rows = [];

  // サマリー
  rows.push(['【月次サマリー】', '', '', '']);
  rows.push(['対象期間', `${startDate} ～ ${endDate}`, '', '']);
  rows.push(['取引件数', deals.length, '', '']);
  rows.push(['支出合計', totalExpense, '', '']);
  rows.push(['収入合計', totalIncome, '', '']);
  rows.push(['差引（収入-支出）', totalIncome - totalExpense, '', '']);
  rows.push(['', '', '', '']);

  // 勘定科目別集計
  rows.push(['【勘定科目別集計】', '', '', '']);
  rows.push(['勘定科目', '支出', '収入', '件数']);

  const accountEntries = Object.entries(accountSummary)
    .sort((a, b) => b[1].expense - a[1].expense);

  for (const [name, data] of accountEntries) {
    rows.push([name, data.expense, data.income, data.count]);
  }

  rows.push(['', '', '', '']);

  // 取引先別集計
  rows.push(['【取引先別集計】', '', '', '']);
  rows.push(['取引先', '支出', '収入', '件数']);

  const partnerEntries = Object.entries(partnerSummary)
    .sort((a, b) => b[1].expense - a[1].expense);

  for (const [name, data] of partnerEntries) {
    rows.push([name, data.expense, data.income, data.count]);
  }

  // ヘッダーなしで書き込み（セクションヘッダーが含まれているため）
  const headers = ['項目', '金額/支出', '収入', '件数'];
  await writeToSheet(sheetsApi, spreadsheetId, sheetTitle, headers, rows);
  await formatHeader(sheetsApi, spreadsheetId, sheetId, headers.length);

  console.log(`   ✓ レポート出力完了`);

  // 5. 結果サマリー
  console.log('\n========================================');
  console.log('  レポート生成完了');
  console.log('========================================');
  console.log(`スプレッドシート: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  console.log(`シート: ${sheetTitle}`);
  console.log(`\n集計結果:`);
  console.log(`  勘定科目: ${accountEntries.length}科目`);
  console.log(`  取引先: ${partnerEntries.length}件`);
  console.log(`  取引総数: ${deals.length}件`);
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});
