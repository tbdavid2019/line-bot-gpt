# 變更日誌

## v1.2.1 - 2024-12-28

### 改進
- **模型配置可外部化**: 將硬編碼的 `gemini-2.5-flash-image-preview` 模型名稱改為可通過環境變數配置
- **新增環境變數**: 
  - `GEMINI_MODEL`: 指定 Gemini 圖片生成模型版本（預設: `gemini-2.5-flash-image-preview`）
- **提升可維護性**: 當 Google 發布新版本模型時，只需修改環境變數即可使用，無需修改程式碼

### 修改檔案
- `example.env`: 新增 `GEMINI_MODEL` 環境變數設定
- `index.js`: 將所有硬編碼的模型名稱替換為 `process.env.GEMINI_MODEL`
- `IMAGE_GENERATION_GUIDE.md`: 新增模型設定說明和配置指南

### 向前相容性
- 所有現有功能保持不變
- 如果未設定 `GEMINI_MODEL` 環境變數，會自動使用預設值 `gemini-2.5-flash-image-preview`

---

## v1.2.0 - 2024-12-28

### 新功能
- **圖片生成功能**: 使用 Google Gemini 2.5 Flash 模型生成圖片
- **雙重觸發方式**: 支援指令驅動（!image, !畫圖等）和自然語言驅動
- **Google Cloud Storage 整合**: 圖片上傳至雲端並提供公開 URL
- **取消機制**: 用戶可在生成過程中取消操作
- **Docker 支援**: 完整的 Docker 和 docker-compose 配置

### 技術改進
- 新增 Alpine Linux 為基礎的 Docker 映像
- 實作非 root 用戶執行
- 健康檢查機制
- 完整的文檔套件
