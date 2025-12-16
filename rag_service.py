import sys
import json
import chromadb
import os

# Disable telemetry
os.environ["ANONYMIZED_TELEMETRY"] = "False"

def query_chroma(query_text, n_results=3):
    try:
        # Check if chroma_db directory exists
        db_path = "./chroma_db"
        if not os.path.exists(db_path):
             return json.dumps({"error": "ChromaDB directory not found"})

        from chromadb.config import Settings
        client = chromadb.PersistentClient(path=db_path, settings=Settings(anonymized_telemetry=False))
        
        # We assume the collection name is 'tatung_cookbook' or similar, 
        # but since we don't know for sure, we list collections.
        # Edit: The unzip output showed a UUID-like folder name inside. 
        # Chroma usually handles this if we point to the root.
        # But wait, the zip had 'chroma.sqlite3' at root level of zip?
        # Let's check the structure after unzip.
        
        # Based on unzip output:
        # tatung_chroma.zip contains:
        #   41101a4c-dc64-4131-b0d0-86636cad0a44/ (folder)
        #   chroma.sqlite3
        #   ...
        # So we point PersistentClient to the unzip directory.
        
        # List collections to find the right one
        collections = client.list_collections()
        if not collections:
            return json.dumps({"error": "No collections found in ChromaDB"})
            
        collection = collections[0] # Assume the first one is the one we want
        
        results = collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        
        # Extract documents and metadata
        docs = results['documents'][0]
        # metadatas = results['metadatas'][0] # Optional if we use it
        
        return json.dumps({"documents": docs})
        
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)
        
    query = sys.argv[1]
    print(query_chroma(query))
