docker build --network=host -t line-bot-gpt .

sudo docker run -dp 8111:8111 \
  --env-file .env \
  --name line-bot-gpt \
  --restart unless-stopped \
  line-bot-gpt


#!/bin/bash

# 停止現有容器
echo "停止現有容器..."
docker-compose down

# 清理舊的映像（可選）
echo "清理舊的映像..."
docker image prune -f

# 重新建置映像
echo "重新建置映像..."
docker-compose build --no-cache

# 啟動容器
echo "啟動容器..."
docker-compose up -d

# 顯示容器狀態
echo "容器狀態："
docker-compose ps

# 顯示日誌
echo "最新日誌："
docker-compose logs --tail=50 line-bot

echo "部署完成！"
echo "健康檢查: curl http://localhost:8111/health"


# 安全日常清潔
docker image prune -f
docker builder prune -f

