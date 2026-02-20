// Google Sheets 共通ヘルパー
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./freee_api');

/**
 * Google Sheets APIを認証して返す
 * @returns {Promise<{ auth: GoogleAuth, sheetsApi: sheets_v4.Sheets }>}
 */
async function authenticateGoogleSheets() {
  const config = getConfig();
  const keyFilePath = path.resolve(config.serviceAccountKeyFile);

  if (!fs.existsSync(keyFilePath)) {
    throw new Error(`サービスアカウントキーファイルが見つかりません: ${keyFilePath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheetsApi = google.sheets({ version: 'v4', auth });
  return { auth, sheetsApi };
}

/**
 * シートを新規作成（既存なら削除して再作成）
 * @param {object} sheetsApi - Google Sheets APIインスタンス
 * @param {string} spreadsheetId
 * @param {string} sheetTitle
 * @returns {Promise<number>} シートID
 */
async function createSheet(sheetsApi, spreadsheetId, sheetTitle) {
  const spreadsheet = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const existingSheet = spreadsheet.data.sheets.find(
    s => s.properties.title === sheetTitle
  );

  if (existingSheet) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteSheet: { sheetId: existingSheet.properties.sheetId }
        }]
      }
    });
  }

  const res = await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        addSheet: {
          properties: { title: sheetTitle }
        }
      }]
    }
  });

  return res.data.replies[0].addSheet.properties.sheetId;
}

/**
 * シートにデータを書き込み
 * @param {object} sheetsApi
 * @param {string} spreadsheetId
 * @param {string} sheetTitle
 * @param {string[]} headers
 * @param {any[][]} rows
 * @returns {Promise<number>} データ行数
 */
async function writeToSheet(sheetsApi, spreadsheetId, sheetTitle, headers, rows) {
  const values = [headers, ...rows];

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values }
  });

  return values.length - 1;
}

/**
 * ヘッダー行をフォーマット（青背景・白太字・行固定）
 * @param {object} sheetsApi
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @param {number} columnCount
 */
async function formatHeader(sheetsApi, spreadsheetId, sheetId, columnCount) {
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: columnCount
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.46, blue: 0.85 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        }
      ]
    }
  });
}

module.exports = {
  authenticateGoogleSheets,
  createSheet,
  writeToSheet,
  formatHeader
};
