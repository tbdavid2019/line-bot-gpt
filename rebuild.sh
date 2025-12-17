

# 記得要  bash build_chromadb_local.sh
# 在執行 bash rebuild.sh
#!/bin/bash

# 檢查 chroma_db 是否存在
if [ ! -d "chroma_db" ]; then
    echo "⚠️  警告：chroma_db 資料夾不存在！"
    echo "📦 正在建立 ChromaDB..."
    bash build_chromadb_local.sh
    echo ""
fi

docker stop line-bot-gpt && docker rm line-bot-gpt
docker build --network=host -t line-bot-gpt .
docker run -dp 8111:8111 --env-file .env --name line-bot-gpt --restart unless-stopped line-bot-gpt

# 查看日誌
# docker logs -f line-bot-gpt



# docker hub
docker tag line-bot-gpt tbdavid2019/line-bot-gpt:latest
docker push tbdavid2019/line-bot-gpt:latest

# 安全日常清潔
docker image prune -f
docker builder prune -f