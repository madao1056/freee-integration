// freee API - 勘定科目一覧の取得と整理
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { freeeApiRequest, getConfig } = require('../utils/freee_api');

const config = getConfig();
const COMPANY_ID = config.freeeCompanyId;

// 勘定科目を取得して整理
async function getAccountItems() {
  try {
    console.log('勘定科目を取得中...\n');

    const response = await freeeApiRequest(`/api/1/account_items?company_id=${COMPANY_ID}`);

    if (!response.account_items) {
      throw new Error('勘定科目の取得に失敗しました');
    }

    const items = response.account_items;
    console.log(`取得勘定科目数: ${items.length}件\n`);

    // カテゴリ別に分類
    const categories = {
      '資産': [],
      '負債': [],
      '純資産': [],
      '収益': [],
      '費用': [],
      'その他': []
    };

    // 主要な勘定科目のマッピング
    const majorAccounts = {
      '流動資産': [],
      '固定資産': [],
      '流動負債': [],
      '固定負債': [],
      '売上高': [],
      '売上原価': [],
      '販売費及び一般管理費': [],
      '営業外収益': [],
      '営業外費用': []
    };

    items.forEach(item => {
      const categoryName = item.account_category || 'その他';
      if (categoryName.includes('資産')) {
        categories['資産'].push(item);
        if (item.name.includes('現金') || item.name.includes('預金') || item.name.includes('売掛')) {
          majorAccounts['流動資産'].push(item);
        } else if (item.name.includes('建物') || item.name.includes('土地') || item.name.includes('備品')) {
          majorAccounts['固定資産'].push(item);
        }
      } else if (categoryName.includes('負債')) {
        categories['負債'].push(item);
        if (item.name.includes('買掛') || item.name.includes('未払')) {
          majorAccounts['流動負債'].push(item);
        } else if (item.name.includes('長期')) {
          majorAccounts['固定負債'].push(item);
        }
      } else if (categoryName.includes('純資産') || categoryName.includes('資本')) {
        categories['純資産'].push(item);
      } else if (categoryName.includes('収益') || categoryName.includes('売上')) {
        categories['収益'].push(item);
        if (item.name.includes('売上')) {
          majorAccounts['売上高'].push(item);
        }
      } else if (categoryName.includes('費用') || categoryName.includes('経費')) {
        categories['費用'].push(item);
        if (item.name.includes('仕入') || item.name.includes('原価')) {
          majorAccounts['売上原価'].push(item);
        } else if (item.name.includes('給料') || item.name.includes('地代') || item.name.includes('広告')) {
          majorAccounts['販売費及び一般管理費'].push(item);
        }
      } else {
        categories['その他'].push(item);
      }
    });

    // 結果を表示
    console.log('===== 勘定科目カテゴリ別一覧 =====\n');

    Object.entries(categories).forEach(([category, catItems]) => {
      if (catItems.length > 0) {
        console.log(`【${category}】 (${catItems.length}件)`);
        catItems.slice(0, 10).forEach(item => {
          const taxInfo = item.tax_name ? ` [${item.tax_name}]` : '';
          console.log(`  - ${item.name} (ID: ${item.id})${taxInfo}`);
        });
        if (catItems.length > 10) {
          console.log(`  ... 他${catItems.length - 10}件`);
        }
        console.log('');
      }
    });

    // よく使う勘定科目
    console.log('===== よく使う勘定科目 =====\n');

    const commonAccounts = [
      { name: '現金', items: items.filter(i => i.name.includes('現金')) },
      { name: '普通預金', items: items.filter(i => i.name.includes('普通預金')) },
      { name: '売掛金', items: items.filter(i => i.name === '売掛金') },
      { name: '買掛金', items: items.filter(i => i.name === '買掛金') },
      { name: '売上高', items: items.filter(i => i.name === '売上高') },
      { name: '仕入高', items: items.filter(i => i.name.includes('仕入')) },
      { name: '給料', items: items.filter(i => i.name.includes('給料')) },
      { name: '消耗品費', items: items.filter(i => i.name.includes('消耗品')) },
      { name: '通信費', items: items.filter(i => i.name.includes('通信費')) },
      { name: '交通費', items: items.filter(i => i.name.includes('旅費交通費') || i.name.includes('交通費')) },
      { name: '会議費', items: items.filter(i => i.name.includes('会議費')) },
      { name: '接待交際費', items: items.filter(i => i.name.includes('接待交際費')) },
      { name: '広告宣伝費', items: items.filter(i => i.name.includes('広告')) },
      { name: '支払手数料', items: items.filter(i => i.name.includes('支払手数料')) },
      { name: '地代家賃', items: items.filter(i => i.name.includes('地代家賃')) },
      { name: '水道光熱費', items: items.filter(i => i.name.includes('水道光熱費')) }
    ];

    commonAccounts.forEach(({ name, items: commonItems }) => {
      if (commonItems.length > 0) {
        commonItems.forEach(item => {
          const shortcut = item.shortcut ? ` (${item.shortcut})` : '';
          console.log(`${name}: ID=${item.id}${shortcut}`);
        });
      }
    });

    // JSONファイルに保存
    const output = {
      timestamp: new Date().toISOString(),
      company_id: COMPANY_ID,
      total_count: items.length,
      categories: Object.entries(categories).reduce((acc, [key, catItems]) => {
        acc[key] = catItems.map(item => ({
          id: item.id,
          name: item.name,
          shortcut: item.shortcut,
          tax_name: item.tax_name,
          account_category: item.account_category,
          account_category_id: item.account_category_id
        }));
        return acc;
      }, {}),
      common_accounts: commonAccounts.reduce((acc, { name, items: commonItems }) => {
        if (commonItems.length > 0) {
          acc[name] = commonItems.map(item => ({
            id: item.id,
            name: item.name,
            shortcut: item.shortcut
          }));
        }
        return acc;
      }, {})
    };

    const outputPath = path.resolve(process.cwd(), 'account_items.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

    console.log('\n\n勘定科目一覧をaccount_items.jsonに保存しました');

    return output;

  } catch (error) {
    console.error('エラー:', error.message);
    throw error;
  }
}

// 実行
getAccountItems();
