// freee API 動作確認テストスクリプト
const fs = require('fs');
require('dotenv').config({ quiet: true });
const { freeeApiRequest } = require('../utils/freee_api');

// テスト結果を記録
const testResults = {
  timestamp: new Date().toISOString(),
  tests: []
};

// テスト1: 事業所一覧を取得（GET）
async function testGetCompanies() {
  console.log('\n===== TEST 1: 事業所一覧取得 (GET) =====');
  try {
    const response = await freeeApiRequest('/api/1/companies');
    console.log(`ステータス: 200 OK`);

    const result = {
      testName: '事業所一覧取得',
      method: 'GET',
      endpoint: '/api/1/companies',
      status: 200,
      success: true
    };

    if (response?.companies) {
      console.log(`取得事業所数: ${response.companies.length}`);
      result.companiesCount = response.companies.length;

      if (response.companies.length > 0) {
        const company = response.companies[0];
        console.log(`最初の事業所: ${company.display_name} (ID: ${company.id})`);
        result.firstCompany = {
          id: company.id,
          name: company.display_name,
          role: company.role
        };
        testResults.tests.push(result);
        return company.id;
      }
    }

    testResults.tests.push(result);
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: '事業所一覧取得',
      method: 'GET',
      endpoint: '/api/1/companies',
      success: false,
      error: error.message
    });
  }
  return null;
}

// テスト2: 取引先一覧を取得（GET）
async function testGetPartners(companyId) {
  console.log('\n===== TEST 2: 取引先一覧取得 (GET) =====');
  if (!companyId) {
    console.log('スキップ: 事業所IDが取得できませんでした');
    return null;
  }

  try {
    const response = await freeeApiRequest(`/api/1/partners?company_id=${companyId}&limit=3`);
    console.log(`ステータス: 200 OK`);

    const result = {
      testName: '取引先一覧取得',
      method: 'GET',
      endpoint: '/api/1/partners',
      status: 200,
      success: true
    };

    if (response?.partners) {
      console.log(`取得取引先数: ${response.partners.length}`);
      result.partnersCount = response.partners.length;

      if (response.partners.length > 0) {
        console.log(`最初の取引先: ${response.partners[0].name}`);
      }
    }

    testResults.tests.push(result);
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: '取引先一覧取得',
      method: 'GET',
      endpoint: '/api/1/partners',
      success: false,
      error: error.message
    });
  }
}

// テスト3: メモタグを作成（POST）
async function testCreateTag(companyId) {
  console.log('\n===== TEST 3: メモタグ作成 (POST) =====');
  if (!companyId) {
    console.log('スキップ: 事業所IDが取得できませんでした');
    return null;
  }

  const tagData = {
    company_id: companyId,
    name: `テストタグ_${Date.now()}`
  };

  try {
    const response = await freeeApiRequest('/api/1/tags', 'POST', tagData);
    console.log(`ステータス: 201 Created`);

    const result = {
      testName: 'メモタグ作成',
      method: 'POST',
      endpoint: '/api/1/tags',
      status: 201,
      success: true
    };

    if (response?.tag) {
      console.log(`作成成功: ${response.tag.name} (ID: ${response.tag.id})`);
      result.createdTag = {
        id: response.tag.id,
        name: response.tag.name
      };
      testResults.tests.push(result);
      return response.tag.id;
    }

    testResults.tests.push(result);
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: 'メモタグ作成',
      method: 'POST',
      endpoint: '/api/1/tags',
      success: false,
      error: error.message
    });
  }
  return null;
}

// テスト4: メモタグを更新（PUT）
async function testUpdateTag(tagId, companyId) {
  console.log('\n===== TEST 4: メモタグ更新 (PUT) =====');
  if (!tagId || !companyId) {
    console.log('スキップ: タグIDまたは事業所IDが取得できませんでした');
    return;
  }

  const updateData = {
    company_id: companyId,
    name: `更新済みタグ_${Date.now()}`
  };

  try {
    const response = await freeeApiRequest(`/api/1/tags/${tagId}`, 'PUT', updateData);
    console.log(`ステータス: 200 OK`);

    const result = {
      testName: 'メモタグ更新',
      method: 'PUT',
      endpoint: `/api/1/tags/${tagId}`,
      status: 200,
      success: true
    };

    if (response?.tag) {
      console.log(`更新成功: ${response.tag.name}`);
      result.updatedTag = {
        id: response.tag.id,
        name: response.tag.name
      };
    }

    testResults.tests.push(result);
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: 'メモタグ更新',
      method: 'PUT',
      endpoint: `/api/1/tags/${tagId}`,
      success: false,
      error: error.message
    });
  }
}

// テスト5: メモタグを削除（DELETE）
async function testDeleteTag(tagId, companyId) {
  console.log('\n===== TEST 5: メモタグ削除 (DELETE) =====');
  if (!tagId || !companyId) {
    console.log('スキップ: タグIDまたは事業所IDが取得できませんでした');
    return;
  }

  try {
    await freeeApiRequest(`/api/1/tags/${tagId}?company_id=${companyId}`, 'DELETE');
    console.log(`ステータス: 204 No Content`);
    console.log('削除成功');

    testResults.tests.push({
      testName: 'メモタグ削除',
      method: 'DELETE',
      endpoint: `/api/1/tags/${tagId}`,
      status: 204,
      success: true
    });
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: 'メモタグ削除',
      method: 'DELETE',
      endpoint: `/api/1/tags/${tagId}`,
      success: false,
      error: error.message
    });
  }
}

// テスト6: 勘定科目一覧を取得（GET）
async function testGetAccountItems(companyId) {
  console.log('\n===== TEST 6: 勘定科目一覧取得 (GET) =====');
  if (!companyId) {
    console.log('スキップ: 事業所IDが取得できませんでした');
    return;
  }

  try {
    const response = await freeeApiRequest(`/api/1/account_items?company_id=${companyId}&limit=5`);
    console.log(`ステータス: 200 OK`);

    const result = {
      testName: '勘定科目一覧取得',
      method: 'GET',
      endpoint: '/api/1/account_items',
      status: 200,
      success: true
    };

    if (response?.account_items) {
      console.log(`取得勘定科目数: ${response.account_items.length}`);
      result.accountItemsCount = response.account_items.length;
    }

    testResults.tests.push(result);
  } catch (error) {
    console.error('エラー:', error.message);
    testResults.tests.push({
      testName: '勘定科目一覧取得',
      method: 'GET',
      endpoint: '/api/1/account_items',
      success: false,
      error: error.message
    });
  }
}

// メイン処理
async function main() {
  console.log('========================================');
  console.log('   freee API 動作確認テスト');
  console.log('========================================');
  console.log(`実行時刻: ${new Date().toLocaleString('ja-JP')}`);

  try {
    const companyId = await testGetCompanies();

    if (companyId) {
      testResults.companyId = companyId;

      await testGetPartners(companyId);
      await testGetAccountItems(companyId);

      const tagId = await testCreateTag(companyId);
      if (tagId) {
        await testUpdateTag(tagId, companyId);
        await testDeleteTag(tagId, companyId);
      }
    }

    // テスト結果のサマリー
    console.log('\n========================================');
    console.log('   テスト結果サマリー');
    console.log('========================================');

    const successCount = testResults.tests.filter(t => t.success).length;
    const totalCount = testResults.tests.length;

    console.log(`実行テスト数: ${totalCount}`);
    console.log(`成功: ${successCount}`);
    console.log(`失敗: ${totalCount - successCount}`);
    console.log('');

    testResults.tests.forEach((test, index) => {
      const status = test.success ? '✓' : '✗';
      console.log(`${status} ${index + 1}. ${test.testName} (${test.method}) - ${test.status || 'ERROR'}`);
    });

    // 結果をJSONファイルに保存
    const path = require('path');
    const outputPath = path.resolve(process.cwd(), 'test_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(testResults, null, 2));

    console.log('\nテスト結果をtest_results.jsonに保存しました');

  } catch (error) {
    console.error('テスト実行エラー:', error);
  }
}

// 実行
main();
