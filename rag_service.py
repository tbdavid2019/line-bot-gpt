import sys
import json
import chromadb
import os
from openai import OpenAI

# Disable telemetry
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.environ.get("OPEN_AI_LINE_SECRET"))

def get_openai_embedding(text):
    """使用 OpenAI 生成 embedding"""
    try:
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        raise Exception(f"OpenAI embedding failed: {str(e)}")

def query_chroma(query_text, n_results=10):
    try:
        # Check if chroma_db directory exists
        db_path = "./chroma_db"
        if not os.path.exists(db_path):
             return json.dumps({"error": "ChromaDB directory not found"})
        
        # Check OpenAI API key
        if not os.environ.get("OPEN_AI_LINE_SECRET"):
            return json.dumps({"error": "OPEN_AI_LINE_SECRET not set"})
        
        # Initialize ChromaDB client
        from chromadb.config import Settings
        client = chromadb.PersistentClient(
            path=db_path, 
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get collection
        collections = client.list_collections()
        if not collections:
            return json.dumps({"error": "No collections found in ChromaDB"})
            
        collection = collections[0]
        
        # 生成查詢的 embedding
        query_embedding = get_openai_embedding(query_text)
        
        # 使用 embedding 查詢
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        # Extract documents and distances
        docs = results['documents'][0] if results['documents'] else []
        distances = results.get('distances', [[]])[0]
        
        return json.dumps({
            "documents": docs,
            "distances": distances,
            "query": query_text,
            "method": "openai_embedding"
        })
        
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)
        
    query = sys.argv[1]
    print(query_chroma(query))

