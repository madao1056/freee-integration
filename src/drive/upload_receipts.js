// Google Drive から freee ファイルボックスへのレシートアップロードスクリプト
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });
const { freeeApiUpload, getConfig } = require('../utils/freee_api');

// 設定
const config = getConfig();
const CONFIG = {
  serviceAccountKeyFile: config.serviceAccountKeyFile,
  driveRootFolderId: config.driveRootFolderId,
  freeeCompanyId: config.freeeCompanyId
};

// 対象ファイルタイプ
const SUPPORTED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'application/pdf'
];

// Google Drive認証
async function authenticateDrive() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(CONFIG.serviceAccountKeyFile),
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  return google.drive({ version: 'v3', auth });
}

// 月別フォルダを取得
async function getMonthlyFolders(drive) {
  const folders = await drive.files.list({
    q: `'${CONFIG.driveRootFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'name desc'
  });

  return folders.data.files;
}

// フォルダ内のレシート画像を取得
async function getReceiptFiles(drive, folderId) {
  const files = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
    orderBy: 'createdTime desc'
  });

  return files.data.files.filter(file =>
    SUPPORTED_MIME_TYPES.includes(file.mimeType)
  );
}

// ファイルをダウンロード
async function downloadFile(drive, fileId) {
  const response = await drive.files.get({
    fileId: fileId,
    alt: 'media'
  }, {
    responseType: 'stream'
  });

  return response.data;
}

// freeeファイルボックスにアップロード
async function uploadToFreeeFilebox(fileName, fileBuffer, mimeType) {
  const FormData = require('form-data');

  const form = new FormData();
  form.append('company_id', CONFIG.freeeCompanyId.toString());
  form.append('receipt', fileBuffer, {
    filename: fileName,
    contentType: mimeType
  });

  return freeeApiUpload('/api/1/receipts', form);
}

// プロファイル対応の処理済みファイルパス
function getProcessedFilePath() {
  const { getCurrentProfile } = require('../utils/freee_api');
  const profile = getCurrentProfile();
  return profile
    ? `./processed_receipts.${profile}.json`
    : './processed_receipts.json';
}

// 処理済みファイル記録の読み込み
function loadProcessedFiles() {
  const filePath = getProcessedFilePath();
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return { processed: [] };
}

// 処理済みファイル記録の保存
function saveProcessedFiles(data) {
  fs.writeFileSync(getProcessedFilePath(), JSON.stringify(data, null, 2));
}

// メイン処理
async function main() {
  console.log('========================================');
  console.log('  Drive → freee レシートアップロード');
  console.log('========================================\n');

  const targetMonth = process.argv[2]; // 例: "2025.12"

  try {
    // 1. Google Drive認証
    console.log('1. Google Drive認証中...');
    const drive = await authenticateDrive();
    console.log('   ✓ 認証成功\n');

    // 2. 処理済みファイル記録を読み込み
    const processedData = loadProcessedFiles();
    console.log(`処理済みファイル数: ${processedData.processed.length}件\n`);

    // 3. 月別フォルダを取得
    console.log('2. 月別フォルダを確認中...');
    const monthlyFolders = await getMonthlyFolders(drive);

    if (monthlyFolders.length === 0) {
      console.log('   月別フォルダが見つかりません');
      return;
    }

    console.log(`   ✓ ${monthlyFolders.length}個の月別フォルダを発見:`);
    monthlyFolders.forEach(folder => {
      console.log(`      📁 ${folder.name} (ID: ${folder.id})`);
    });
    console.log('');

    // 4. 対象フォルダを決定
    let targetFolders = monthlyFolders;
    if (targetMonth) {
      targetFolders = monthlyFolders.filter(folder => folder.name === targetMonth);
      if (targetFolders.length === 0) {
        console.log(`指定された月 "${targetMonth}" のフォルダが見つかりません`);
        return;
      }
    }

    // 5. 各フォルダを処理
    let totalUploaded = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const folder of targetFolders) {
      console.log(`3. "${folder.name}" フォルダを処理中...`);

      // レシートファイルを取得
      const receiptFiles = await getReceiptFiles(drive, folder.id);
      console.log(`   ファイル数: ${receiptFiles.length}件\n`);

      if (receiptFiles.length === 0) {
        console.log('   → レシートファイルがありません\n');
        continue;
      }

      // 各ファイルを処理
      for (let i = 0; i < receiptFiles.length; i++) {
        const file = receiptFiles[i];
        const progress = `[${i + 1}/${receiptFiles.length}]`;

        console.log(`   ${progress} ${file.name}`);

        // 既に処理済みかチェック
        const fileKey = `${file.id}_${file.name}`;
        if (processedData.processed.includes(fileKey)) {
          console.log(`      ⏭️  スキップ（処理済み）`);
          totalSkipped++;
          continue;
        }

        try {
          // ファイルサイズチェック（10MB制限）
          const fileSizeMB = file.size ? (parseInt(file.size) / 1024 / 1024) : 0;
          if (fileSizeMB > 10) {
            console.log(`      ❌ ファイルサイズが大きすぎます (${fileSizeMB.toFixed(1)}MB)`);
            totalErrors++;
            continue;
          }

          // ファイルをダウンロード
          const fileStream = await downloadFile(drive, file.id);

          // ストリームをバッファに変換
          const chunks = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk);
          }
          const fileBuffer = Buffer.concat(chunks);

          // freeeにアップロード
          const uploadResult = await uploadToFreeeFilebox(file.name, fileBuffer, file.mimeType);

          console.log(`      ✅ アップロード成功 (ID: ${uploadResult.receipt.id})`);

          // 処理済みファイルとして記録
          processedData.processed.push(fileKey);
          saveProcessedFiles(processedData);

          totalUploaded++;

          // API制限を考慮してウェイト
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.log(`      ❌ エラー: ${error.message}`);
          totalErrors++;
        }

        console.log('');
      }
    }

    // 6. 結果サマリー
    console.log('========================================');
    console.log('  処理完了');
    console.log('========================================');
    console.log(`アップロード成功: ${totalUploaded}件`);
    console.log(`スキップ: ${totalSkipped}件`);
    console.log(`エラー: ${totalErrors}件`);
    console.log(`総処理ファイル数: ${totalUploaded + totalSkipped + totalErrors}件`);

    if (totalUploaded > 0) {
      console.log('\nfreee管理画面でレシートを確認:');
      console.log('https://app.secure.freee.co.jp/');
      console.log('→ ファイルボックス → 証憑ファイル');
    }

  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

// 使用方法を表示
if (process.argv.includes('--help')) {
  console.log(`
使用方法:
  node main.js drive:upload [月指定]

例:
  node main.js drive:upload              # 全ての月別フォルダを処理
  node main.js drive:upload 2025.12      # 2025.12フォルダのみ処理

対応ファイル形式:
  - JPEG, PNG, GIF画像
  - PDFファイル
  - 最大10MBまで
`);
  process.exit(0);
}

// 実行
main();

module.exports = {
  uploadToFreeeFilebox,
  getReceiptFiles,
  loadProcessedFiles
};
