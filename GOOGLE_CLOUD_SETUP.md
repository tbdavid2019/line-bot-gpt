# Google Cloud Storage 設定指南

本指南將幫助您設定 Google Cloud Storage 來儲存機器人生成的圖片，讓用戶可以直接在 LINE 中查看圖片。

## 為什麼需要 Google Cloud Storage？

- **用戶體驗**：用戶可以直接在 LINE 中查看生成的圖片
- **可靠性**：雲端存儲比本地存儲更加可靠
- **擴展性**：支援大量圖片存儲
- **可訪問性**：圖片可以通過公開 URL 訪問

## 設定步驟

### 1. 建立 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 點擊「新建專案」或選擇現有專案
3. 記錄專案 ID（例如：`my-linebot-project`）

### 2. 啟用 Cloud Storage API

1. 在 Google Cloud Console 中，前往「API 和服務」>「庫」
2. 搜尋「Cloud Storage API」
3. 點擊並啟用 API

### 3. 建立 Storage Bucket

#### 方法 1：使用 Google Cloud Console

1. 前往「Storage」>「瀏覽器」
2. 點擊「建立儲存桶」
3. 輸入儲存桶名稱（例如：`linebot-images-bucket`）
4. 選擇地區（建議選擇離您的伺服器較近的地區）
5. 選擇「標準」存儲類別
6. 點擊「建立」

#### 方法 2：使用命令列

```bash
# 安裝 Google Cloud CLI
# 參考：https://cloud.google.com/sdk/docs/install

# 設定認證
gcloud auth login

# 設定專案
gcloud config set project YOUR_PROJECT_ID

# 建立 Bucket
gsutil mb -l asia-east1 gs://your-bucket-name
```

### 4. 設定 Bucket 權限

為了讓圖片可以公開訪問，需要設定適當的權限：

```bash
# 設定 Bucket 為公開可讀
gsutil iam ch allUsers:objectViewer gs://your-bucket-name
```

或者在 Google Cloud Console 中：
1. 選擇您的 Bucket
2. 前往「權限」分頁
3. 點擊「新增主體」
4. 在「新主體」欄位輸入 `allUsers`
5. 選擇角色「Storage Object Viewer」
6. 點擊「儲存」

### 5. 建立 Service Account

1. 前往「IAM 和管理」>「服務帳戶」
2. 點擊「建立服務帳戶」
3. 輸入服務帳戶名稱（例如：`linebot-storage`）
4. 點擊「建立並繼續」
5. 選擇角色「Storage Object Admin」
6. 點擊「完成」

### 6. 下載服務帳戶金鑰

1. 在服務帳戶列表中，點擊剛建立的服務帳戶
2. 前往「金鑰」分頁
3. 點擊「新增金鑰」>「建立新金鑰」
4. 選擇「JSON」格式
5. 下載 JSON 檔案到您的專案目錄（例如：`service-account-key.json`）

### 7. 設定環境變數

在您的 `.env` 檔案中加入以下設定：

```env
# Google Cloud Storage 設定
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
GOOGLE_CLOUD_KEY_FILE=./service-account-key.json
```

**重要**：請確保將 `service-account-key.json` 檔案加入到 `.gitignore` 中，避免意外上傳到版本控制系統。

## 測試設定

您可以使用以下程式碼測試 Google Cloud Storage 是否正確設定：

```javascript
const { Storage } = require('@google-cloud/storage');

async function testGCS() {
  try {
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    });
    
    const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET_NAME);
    
    // 測試檔案上傳
    const testFile = bucket.file('test.txt');
    await testFile.save('Hello, World!');
    
    // 設定為公開
    await testFile.makePublic();
    
    console.log('✅ Google Cloud Storage 測試成功！');
    console.log(`測試檔案 URL: https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_BUCKET_NAME}/test.txt`);
    
    // 清理測試檔案
    await testFile.delete();
    
  } catch (error) {
    console.error('❌ Google Cloud Storage 測試失敗:', error.message);
  }
}

testGCS();
```

## 費用考量

Google Cloud Storage 的計費方式：

- **存儲費用**：每月每 GB 約 $0.020 USD（標準存儲）
- **網路傳輸費用**：從 Google Cloud 到網際網路的傳輸費用
- **操作費用**：API 請求費用（通常很低）

**估算範例**：
- 如果每天生成 100 張圖片，每張圖片約 1MB
- 每月約 3GB 存儲空間
- 估計費用：每月約 $0.10 - $1.00 USD

## 安全性建議

1. **最小權限原則**：Service Account 只給予必要的 Storage Object Admin 權限
2. **金鑰保護**：妥善保管 Service Account 金鑰檔案
3. **定期檢查**：定期檢查 Bucket 的存取權限和使用情況
4. **監控使用量**：設定預算警告避免意外費用

## 故障排除

### 常見錯誤

1. **權限錯誤**
   ```
   Error: Insufficient Permission
   ```
   - 檢查 Service Account 是否有正確的權限
   - 確認 Bucket 存在且可訪問

2. **認證錯誤**
   ```
   Error: Could not load the default credentials
   ```
   - 檢查 `GOOGLE_CLOUD_KEY_FILE` 路徑是否正確
   - 確認 JSON 金鑰檔案格式正確

3. **Bucket 不存在**
   ```
   Error: No such bucket
   ```
   - 檢查 `GOOGLE_CLOUD_BUCKET_NAME` 是否正確
   - 確認 Bucket 存在於指定的專案中

4. **網路問題**
   - 檢查伺服器網路連線
   - 確認防火牆設定允許 Google Cloud 連線

## 替代方案

如果您不想使用 Google Cloud Storage，也可以考慮以下替代方案：

1. **AWS S3**：Amazon 的物件存儲服務
2. **Azure Blob Storage**：Microsoft 的雲端存儲
3. **Firebase Storage**：Google 的 Firebase 存儲服務
4. **本地檔案伺服器**：使用 nginx 或 Apache 提供靜態檔案服務

## 結論

設定 Google Cloud Storage 可以大幅提升用戶體驗，讓生成的圖片可以直接在 LINE 中顯示。雖然需要一些初始設定，但長期來看是值得的投資。

如果您在設定過程中遇到任何問題，請參考 [Google Cloud Storage 官方文件](https://cloud.google.com/storage/docs) 或聯繫技術支援。
