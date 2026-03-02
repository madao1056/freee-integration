// freee API - 事業所情報の取得
require('dotenv').config({ quiet: true });
const { freeeApiRequest } = require('../utils/freee_api');

// 事業所一覧を取得
async function getCompanies() {
  const response = await freeeApiRequest('/api/1/companies');

  console.log('===== 事業所一覧 =====');
  console.log(`取得件数: ${response.companies.length}件\n`);

  response.companies.forEach((company, index) => {
    console.log(`【事業所 ${index + 1}】`);
    console.log(`  ID: ${company.id}`);
    console.log(`  事業所名: ${company.display_name}`);
    console.log(`  役割: ${company.role}`);

    if (company.name) {
      console.log(`  正式名称: ${company.name}`);
    }
    if (company.name_kana) {
      console.log(`  カナ名称: ${company.name_kana}`);
    }
    if (company.phone1) {
      console.log(`  電話番号: ${company.phone1}`);
    }
    if (company.zipcode) {
      console.log(`  郵便番号: ${company.zipcode}`);
    }
    if (company.prefecture_name) {
      console.log(`  都道府県: ${company.prefecture_name}`);
    }
    if (company.street_name1) {
      console.log(`  住所: ${company.street_name1} ${company.street_name2 || ''}`);
    }
    console.log('');
  });

  return response;
}

// 特定の事業所の詳細情報を取得
async function getCompanyDetails(companyId) {
  const response = await freeeApiRequest(`/api/1/companies/${companyId}`);

  console.log(`===== 事業所詳細情報 (ID: ${companyId}) =====`);
  const company = response.company;

  console.log('【基本情報】');
  console.log(`  事業所名: ${company.display_name}`);
  console.log(`  役割: ${company.role}`);

  console.log('\n【会計期間】');
  console.log(`  会計期間: ${company.fiscal_years[0]?.start_date} 〜 ${company.fiscal_years[0]?.end_date}`);
  console.log(`  年度の表示形式: ${company.fiscal_years[0]?.display_name}`);

  console.log('\n【設定情報】');
  console.log(`  業種: ${company.industry_name || '未設定'}`);
  console.log(`  従業員数: ${company.head_count || '未設定'}`);
  console.log(`  法人番号: ${company.corporate_number || '未設定'}`);

  console.log('\n【機能設定】');
  console.log(`  仕訳番号形式: ${company.txn_number_format || '未設定'}`);
  console.log(`  消費税計算方法: ${company.amount_fraction || '未設定'}`);

  return response;
}

// 実行
async function main() {
  try {
    console.log('freee API - 事業所情報取得\n');
    console.log('アクセストークンを使用して事業所情報を取得します...\n');

    const companiesResponse = await getCompanies();

    if (companiesResponse.companies && companiesResponse.companies.length > 0) {
      const firstCompanyId = companiesResponse.companies[0].id;
      console.log('\n詳細情報を取得中...\n');
      await getCompanyDetails(firstCompanyId);
    }

  } catch (error) {
    console.error('実行エラー:', error.message);
    process.exit(1);
  }
}

main();
