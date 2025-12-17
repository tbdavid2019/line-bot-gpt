
# Line Bot with GPT Integration

## 示範機器人 Demo Line Bot

直接點選連結 加入 Line Bot 後使用

https://liff.line.me/1645278921-kWRPP32q/?accountId=728wsrjq



![image_2024_09_01T23_38_38_700Z](https://github.com/user-attachments/assets/52c9e274-8019-4e68-a58d-9a7f26d7423a)
![image](https://github.com/user-attachments/assets/3cd099af-861f-45ea-92c3-5062a0f42142)
![image](https://github.com/user-attachments/assets/61fbcb73-6cec-4827-9b89-450a33acce94)
![image](https://github.com/user-attachments/assets/d9e418f1-36b5-447f-b3dc-1f72089910f1)
![alt text](image.png)



## 目錄 (Table of Contents)

- [Line Bot with GPT Integration](#line-bot-with-gpt-integration)
  - [示範機器人 Demo Line Bot](#示範機器人-demo-line-bot)
  - [目錄 (Table of Contents)](#目錄-table-of-contents)
  - [專案簡介 (Project Introduction)](#專案簡介-project-introduction)
  - [功能 (Features)](#功能-features)
    - [圖片生成功能](#圖片生成功能)
  - [文檔指南 (Documentation Guide)](#文檔指南-documentation-guide)
    - [📚 主要文檔](#-主要文檔)
    - [🔧 技術文檔](#-技術文檔)
    - [📖 快速導航](#-快速導航)
      - [🚀 新手入門](#-新手入門)
      - [🎨 圖片生成功能](#-圖片生成功能)
      - [🐳 Docker 部署](#-docker-部署)
      - [⚙️ 進階設定](#️-進階設定)
    - [💡 使用建議](#-使用建議)
  - [安裝與執行 (Installation and Running) (方法1)](#安裝與執行-installation-and-running-方法1)
  - [環境變數 (Environment Variables)](#環境變數-environment-variables)
  - [安裝與執行 (Installation and Running) (方法2)](#安裝與執行-installation-and-running-方法2)
  - [專案結構 (Project Structure)](#專案結構-project-structure)
    - [📁 重要檔案說明](#-重要檔案說明)
    - [🎯 設定檢查清單](#-設定檢查清單)


## 專案簡介 (Project Introduction)

此專案是一個基於 [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/) 的 Line Bot，並整合了 [OpenAI GPT-5](https://openai.com/) 來處理用戶的對話內容。

This project is a Line Bot based on the [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/), integrated with [OpenAI GPT-4](https://openai.com/) to handle user conversations.

## 功能 (Features)

- 整合 OpenAI GPT-4 聊天機器人
- 整合 Google Gemini Flash Latest AI 視覺功能
  - 🔍 **圖片分析**：上傳圖片讓 AI 分析內容（看圖說話）
  - ✏️ **圖片編輯**：基於現有圖片進行 AI 編輯
  - 🎨 **文字生成圖片**：從文字描述生成全新圖片
- 解答之書占卜服務
- 唐詩隨機推薦
- 淺草籤占卜
- 奇門遁甲占卜
- 台灣氣象署天氣特報
- 台灣法律諮詢（整合台灣法律 LLM）
- 📍 **周邊設施查詢**：傳送位置資訊，查找附近加油站、超商、餐廳、咖啡廳、停車場、ATM 等設施
- 🍲 **大同電鍋食譜助手**：使用 RAG 技術提供大同電鍋食譜查詢（支援繁體中文語義搜尋）
- 支援群組聊天（需要 @ 機器人）

- 通過環境變數配置 API 金鑰
- 支援 Docker 容器化

### 🔍 圖片分析功能（NEW！）

讓 AI 幫你「看圖說話」，分析圖片內容並回答問題。

**使用方式：**
1. 傳送圖片給 Bot
2. 輸入你的問題或直接點選「🔍 分析圖片」

**分析範例：**
- `這是什麼？` → AI 會描述圖片內容
- `這張照片是在哪裡拍的？` → AI 會根據場景推測地點
- `圖片裡有什麼？` → AI 會列出圖片中的物體
- `請描述這張圖片` → AI 會提供詳細描述

**自動觸發關鍵字：**
這是什麼、分析、看圖、描述、辨識、有什麼、what is、describe 等

### ✏️ 圖片編輯功能（NEW！）

基於現有圖片進行 AI 編輯，改變風格、背景或添加元素。

**使用方式：**
1. 傳送圖片給 Bot
2. 輸入編輯指令或點選「✏️ 編輯圖片」

**編輯範例：**
- `把背景改成海邊` → 更換圖片背景
- `改成卡通風格` → 轉換藝術風格
- `加上彩虹和雲朵` → 添加新元素
- `讓顏色更鮮豔` → 調整色調

**自動觸發關鍵字：**
編輯、修改、改成、變成、把...改、加上、背景、風格、edit、change 等

### 🎨 文字生成圖片功能

從零開始，用文字描述生成全新圖片。

**使用方式：**
- **指令驅動**：`!畫圖 一隻可愛的小貓咪`、`!image a sunset`
- **自然語言驅動**：在對話中包含「畫圖」、「幫我產生圖」等關鍵字
- **取消機制**：生成過程中輸入「取消」可中止

**生成範例：**
- `!畫圖 一隻可愛的小貓咪在花園裡玩耍`
- `幫我畫一張美麗的夕陽風景圖`
- `!image a futuristic city with flying cars`

### 📍 周邊設施查詢（NEW！）

想知道附近有哪些設施？傳送位置給機器人即可！

**使用方式：**
1. 輸入「選擇服務」→ 點選「📍 找附近設施」
2. 或直接點選 LINE 輸入框左側的 `+` 號 → 選擇「位置資訊」
3. 點擊「📍 分享我的位置」按鈕
4. 選擇想查找的設施類型

**支援查找類別：**
- ⛽ 加油站
- 🅿️ 停車場
- 🏪 超商
- ☕ 咖啡廳
- 🍴 餐廳
- 🏧 ATM

**特色功能：**
- 📍 位置資訊保留 30 分鐘，可重複查詢不同類型
- 🗺️ 以 Flex Message Carousel 展示最多 10 個附近地點
- 📊 包含評分、距離、營業時間等資訊
- 🔗 可直接開啟 Google Maps 導航

### 🍲 大同電鍋食譜助手（NEW！）

不知道怎麼用電鍋做菜？問問大同食譜助手！

**使用方式：**
1. 輸入「大同食譜」進入食譜模式
2. 直接輸入想做的料理名稱（例如：「蒸蛋」、「滷肉」、「紅燒牛肉」）
3. 輸入「退出」結束食譜模式

**技術特色：**
- 🤖 **RAG 技術**：使用 ChromaDB 向量資料庫 + OpenAI Embedding
- 🇹🇼 **繁體中文優化**：採用 OpenAI text-embedding-3-small 模型，對繁體中文語義理解極佳
- 📚 **豐富食譜庫**：包含 584 個大同電鍋官方食譜
- 🎯 **精準檢索**：能理解「蒸蛋」、「滷肉」等繁體中文詞彙的語義
- ⚡ **快速回應**：向量搜尋 + GPT-4o 生成，秒級回應

**查詢範例：**
- 「蒸蛋」→ 找到電鍋蒸蛋做法
- 「滷肉」→ 取得滷肉食譜步驟
- 「排骨湯」→ 學習如何用電鍋煮排骨湯


### 📊 功能對比表

| 功能 | 輸入 | 輸出 | 使用情境 |
|------|------|------|----------|
| 圖片分析 🔍 | 圖片 + 問題 | 文字描述 | 想知道圖片內容、辨識物體 |
| 圖片編輯 ✏️ | 圖片 + 編輯指令 | 編輯後的圖片 | 修改現有圖片的風格或內容 |
| 文字生成圖片 🎨 | 文字描述 | 全新圖片 | 從零創作、實現想像 |

---

- Integrated with OpenAI GPT-4 chatbot
- Integrated with Google Gemini 2.5 Flash AI Vision features
  - 🔍 **Image Analysis**: Upload images for AI content analysis
  - ✏️ **Image Editing**: AI-powered editing of existing images
  - 🎨 **Text-to-Image**: Generate new images from text descriptions
- Answer Book divination service
- Random Tang poetry recommendations
- Asakusa temple fortune slips
- Qimen Dunjia divination
- Taiwan weather alerts
- Taiwan legal consultation (integrated with Taiwan Legal LLM)
- Group chat support (requires @ mention)
- OpenAI and LINE API keys are configured via environment variables
- Supports Docker containerization

## 文檔指南 (Documentation Guide)

本專案包含多個詳細的說明文檔，請根據您的需求選擇適合的文檔：

### 📚 主要文檔

| 文檔名稱 | 用途 | 適用對象 |
|---------|------|----------|
| [README.md](README.md) | 專案概覽和基本設定 | 所有用戶 |
| [IMAGE_GENERATION_GUIDE.md](IMAGE_GENERATION_GUIDE.md) | 圖片生成功能詳細使用說明 | 想要使用 AI 圖片生成的用戶 |
| [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) | Google Cloud Storage 設定指南 | 需要雲端圖片存儲的用戶 |
| [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) | Docker 部署完整指南 | 使用 Docker 部署的用戶 |

### 🔧 技術文檔

- **[test_image_generation.js](test_image_generation.js)** - 圖片生成功能測試腳本
- **[example.env](example.env)** - 環境變數設定範例
- **[docker-compose.yml](docker-compose.yml)** - Docker Compose 配置檔案
- **[Dockerfile](Dockerfile)** - Docker 映像建置檔案

### 📖 快速導航

#### 🚀 新手入門
1. 先閱讀本 [README.md](README.md) 了解專案概覽
2. 按照 [安裝與執行](#安裝與執行-installation-and-running) 部分設定基本環境
3. 如需圖片生成功能，參考 [IMAGE_GENERATION_GUIDE.md](IMAGE_GENERATION_GUIDE.md)

#### 🎨 圖片生成功能
1. 閱讀 [IMAGE_GENERATION_GUIDE.md](IMAGE_GENERATION_GUIDE.md) 了解功能使用方式
2. 如需雲端存儲，參考 [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)
3. 使用 `npm run test-image` 測試功能

#### 🐳 Docker 部署
1. 閱讀 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md) 了解完整部署流程
2. 使用 [docker-compose.yml](docker-compose.yml) 進行部署
3. 參考 [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) 設定雲端存儲（可選）

#### ⚙️ 進階設定
- **環境變數**: 參考 [example.env](example.env) 和 [環境變數](#環境變數-environment-variables) 章節
- **Google Cloud**: 詳細設定請參考 [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)
- **故障排除**: 各文檔都包含故障排除章節

### 💡 使用建議

- **第一次使用**: 建議按順序閱讀 README.md → IMAGE_GENERATION_GUIDE.md
- **生產部署**: 必讀 DOCKER_DEPLOY.md 和 GOOGLE_CLOUD_SETUP.md
- **功能測試**: 使用 test_image_generation.js 驗證設定
- **問題解決**: 每個文檔都有詳細的故障排除章節

## 安裝與執行 (Installation and Running) (方法1)

1. 克隆此倉庫到本地：
   
   Clone this repository to your local machine:
   ```bash
   git clone https://github.com/tbdavid2019/line-bot-gpt.git
   cd line-bot-gpt
   ```

2. 安裝相依套件：
   
   Install dependencies:
   ```bash
   npm install
   ```

3. 複製並修改環境變數文件：
   
   Copy and modify the environment variables file:
   ```bash
   mv example.env .env
   # 然後打開 .env 文件，填入您的 LINE 和 OpenAI API 金鑰
   # Then open the .env file and enter your LINE and OpenAI API keys
   ```

4. 啟動應用程式：
   
   Start the application:
   ```bash
   node index.js
   ```

## 環境變數 (Environment Variables)

在 `.env` 文件中，您需要配置以下環境變數：

In the `.env` file, you need to configure the following environment variables:

```bash
# LINE Bot 設定
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_BOT_USER_ID=your_line_bot_user_id

# OpenAI 設定
OPEN_AI_LINE_SECRET=your_openai_api_key
OPEN_AI_MODEL=gpt-4o-mini
OPEN_AI_BASE_PATH=https://api.openai.com/v1

# Gemini AI 設定
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-image-preview          # 用於圖片生成/編輯
GEMINI_VISION_MODEL=gemini-2.5-flash                 # 用於圖片分析（看圖說話）

# 圖片功能開關（可選）
ENABLE_IMAGE_ANALYSIS=true
ENABLE_IMAGE_EDITING=true

# Google Cloud Storage 設定（可選，用於圖片存儲）
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_BUCKET_NAME=your_bucket_name

# Google Maps API（用於周邊設施查詢）
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Python RAG 服務設定（大同食譜功能）
PYTHON_PATH=./venv/bin/python
RAG_SCRIPT_PATH=rag_service.py

# 注意：大同食譜 RAG 功能使用 OPEN_AI_LINE_SECRET 來生成 embedding
# 確保 OPEN_AI_LINE_SECRET 已設定，否則食譜搜尋功能無法運作
```

**重要說明：**
- `OPEN_AI_LINE_SECRET` 同時用於：GPT 對話、圖片生成、大同食譜 RAG embedding
- `GEMINI_API_KEY` 用於：圖片分析（視覺功能）
- `GOOGLE_MAPS_API_KEY` 用於：周邊設施查詢功能
GOOGLE_CLOUD_KEY_FILE=path/to/service-account-key.json

# 伺服器設定
PORT=8111
```

### 🔑 重要環境變數說明

#### LINE Bot 設定
- `LINE_CHANNEL_ACCESS_TOKEN`：LINE 頻道存取權杖
- `LINE_CHANNEL_SECRET`：LINE 頻道密鑰
- `LINE_BOT_USER_ID`：機器人用戶 ID（用於群組 @ 提及判斷）

#### Gemini AI 模型設定
- `GEMINI_MODEL`：**圖片生成/編輯模型**
  - 預設：`gemini-2.5-flash-image-preview`
  - 用途：從文字生成圖片、編輯現有圖片
  - 輸出：**圖片**

- `GEMINI_VISION_MODEL`：**圖片分析模型（LLM 看圖）**
  - 預設：`gemini-2.5-flash`
  - 用途：分析圖片內容、回答圖片相關問題
  - 輸出：**文字描述**

#### Google Cloud Storage（可選但推薦）
- 用於儲存生成/編輯的圖片
- 如果未配置，圖片會保存到本地 `images` 資料夾
- 詳細設定請參考 [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)

---

**重要提醒：** 

**Important Note:** 

- ✅ **群組功能**：設定 `LINE_BOT_USER_ID` 讓機器人只回應被 @ 的訊息
- ✅ **圖片功能**：需要設定 `GEMINI_API_KEY`，可在 [Google AI Studio](https://makersuite.google.com/app/apikey) 取得
- ✅ **模型區分**：
  - `GEMINI_MODEL` = 生成/編輯圖片（輸出圖片）
  - `GEMINI_VISION_MODEL` = 分析圖片（輸出文字）
- ⚠️ **不要搞混模型用途**，否則功能會異常！

## 安裝與執行 (Installation and Running) (方法2)

### 🐳 使用 Docker 快速部署（推薦）

**方式 A：使用 Docker Hub 映像**

1. 拉取現成的映像：
   ```bash
   docker pull tbdavid2019/line-bot-gpt:latest
   ```

2. 設定環境變數（可以 `mv example.env .env`）

3. 啟動容器：
   ```bash
   docker run -dp 8111:8111 --env-file .env --name line-bot-gpt tbdavid2019/line-bot-gpt:latest
   ```

4. **建立 ChromaDB 資料庫（僅首次需要）：**
   ```bash
   docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rebuild_chromadb.py
   ```
   > ⏱️ 此步驟約需 2-3 分鐘，會使用 OpenAI API 生成 embeddings

**方式 B：本地建置映像**

1. 克隆專案：
   ```bash
   git clone https://github.com/tbdavid2019/line-bot-gpt.git
   cd line-bot-gpt
   ```

2. 設定 `.env` 文件

3. 使用快速部署腳本：
   ```bash
   bash rebuild.sh
   ```
   或手動執行：
   ```bash
   # 建置映像
   docker build -t line-bot-gpt .
   
   # 啟動容器
   docker run -dp 8111:8111 --env-file .env --name line-bot-gpt --restart unless-stopped line-bot-gpt
   
   # 建立 ChromaDB（僅首次需要）
   docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rebuild_chromadb.py
   ```

### 📝 重要提醒

1. **ChromaDB 建立**：
   - 只需執行一次，之後更新程式碼不需要重建
   - 如需更新食譜資料庫，再次執行 rebuild_chromadb.py 即可

2. **環境變數檢查**：
   - `OPEN_AI_LINE_SECRET` 必須設定（用於對話、圖片生成、食譜 RAG）
   - `GEMINI_API_KEY` 用於圖片分析功能
   - `GOOGLE_MAPS_API_KEY` 用於周邊設施查詢

3. **健康檢查**：
   ```bash
   curl http://localhost:8111/health
   ```

## 專案結構 (Project Structure)

```
line-bot-gpt/
├── 📄 主要程式檔案
│   ├── index.js                    # 主程式檔案
│   ├── package.json                # NPM 套件設定
│   └── package-lock.json           # 套件版本鎖定
│
├── 🔧 設定檔案
│   ├── .env                        # 環境變數設定（需自行建立）
│   ├── example.env                 # 環境變數範例
│   ├── .gitignore                  # Git 忽略清單
│   └── .dockerignore              # Docker 忽略清單
│
├── 🐳 Docker 相關
│   ├── Dockerfile                  # Docker 映像建置檔案
│   ├── docker-compose.yml          # Docker Compose 設定
│   └── rebuild.sh                  # 快速重新部署腳本
│
├── 🍲 大同食譜 RAG 功能
│   ├── rag_service.py              # RAG 查詢服務（Python）
│   ├── rebuild_chromadb.py         # ChromaDB 資料庫建立腳本
│   ├── tatung_recipes_51_634.jsonl # 食譜原始資料（584 筆）
│   ├── requirements.txt            # Python 套件需求
│   └── chroma_db/                  # ChromaDB 向量資料庫目錄
│
├── 🗺️ 周邊設施查詢
│   └── maps_helper.js              # Google Maps API 整合模組
│
├── 📚 說明文檔
│   ├── README.md                   # 📖 專案主要說明（您正在閱讀）
│   ├── IMAGE_GENERATION_GUIDE.md   # 🎨 圖片生成功能使用指南
│   ├── GOOGLE_CLOUD_SETUP.md       # ☁️ Google Cloud Storage 設定指南
│   └── DOCKER_DEPLOY.md            # 🐳 Docker 部署完整指南
│
├── 🧪 測試相關
│   └── test_image_generation.js    # 圖片生成功能測試腳本
│
└── 📁 資料夾
    ├── images/                     # 🖼️ 生成的圖片存放處
    ├── test_images/               # 🧪 測試圖片存放處
    └── service-account-key.json   # 🔑 Google Cloud 金鑰（需自行新增）
```

### 📁 重要檔案說明

| 檔案/資料夾 | 說明 | 是否必須 |
|------------|------|----------|
| `index.js` | 主程式，包含所有機器人邏輯 | ✅ 必須 |
| `.env` | 環境變數設定，包含 API Keys | ✅ 必須 |
| `service-account-key.json` | Google Cloud 認證金鑰 | ⚠️ 圖片功能需要 |
| `images/` | 本地生成圖片存放處 | 📁 自動建立 |
| `IMAGE_GENERATION_GUIDE.md` | 圖片功能詳細說明 | 📖 建議閱讀 |
| `DOCKER_DEPLOY.md` | Docker 部署指南 | 🐳 Docker 用戶必讀 |

### 🎯 設定檢查清單

在開始使用前，請確認以下檔案已正確設定：

- [ ] `.env` - 複製 `example.env` 並填入您的 API Keys
- [ ] `service-account-key.json` - 如需圖片功能，請參考 [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)
- [ ] NODE.js 環境 - 版本 18 或更高
- [ ] Python 環境 - 用於 RAG 功能（Docker 會自動處理）
- [ ] Docker 環境 - 如要使用 Docker 部署

---

## 🆕 新功能部署說明

### 周邊設施查詢功能

**需要的設定：**
1. 在 `.env` 中設定 `GOOGLE_MAPS_API_KEY`
2. 在 Google Cloud Console 啟用 Places API (New)
3. 設定 HTTP referrers 限制（建議加入 `https://tbdavid2019.github.io/`）

**測試方式：**
- 在 LINE 中輸入「選擇服務」→「找附近設施」
- 或直接分享位置給機器人

### 大同食譜 RAG 功能

**首次部署步驟：**

1. **確保環境變數設定完整**：
   ```bash
   OPEN_AI_LINE_SECRET=your_openai_api_key  # 必須！用於生成 embeddings
   ```

2. **啟動容器**：
   ```bash
   docker run -dp 8111:8111 --env-file .env --name line-bot-gpt --restart unless-stopped line-bot-gpt
   ```

3. **建立 ChromaDB 資料庫**（僅首次需要）：
   ```bash
   docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rebuild_chromadb.py
   ```
   > ⏱️ 約需 2-3 分鐘，會處理 584 個食譜並生成 embeddings

4. **驗證功能**：
   ```bash
   # 測試查詢
   docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rag_service.py "蒸蛋"
   ```

**RAG 技術架構：**
- 📚 **向量資料庫**：ChromaDB 0.4.22
- 🤖 **Embedding 模型**：OpenAI text-embedding-3-small（1536 維）
- 🇹🇼 **中文優化**：專為繁體中文語義搜尋優化
- 📊 **資料規模**：584 個食譜，約 3400+ 個文本片段
- ⚡ **查詢速度**：向量搜尋 < 100ms，完整回應 < 3 秒

**常見問題：**

Q: 為什麼要用 OpenAI Embedding？
A: 對繁體中文語義理解最好，能正確理解「蒸蛋」、「滷肉」等詞彙

Q: 可以更新食譜資料嗎？
A: 可以！編輯 `tatung_recipes_51_634.jsonl`，然後重新執行 `rebuild_chromadb.py`

Q: 建立 ChromaDB 需要多久？
A: 約 2-3 分鐘，取決於網路速度（需呼叫 OpenAI API）

---
