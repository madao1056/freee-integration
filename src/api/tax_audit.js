// 確定申告データ品質チェックツール
require('dotenv').config();
const { freeeApiRequest, getConfig } = require('../utils/freee_api');

const config = getConfig();
const companyId = config.freeeCompanyId;

/**
 * 年度内の全取引をページネーションで取得
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function fetchAllDeals(startDate, endDate) {
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
 * @returns {Promise<object[]>}
 */
async function fetchAccountItems() {
  const res = await freeeApiRequest(`/api/1/account_items?company_id=${companyId}`);
  return res.account_items || [];
}

/**
 * 取引先一覧を取得
 * @returns {Promise<object[]>}
 */
async function fetchPartners() {
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
 * 試算表（PL）を取得
 * @param {number} fiscalYear
 * @returns {Promise<object>}
 */
async function fetchTrialPl(startDate, endDate) {
  const res = await freeeApiRequest(
    `/api/1/reports/trial_pl?company_id=${companyId}&start_date=${startDate}&end_date=${endDate}`
  );
  return res.trial_pl || {};
}

// ========================================
// チェック関数
// ========================================

/**
 * 1. 未決済取引チェック
 */
function checkUnsettledDeals(deals, accountMap) {
  const unsettled = deals.filter(d => d.status === 'unsettled');
  const items = unsettled.map(d => {
    const detail = (d.details || [])[0] || {};
    const accountName = accountMap[detail.account_item_id] || '不明';
    return {
      date: d.issue_date,
      account: accountName,
      amount: detail.amount || 0,
      description: detail.description || '（摘要なし）'
    };
  });
  return { count: unsettled.length, items };
}

/**
 * 2. 摘要なし取引チェック
 */
function checkNoDescription(deals, accountMap) {
  const items = [];
  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      if (!detail.description || detail.description.trim() === '') {
        items.push({
          date: deal.issue_date,
          account: accountMap[detail.account_item_id] || '不明',
          amount: detail.amount || 0,
          dealId: deal.id
        });
      }
    }
  }
  return { count: items.length, items };
}

/**
 * 3. 取引先なし取引チェック
 */
function checkNoPartner(deals) {
  const items = [];
  for (const deal of deals) {
    if (!deal.partner_id) {
      const detail = (deal.details || [])[0] || {};
      items.push({
        date: deal.issue_date,
        amount: detail.amount || 0,
        description: detail.description || '（摘要なし）',
        dealId: deal.id
      });
    }
  }
  return { count: items.length, items };
}

/**
 * 4. 重複疑い検出（同日・同額・同勘定科目）
 */
function checkDuplicates(deals) {
  const groups = {};
  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      const key = `${deal.issue_date}_${detail.amount}_${detail.account_item_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        dealId: deal.id,
        date: deal.issue_date,
        amount: detail.amount,
        accountItemId: detail.account_item_id,
        description: detail.description || '（摘要なし）'
      });
    }
  }

  const duplicates = [];
  for (const [, group] of Object.entries(groups)) {
    if (group.length >= 2) {
      duplicates.push(group);
    }
  }
  return { count: duplicates.length, groups: duplicates };
}

/**
 * 5. 月別推移チェック
 */
function checkMonthlyTrend(deals, startDate, endDate) {
  const monthly = {};
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = { count: 0, expense: 0, income: 0 };
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const deal of deals) {
    const month = deal.issue_date.substring(0, 7); // YYYY-MM
    if (!monthly[month]) continue;
    monthly[month].count++;
    for (const detail of (deal.details || [])) {
      if (deal.type === 'income') {
        monthly[month].income += detail.amount;
      } else {
        monthly[month].expense += detail.amount;
      }
    }
  }

  // 平均を算出し、極端に少ない月を警告
  const counts = Object.values(monthly).map(m => m.count);
  const monthCount = counts.length || 1;
  const avg = counts.reduce((a, b) => a + b, 0) / monthCount;
  const warnings = [];
  for (const [month, data] of Object.entries(monthly)) {
    if (data.count > 0 && data.count < avg * 0.3) {
      warnings.push({ month, count: data.count, avg: Math.round(avg) });
    }
  }

  return { monthly, warnings };
}

/**
 * 6. 勘定科目別集計
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
 * 7. 試算表チェック（PLとの整合確認）
 */
function checkTrialBalance(deals, trialPl) {
  // 取引からの合計
  let dealExpense = 0;
  let dealIncome = 0;
  for (const deal of deals) {
    for (const detail of (deal.details || [])) {
      if (deal.type === 'income') {
        dealIncome += detail.amount;
      } else {
        dealExpense += detail.amount;
      }
    }
  }

  // 試算表からの合計
  const balances = trialPl.balances || [];
  let plIncome = 0;
  let plExpense = 0;

  for (const item of balances) {
    // account_category_id: 9=売上, 11=売上原価, 12=販管費, 13=営業外収益, 14=営業外費用, etc.
    const creditAmount = item.credit_amount || 0;
    const debitAmount = item.debit_amount || 0;

    if (item.account_category_id === 9 || item.account_category_id === 13) {
      plIncome += creditAmount;
    } else if (item.account_category_id === 11 || item.account_category_id === 12 || item.account_category_id === 14) {
      plExpense += debitAmount;
    }
  }

  return {
    dealIncome,
    dealExpense,
    plIncome,
    plExpense,
    incomeDiff: Math.abs(dealIncome - plIncome),
    expenseDiff: Math.abs(dealExpense - plExpense)
  };
}

// ========================================
// 金額フォーマット
// ========================================

function formatYen(amount) {
  return `¥${amount.toLocaleString()}`;
}

// ========================================
// コンソール出力
// ========================================

function printResults(fiscalYear, results) {
  console.log('========================================');
  console.log(`  確定申告データ品質チェック（${fiscalYear}年度）`);
  console.log('========================================\n');

  let okCount = 0;
  let warnCount = 0;
  let warnItems = 0;

  // 1. 未決済取引
  console.log('1. 未決済取引チェック...');
  if (results.unsettled.count === 0) {
    console.log('   ✓ 未決済取引はありません\n');
    okCount++;
  } else {
    console.log(`   ⚠ ${results.unsettled.count}件の未決済取引があります`);
    for (const item of results.unsettled.items.slice(0, 10)) {
      console.log(`   - ${item.date} ${item.account} ${formatYen(item.amount)}（摘要: ${item.description}）`);
    }
    if (results.unsettled.count > 10) {
      console.log(`   ... 他${results.unsettled.count - 10}件`);
    }
    console.log('');
    warnCount++;
    warnItems += results.unsettled.count;
  }

  // 2. 摘要なし
  console.log('2. 摘要なし取引チェック...');
  if (results.noDescription.count === 0) {
    console.log('   ✓ 摘要なし取引はありません\n');
    okCount++;
  } else {
    console.log(`   ⚠ ${results.noDescription.count}件の摘要なし取引`);
    for (const item of results.noDescription.items.slice(0, 10)) {
      console.log(`   - ${item.date} ${item.account} ${formatYen(item.amount)}（取引ID: ${item.dealId}）`);
    }
    if (results.noDescription.count > 10) {
      console.log(`   ... 他${results.noDescription.count - 10}件`);
    }
    console.log('');
    warnCount++;
    warnItems += results.noDescription.count;
  }

  // 3. 取引先なし
  console.log('3. 取引先なし取引チェック...');
  if (results.noPartner.count === 0) {
    console.log('   ✓ 取引先なし取引はありません\n');
    okCount++;
  } else {
    console.log(`   ⚠ ${results.noPartner.count}件の取引先なし取引`);
    for (const item of results.noPartner.items.slice(0, 10)) {
      console.log(`   - ${item.date} ${formatYen(item.amount)}（摘要: ${item.description}）（取引ID: ${item.dealId}）`);
    }
    if (results.noPartner.count > 10) {
      console.log(`   ... 他${results.noPartner.count - 10}件`);
    }
    console.log('');
    warnCount++;
    warnItems += results.noPartner.count;
  }

  // 4. 重複疑い
  console.log('4. 重複疑い検出...');
  if (results.duplicates.count === 0) {
    console.log('   ✓ 重複疑いはありません\n');
    okCount++;
  } else {
    console.log(`   ⚠ ${results.duplicates.count}組の重複疑い`);
    for (const group of results.duplicates.groups.slice(0, 5)) {
      const first = group[0];
      console.log(`   - ${first.date} ${formatYen(first.amount)} × ${group.length}件（${first.description}）`);
      console.log(`     取引ID: ${group.map(g => g.dealId).join(', ')}`);
    }
    if (results.duplicates.count > 5) {
      console.log(`   ... 他${results.duplicates.count - 5}組`);
    }
    console.log('');
    warnCount++;
    warnItems += results.duplicates.count;
  }

  // 5. 月別推移
  console.log('5. 月別取引推移...');
  console.log('   月        件数    支出          収入');
  console.log('   ─────────────────────────────────────────');
  for (const [month, data] of Object.entries(results.monthlyTrend.monthly)) {
    const flag = results.monthlyTrend.warnings.some(w => w.month === month) ? ' ⚠' : '';
    console.log(`   ${month}   ${String(data.count).padStart(4)}    ${formatYen(data.expense).padStart(12)}    ${formatYen(data.income).padStart(12)}${flag}`);
  }
  if (results.monthlyTrend.warnings.length > 0) {
    console.log(`\n   ⚠ 取引が極端に少ない月: ${results.monthlyTrend.warnings.map(w => w.month).join(', ')}（平均${results.monthlyTrend.warnings[0].avg}件）`);
    warnCount++;
    warnItems += results.monthlyTrend.warnings.length;
  } else {
    okCount++;
  }
  console.log('');

  // 6. 勘定科目別集計
  console.log('6. 勘定科目別集計...');
  const accountEntries = Object.entries(results.accountSummary)
    .sort((a, b) => (b[1].expense + b[1].income) - (a[1].expense + a[1].income));

  console.log('   勘定科目            支出          収入      件数');
  console.log('   ─────────────────────────────────────────────────');
  for (const [name, data] of accountEntries.slice(0, 15)) {
    const paddedName = (name + '                    ').substring(0, 20);
    console.log(`   ${paddedName} ${formatYen(data.expense).padStart(12)} ${formatYen(data.income).padStart(12)} ${String(data.count).padStart(6)}`);
  }
  if (accountEntries.length > 15) {
    console.log(`   ... 他${accountEntries.length - 15}科目`);
  }
  console.log('');
  okCount++;

  // 7. 試算表チェック
  console.log('7. 試算表チェック（PL整合）...');
  const tb = results.trialBalance;
  console.log(`   取引合計  - 収入: ${formatYen(tb.dealIncome)}  支出: ${formatYen(tb.dealExpense)}`);
  console.log(`   試算表PL  - 収入: ${formatYen(tb.plIncome)}  費用: ${formatYen(tb.plExpense)}`);

  if (tb.incomeDiff === 0 && tb.expenseDiff === 0) {
    console.log('   ✓ 取引合計と試算表が一致しています\n');
    okCount++;
  } else {
    if (tb.incomeDiff > 0) {
      console.log(`   ⚠ 収入差異: ${formatYen(tb.incomeDiff)}`);
    }
    if (tb.expenseDiff > 0) {
      console.log(`   ⚠ 費用差異: ${formatYen(tb.expenseDiff)}`);
    }
    console.log('   ※ 振替伝票・家事按分等の影響で差異が出る場合があります\n');
    warnCount++;
    warnItems += (tb.incomeDiff > 0 ? 1 : 0) + (tb.expenseDiff > 0 ? 1 : 0);
  }

  // サマリー
  console.log('========================================');
  console.log('  チェック結果サマリー');
  console.log('========================================');
  console.log(`✓ 問題なし: ${okCount}項目`);
  if (warnCount > 0) {
    console.log(`⚠ 要確認: ${warnCount}項目（合計${warnItems}件）`);
  }
  console.log('');

  return { okCount, warnCount, warnItems };
}

// ========================================
// Google Sheets出力
// ========================================

async function exportToSheets(spreadsheetId, fiscalYear, results) {
  const { authenticateGoogleSheets, createSheet, writeToSheet, formatHeader } = require('../utils/sheets_helper');

  console.log('Google Sheetsに出力中...');
  const { sheetsApi } = await authenticateGoogleSheets();

  const sheetTitle = `データ品質チェック_${fiscalYear}年度`;
  const sheetId = await createSheet(sheetsApi, spreadsheetId, sheetTitle);

  const rows = [];

  // サマリー
  rows.push(['【チェック結果サマリー】', '', '', '', '']);
  rows.push(['チェック項目', '結果', '件数', '', '']);
  rows.push(['未決済取引', results.unsettled.count > 0 ? '⚠ 要確認' : '✓ OK', results.unsettled.count, '', '']);
  rows.push(['摘要なし取引', results.noDescription.count > 0 ? '⚠ 要確認' : '✓ OK', results.noDescription.count, '', '']);
  rows.push(['取引先なし取引', results.noPartner.count > 0 ? '⚠ 要確認' : '✓ OK', results.noPartner.count, '', '']);
  rows.push(['重複疑い', results.duplicates.count > 0 ? '⚠ 要確認' : '✓ OK', results.duplicates.count, '', '']);
  rows.push(['月別推移', results.monthlyTrend.warnings.length > 0 ? '⚠ 要確認' : '✓ OK', results.monthlyTrend.warnings.length, '', '']);
  rows.push(['', '', '', '', '']);

  // 未決済取引一覧
  if (results.unsettled.count > 0) {
    rows.push(['【未決済取引一覧】', '', '', '', '']);
    rows.push(['日付', '勘定科目', '金額', '摘要', '']);
    for (const item of results.unsettled.items) {
      rows.push([item.date, item.account, item.amount, item.description, '']);
    }
    rows.push(['', '', '', '', '']);
  }

  // 摘要なし取引一覧
  if (results.noDescription.count > 0) {
    rows.push(['【摘要なし取引一覧】', '', '', '', '']);
    rows.push(['日付', '勘定科目', '金額', '取引ID', '']);
    for (const item of results.noDescription.items) {
      rows.push([item.date, item.account, item.amount, item.dealId, '']);
    }
    rows.push(['', '', '', '', '']);
  }

  // 取引先なし取引一覧
  if (results.noPartner.count > 0) {
    rows.push(['【取引先なし取引一覧】', '', '', '', '']);
    rows.push(['日付', '金額', '摘要', '取引ID', '']);
    for (const item of results.noPartner.items) {
      rows.push([item.date, item.amount, item.description, item.dealId, '']);
    }
    rows.push(['', '', '', '', '']);
  }

  // 重複疑い一覧
  if (results.duplicates.count > 0) {
    rows.push(['【重複疑い一覧】', '', '', '', '']);
    rows.push(['日付', '金額', '摘要', '取引ID群', '件数']);
    for (const group of results.duplicates.groups) {
      const first = group[0];
      rows.push([first.date, first.amount, first.description, group.map(g => g.dealId).join(', '), group.length]);
    }
    rows.push(['', '', '', '', '']);
  }

  // 月別推移
  rows.push(['【月別推移】', '', '', '', '']);
  rows.push(['月', '件数', '支出', '収入', '警告']);
  for (const [month, data] of Object.entries(results.monthlyTrend.monthly)) {
    const warn = results.monthlyTrend.warnings.some(w => w.month === month) ? '⚠ 少' : '';
    rows.push([month, data.count, data.expense, data.income, warn]);
  }
  rows.push(['', '', '', '', '']);

  // 勘定科目別集計
  rows.push(['【勘定科目別集計】', '', '', '', '']);
  rows.push(['勘定科目', '支出', '収入', '件数', '']);
  const accountEntries = Object.entries(results.accountSummary)
    .sort((a, b) => (b[1].expense + b[1].income) - (a[1].expense + a[1].income));
  for (const [name, data] of accountEntries) {
    rows.push([name, data.expense, data.income, data.count, '']);
  }
  rows.push(['', '', '', '', '']);

  // 試算表チェック
  rows.push(['【試算表チェック】', '', '', '', '']);
  const tb = results.trialBalance;
  rows.push(['', '収入', '支出/費用', '', '']);
  rows.push(['取引合計', tb.dealIncome, tb.dealExpense, '', '']);
  rows.push(['試算表PL', tb.plIncome, tb.plExpense, '', '']);
  rows.push(['差異', tb.incomeDiff, tb.expenseDiff, '', '']);

  const headers = ['項目/日付', '値1', '値2', '値3', '値4'];
  await writeToSheet(sheetsApi, spreadsheetId, sheetTitle, headers, rows);
  await formatHeader(sheetsApi, spreadsheetId, sheetId, headers.length);

  console.log(`   ✓ Sheets出力完了`);
  console.log(`   https://docs.google.com/spreadsheets/d/${spreadsheetId}\n`);
}

// ========================================
// メイン処理
// ========================================

async function main() {
  // 引数解析
  const args = process.argv.slice(2);
  let spreadsheetId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sheets' && args[i + 1]) {
      spreadsheetId = args[i + 1];
      i++;
    }
  }

  // 事業所の会計年度を取得
  const companyRes = await freeeApiRequest(`/api/1/companies/${companyId}`);
  const fiscalYears = companyRes.company.fiscal_years || [];
  if (fiscalYears.length === 0) {
    console.error('エラー: 会計年度情報が取得できません');
    process.exit(1);
  }
  const fy = fiscalYears[fiscalYears.length - 1];
  const startDate = fy.start_date;
  const endDate = fy.end_date;
  const fiscalYear = `${startDate} ～ ${endDate}`;

  console.log('========================================');
  console.log(`  確定申告データ品質チェック`);
  console.log('========================================\n');
  console.log(`会計年度: ${fiscalYear}\n`);

  // データ取得
  console.log('データ取得中...');
  const [deals, accountItems, partners, trialPl] = await Promise.all([
    fetchAllDeals(startDate, endDate).then(d => { console.log(`   ✓ 取引: ${d.length}件`); return d; }),
    fetchAccountItems().then(a => { console.log(`   ✓ 勘定科目: ${a.length}件`); return a; }),
    fetchPartners().then(p => { console.log(`   ✓ 取引先: ${p.length}件`); return p; }),
    fetchTrialPl(startDate, endDate).then(t => { console.log(`   ✓ 試算表取得完了`); return t; })
  ]);
  console.log('');

  // マッピング作成
  const accountMap = {};
  for (const item of accountItems) {
    accountMap[item.id] = item.name;
  }

  // チェック実行
  console.log('チェック実行中...\n');
  const results = {
    unsettled: checkUnsettledDeals(deals, accountMap),
    noDescription: checkNoDescription(deals, accountMap),
    noPartner: checkNoPartner(deals),
    duplicates: checkDuplicates(deals),
    monthlyTrend: checkMonthlyTrend(deals, startDate, endDate),
    accountSummary: aggregateByAccount(deals, accountMap),
    trialBalance: checkTrialBalance(deals, trialPl)
  };

  // コンソール出力
  printResults(fiscalYear, results);

  // Sheets出力（オプション）
  if (spreadsheetId) {
    await exportToSheets(spreadsheetId, fiscalYear, results);
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
