# 使用最新的 Node.js LTS 版本
FROM node:18-alpine

# 設置工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安裝項目依賴
RUN npm ci --only=production

# 創建必要的目錄並設置權限
RUN mkdir -p images test_images && \
    chown -R node:node images test_images

# 將源代碼複製到容器中（排除不必要的檔案）
COPY --chown=node:node . .

# 複製 Google Cloud 金鑰檔案（如果存在）
COPY --chown=node:node service-account-key.json* ./

# 切換到非 root 用戶以提高安全性
USER node

# 暴露應用程式運行的端口
EXPOSE 8111

# 定義環境變量
ENV NODE_ENV=production

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8111/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 運行應用程式
CMD [ "node", "index.js" ]

