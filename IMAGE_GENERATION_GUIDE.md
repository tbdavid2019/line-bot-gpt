# 圖片生成功能使用說明

## 功能概述

本 LINE Bot 現在支援使用 Google Gemini 2.5 Flash 模型生成圖片！您可以透過兩種方式來使用這個功能：

## 使用方式

### 方法 1：指令驅動
使用以下任何一個指令，後面接上您想要生成的圖片描述：

- `!image`
- `!畫圖`  
- `!img`
- `!圖片`
- `!產圖`

**範例：**
```
!畫圖 一隻可愛的小貓咪在花園裡玩耍
!image a beautiful sunset over the ocean
!圖片 未來城市的科幻景觀
```

### 方法 2：自然語言驅動
在對話中包含以下關鍵字，機器人會自動識別並生成圖片：

- 畫圖
- image
- 幫我產生圖
- 生成圖片
- 產生圖片
- 畫一張
- 畫一個
- 生成一張

**範例：**
```
幫我畫一張美麗的風景圖
可以幫我產生圖片嗎？一個機器人在讀書
我想要一張關於春天的圖片
```

## 取消功能

如果您在圖片生成過程中改變想法，可以使用以下任何一個指令來取消：

- `取消`
- `退出`
- `停止`
- `cancel`
- `stop`
- `exit`
- `不要了`
- `算了`

**使用流程：**
1. 用戶：`!畫圖 一隻可愛的小貓`
2. 機器人：`🎨 正在為您生成圖片：「一隻可愛的小貓」⏳ 請稍等片刻... 💡 如要取消，請輸入「取消」、「退出」或「停止」`
3. 用戶：`取消`
4. 機器人：`❌ 已取消圖片生成。`

## 功能特色

1. **智能識別**：自動判斷是否為圖片生成請求
2. **多語言支援**：支援中文和英文描述
3. **即時回饋**：顯示處理進度訊息
4. **取消機制**：隨時可以取消正在進行的圖片生成
5. **雲端存儲**：使用 Google Cloud Storage 儲存圖片（可選）
6. **本地備用**：如果雲端配置失敗，會自動使用本地存儲
7. **群組支援**：在群組中需要 @ 機器人才會回應

## 圖片存儲方式

### 方式 1：Google Cloud Storage（推薦）
- 圖片會上傳到 Google Cloud Storage
- 用戶可以直接在 LINE 中查看圖片
- 需要配置 Google Cloud 相關環境變數

### 方式 2：本地存儲（備用）
- 如果雲端配置失敗，會自動使用本地存儲
- 圖片保存在伺服器的 `images` 資料夾
- 用戶無法直接查看，但會收到確認訊息

## 環境變數設定

### 必要設定
```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-image-preview
```

### Google Cloud Storage 設定（可選但推薦）
```env
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_BUCKET_NAME=your_bucket_name
GOOGLE_CLOUD_KEY_FILE=path/to/service-account-key.json
```

## 設定 Google Cloud Storage

1. **建立 Google Cloud 專案**
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)
   - 建立新專案或選擇現有專案

2. **啟用 Cloud Storage API**
   - 在專案中啟用 Cloud Storage API

3. **建立 Storage Bucket**
   ```bash
   gsutil mb gs://your-bucket-name
   ```

4. **設定 Bucket 權限**
   ```bash
   gsutil iam ch allUsers:objectViewer gs://your-bucket-name
   ```

5. **建立 Service Account**
   - 在 IAM & Admin > Service Accounts 建立新的 Service Account
   - 下載 JSON 金鑰檔案
   - 給予 Storage Object Admin 權限

6. **設定環境變數**
   ```env
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
   GOOGLE_CLOUD_KEY_FILE=./path/to/service-account-key.json
   ```

## 注意事項

1. **API Key 設定**：需要在 `.env` 檔案中設定 `GEMINI_API_KEY`
2. **處理時間**：圖片生成需要一些時間，請耐心等待
3. **取消功能**：在生成過程中隨時可以取消
4. **內容政策**：請確保您的描述符合 Google 的內容政策
5. **雲端費用**：使用 Google Cloud Storage 可能產生費用

## 取得 API Keys

### Gemini API Key
1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 登入您的 Google 帳號
3. 創建新的 API Key
4. 將 API Key 加入到 `.env` 檔案中

### 模型設定說明

`GEMINI_MODEL` 環境變數讓您可以指定要使用的 Gemini 模型版本：

- **預設值**: `gemini-2.5-flash-image-preview`
- **用途**: 當 Google 發布新版本模型時，您可以透過修改此環境變數來使用新模型，而不需要修改程式碼
- **範例**: 未來可能的模型名稱如 `gemini-3.0-flash-image` 或 `gemini-2.5-flash-image-stable`

這樣的設計確保了程式碼的可維護性和向前相容性。

## 測試功能

您可以使用提供的測試腳本來驗證圖片生成功能：

```bash
npm run test-image
```

這個腳本會：
- 檢查 API Key 是否正確設定
- 測試圖片生成功能
- 將測試圖片保存到 `test_images` 資料夾

## 故障排除

### 常見問題

1. **API Key 錯誤**
   - 確認 `.env` 檔案中的 `GEMINI_API_KEY` 是否正確
   - 檢查 API Key 是否有效且未過期

2. **圖片無法生成**
   - 確認描述文字是否清楚明確
   - 避免使用可能違反內容政策的描述

3. **無法取消生成**
   - 確認使用正確的取消關鍵字
   - 檢查網路連線是否正常

4. **Google Cloud Storage 錯誤**
   - 檢查環境變數是否正確設定
   - 確認 Service Account 權限是否足夠
   - 檢查 Bucket 是否存在且可訪問

5. **機器人無回應**
   - 在群組中確保有 @ 機器人
   - 檢查其他環境變數是否正確設定

## 技術細節

- **模型**：gemini-2.5-flash-image-preview
- **輸出格式**：支援多種圖片格式（JPEG, PNG 等）
- **回應模式**：IMAGE + TEXT
- **檔案命名**：使用時間戳和清理過的提示詞
- **存儲方式**：優先使用 Google Cloud Storage，備用本地存儲
- **取消機制**：即時檢查用戶狀態，支援中途取消

## 更新日誌

- **v1.2.0**：
  - 加入 Google Cloud Storage 支援
  - 加入取消功能
  - 改善用戶體驗和錯誤處理
- **v1.1.0**：新增 Gemini 圖片生成功能
- **v1.0.0**：基礎 GPT 聊天機器人功能
