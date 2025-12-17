# -*- coding: utf-8 -*-
"""
大同食譜資料庫重建腳本
使用 OpenAI Embedding (對繁體中文友善)

使用方法：
1. 確保已安裝：pip install chromadb==0.4.22 beautifulsoup4 lxml tqdm requests openai
2. 設定 OPEN_AI_LINE_SECRET 環境變數
3. 執行：python rebuild_chromadb.py
"""

import os
import json
import hashlib
import time
import random
import requests
import chromadb
from bs4 import BeautifulSoup
from tqdm import tqdm
import re
from openai import OpenAI

# ========= 設定 =========
PERSIST_DIR = "./chroma_db"
COLLECTION_NAME = "tatung_recipes"
OUT_JSONL = "./tatung_recipes_51_634.jsonl"

# Initialize OpenAI client
OPENAI_API_KEY = os.environ.get("OPEN_AI_LINE_SECRET")
if not OPENAI_API_KEY:
    raise ValueError("請設定 OPEN_AI_LINE_SECRET 環境變數")

openai_client = OpenAI(api_key=OPENAI_API_KEY)

def get_openai_embeddings_batch(texts):
    """使用 OpenAI 批次生成 embeddings"""
    try:
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        print(f"⚠️ OpenAI embedding 錯誤: {e}")
        raise

# ========= HTML 抓取 =========
def fetch_html(url: str) -> str:
    r = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 (compatible; RAGBot/1.0)"}
    )
    r.raise_for_status()
    r.encoding = "utf-8"
    return r.text

def fetch_html_retry(url: str, retries: int = 3, base_sleep: float = 0.8) -> str:
    last_err = None
    for i in range(1, retries + 1):
        try:
            return fetch_html(url)
        except Exception as e:
            last_err = e
            time.sleep(base_sleep * i + random.random())
    raise RuntimeError(f"fetch failed: {url} err={last_err}")

# ========= 解析食譜 =========
def clean_text(s: str) -> str:
    if not s:
        return ""
    s = s.strip()
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s

def _node_text(node) -> str:
    if not node:
        return ""
    for br in node.find_all("br"):
        br.replace_with("\n")
    return node.get_text("\n", strip=True)

def parse_recipe(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    
    # 標題
    title = ""
    title_wrap = soup.select_one(".title01")
    if title_wrap:
        h = title_wrap.find(["h1", "h2"])
        if h:
            title = h.get_text(" ", strip=True)
        else:
            raw = title_wrap.get_text("\n", strip=True)
            first_line = raw.split("\n", 1)[0].strip()
            title = first_line.split("步驟")[0].strip()
    
    if not title:
        title = soup.title.get_text(" ", strip=True) if soup.title else url
    
    # 食材
    ingredients = ""
    candidates = soup.find_all(string=lambda t: t and t.strip() in ("食材", "材料"))
    for t in candidates:
        container = t.parent
        for _ in range(8):
            if not container:
                break
            if container.name in ("div", "section", "article"):
                txt = _node_text(container)
                if 30 < len(txt) < 2000:
                    txt = re.sub(r"^(食材|材料)\s*", "", txt).strip()
                    if len(txt) > 10:
                        ingredients = txt
                        break
            container = container.parent
        if ingredients:
            break
    
    # 步驟
    lefts = soup.select(".step-left")
    rights = soup.select(".step-right")
    step_texts = []
    n = max(len(lefts), len(rights))
    
    def extract_step_text(node):
        if not node:
            return ""
        txt = _node_text(node)
        txt = re.sub(r"^步驟\s*\d+\s*", "", txt)
        txt = re.sub(r"^\d+\s*", "", txt)
        return txt.strip()
    
    for i in range(n):
        ltxt = extract_step_text(lefts[i]) if i < len(lefts) else ""
        rtxt = extract_step_text(rights[i]) if i < len(rights) else ""
        combined = (rtxt if len(rtxt) >= len(ltxt) else ltxt).strip()
        
        if not combined or combined.startswith("食材") or combined.startswith("材料") or len(combined) < 3:
            continue
        
        step_texts.append(combined)
    
    steps = "\n\n".join([f"{i+1}. {t}" for i, t in enumerate(step_texts)])
    
    # 圖片
    image_urls = []
    for img in soup.select("img"):
        src = img.get("src") or ""
        if src.startswith("/"):
            src = "http://cooking.tatung.com.tw" + src
        if src.startswith("http") and "file/get" in src:
            image_urls.append(src)
    image_urls = list(dict.fromkeys(image_urls))
    
    return {
        "url": url,
        "title": clean_text(title),
        "ingredients": clean_text(ingredients),
        "steps": clean_text(steps),
        "image_urls": image_urls,
    }

# ========= JSONL 處理 =========
def load_done_urls(path: str) -> set:
    if not os.path.exists(path):
        return set()
    done = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                obj = json.loads(line)
                if "url" in obj:
                    done.add(obj["url"])
            except:
                pass
    return done

def append_jsonl(path: str, obj: dict):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

# ========= Gemini Embedding =========
def gemini_embed_batch(texts, retries=6):
    last_err = None
    for i in range(retries):
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=texts
            )
            return result['embedding']
        except Exception as e:
            last_err = e
            time.sleep(min(20, 2**i) + random.random())
    raise last_err

# ========= Chunk 處理 =========
def make_id(url, section, text):
    return hashlib.sha1((url + "|" + section + "|" + text).encode("utf-8")).hexdigest()

def to_chunks(recipe):
    url = recipe["url"]
    title = recipe.get("title", "").strip() or url
    head = f"# {title}\nURL: {url}\n"
    
    chunks = []
    
    ing = (recipe.get("ingredients") or "").strip()
    if ing:
        chunks.append({
            "section": "ingredients",
            "text": head + "\n## 食材\n" + ing
        })
    
    steps = (recipe.get("steps") or "").strip()
    if steps:
        parts = [p.strip() for p in steps.split("\n\n") if p.strip()]
        for i, p in enumerate(parts, 1):
            chunks.append({
                "section": f"step_{i}",
                "text": head + f"\n## 步驟 {i}\n{p}"
            })
    
    return chunks

# ========= 主要流程 =========
def main():
    print("🚀 開始重建大同食譜資料庫...\n")
    
    # 檢查 JSONL 檔案是否存在
    if not os.path.exists(OUT_JSONL):
        print(f"❌ 找不到 {OUT_JSONL} 檔案")
        print("請先準備好食譜 JSONL 檔案")
        return
    
    print(f"✅ 找到食譜檔案: {OUT_JSONL}")
    
    # 計算食譜數量
    recipe_count = 0
    with open(OUT_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                recipe_count += 1
    
    print(f"📋 共有 {recipe_count} 個食譜\n")
    
    # 直接建立 ChromaDB（跳過抓取步驟）
    print("🔧 建立 ChromaDB...")
    
    # 關閉 telemetry
    os.environ["ANONYMIZED_TELEMETRY"] = "False"
    
    chroma = chromadb.PersistentClient(path=PERSIST_DIR)
    
    # 刪除舊 collection（如果存在）
    try:
        chroma.delete_collection(name=COLLECTION_NAME)
    except:
        pass
    
    # 建立 collection（不指定 embedding function，手動提供 embeddings）
    col = chroma.create_collection(name=COLLECTION_NAME)
    
    # 4. Ingest 到 ChromaDB
    BATCH = 20  # OpenAI API 批次處理
    to_ids, to_docs, to_metas = [], [], []
    count_read = 0
    count_added = 0
    
    with open(OUT_JSONL, "r", encoding="utf-8") as f:
        for line in tqdm(f, desc="💾 寫入 ChromaDB"):
            if not line.strip():
                continue
            
            recipe = json.loads(line)
            count_read += 1
            
            chunks = to_chunks(recipe)
            img_urls = recipe.get("image_urls", [])
            img_str = ",".join(img_urls) if isinstance(img_urls, list) else ""
            
            for ch in chunks:
                cid = make_id(recipe["url"], ch["section"], ch["text"])
                to_ids.append(cid)
                to_docs.append(ch["text"])
                to_metas.append({
                    "url": recipe["url"],
                    "title": recipe.get("title", ""),
                    "section": ch["section"],
                    "image_urls": img_str
                })
            
            if len(to_docs) >= BATCH:
                # 使用 OpenAI 生成 embeddings
                embeddings = get_openai_embeddings_batch(to_docs)
                col.add(
                    ids=to_ids,
                    documents=to_docs,
                    metadatas=to_metas,
                    embeddings=embeddings
                )
                count_added += len(to_docs)
                to_ids, to_docs, to_metas = [], [], []
                time.sleep(0.5)  # 避免 rate limit
    
    # Flush 剩餘
    if to_docs:
        embeddings = get_openai_embeddings_batch(to_docs)
        col.add(
            ids=to_ids,
            documents=to_docs,
            metadatas=to_metas,
            embeddings=embeddings
        )
        count_added += len(to_docs)
    
    print(f"\n✅ 資料庫建立完成!")
    print(f"   - 食譜數: {count_read}")
    print(f"   - Chunk 數: {count_added}")
    print(f"   - 資料庫路徑: {PERSIST_DIR}\n")
    
    # 5. 測試查詢
    print("🧪 跳過測試查詢（節省 API 呼叫）")
    
    print("\n🎉 完成！")

if __name__ == "__main__":
    main()
