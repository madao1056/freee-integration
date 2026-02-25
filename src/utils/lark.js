// Lark 共通クライアント
// Bot通知・メッセージカード送信
const https = require('https');
require('dotenv').config();

/**
 * Lark tenant_access_token を取得
 * @returns {Promise<string>}
 */
async function getToken() {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('LARK_APP_ID / LARK_APP_SECRET が設定されていません。.envファイルを確認してください。');
  }

  const data = JSON.stringify({ app_id: appId, app_secret: appSecret });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.larksuite.com',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const result = JSON.parse(body);
        if (result.code === 0 && result.tenant_access_token) {
          resolve(result.tenant_access_token);
        } else {
          reject(new Error(`Lark token取得失敗: ${result.msg}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Lark APIリクエスト
 * @param {string} path - APIパス
 * @param {string} method - HTTPメソッド
 * @param {object} body - リクエストボディ
 * @returns {Promise<object>}
 */
async function larkApiRequest(path, method, body) {
  const token = await getToken();
  const postData = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.larksuite.com',
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = JSON.parse(data);
        if (result.code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Lark API Error ${result.code}: ${result.msg}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * テキストメッセージ送信
 * @param {string} chatId - チャットID
 * @param {string} text - メッセージ本文
 */
async function sendText(chatId, text) {
  return larkApiRequest(
    '/open-apis/im/v1/messages?receive_id_type=chat_id',
    'POST',
    { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) }
  );
}

/**
 * メールアドレス宛にテキストメッセージ送信
 * @param {string} email - メールアドレス
 * @param {string} text - メッセージ本文
 */
async function sendTextToEmail(email, text) {
  return larkApiRequest(
    '/open-apis/im/v1/messages?receive_id_type=email',
    'POST',
    { receive_id: email, msg_type: 'text', content: JSON.stringify({ text }) }
  );
}

/**
 * メッセージカード送信
 * @param {string} chatId - チャットID
 * @param {object} card - カードオブジェクト
 */
async function sendCard(chatId, card) {
  return larkApiRequest(
    '/open-apis/im/v1/messages?receive_id_type=chat_id',
    'POST',
    { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card) }
  );
}

/**
 * 仕訳提案カードを生成
 * @param {object} params
 * @param {string} params.date - 日付
 * @param {string} params.account - 勘定科目名
 * @param {number} params.amount - 金額
 * @param {string} params.description - 摘要
 * @param {string} [params.partner] - 取引先
 * @param {string} [params.dealId] - 取引ID
 * @param {string} [params.status] - ステータス（提案/登録済み/却下）
 */
function buildDealCard(params) {
  const { date, account, amount, description, partner, dealId, status } = params;

  const templateMap = {
    '提案': 'blue',
    '登録済み': 'green',
    '却下': 'red'
  };
  const headerStatus = status || '提案';
  const template = templateMap[headerStatus] || 'blue';

  const fields = [
    { is_short: true, text: { tag: 'lark_md', content: `**日付**\n${date}` } },
    { is_short: true, text: { tag: 'lark_md', content: `**金額**\n¥${amount.toLocaleString()}` } },
    { is_short: true, text: { tag: 'lark_md', content: `**勘定科目**\n${account}` } }
  ];

  if (partner) {
    fields.push({ is_short: true, text: { tag: 'lark_md', content: `**取引先**\n${partner}` } });
  }

  const elements = [
    { tag: 'div', fields }
  ];

  if (description) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**摘要**: ${description}` }
    });
  }

  if (dealId) {
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: `取引ID: ${dealId}` }]
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `📝 仕訳${headerStatus}` },
      template
    },
    elements
  };
}

/**
 * 仕訳提案を通知
 * @param {string} chatId - チャットID
 * @param {object} params - buildDealCardと同じパラメータ
 */
async function notifyDeal(chatId, params) {
  const card = buildDealCard(params);
  return sendCard(chatId, card);
}

/**
 * サマリーカードを生成・送信（複数件まとめて通知）
 * @param {string} chatId
 * @param {string} title - カードタイトル
 * @param {string[]} lines - 本文行
 */
async function notifySummary(chatId, title, lines) {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'blue'
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } }
    ]
  };
  return sendCard(chatId, card);
}

module.exports = {
  getToken,
  larkApiRequest,
  sendText,
  sendTextToEmail,
  sendCard,
  buildDealCard,
  notifyDeal,
  notifySummary
};
