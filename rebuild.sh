sudo docker build -t line-bot-gpt .

sudo docker run -dp 8111:8111 \
  --env-file .env \
  --name line-bot-gpt \
  --restart unless-stopped \
  line-bot-gpt


# 停止並刪除舊的容器
docker stop line-bot-gpt  && docker rm line-bot-gpt
# 刪除無用的舊 image
docker image prune -f


pm2 start index2.js --name "my-line-bot"