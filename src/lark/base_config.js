// Lark Base 設定管理
// .lark_base_config.json にBase app_tokenとtable_idを保存
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(process.cwd(), '.lark_base_config.json');

/**
 * 設定ファイルを読み込む
 * @returns {object} 設定オブジェクト
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * 設定ファイルに保存
 * @param {object} config - 設定オブジェクト
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Base app_token を取得
 * @returns {string|null}
 */
function getAppToken() {
  const config = loadConfig();
  return config.app_token || null;
}

/**
 * テーブルIDを名前で取得
 * @param {string} name - テーブル名
 * @returns {string|null}
 */
function getTableId(name) {
  const config = loadConfig();
  const tables = config.tables || {};
  return tables[name] || null;
}

module.exports = { loadConfig, saveConfig, getAppToken, getTableId };
