from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
from contextlib import asynccontextmanager

PROJECT_ROOT = os.getenv("NOAH_PROJECT_ROOT", ".")

@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    from scanner import scan_project
    from watcher import start_watcher

    # Start scanner in background
    scan_thread = threading.Thread(target=scan_project, args=(PROJECT_ROOT,), daemon=True)
    scan_thread.start()

    # Start watcher in background
    watch_thread = threading.Thread(target=start_watcher, args=(PROJECT_ROOT,), daemon=True)
    watch_thread.start()

    yield

app = FastAPI(title="Noah Daemon", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str
    context: Optional[str] = None

class FixRequest(BaseModel):
    error: str
    file_path: str
    code: Optional[str] = None

class ForgeRequest(BaseModel):
    description: str
    output_dir: str

@app.get("/status")
def status():
    from memory import get_db
    _, col = get_db(PROJECT_ROOT)
    return {
        "status": "online",
        "version": "0.2.0",
        "project_root": PROJECT_ROOT,
        "memory_count": col.count()
    }
@app.post("/scan")
def trigger_scan(force: bool = False):
    import threading
    from scanner import scan_project
    from memory import mark_project_scanned
    from pathlib import Path
    
    if force:
        # Remove the flag so it rescans
        flag = Path(PROJECT_ROOT) / ".noah" / "scanned.flag"
        if flag.exists():
            flag.unlink()
    
    thread = threading.Thread(target=scan_project, args=(PROJECT_ROOT,), daemon=True)
    thread.start()
    return {"status": "scan started", "project_root": PROJECT_ROOT}

@app.post("/ask")
def ask(req: AskRequest):
    from memory import query_memory, get_recent_memories
    from agent import answer_question

    # Get semantically relevant memories
    semantic_memories = query_memory(PROJECT_ROOT, req.question, n_results=5)
    
    # Also get the 3 most recent memories
    recent_memories = get_recent_memories(PROJECT_ROOT, limit=3)
    
    # Merge, deduplicate by id, keep recent ones
    seen = set()
    merged = []
    for m in recent_memories + semantic_memories:
        mid = m.get('id') or m.get('summary')
        if mid not in seen:
            seen.add(mid)
            merged.append(m)

    answer = answer_question(req.question, merged)
    return {"answer": answer, "memories_used": len(merged)}

@app.get("/memory")
def get_memory(limit: int = Query(default=20, le=100)):
    from memory import get_recent_memories
    return {"memories": get_recent_memories(PROJECT_ROOT, limit)}

@app.post("/fix")
def fix_error(req: FixRequest):
    # Stub — wired up in Phase 5
    return {"fix": "[stub] Fix will go here", "file": req.file_path}

@app.post("/forge")
def forge(req: ForgeRequest):
    # Stub — wired up in Phase 8
    return {"plan": "[stub] Forge plan will go here"}

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=7878, reload=False)