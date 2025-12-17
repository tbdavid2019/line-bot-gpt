# 使用 Node.js 22 Slim (Debian based) 以獲得更好的 Python 相容性
FROM node:22-slim

# 設置工作目錄
WORKDIR /usr/src/app

# 安裝系統依賴 (Python 和 Build tools)
RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  python3-venv \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝 Node.js 依賴
RUN npm ci --omit=dev

# 複製 requirements.txt
COPY requirements.txt ./

# 建立 Python 虛擬環境並安裝依賴
RUN python3 -m venv venv && \
  ./venv/bin/pip install --no-cache-dir -r requirements.txt

# 創建必要的目錄並設置權限
RUN mkdir -p images test_images && \
  chown -R node:node images test_images

# 將源代碼複製到容器中
COPY --chown=node:node . .

# 複製 Google Cloud 金鑰檔案
COPY --chown=node:node service-account-key.json* ./

# 注意：ChromaDB 需要在容器啟動後手動建立
# 執行：docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rebuild_chromadb.py

# 切換到非 root 用戶
USER node

# 暴露應用程式運行的端口
EXPOSE 8111

# 定義環境變量
ENV NODE_ENV=production

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8111/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 運行應用程式
CMD [ "node", "index.js" ]
