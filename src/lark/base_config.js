// Lark Base 設定管理
// .lark_base_config.{profile}.json にBase app_tokenとtable_idを保存
const fs = require('fs');
const path = require('path');
const { getCurrentProfile } = require('../utils/freee_api');

/**
 * プロファイル対応の設定ファイルパスを返す
 * @returns {string}
 */
function getConfigPath() {
  const profile = getCurrentProfile();
  const fileName = profile
    ? `.lark_base_config.${profile}.json`
    : '.lark_base_config.json';
  return path.resolve(process.cwd(), fileName);
}

/**
 * 設定ファイルを読み込む
 * @returns {object} 設定オブジェクト
 */
function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * 設定ファイルに保存
 * @param {object} config - 設定オブジェクト
 */
function saveConfig(config) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
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
