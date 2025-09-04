# Docker 部署指南

本指南說明如何使用 Docker 部署 LINE Bot，包含 Google Cloud Storage 認證的不同方式。

## 部署方式

### 方式 1：Docker Compose（推薦）

使用 Docker Compose 可以簡化配置和管理：

```bash
# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f line-bot

# 停止服務
docker-compose down
```

### 方式 2：傳統 Docker

```bash
# 建置映像
docker build -t line-bot-gpt .

# 運行容器
docker run -d \
  --name line-bot \
  -p 8111:8111 \
  --env-file .env \
  -v $(pwd)/service-account-key.json:/usr/src/app/service-account-key.json:ro \
  -v $(pwd)/images:/usr/src/app/images \
  line-bot-gpt
```

## Google Cloud 認證配置

### 選項 1：Volume Mount（推薦用於開發和測試）

**優點**：
- 金鑰檔案不會包含在映像中，更安全
- 可以動態更換金鑰檔案
- 符合安全最佳實踐

**設定方式**：
1. 將 `service-account-key.json` 放在專案根目錄
2. 使用 docker-compose.yml 中的 volume 配置：
   ```yaml
   volumes:
     - ./service-account-key.json:/usr/src/app/service-account-key.json:ro
   ```

**環境變數設定**：
```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
GOOGLE_CLOUD_KEY_FILE=./service-account-key.json
```

### 選項 2：映像內嵌（用於生產環境）

**優點**：
- 映像自包含，部署簡單
- 不需要額外的 volume mount

**缺點**：
- 金鑰檔案包含在映像中，需要注意安全性
- 更換金鑰需要重新建置映像

**設定方式**：
1. 將 `service-account-key.json` 放在專案根目錄
2. Dockerfile 會自動複製檔案到容器中

### 選項 3：環境變數（Google Cloud 平台推薦）

如果在 Google Cloud Platform 上部署，可以使用 IAM 角色：

**環境變數設定**：
```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_BUCKET_NAME=your-bucket-name
# 不設定 GOOGLE_CLOUD_KEY_FILE，使用預設認證
```

**Dockerfile 修改**：
```dockerfile
# 移除金鑰檔案相關配置
# 依賴 Google Cloud 的預設認證
```

## 安全性注意事項

### 本地開發
1. 確保 `service-account-key.json` 已加入 `.gitignore`
2. 使用 volume mount 方式，避免金鑰包含在映像中
3. 定期輪換 service account 金鑰

### 生產環境
1. **不要**將金鑰檔案推送到版本控制系統
2. 使用 Kubernetes secrets 或類似的安全存儲
3. 考慮使用 IAM 角色而非金鑰檔案
4. 啟用金鑰檔案的自動輪換

## 部署檢查清單

### 必要檔案
- [ ] `.env` 檔案已正確配置
- [ ] `service-account-key.json` 已準備好（如果使用）
- [ ] Google Cloud Storage bucket 已建立
- [ ] Bucket 權限已正確設定

### 部署前測試
```bash
# 檢查語法
node -c index.js

# 測試映像建置
docker build -t line-bot-gpt-test .

# 測試容器運行
docker run --rm --env-file .env -p 8111:8111 line-bot-gpt-test
```

### 部署後驗證
```bash
# 檢查健康狀態
curl http://localhost:8111/health

# 檢查容器日誌
docker-compose logs line-bot

# 測試圖片生成功能
# 在 LINE 中發送：!測試圖片 一隻可愛的小貓
```

## 故障排除

### Google Cloud 認證錯誤
```
Error: Could not load the default credentials
```

**解決方案**：
1. 檢查 `service-account-key.json` 檔案是否存在
2. 確認檔案路徑在環境變數中正確設定
3. 驗證 service account 權限

### Volume Mount 錯誤
```
Error: ENOENT: no such file or directory
```

**解決方案**：
1. 確認檔案在主機上存在
2. 檢查 Docker 檔案共享設定
3. 驗證檔案權限

### 網路連線問題
```
Error: getaddrinfo ENOTFOUND storage.googleapis.com
```

**解決方案**：
1. 檢查網路連線
2. 確認防火牆設定
3. 驗證 DNS 解析

## 建議的部署流程

### 開發環境
1. 使用 docker-compose.yml
2. Volume mount 金鑰檔案
3. 啟用詳細日誌

### 測試環境
1. 使用映像內嵌金鑰
2. 自動化測試腳本
3. 健康檢查

### 生產環境
1. 使用 Kubernetes 或類似平台
2. IAM 角色認證
3. 監控和警報
4. 自動擴展
