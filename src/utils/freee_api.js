// freee API 共通クライアント
// 全スクリプト共通のAPIリクエスト関数 + トークン自動更新
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 共通設定を取得
 * @returns {{ freeeToken: string, freeeCompanyId: number, spreadsheetId: string, serviceAccountKeyFile: string, driveRootFolderId: string }}
 */
function getConfig() {
  return {
    freeeToken: process.env.FREEE_ACCESS_TOKEN,
    freeeCompanyId: parseInt(process.env.FREEE_COMPANY_ID || '12324013'),
    spreadsheetId: process.env.SPREADSHEET_ID,
    serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account-key.json',
    driveRootFolderId: process.env.DRIVE_ROOT_FOLDER_ID || '1olrlaaCZaz1goFyHBd02Setd12xOZ5qM'
  };
}

/**
 * .envファイルのトークンを更新
 * @param {string} newAccessToken
 * @param {string} newRefreshToken
 */
function updateEnvTokens(newAccessToken, newRefreshToken) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /FREEE_ACCESS_TOKEN=.*/,
    `FREEE_ACCESS_TOKEN=${newAccessToken}`
  );
  if (newRefreshToken) {
    envContent = envContent.replace(
      /FREEE_REFRESH_TOKEN=.*/,
      `FREEE_REFRESH_TOKEN=${newRefreshToken}`
    );
  }
  fs.writeFileSync(envPath, envContent);

  // プロセス内の環境変数も更新
  process.env.FREEE_ACCESS_TOKEN = newAccessToken;
  if (newRefreshToken) {
    process.env.FREEE_REFRESH_TOKEN = newRefreshToken;
  }
}

/**
 * トークンをリフレッシュ
 * @returns {Promise<string>} 新しいアクセストークン
 */
function refreshToken() {
  return new Promise((resolve, reject) => {
    const clientId = process.env.FREEE_CLIENT_ID;
    const clientSecret = process.env.FREEE_CLIENT_SECRET;
    const refreshTokenValue = process.env.FREEE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshTokenValue) {
      reject(new Error('トークンリフレッシュに必要な環境変数が設定されていません（FREEE_CLIENT_ID, FREEE_CLIENT_SECRET, FREEE_REFRESH_TOKEN）'));
      return;
    }

    const postData = JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue
    });

    const options = {
      hostname: 'accounts.secure.freee.co.jp',
      path: '/public_api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.access_token) {
            console.log('   ✓ トークンを自動更新しました');
            updateEnvTokens(response.access_token, response.refresh_token);
            resolve(response.access_token);
          } else {
            reject(new Error(`トークンリフレッシュ失敗 ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * freee APIリクエスト（JSON）
 * 401エラー時にトークン自動リフレッシュしてリトライ
 * @param {string} apiPath - APIパス（例: /api/1/deals）
 * @param {string} [method='GET'] - HTTPメソッド
 * @param {object|null} [data=null] - リクエストボディ
 * @returns {Promise<object>}
 */
function freeeApiRequest(apiPath, method = 'GET', data = null) {
  return _doRequest(apiPath, method, data, false);
}

/**
 * freee APIアップロード（multipart/form-data）
 * @param {string} apiPath - APIパス（例: /api/1/receipts）
 * @param {FormData} formData - form-dataインスタンス
 * @returns {Promise<object>}
 */
function freeeApiUpload(apiPath, formData) {
  return _doUpload(apiPath, formData, false);
}

/**
 * 内部: JSONリクエスト実行
 */
function _doRequest(apiPath, method, data, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('FREEE_ACCESS_TOKENが設定されていません。.envファイルを確認してください。'));
      return;
    }

    const options = {
      hostname: 'api.freee.co.jp',
      path: apiPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        // 401かつ未リトライならトークンリフレッシュしてリトライ
        if (res.statusCode === 401 && !isRetry) {
          try {
            await refreshToken();
            const result = await _doRequest(apiPath, method, data, true);
            resolve(result);
          } catch (refreshError) {
            reject(new Error(`認証エラー（トークンリフレッシュも失敗）: ${refreshError.message}`));
          }
          return;
        }

        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 内部: multipart/form-dataアップロード実行
 */
function _doUpload(apiPath, formData, isRetry) {
  return new Promise((resolve, reject) => {
    const token = process.env.FREEE_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('FREEE_ACCESS_TOKENが設定されていません。'));
      return;
    }

    const options = {
      hostname: 'api.freee.co.jp',
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', async () => {
        if (res.statusCode === 401 && !isRetry) {
          try {
            await refreshToken();
            const result = await _doUpload(apiPath, formData, true);
            resolve(result);
          } catch (refreshError) {
            reject(new Error(`認証エラー（トークンリフレッシュも失敗）: ${refreshError.message}`));
          }
          return;
        }

        try {
          const response = responseData ? JSON.parse(responseData) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`Upload Error ${res.statusCode}: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    formData.pipe(req);
  });
}

module.exports = {
  getConfig,
  freeeApiRequest,
  freeeApiUpload,
  refreshToken,
  updateEnvTokens
};
