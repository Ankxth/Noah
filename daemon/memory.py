import chromadb
import hashlib
import json
from datetime import datetime
from pathlib import Path

def get_db(project_root: str):
    noah_dir = Path(project_root) / ".noah"
    noah_dir.mkdir(exist_ok=True)
    client = chromadb.PersistentClient(path=str(noah_dir / "memory.db"))
    collection = client.get_or_create_collection(
        name="noah_memory",
        metadata={"hnsw:space": "cosine"}
    )
    return client, collection

def store_memory(project_root: str, file_path: str, summary: str, diff: str = "", tags: list = []):
    _, collection = get_db(project_root)

    doc_id = hashlib.md5(f"{file_path}:{datetime.utcnow().isoformat()}".encode()).hexdigest()
    timestamp = datetime.utcnow().isoformat()

    collection.add(
        documents=[summary],
        metadatas=[{
            "file": file_path,
            "timestamp": timestamp,
            "tags": json.dumps(tags),
            "diff_preview": diff[:500] if diff else ""
        }],
        ids=[doc_id]
    )

    # Also append to human-readable log
    log_path = Path(project_root) / ".noah" / "log.jsonl"
    with open(log_path, "a") as f:
        f.write(json.dumps({
            "id": doc_id,
            "file": file_path,
            "summary": summary,
            "timestamp": timestamp,
            "tags": tags
        }) + "\n")

    return doc_id

def query_memory(project_root: str, query: str, n_results: int = 5):
    _, collection = get_db(project_root)

    count = collection.count()
    if count == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, count)
    )

    memories = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i]
        memories.append({
            "summary": doc,
            "file": meta.get("file"),
            "timestamp": meta.get("timestamp"),
            "tags": json.loads(meta.get("tags", "[]")),
            "id": results["ids"][0][i]
        })

    return memories

def get_recent_memories(project_root: str, limit: int = 20):
    log_path = Path(project_root) / ".noah" / "log.jsonl"
    if not log_path.exists():
        return []

    lines = log_path.read_text().strip().splitlines()
    recent = []
    for line in reversed(lines[-limit:]):
        try:
            recent.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return recent

def is_project_scanned(project_root: str) -> bool:
    flag = Path(project_root) / ".noah" / "scanned.flag"
    return flag.exists()

def mark_project_scanned(project_root: str):
    flag = Path(project_root) / ".noah" / "scanned.flag"
    flag.touch()