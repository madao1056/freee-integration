// --- Command definitions ---
const COMMAND_GROUPS = [
  {
    title: 'freee API',
    commands: [
      { label: 'APIテスト', cmd: 'api:test' },
      { label: '事業所情報', cmd: 'api:companies' },
      { label: '勘定科目一覧', cmd: 'api:accounts' },
      {
        label: '確定申告チェック',
        cmd: 'api:audit',
        args: [{ name: 'year', label: '年度 (例: 2025)', required: false }],
      },
    ],
  },
  {
    title: 'Sheets',
    commands: [
      {
        label: 'エクスポート',
        cmd: 'sheets:export',
        args: [{ name: 'spreadsheet-id', label: 'スプレッドシートID', required: true, fromEnv: 'SPREADSHEET_ID' }],
      },
      {
        label: 'インポート',
        cmd: 'sheets:import',
        args: [{ name: 'spreadsheet-id', label: 'スプレッドシートID', required: true, fromEnv: 'SPREADSHEET_ID' }],
      },
      {
        label: '月次レポート',
        cmd: 'sheets:report',
        args: [
          { name: 'spreadsheet-id', label: 'スプレッドシートID', required: true, fromEnv: 'SPREADSHEET_ID' },
          { name: 'month', label: '年月 (YYYY-MM)', required: false },
        ],
      },
      {
        label: '請求書連携',
        cmd: 'sheets:invoice',
        args: [
          { name: 'spreadsheet-id', label: 'スプレッドシートID', required: true, fromEnv: 'SPREADSHEET_ID' },
          { name: 'mode', label: 'モード (export / 空欄=import)', required: false },
        ],
      },
    ],
  },
  {
    title: 'Drive',
    commands: [
      { label: 'フォルダ確認', cmd: 'drive:check' },
      { label: 'レシートアップロード', action: 'form', formType: 'receipt' },
    ],
  },
  {
    title: 'Lark',
    commands: [
      { label: '接続テスト', cmd: 'lark:test' },
      { label: '未処理通知', cmd: 'lark:notify' },
      { label: 'Base初期化', cmd: 'lark:base:init' },
      { label: 'Base同期', cmd: 'lark:base:sync' },
      { label: 'Base状況', cmd: 'lark:base:status' },
    ],
  },
  {
    title: '書類作成',
    commands: [
      { label: '請求書作成', action: 'form', formType: 'invoice' },
      { label: '見積書作成', action: 'form', formType: 'quotation' },
    ],
  },
];

// --- State ---
let activeProfile = '';
let isRunning = false;

// --- Main terminal (Claude Code via PTY) ---
let term;
let fitAddon;

// --- Output panel (sidebar command results) ---
let outputTerm;
let outputFitAddon;
let outputPanelVisible = false;

// --- xterm theme (shared) ---
const XTERM_THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

// --- Main terminal setup (Claude Code PTY) ---
function initTerminal() {
  term = new Terminal({
    theme: XTERM_THEME,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    disableStdin: false,
    convertEol: false,
    scrollback: 10000,
  });

  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  // Send keyboard input to PTY
  term.onData((data) => {
    window.freeeApp.sendInput(data);
  });

  // Send resize to PTY
  term.onResize(({ cols, rows }) => {
    window.freeeApp.resizePty(cols, rows);
  });

  // Receive PTY output
  window.freeeApp.onPtyData((data) => {
    term.write(data);
  });

  // Fit on window resize
  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (outputPanelVisible && outputFitAddon) {
      outputFitAddon.fit();
    }
  });

  // Send initial size after a short delay (PTY needs it)
  setTimeout(() => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      window.freeeApp.resizePty(dims.cols, dims.rows);
    }
  }, 200);
}

// --- Output panel terminal (read-only, for sidebar commands) ---
function initOutputTerminal() {
  outputTerm = new Terminal({
    theme: { ...XTERM_THEME, background: '#181825' },
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 12,
    lineHeight: 1.3,
    cursorBlink: false,
    disableStdin: true,
    convertEol: true,
    scrollback: 5000,
  });

  outputFitAddon = new FitAddon.FitAddon();
  outputTerm.loadAddon(outputFitAddon);
  outputTerm.open(document.getElementById('outputTerminal'));
}

function showOutputPanel(title) {
  const panel = document.getElementById('outputPanel');
  panel.classList.add('open');
  document.getElementById('outputPanelTitle').textContent = title || 'コマンド出力';
  outputPanelVisible = true;

  if (!outputTerm) {
    initOutputTerminal();
  }
  outputTerm.clear();

  // Refit both terminals after layout change
  setTimeout(() => {
    fitAddon.fit();
    outputFitAddon.fit();
  }, 50);
}

function hideOutputPanel() {
  const panel = document.getElementById('outputPanel');
  panel.classList.remove('open');
  outputPanelVisible = false;
  document.getElementById('outputStopBtn').style.display = 'none';

  // Refit main terminal after layout change
  setTimeout(() => fitAddon.fit(), 50);
}

// --- Profile switcher ---
const PROFILE_LABELS = {
  bond: '法人',
  personal: '個人',
};

async function initProfiles() {
  const { profiles, defaultProfile } = await window.freeeApp.getProfiles();
  activeProfile = defaultProfile || profiles[0] || '';

  const container = document.getElementById('profileSwitcher');
  container.innerHTML = '';

  profiles.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = `profile-btn ${p === activeProfile ? 'active' : ''}`;
    btn.textContent = PROFILE_LABELS[p] || p;
    btn.addEventListener('click', () => {
      if (p === activeProfile) return;
      const formOpen = document.getElementById('invoiceForm').style.display !== 'none'
        || document.getElementById('quotationSelect').style.display !== 'none'
        || document.getElementById('receiptUpload').style.display !== 'none';

      if (formOpen) {
        showProfileSwitchConfirm(p, btn, container);
      } else {
        switchProfile(p, btn, container);
      }
    });
    container.appendChild(btn);
  });

  document.getElementById('statusProfile').textContent = PROFILE_LABELS[activeProfile] || activeProfile;
}

function switchProfile(p, btn, container) {
  activeProfile = p;
  partnersCache = null;
  container.querySelectorAll('.profile-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('statusProfile').textContent = PROFILE_LABELS[p] || p;

  // 開いているフォームを閉じてターミナルに戻す
  document.getElementById('invoiceForm').style.display = 'none';
  document.getElementById('quotationSelect').style.display = 'none';
  document.getElementById('receiptUpload').style.display = 'none';
  document.querySelector('.terminal-wrapper').style.display = 'flex';
  setTimeout(() => fitAddon.fit(), 50);
}

function showProfileSwitchConfirm(p, btn, container) {
  const targetLabel = PROFILE_LABELS[p] || p;
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const fields = document.getElementById('modalFields');
  const runBtn = document.getElementById('modalRun');
  const cancelBtn = document.getElementById('modalCancel');

  title.textContent = 'プロファイル切り替え';
  fields.innerHTML = `<p style="font-size:13px;color:var(--text-dim);line-height:1.6;">
    現在の編集内容は破棄されます。<br><strong>${targetLabel}</strong>に切り替えますか？</p>`;

  // 一時的にモーダルの実行ボタンを差し替え
  runBtn.textContent = '切り替える';
  overlay.classList.add('visible');

  const onRun = () => {
    cleanup();
    hideModal();
    switchProfile(p, btn, container);
  };
  const onCancel = () => {
    cleanup();
    hideModal();
  };
  const cleanup = () => {
    runBtn.removeEventListener('click', onRun);
    cancelBtn.removeEventListener('click', onCancel);
    runBtn.textContent = '実行';
  };

  runBtn.addEventListener('click', onRun);
  cancelBtn.addEventListener('click', onCancel);
}

// --- Sidebar ---
function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';

  COMMAND_GROUPS.forEach((group) => {
    const grp = document.createElement('div');
    grp.className = 'sidebar-group';

    const title = document.createElement('div');
    title.className = 'sidebar-group-title';
    title.textContent = group.title;
    grp.appendChild(title);

    group.commands.forEach((cmd) => {
      const btn = document.createElement('button');
      btn.className = 'cmd-btn';
      btn.textContent = cmd.label;
      if (cmd.cmd) btn.dataset.cmd = cmd.cmd;
      btn.addEventListener('click', () => {
        if (cmd.action === 'form') {
          if (cmd.formType === 'invoice') {
            showQuotationSelect();
          } else if (cmd.formType === 'receipt') {
            showReceiptUpload();
          } else {
            showInvoiceForm(cmd.formType);
          }
        } else {
          handleCommand(cmd);
        }
      });
      grp.appendChild(btn);
    });

    sidebar.appendChild(grp);
  });
}

// --- Command execution (sidebar → bottom panel) ---
async function handleCommand(cmd) {
  if (isRunning) return;

  if (cmd.args && cmd.args.length > 0) {
    showModal(cmd);
  } else {
    executeCommand(cmd.cmd, [], cmd.label);
  }
}

let outputBuffer = '';

async function executeCommand(command, args, label) {
  if (isRunning) return;
  setRunning(true);
  outputBuffer = '';
  hideFileToast();

  // Highlight active button
  document.querySelectorAll('.cmd-btn').forEach((b) => {
    b.classList.toggle('running', b.dataset.cmd === command);
  });

  const cmdLine = `node src/main.js ${command} ${args.join(' ')} ${activeProfile ? `--profile ${activeProfile}` : ''}`.trim();

  // Show output panel
  showOutputPanel(label || command);
  document.getElementById('outputStopBtn').style.display = 'block';
  outputTerm.writeln(`\x1b[34m$ ${cmdLine}\x1b[0m\n`);

  await window.freeeApp.runCommand(command, args, activeProfile);
}

function setRunning(running) {
  isRunning = running;
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  dot.className = `status-indicator ${running ? 'running' : ''}`;
  text.textContent = running ? '実行中...' : '待機中';
}

// --- File detection & preview ---
let detectedFile = null;

const FILE_PATTERN = /([\w./-]+\.(json|csv|txt|log))/;
const SAVE_KEYWORDS = ['保存しました', '保存:', '出力しました', '書き込みました', 'saved', 'written'];

function detectFileInOutput(text) {
  const match = text.match(FILE_PATTERN);
  if (!match) return null;
  const filename = match[1];
  const hasSaveKeyword = SAVE_KEYWORDS.some((kw) => text.includes(kw));
  if (hasSaveKeyword) return filename;
  return null;
}

function showFileToast(filename) {
  detectedFile = filename;
  const toast = document.getElementById('fileToast');
  document.getElementById('fileToastText').textContent = `${filename} に保存されました`;
  toast.classList.add('visible');
}

function hideFileToast() {
  document.getElementById('fileToast').classList.remove('visible');
  detectedFile = null;
}

function highlightJson(json) {
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:/g,
    '<span class="json-key">$1</span>:'
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g,
    ': <span class="json-string">$1</span>'
  ).replace(
    /:\s*(\d+(?:\.\d+)?)/g,
    ': <span class="json-number">$1</span>'
  ).replace(
    /:\s*(true|false)/g,
    ': <span class="json-bool">$1</span>'
  ).replace(
    /:\s*(null)/g,
    ': <span class="json-null">$1</span>'
  );
}

async function openPreview(filename) {
  const result = await window.freeeApp.readFile(filename);
  if (result.error) {
    if (outputTerm) {
      outputTerm.writeln(`\x1b[31mプレビューエラー: ${result.error}\x1b[0m`);
    }
    return;
  }

  const panel = document.getElementById('previewPanel');
  const nameEl = document.getElementById('previewFilename');
  const contentEl = document.getElementById('previewContent');

  nameEl.textContent = filename;

  if (filename.endsWith('.json')) {
    try {
      const formatted = JSON.stringify(JSON.parse(result.content), null, 2);
      contentEl.innerHTML = highlightJson(escapeHtml(formatted));
    } catch {
      contentEl.textContent = result.content;
    }
  } else {
    contentEl.textContent = result.content;
  }

  panel.classList.add('open');
  fitAddon.fit();
}

function closePreview() {
  document.getElementById('previewPanel').classList.remove('open');
  setTimeout(() => fitAddon.fit(), 220);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('fileToastBtn').addEventListener('click', () => {
  if (detectedFile) openPreview(detectedFile);
});
document.getElementById('fileToastDismiss').addEventListener('click', hideFileToast);
document.getElementById('previewClose').addEventListener('click', closePreview);

// --- Output panel data handling (sidebar commands) ---
window.freeeApp.onTerminalData((data) => {
  if (outputTerm) {
    outputTerm.write(data);
  }
  outputBuffer += data;
});

window.freeeApp.onCommandDone((code) => {
  if (outputTerm) {
    if (code !== 0) {
      outputTerm.writeln(`\n\x1b[31m終了コード: ${code}\x1b[0m`);
    } else {
      outputTerm.writeln('\n\x1b[32m完了\x1b[0m');
    }
  }
  setRunning(false);
  document.getElementById('outputStopBtn').style.display = 'none';
  document.querySelectorAll('.cmd-btn.running').forEach((b) => b.classList.remove('running'));

  // Check output for saved files
  const lines = outputBuffer.split('\n');
  for (const line of lines) {
    const file = detectFileInOutput(line);
    if (file) {
      showFileToast(file);
      break;
    }
  }
  outputBuffer = '';
});

// --- Output panel controls ---
document.getElementById('outputCloseBtn').addEventListener('click', hideOutputPanel);
document.getElementById('outputStopBtn').addEventListener('click', async () => {
  await window.freeeApp.killProcess();
  if (outputTerm) {
    outputTerm.writeln('\n\x1b[33m中断しました\x1b[0m');
  }
  setRunning(false);
  document.getElementById('outputStopBtn').style.display = 'none';
  document.querySelectorAll('.cmd-btn.running').forEach((b) => b.classList.remove('running'));
});

// --- Modal ---
let pendingModalCmd = null;

function showModal(cmd) {
  pendingModalCmd = cmd;
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const fields = document.getElementById('modalFields');

  title.textContent = `${cmd.label} - 引数を入力`;
  fields.innerHTML = '';

  cmd.args.forEach((arg, i) => {
    const div = document.createElement('div');
    div.className = 'modal-field';

    const label = document.createElement('label');
    label.textContent = arg.label + (arg.required ? ' *' : '');
    div.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.argIndex = i;
    input.placeholder = arg.label;
    div.appendChild(input);

    fields.appendChild(div);

    // fromEnv: .envのSPREADSHEET_ID等をデフォルト値として表示
    if (arg.fromEnv && activeProfile) {
      window.freeeApp.getEnvValue(activeProfile, arg.fromEnv).then((val) => {
        if (val && !input.value) input.value = val;
      });
    }
  });

  overlay.classList.add('visible');
  // Focus first input
  const firstInput = fields.querySelector('input');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function hideModal() {
  document.getElementById('modalOverlay').classList.remove('visible');
  pendingModalCmd = null;
}

document.getElementById('modalCancel').addEventListener('click', hideModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideModal();
});

document.getElementById('modalRun').addEventListener('click', () => {
  if (!pendingModalCmd) return;
  const cmd = pendingModalCmd;
  const fields = document.getElementById('modalFields');
  const inputs = fields.querySelectorAll('input');
  const args = [];

  for (let i = 0; i < cmd.args.length; i++) {
    const val = inputs[i].value.trim();
    if (cmd.args[i].required && !val) {
      inputs[i].style.borderColor = 'var(--red)';
      return;
    }
    if (val) args.push(val);
  }

  hideModal();
  executeCommand(cmd.cmd, args, cmd.label);
});

// Enter key in modal
document.getElementById('modalFields').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('modalRun').click();
});

// --- Keyboard shortcut: Escape to close modal/preview/output/form ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('modalOverlay');
    if (overlay.classList.contains('visible')) {
      hideModal();
    } else if (document.getElementById('receiptUpload').style.display !== 'none') {
      hideReceiptUpload();
    } else if (document.getElementById('quotationSelect').style.display !== 'none') {
      hideQuotationSelect();
    } else if (document.getElementById('invoiceForm').style.display !== 'none') {
      hideInvoiceForm();
    } else if (document.getElementById('previewPanel').classList.contains('open')) {
      closePreview();
    } else if (outputPanelVisible) {
      hideOutputPanel();
    }
  }
});

// --- Invoice / Quotation Form ---
let currentFormType = 'invoice'; // 'invoice' or 'quotation'
/** @type {object|null} 取引先キャッシュ */
let partnersCache = null;

function getLastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getLastDayOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 2, 0);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatAmount(amount) {
  return amount != null ? Number(amount).toLocaleString() : '-';
}

// --- 見積書選択画面 ---
async function showQuotationSelect() {
  const termWrapper = document.querySelector('.terminal-wrapper');
  const selectView = document.getElementById('quotationSelect');
  const body = document.getElementById('quotationSelectBody');

  termWrapper.style.display = 'none';
  selectView.style.display = 'flex';
  body.innerHTML = '<p class="loading-text">見積書と請求書を読み込み中...</p>';

  try {
    // 見積書一覧と請求書一覧を並行取得
    const [quotResult, invResult] = await Promise.all([
      window.freeeApp.fetchQuotations(activeProfile),
      window.freeeApp.fetchInvoices(activeProfile),
    ]);

    const quotations = quotResult.quotations || [];
    const invoices = invResult.invoices || [];

    if (quotations.length === 0) {
      body.innerHTML = '<p class="loading-text">見積書がありません</p>';
      return;
    }

    // 請求書が存在する見積書にはバッジを付けるが、全件表示する
    const invoiceMatchSet = new Set();
    invoices.forEach((inv) => {
      if (inv.partner_id && inv.title) {
        invoiceMatchSet.add(`${inv.partner_id}_${inv.title}`);
      }
    });

    body.innerHTML = '';
    quotations.forEach((q) => {
      const matchKey = `${q.partner_id}_${q.title}`;
      const hasInvoice = q.title && q.partner_id && invoiceMatchSet.has(matchKey);
      const card = document.createElement('div');
      card.className = 'quotation-card';
      card.innerHTML = `
        <div class="quotation-card-header">
          <span class="quotation-card-number">${q.quotation_number || '-'}</span>
          ${hasInvoice ? '<span class="quotation-card-badge">請求書済</span>' : ''}
          <span class="quotation-card-date">${q.issue_date || ''}</span>
        </div>
        <div class="quotation-card-title">${q.title || '(件名なし)'}</div>
        <div class="quotation-card-partner">${q.partner_name || '(取引先なし)'}</div>
        <div class="quotation-card-amount">&yen; ${formatAmount(q.total_amount)}</div>
      `;
      card.addEventListener('click', () => openInvoiceFromQuotation(q.id));
      body.appendChild(card);
    });
  } catch (err) {
    body.innerHTML = `<p class="loading-text">読み込み失敗: ${err.message}</p>`;
  }
}

function hideQuotationSelect() {
  document.getElementById('quotationSelect').style.display = 'none';
  document.querySelector('.terminal-wrapper').style.display = 'flex';
  setTimeout(() => fitAddon.fit(), 50);
}

async function openInvoiceFromQuotation(quotationId) {
  document.getElementById('quotationSelect').style.display = 'none';

  // 見積書詳細を取得して請求書フォームにデータを流し込む
  try {
    const detail = await window.freeeApp.fetchQuotationDetail(quotationId, activeProfile);
    const q = detail.quotation || detail;
    await showInvoiceForm('invoice', q);
  } catch (err) {
    alert(`見積書の読み込みに失敗しました:\n${err.message}`);
    hideQuotationSelect();
  }
}

// --- 請求書/見積書フォーム ---
/**
 * @param {'invoice'|'quotation'} type
 * @param {object} [prefill] - 見積書データから流し込む場合
 */
async function showInvoiceForm(type, prefill) {
  currentFormType = type;
  const form = document.getElementById('invoiceForm');
  const termWrapper = document.querySelector('.terminal-wrapper');
  const billingField = document.getElementById('formBillingDateField');
  const paymentField = document.getElementById('formPaymentDate').closest('.form-field');
  const paymentLabel = paymentField.querySelector('label');
  const billingSameCheckbox = document.getElementById('formBillingSameAsDate');
  const billingDateInput = document.getElementById('formBillingDate');

  if (type === 'invoice') {
    document.getElementById('formTitle').textContent = prefill ? '請求書作成（見積書から）' : '請求書作成';
    document.getElementById('formDateLabel').textContent = '請求日';
    billingField.style.display = '';
    paymentLabel.textContent = '支払期限';
    // チェックボックスリセット
    billingSameCheckbox.checked = true;
    billingDateInput.style.display = 'none';
    // デフォルト日付: 月末
    const now = new Date();
    const endOfMonth = getLastDayOfMonth(now);
    const endOfNextMonth = getLastDayOfNextMonth(now);
    document.getElementById('formDate').value = formatDate(endOfMonth);
    document.getElementById('formBillingDate').value = formatDate(endOfMonth);
    document.getElementById('formPaymentDate').value = formatDate(endOfNextMonth);
  } else {
    document.getElementById('formTitle').textContent = '見積書作成';
    document.getElementById('formDateLabel').textContent = '見積日';
    billingField.style.display = 'none';
    paymentLabel.textContent = '有効期限';
    document.getElementById('formDate').value = formatDate(new Date());
    document.getElementById('formPaymentDate').value = formatDate(getLastDayOfNextMonth(new Date()));
  }

  // リセット
  document.getElementById('formSubject').value = '';
  document.getElementById('formNote').value = '';
  document.getElementById('formTaxEntry').value = 'out';
  document.getElementById('formTaxFraction').value = 'omit';
  document.getElementById('formPartnerTitle').value = '御中';
  document.getElementById('lineItemsBody').innerHTML = '';

  // 表示切り替え
  form.style.display = 'flex';
  termWrapper.style.display = 'none';

  // 取引先取得
  await loadPartners();

  // 見積書からの流し込み
  if (prefill) {
    fillFormFromQuotation(prefill);
  } else {
    // 新規の場合は初期行を1つ追加
    addLineRow('item');
  }
}

async function loadPartners() {
  const select = document.getElementById('formPartner');
  select.innerHTML = '<option value="">読み込み中...</option>';
  try {
    if (!partnersCache) {
      const result = await window.freeeApp.fetchPartners(activeProfile);
      partnersCache = result.partners || [];
    }
    select.innerHTML = '<option value="">-- 選択してください --</option>';
    partnersCache.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  } catch (err) {
    select.innerHTML = `<option value="">取得失敗: ${err.message}</option>`;
  }
}

function fillFormFromQuotation(q) {
  // 取引先
  if (q.partner_id) {
    document.getElementById('formPartner').value = q.partner_id;
  }
  // 敬称
  if (q.partner_title) {
    document.getElementById('formPartnerTitle').value = q.partner_title;
  }
  // 件名
  if (q.subject) {
    document.getElementById('formSubject').value = q.subject;
  }
  // 税
  if (q.tax_entry_method) {
    document.getElementById('formTaxEntry').value = q.tax_entry_method;
  }
  if (q.tax_fraction) {
    document.getElementById('formTaxFraction').value = q.tax_fraction;
  }
  // 備考
  if (q.quotation_note) {
    document.getElementById('formNote').value = q.quotation_note;
  }
  // 明細行
  const lines = q.lines || [];
  if (lines.length === 0) {
    addLineRow('item');
    return;
  }
  lines.forEach((line) => {
    addLineRow(line.type || 'item');
    const rows = document.querySelectorAll('#lineItemsBody tr');
    const tr = rows[rows.length - 1];
    const descInput = tr.querySelector('.line-desc');
    if (descInput && line.description) descInput.value = line.description;
    if (line.type === 'item' || !line.type) {
      const qtyInput = tr.querySelector('.line-qty');
      const unitInput = tr.querySelector('.line-unit');
      const priceInput = tr.querySelector('.line-price');
      const taxSelect = tr.querySelector('.line-tax');
      if (qtyInput && line.quantity != null) qtyInput.value = line.quantity;
      if (unitInput && line.unit) unitInput.value = line.unit;
      if (priceInput && line.unit_price != null) priceInput.value = line.unit_price;
      if (taxSelect && line.tax_rate != null) taxSelect.value = line.tax_rate;
    }
  });
}

function hideInvoiceForm() {
  document.getElementById('invoiceForm').style.display = 'none';
  document.getElementById('quotationSelect').style.display = 'none';
  document.querySelector('.terminal-wrapper').style.display = 'flex';
  setTimeout(() => fitAddon.fit(), 50);
}

function addLineRow(type) {
  const tbody = document.getElementById('lineItemsBody');
  const tr = document.createElement('tr');
  tr.dataset.lineType = type;

  if (type === 'item') {
    tr.innerHTML = `
      <td><input type="text" class="line-desc" placeholder="品名"></td>
      <td><input type="number" class="line-qty" value="1" min="0" step="1"></td>
      <td><input type="text" class="line-unit" value="式" placeholder="単位"></td>
      <td><input type="number" class="line-price" placeholder="単価" min="0"></td>
      <td>
        <select class="line-tax">
          <option value="10">10%</option>
          <option value="8">8%</option>
          <option value="0">0%</option>
        </select>
      </td>
      <td><button class="line-remove-btn">&times;</button></td>
    `;
  } else {
    tr.innerHTML = `
      <td colspan="5"><input type="text" class="line-desc line-text-desc" placeholder="テキスト行（例: ― 内訳 ―）"></td>
      <td><button class="line-remove-btn">&times;</button></td>
    `;
  }

  tr.querySelector('.line-remove-btn').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

function collectFormData() {
  const partnerId = document.getElementById('formPartner').value;
  const partnerTitle = document.getElementById('formPartnerTitle').value;
  const subject = document.getElementById('formSubject').value.trim();
  const dateVal = document.getElementById('formDate').value;
  const billingSame = document.getElementById('formBillingSameAsDate').checked;
  const billingDate = billingSame ? dateVal : document.getElementById('formBillingDate').value;
  const paymentDate = document.getElementById('formPaymentDate').value;
  const taxEntry = document.getElementById('formTaxEntry').value;
  const taxFraction = document.getElementById('formTaxFraction').value;
  const note = document.getElementById('formNote').value.trim();

  // 明細行
  const rows = document.querySelectorAll('#lineItemsBody tr');
  const lines = [];
  rows.forEach((row) => {
    const type = row.dataset.lineType;
    if (type === 'item') {
      const desc = row.querySelector('.line-desc').value.trim();
      const qty = parseFloat(row.querySelector('.line-qty').value) || 0;
      const unit = row.querySelector('.line-unit').value.trim();
      const price = row.querySelector('.line-price').value.trim();
      const tax = parseInt(row.querySelector('.line-tax').value);
      if (desc) {
        lines.push({ type: 'item', description: desc, quantity: qty, unit: unit || null, unit_price: price || '0', tax_rate: tax });
      }
    } else {
      const desc = row.querySelector('.line-desc').value.trim();
      if (desc) {
        lines.push({ type: 'text', description: desc });
      }
    }
  });

  if (currentFormType === 'invoice') {
    const data = {
      partner_id: parseInt(partnerId),
      partner_title: partnerTitle,
      tax_entry_method: taxEntry,
      tax_fraction: taxFraction,
      withholding_tax_entry_method: taxEntry,
      lines,
    };
    if (dateVal) data.invoice_date = dateVal;
    if (billingDate) data.billing_date = billingDate;
    if (paymentDate) data.payment_date = paymentDate;
    if (subject) data.subject = subject;
    if (note) data.invoice_note = note;
    return data;
  } else {
    const data = {
      partner_id: parseInt(partnerId),
      partner_title: partnerTitle,
      tax_entry_method: taxEntry,
      tax_fraction: taxFraction,
      withholding_tax_entry_method: taxEntry,
      lines,
    };
    if (dateVal) data.quotation_date = dateVal;
    if (paymentDate) data.payment_date = paymentDate;
    if (subject) data.subject = subject;
    if (note) data.quotation_note = note;
    return data;
  }
}

async function submitForm() {
  // バリデーション
  const partnerId = document.getElementById('formPartner').value;
  if (!partnerId) {
    alert('取引先を選択してください');
    return;
  }

  const rows = document.querySelectorAll('#lineItemsBody tr');
  let hasLine = false;
  rows.forEach((row) => {
    const desc = row.querySelector('.line-desc');
    if (desc && desc.value.trim()) hasLine = true;
  });
  if (!hasLine) {
    alert('明細行を1つ以上入力してください');
    return;
  }

  if (currentFormType === 'invoice') {
    const dateVal = document.getElementById('formDate').value;
    if (!dateVal) {
      alert('請求日は必須です');
      return;
    }
  }

  const data = collectFormData();
  const submitBtn = document.getElementById('formSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = '作成中...';

  try {
    const result = await window.freeeApp.createDocument(currentFormType, data, activeProfile);
    const typeName = currentFormType === 'invoice' ? '請求書' : '見積書';
    alert(`${typeName}を作成しました (ID: ${result.id || '?'})`);
    partnersCache = null; // キャッシュクリア
    hideInvoiceForm();
  } catch (err) {
    alert(`作成に失敗しました:\n${err.message || err}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '作成';
  }
}

// --- billing_date チェックボックス連動 ---
document.getElementById('formBillingSameAsDate').addEventListener('change', (e) => {
  const billingInput = document.getElementById('formBillingDate');
  if (e.target.checked) {
    billingInput.style.display = 'none';
  } else {
    billingInput.style.display = '';
    billingInput.value = document.getElementById('formDate').value;
    billingInput.focus();
  }
});

// --- フォームイベントリスナー ---
document.getElementById('formCancel').addEventListener('click', hideInvoiceForm);
document.getElementById('formSubmit').addEventListener('click', submitForm);
document.getElementById('addItemLine').addEventListener('click', () => addLineRow('item'));
document.getElementById('addTextLine').addEventListener('click', () => addLineRow('text'));

// --- 見積書選択画面イベントリスナー ---
document.getElementById('quotationSelectCancel').addEventListener('click', hideQuotationSelect);
document.getElementById('quotationSelectNew').addEventListener('click', () => {
  document.getElementById('quotationSelect').style.display = 'none';
  showInvoiceForm('invoice');
});

// --- Receipt Upload ---
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** @type {{ file: File, status: string, detail: string }[]} */
let receiptFiles = [];
let isUploading = false;

function showReceiptUpload() {
  receiptFiles = [];
  isUploading = false;
  const screen = document.getElementById('receiptUpload');
  const termWrapper = document.querySelector('.terminal-wrapper');
  termWrapper.style.display = 'none';
  screen.style.display = 'flex';

  document.getElementById('fileList').innerHTML = '';
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('uploadSummary').style.display = 'none';
  document.getElementById('receiptSubmit').disabled = true;
  document.getElementById('dropZone').style.display = '';
}

function hideReceiptUpload() {
  if (isUploading) return;
  document.getElementById('receiptUpload').style.display = 'none';
  document.querySelector('.terminal-wrapper').style.display = 'flex';
  receiptFiles = [];
  setTimeout(() => fitAddon.fit(), 50);
}

function validateFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return `非対応形式 (${ext})`;
  }
  if (!ALLOWED_MIME.includes(file.type) && file.type !== '') {
    return `非対応MIME (${file.type})`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `サイズ超過 (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
  }
  if (receiptFiles.some((f) => f.file.name === file.name && f.file.size === file.size)) {
    return '重複ファイル';
  }
  return null;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function addFilesToList(files) {
  for (const file of files) {
    const error = validateFile(file);
    if (error) {
      receiptFiles.push({ file, status: 'error', detail: error });
    } else {
      receiptFiles.push({ file, status: 'pending', detail: '待機中' });
    }
  }
  renderFileList();
  updateSubmitButton();
}

function removeFile(index) {
  if (isUploading) return;
  receiptFiles.splice(index, 1);
  renderFileList();
  updateSubmitButton();
}

function renderFileList() {
  const container = document.getElementById('fileList');
  container.innerHTML = '';

  receiptFiles.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = `file-item status-${item.status}`;
    row.innerHTML = `
      <span class="file-item-name">${escapeHtml(item.file.name)}</span>
      <span class="file-item-size">${formatFileSize(item.file.size)}</span>
      <span class="file-item-status">${escapeHtml(item.detail)}</span>
      ${!isUploading ? `<button class="file-item-remove" data-idx="${i}">&times;</button>` : ''}
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.file-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.idx)));
  });
}

function updateSubmitButton() {
  const hasValid = receiptFiles.some((f) => f.status === 'pending');
  document.getElementById('receiptSubmit').disabled = !hasValid || isUploading;
}

function updateProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressBar').style.width = `${pct}%`;
  document.getElementById('progressText').textContent = `${done}/${total} ファイル完了`;
}

async function startUpload() {
  if (isUploading) return;
  isUploading = true;

  const submitBtn = document.getElementById('receiptSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'アップロード中...';
  document.getElementById('dropZone').style.display = 'none';

  const targets = receiptFiles.filter((f) => f.status === 'pending');
  const total = targets.length;
  let done = 0;
  let successCount = 0;
  let failCount = 0;

  document.getElementById('progressSection').style.display = '';
  updateProgress(0, total);

  for (const item of targets) {
    item.status = 'uploading';
    item.detail = 'アップロード中...';
    renderFileList();

    const result = await window.freeeApp.uploadReceipt(
      item.file.path,
      item.file.name,
      item.file.type || 'application/octet-stream',
      activeProfile
    );

    if (result.success) {
      item.status = 'success';
      item.detail = `成功 ID:${result.receiptId || '?'}`;
      successCount++;
    } else {
      item.status = 'error';
      item.detail = result.error || '失敗';
      failCount++;
    }

    done++;
    updateProgress(done, total);
    renderFileList();

    // API rate limit 対策
    if (done < total) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  isUploading = false;
  submitBtn.textContent = 'アップロード';
  submitBtn.disabled = true;

  // サマリー表示
  const summary = document.getElementById('uploadSummary');
  summary.style.display = '';
  summary.innerHTML = `
    <div class="summary-row summary-success">成功: ${successCount}件</div>
    ${failCount > 0 ? `<div class="summary-row summary-fail">失敗: ${failCount}件</div>` : ''}
    <div class="summary-row">合計: ${total}件</div>
  `;
}

// --- ドロップゾーン イベント ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
  if (isUploading) return;
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) addFilesToList(files);
});

dropZone.addEventListener('click', (e) => {
  if (e.target.id === 'fileSelectBtn' || e.target === dropZone || e.target.closest('.drop-zone-content')) {
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  if (isUploading) return;
  const files = Array.from(e.target.files);
  if (files.length > 0) addFilesToList(files);
  fileInput.value = '';
});

document.getElementById('receiptCancel').addEventListener('click', hideReceiptUpload);
document.getElementById('receiptSubmit').addEventListener('click', startUpload);

// --- Init ---
initTerminal();
initProfiles();
buildSidebar();
