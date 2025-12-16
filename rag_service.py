import sys
import json
import chromadb
import os
import google.generativeai as genai

# Disable telemetry
os.environ["ANONYMIZED_TELEMETRY"] = "False"

def query_chroma(query_text, n_results=3):
    try:
        # Check if chroma_db directory exists
        db_path = "./chroma_db"
        if not os.path.exists(db_path):
             return json.dumps({"error": "ChromaDB directory not found"})

        # Initialize Gemini
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return json.dumps({"error": "GEMINI_API_KEY not set"})
        
        genai.configure(api_key=api_key)
        
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
            
        collection = collections[0]  # Use first collection (tatung_recipes)
        
        # Generate query embedding using Gemini
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=query_text
        )
        query_embedding = result['embedding']
        
        # Query ChromaDB
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        # Extract documents
        docs = results['documents'][0]
        
        return json.dumps({"documents": docs})
        
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)
        
    query = sys.argv[1]
    print(query_chroma(query))

