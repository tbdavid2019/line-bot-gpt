
docker stop line-bot-gpt && docker rm line-bot-gpt
docker build --network=host -t line-bot-gpt .
docker run -dp 8111:8111 --env-file .env --name line-bot-gpt --restart unless-stopped line-bot-gpt

# 等待容器啟動
sleep 3

# 建立 ChromaDB（只需執行一次）
docker exec line-bot-gpt /usr/src/app/venv/bin/python /usr/src/app/rebuild_chromadb.py

# 查看日誌
docker logs -f line-bot-gpt





# 安全日常清潔
docker image prune -f
docker builder prune -f


# docker hub
docker tag line-bot-gpt tbdavid2019/line-bot-gpt:latest
docker push tbdavid2019/line-bot-gpt:latest
