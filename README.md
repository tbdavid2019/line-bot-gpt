
# Line Bot with GPT Integration

## 目錄 (Table of Contents)

- [專案簡介 (Project Introduction)](#專案簡介-project-introduction)
- [功能 (Features)](#功能-features)
- [安裝與執行 (Installation and Running)](#安裝與執行-installation-and-running)
- [環境變數 (Environment Variables)](#環境變數-environment-variables)
- [使用 Docker (Using Docker)](#使用-docker-using-docker)
- [授權 (License)](#授權-license)

## 專案簡介 (Project Introduction)

此專案是一個基於 [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/) 的 Line Bot，並整合了 [OpenAI GPT-4](https://openai.com/) 來處理用戶的對話內容。

This project is a Line Bot based on the [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/), integrated with [OpenAI GPT-4](https://openai.com/) to handle user conversations.

## 功能 (Features)

- 通過環境變數配置 OpenAI 和 LINE API 的金鑰
- 支援 Docker 容器化

- OpenAI and LINE API keys are configured via environment variables.
- Supports Docker containerization.

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
OPEN_AI_LINE_SECRET=your_openai_api_key
PORT=8111
```

## 安裝與執行 (Installation and Running) (方法2)

1. 您可以從 Docker Hub 拉取現成的映像：

   You can pull the ready-to-use image from Docker Hub:
   ```bash
   sudo docker pull tbdavid2019/line-bot-gpt:latest
   ```


2. 在 `.env` 文件中，您需要配置以下環境變數：

In the `.env` file, you need to configure the following environment variables:

```bash
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret
OPEN_AI_LINE_SECRET=your_openai_api_key
PORT=8111
```   

3. 使用 Docker 啟動容器：
   
   Run the Docker container:
   ```bash
   sudo docker run -dp 8111:8111 --env-file .env tbdavid2019/line-bot-gpt:latest
   ```

## 授權 (License)

本項目使用 MIT 許可證，詳細資訊請參閱 [LICENSE](LICENSE) 文件。

This project is licensed under the MIT License. For more details, see the [LICENSE](LICENSE) file.
