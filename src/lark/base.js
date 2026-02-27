// Lark Base (Bitable) × freee 連携
// Base作成・テーブル管理・freeeデータ同期
const { larkApiRequest } = require('../utils/lark');
const { freeeApiRequest, getConfig } = require('../utils/freee_api');
const { loadConfig, saveConfig, getAppToken, getTableId } = require('./base_config');

// export_to_sheets.js から税区分マッピングを再利用
const TAX_CODE_NAMES = {
  0: '対象外', 2: '課税売上 10%', 6: '課税売上 8%（軽減）',
  21: '課対仕入 10%', 22: '課対仕入 8%（軽減）',
  23: '課税売上 10%（内税）', 24: '課税売上 8%（内税・軽減）',
  136: '課対仕入 10%（内税）', 189: '課対仕入 8%（内税・軽減）',
  1: '非課税売上', 3: '非課税仕入', 7: '不課税', 8: '輸出免税'
};

// テーブル定義
const TABLE_DEFINITIONS = {
  '取引一覧': [
    { field_name: 'freee_deal_id', type: 2 },   // Number
    { field_name: '日付', type: 5 },              // DateTime
    { field_name: '種別', type: 3, property: { options: [{ name: '収入' }, { name: '支出' }] } }, // SingleSelect
    { field_name: '取引先', type: 1 },             // Text
    { field_name: '勘定科目', type: 1 },           // Text
    { field_name: '金額', type: 2 },               // Number
    { field_name: '消費税', type: 2 },             // Number
    { field_name: '税区分', type: 1 },             // Text
    { field_name: '摘要', type: 1 },               // Text
    { field_name: 'ステータス', type: 3, property: { options: [{ name: '決済済' }, { name: '未決済' }] } }
  ],
  '口座明細': [
    { field_name: '日付', type: 5 },
    { field_name: '口座名', type: 1 },
    { field_name: '口座種別', type: 3, property: { options: [{ name: 'bank_account' }, { name: 'credit_card' }] } },
    { field_name: '金額', type: 2 },
    { field_name: '摘要', type: 1 },
    { field_name: 'freee連携', type: 3, property: { options: [{ name: '連携済' }, { name: '未連携' }] } },
    { field_name: 'freee_deal_id', type: 2 }
  ],
  '月次サマリー': [
    { field_name: '年月', type: 1 },
    { field_name: '収入合計', type: 2 },
    { field_name: '支出合計', type: 2 },
    { field_name: '差引', type: 2 },
    { field_name: '取引件数', type: 2 }
  ]
};

// ==================== 低レベルAPI ====================

/**
 * Lark Base（Bitable）を作成
 * @param {string} name - Base名
 * @returns {Promise<object>} { app_token, url }
 */
async function createBase(name) {
  const res = await larkApiRequest(
    '/open-apis/bitable/v1/apps',
    'POST',
    { name }
  );
  return res.data.app;
}

/**
 * テーブルを作成
 * @param {string} appToken - Base app_token
 * @param {string} name - テーブル名
 * @param {Array} fields - フィールド定義
 * @returns {Promise<string>} table_id
 */
async function createTable(appToken, name, fields) {
  const res = await larkApiRequest(
    `/open-apis/bitable/v1/apps/${appToken}/tables`,
    'POST',
    { table: { name, fields } }
  );
  return res.data.table_id;
}

/**
 * レコードをバッチ作成（500件/バッチ上限）
 * @param {string} appToken
 * @param {string} tableId
 * @param {Array<object>} records - { fields: { ... } } の配列
 * @returns {Promise<number>} 作成件数
 */
async function batchCreateRecords(appToken, tableId, records) {
  let created = 0;
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    await larkApiRequest(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
      'POST',
      { records: batch }
    );
    created += batch.length;
    if (i + 500 < records.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return created;
}

/**
 * レコード一覧を取得（ページネーション対応）
 * @param {string} appToken
 * @param {string} tableId
 * @param {string} [filter] - フィルタ式
 * @returns {Promise<Array>} レコード配列
 */
async function listRecords(appToken, tableId, filter) {
  const allRecords = [];
  let pageToken = null;

  while (true) {
    let url = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    if (filter) url += `&filter=${encodeURIComponent(filter)}`;
    if (pageToken) url += `&page_token=${pageToken}`;

    const res = await larkApiRequest(url, 'GET', {});
    const items = (res.data && res.data.items) || [];
    allRecords.push(...items);

    if (!res.data || !res.data.has_more) break;
    pageToken = res.data.page_token;
  }

  return allRecords;
}

// ==================== 高レベル関数 ====================

/**
 * Base初期化: Base作成 → 3テーブル作成 → 設定保存
 */
async function initBase() {
  console.log('Lark Base を作成中...');
  const app = await createBase('freee経費管理');
  console.log(`   ✓ Base作成: ${app.app_token}`);

  const tables = {};
  for (const [name, fields] of Object.entries(TABLE_DEFINITIONS)) {
    const tableId = await createTable(app.app_token, name, fields);
    tables[name] = tableId;
    console.log(`   ✓ テーブル「${name}」作成: ${tableId}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // デフォルトテーブル（Table1）を削除
  try {
    // テーブル一覧を取得してデフォルトテーブルを探す
    const listRes = await larkApiRequest(
      `/open-apis/bitable/v1/apps/${app.app_token}/tables`,
      'GET',
      {}
    );
    const defaultTable = (listRes.data.items || []).find(
      t => !Object.values(tables).includes(t.table_id)
    );
    if (defaultTable) {
      await larkApiRequest(
        `/open-apis/bitable/v1/apps/${app.app_token}/tables/${defaultTable.table_id}`,
        'DELETE',
        {}
      );
      console.log('   ✓ デフォルトテーブル削除');
    }
  } catch (e) {
    // 削除失敗は無視（デフォルトテーブルが無い場合もある）
  }

  saveConfig({
    app_token: app.app_token,
    url: app.url,
    tables,
    created_at: new Date().toISOString()
  });

  console.log(`\n   Base URL: ${app.url}`);
  return { app_token: app.app_token, url: app.url, tables };
}

/**
 * freee取引を同期
 */
async function syncDeals() {
  const appToken = getAppToken();
  const tableId = getTableId('取引一覧');
  if (!appToken || !tableId) throw new Error('Base未初期化。先に lark:base:init を実行してください');

  const cfg = getConfig();
  const companyId = cfg.freeeCompanyId;

  console.log('   取引データを取得中...');

  // freee取引を全件取得
  const allDeals = [];
  let offset = 0;
  while (true) {
    const res = await freeeApiRequest(
      `/api/1/deals?company_id=${companyId}&limit=100&offset=${offset}`
    );
    allDeals.push(...(res.deals || []));
    if ((res.deals || []).length < 100) break;
    offset += 100;
  }

  // 勘定科目・取引先マップ
  const [acctRes, partnerRes] = await Promise.all([
    freeeApiRequest(`/api/1/account_items?company_id=${companyId}`),
    freeeApiRequest(`/api/1/partners?company_id=${companyId}&limit=100`)
  ]);
  const acctMap = {};
  for (const a of acctRes.account_items) acctMap[a.id] = a.name;
  const partnerMap = {};
  for (const p of partnerRes.partners) partnerMap[p.id] = p.name;

  console.log(`   freee取引: ${allDeals.length}件`);

  // 既存レコードからfreee_deal_idのセットを取得
  const existingRecords = await listRecords(appToken, tableId);
  const existingDealIds = new Set();
  for (const r of existingRecords) {
    const id = r.fields && r.fields.freee_deal_id;
    if (id) existingDealIds.add(id);
  }
  console.log(`   既存レコード: ${existingDealIds.size}件`);

  // 新規レコードを構築
  const newRecords = [];
  for (const deal of allDeals) {
    const type = deal.type === 'income' ? '収入' : '支出';
    const status = deal.status === 'settled' ? '決済済' : '未決済';
    let partnerName = '';
    if (deal.partner_id && partnerMap[deal.partner_id]) {
      partnerName = partnerMap[deal.partner_id];
    }

    for (const detail of (deal.details || [])) {
      // deal.id + detail行番号でユニーク判定（1つのdealに複数detail）
      // ただしBase側はdeal_idのみ格納なので、deal_id自体で重複チェック
      if (existingDealIds.has(deal.id)) continue;

      newRecords.push({
        fields: {
          freee_deal_id: deal.id,
          '日付': deal.issue_date ? new Date(deal.issue_date).getTime() : null,
          '種別': type,
          '取引先': partnerName,
          '勘定科目': acctMap[detail.account_item_id] || String(detail.account_item_id),
          '金額': detail.amount,
          '消費税': detail.vat || 0,
          '税区分': TAX_CODE_NAMES[detail.tax_code] || String(detail.tax_code),
          '摘要': detail.description || '',
          'ステータス': status
        }
      });
    }
  }

  if (newRecords.length === 0) {
    console.log('   新規取引なし');
    return 0;
  }

  const created = await batchCreateRecords(appToken, tableId, newRecords);
  console.log(`   ✓ ${created}件の取引を同期`);
  return created;
}

/**
 * freee口座明細を同期
 */
async function syncWalletTxns() {
  const appToken = getAppToken();
  const tableId = getTableId('口座明細');
  if (!appToken || !tableId) throw new Error('Base未初期化。先に lark:base:init を実行してください');

  const cfg = getConfig();
  const companyId = cfg.freeeCompanyId;

  console.log('   口座明細を取得中...');

  // 口座一覧
  const wallets = await freeeApiRequest(`/api/1/walletables?company_id=${companyId}`);

  // 既存レコードの摘要+日付+金額セット（口座明細にはユニークIDが無いため）
  const existingRecords = await listRecords(appToken, tableId);
  const existingKeys = new Set();
  for (const r of existingRecords) {
    const f = r.fields || {};
    existingKeys.add(`${f['日付']}_${f['金額']}_${f['摘要']}`);
  }

  const newRecords = [];
  for (const w of (wallets.walletables || [])) {
    // ページネーション対応で口座明細を取得
    let offset = 0;
    while (true) {
      const txnRes = await freeeApiRequest(
        `/api/1/wallet_txns?company_id=${companyId}&walletable_id=${w.id}&walletable_type=${w.type}&limit=100&offset=${offset}`
      );
      const txns = txnRes.wallet_txns || [];

      for (const t of txns) {
        const dateMs = t.date ? new Date(t.date).getTime() : null;
        const key = `${dateMs}_${t.amount}_${t.description || ''}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        newRecords.push({
          fields: {
            '日付': dateMs,
            '口座名': w.name,
            '口座種別': w.type,
            '金額': t.amount,
            '摘要': t.description || '',
            'freee連携': t.deal_id ? '連携済' : '未連携',
            'freee_deal_id': t.deal_id || null
          }
        });
      }

      if (txns.length < 100) break;
      offset += 100;
    }
    // API制限考慮
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`   口座明細: ${newRecords.length}件の新規`);

  if (newRecords.length === 0) {
    console.log('   新規口座明細なし');
    return 0;
  }

  const created = await batchCreateRecords(appToken, tableId, newRecords);
  console.log(`   ✓ ${created}件の口座明細を同期`);
  return created;
}

/**
 * 月次サマリーを同期
 */
async function syncMonthlySummary() {
  const appToken = getAppToken();
  const tableId = getTableId('月次サマリー');
  if (!appToken || !tableId) throw new Error('Base未初期化。先に lark:base:init を実行してください');

  const cfg = getConfig();
  const companyId = cfg.freeeCompanyId;

  console.log('   月次サマリーを集計中...');

  // 取引を全件取得して月別集計
  const allDeals = [];
  let offset = 0;
  while (true) {
    const res = await freeeApiRequest(
      `/api/1/deals?company_id=${companyId}&limit=100&offset=${offset}`
    );
    allDeals.push(...(res.deals || []));
    if ((res.deals || []).length < 100) break;
    offset += 100;
  }

  // 月別集計
  const monthly = {};
  for (const deal of allDeals) {
    const ym = deal.issue_date ? deal.issue_date.substring(0, 7) : 'unknown';
    if (!monthly[ym]) monthly[ym] = { income: 0, expense: 0, count: 0 };

    const totalAmount = (deal.details || []).reduce((sum, d) => sum + (d.amount || 0), 0);
    if (deal.type === 'income') {
      monthly[ym].income += totalAmount;
    } else {
      monthly[ym].expense += totalAmount;
    }
    monthly[ym].count++;
  }

  // 既存レコードを全削除してから書き直す（サマリーは毎回上書き）
  const existingRecords = await listRecords(appToken, tableId);
  if (existingRecords.length > 0) {
    const recordIds = existingRecords.map(r => r.record_id);
    // 500件ずつバッチ削除
    for (let i = 0; i < recordIds.length; i += 500) {
      const batch = recordIds.slice(i, i + 500);
      await larkApiRequest(
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`,
        'POST',
        { records: batch }
      );
    }
  }

  // 新規レコード作成
  const records = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, data]) => ({
      fields: {
        '年月': ym,
        '収入合計': data.income,
        '支出合計': data.expense,
        '差引': data.income - data.expense,
        '取引件数': data.count
      }
    }));

  if (records.length === 0) {
    console.log('   集計対象なし');
    return 0;
  }

  const created = await batchCreateRecords(appToken, tableId, records);
  console.log(`   ✓ ${created}件の月次サマリーを同期`);
  return created;
}

/**
 * 同期状況を表示
 */
async function showStatus() {
  const config = loadConfig();
  if (!config.app_token) {
    console.log('Base未初期化。先に lark:base:init を実行してください');
    return;
  }

  console.log(`Base: ${config.url || config.app_token}`);
  console.log(`作成日: ${config.created_at || '不明'}\n`);

  for (const [name, tableId] of Object.entries(config.tables || {})) {
    try {
      const records = await listRecords(config.app_token, tableId);
      console.log(`   ${name}: ${records.length}件`);
    } catch (e) {
      console.log(`   ${name}: 取得エラー (${e.message})`);
    }
  }
}

module.exports = {
  createBase,
  createTable,
  batchCreateRecords,
  listRecords,
  initBase,
  syncDeals,
  syncWalletTxns,
  syncMonthlySummary,
  showStatus
};
