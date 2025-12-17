#!/bin/bash

# 在 host 主機上建立 ChromaDB 的腳本

echo "🔧 檢查 Python 虛擬環境..."

# 如果 venv 不存在，創建它
if [ ! -d "venv" ]; then
    echo "📦 創建 Python 虛擬環境..."
    python3 -m venv venv
fi

# 啟動虛擬環境並安裝依賴
echo "📥 安裝 Python 套件..."
source venv/bin/activate
pip install -q -r requirements.txt

# 載入環境變數
if [ -f .env ]; then
    echo "📋 載入環境變數..."
    export $(grep -v '^#' .env | xargs)
fi

# 建立 ChromaDB
echo "🗃️  開始建立 ChromaDB..."
python rebuild_chromadb.py

echo "✅ ChromaDB 建立完成！"
echo "📁 資料庫位置: ./chroma_db"
echo ""
echo "現在可以執行 bash rebuild.sh 來部署了"
