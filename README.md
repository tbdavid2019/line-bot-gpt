
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
- 整合 Google Gemini 2.5 Flash 圖片生成功能
- 解答之書占卜服務
- 唐詩隨機推薦
- 淺草籤占卜
- 奇門遁甲占卜
- 台灣氣象署天氣特報
- 支援群組聊天（需要 @ 機器人）
- 通過環境變數配置 API 金鑰
- 支援 Docker 容器化

### 圖片生成功能

- **指令驅動**：使用 `!image`、`!畫圖`、`!img`、`!圖片`、`!產圖` 等指令後接描述文字
- **自然語言驅動**：在對話中包含「畫圖」、「image」、「幫我產生圖」、「生成圖片」等關鍵字
- **取消機制**：在生成過程中輸入「取消」、「退出」、「停止」等關鍵字可中止操作
- **雲端存儲**：支援 Google Cloud Storage，用戶可直接在 LINE 中查看圖片
- **本地備用**：如果雲端未配置，自動使用本地存儲

**使用範例：**

- `!畫圖 一隻可愛的小貓咪在花園裡玩耍`
- `幫我畫一張美麗的夕陽風景圖`
- `!image a cute robot playing with children`
- 生成過程中輸入 `取消` 可中止操作

- Integrated with OpenAI GPT-4 chatbot
- Integrated with Google Gemini 2.5 Flash image generation
- Answer Book divination service
- Random Tang poetry recommendations
- Asakusa temple fortune slips
- Qimen Dunjia divination
- Taiwan weather alerts
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
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_BOT_USER_ID=your_line_bot_user_id
OPEN_AI_LINE_SECRET=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
# Google Cloud Storage 設定 (可選，用於圖片存儲)
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_BUCKET_NAME=your_bucket_name
GOOGLE_CLOUD_KEY_FILE=path/to/service-account-key.json
PORT=8111
```

**重要提醒：** 
- 為了讓機器人在群組中只對被 @ 提及的訊息回應，您需要設定 `LINE_BOT_USER_ID`。這個 ID 可以在 LINE Developers Console 的機器人設定頁面找到。
- `GEMINI_API_KEY` 是用於圖片生成功能，您可以在 [Google AI Studio](https://makersuite.google.com/app/apikey) 取得 API Key。

**Important Note:** 
- To make the bot respond only to messages where it's mentioned (@) in groups, you need to set `LINE_BOT_USER_ID`. This ID can be found in the bot settings page of the LINE Developers Console.
- `GEMINI_API_KEY` is used for image generation feature. You can get the API key from [Google AI Studio](https://makersuite.google.com/app/apikey).

## 安裝與執行 (Installation and Running) (方法2)

1. 您可以從 Docker Hub 拉取現成的映像：

   You can pull the ready-to-use image from Docker Hub:
   ```bash
   sudo docker pull tbdavid2019/line-bot-gpt:latest
   ```


2. 在 `.env` 文件中，您需要配置以下環境變數： (可以 mv example.env .env)

In the `.env` file, you need to configure the following environment variables:

```bash
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_BOT_USER_ID=your_line_bot_user_id
OPEN_AI_LINE_SECRET=your_openai_api_key
PORT=8111
```   

3. 使用 Docker 啟動容器：
   
   Run the Docker container:
   ```bash
   sudo docker run -dp 8111:8111 --env-file .env tbdavid2019/line-bot-gpt:latest
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
- [ ] Docker 環境 - 如要使用 Docker 部署

