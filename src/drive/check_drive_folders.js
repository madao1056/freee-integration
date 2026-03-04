// Google Driveフォルダ構造の確認スクリプト
const { google } = require('googleapis');
const path = require('path');

const { getConfig } = require('../utils/freee_api');
const config = getConfig();
const SERVICE_ACCOUNT_FILE = config.serviceAccountKeyFile;
// .envのDRIVE_ROOT_FOLDER_IDから取得
const DRIVE_FOLDER_ID = config.driveRootFolderId;

async function checkDriveFolders() {
  console.log('========================================');
  console.log('  Google Drive フォルダ構造確認');
  console.log('========================================\n');

  try {
    // 1. 認証
    console.log('1. Google Drive API 認証中...');
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ]
    });

    const authClient = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    
    console.log('   ✓ 認証成功\n');

    // 2. ルートフォルダの情報を取得
    console.log('2. ルートフォルダの確認...');
    try {
      const rootFolder = await drive.files.get({
        fileId: DRIVE_FOLDER_ID,
        fields: 'id, name, mimeType, createdTime, modifiedTime'
      });

      console.log(`   ✓ フォルダ名: ${rootFolder.data.name}`);
      console.log(`   ID: ${rootFolder.data.id}`);
      console.log(`   作成日: ${new Date(rootFolder.data.createdTime).toLocaleString('ja-JP')}`);
      console.log(`   更新日: ${new Date(rootFolder.data.modifiedTime).toLocaleString('ja-JP')}\n`);

    } catch (error) {
      if (error.message.includes('File not found')) {
        console.error('   ✗ フォルダが見つかりません');
        console.log('   → サービスアカウントにフォルダを共有してください');
        console.log('   → service-account-key.json 内の client_email を確認してください');
        return;
      } else {
        throw error;
      }
    }

    // 3. サブフォルダ（月別フォルダ）を取得
    console.log('3. サブフォルダの確認...');
    
    const subFolders = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, createdTime, modifiedTime)',
      orderBy: 'name'
    });

    if (subFolders.data.files.length === 0) {
      console.log('   サブフォルダが見つかりません\n');
    } else {
      console.log(`   ✓ ${subFolders.data.files.length}個の月別フォルダを発見:\n`);
      
      // 各サブフォルダの詳細を表示
      for (const folder of subFolders.data.files) {
        console.log(`   📁 ${folder.name}`);
        console.log(`      ID: ${folder.id}`);
        console.log(`      作成: ${new Date(folder.createdTime).toLocaleString('ja-JP')}`);
        
        // 各フォルダ内のファイル数を確認
        const files = await drive.files.list({
          q: `'${folder.id}' in parents`,
          fields: 'files(id, name, mimeType, size)',
          pageSize: 1000
        });

        const imageFiles = files.data.files.filter(file => 
          file.mimeType && (
            file.mimeType.startsWith('image/') ||
            file.mimeType === 'application/pdf'
          )
        );

        console.log(`      📄 ファイル数: ${files.data.files.length}件`);
        console.log(`      🖼️ 画像・PDF: ${imageFiles.length}件\n`);
        
        // 最初の5件のファイル名を表示
        if (imageFiles.length > 0) {
          console.log(`      ファイル例:`);
          imageFiles.slice(0, 5).forEach(file => {
            const sizeKB = file.size ? Math.round(file.size / 1024) : 0;
            console.log(`        • ${file.name} (${sizeKB}KB)`);
          });
          if (imageFiles.length > 5) {
            console.log(`        ... 他${imageFiles.length - 5}件`);
          }
          console.log('');
        }
      }
    }

    // 4. 結果サマリー
    console.log('========================================');
    console.log('  フォルダ構造確認完了');
    console.log('========================================');

    const totalSubFolders = subFolders.data.files.length;
    let totalFiles = 0;
    let totalImageFiles = 0;

    // 各フォルダのファイル数を集計
    for (const folder of subFolders.data.files) {
      const files = await drive.files.list({
        q: `'${folder.id}' in parents`,
        fields: 'files(mimeType)'
      });
      
      totalFiles += files.data.files.length;
      totalImageFiles += files.data.files.filter(file => 
        file.mimeType && (
          file.mimeType.startsWith('image/') ||
          file.mimeType === 'application/pdf'
        )
      ).length;
    }

    console.log(`月別フォルダ数: ${totalSubFolders}`);
    console.log(`総ファイル数: ${totalFiles}`);
    console.log(`レシート画像・PDF数: ${totalImageFiles}`);

    console.log('\n次のステップ:');
    console.log('1. レシートアップロード機能の実装');
    console.log('2. freee OCR連携の設定');
    console.log('3. 月別バッチ処理の実装');

    return {
      rootFolderId: DRIVE_FOLDER_ID,
      subFolders: subFolders.data.files,
      totalFiles,
      totalImageFiles
    };

  } catch (error) {
    console.error('エラー:', error.message);
    
    if (error.message.includes('Google Drive API has not been used')) {
      console.log('\nGoogle Drive APIを有効にしてください:');
      console.log('1. https://console.cloud.google.com/');
      console.log('2. 「APIとサービス」→「ライブラリ」');
      console.log('3. 「Google Drive API」を検索して有効化');
    } else if (error.message.includes('insufficient authentication scopes')) {
      console.log('\nDrive APIスコープが不足しています');
    }
    
    process.exit(1);
  }
}

// 実行
checkDriveFolders();