# 使用最新的 Node.js LTS 版本
FROM node:20

# 設置工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安裝項目依賴
RUN npm install

# 明確安裝 Line Bot SDK、Express 和 dotenv
RUN npm install @line/bot-sdk express dotenv

# 將源代碼複製到容器中
COPY . .

# 暴露應用程式運行的端口
EXPOSE 8111

# 定義環境變量
ENV NODE_ENV=production

# 運行應用程式
CMD [ "node", "index.js" ]

