from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os

app = FastAPI(title="Noah Daemon", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = os.getenv("NOAH_PROJECT_ROOT", ".")

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

@app.post("/ask")
def ask(req: AskRequest):
    from memory import query_memory
    from agent import answer_question
    memories = query_memory(PROJECT_ROOT, req.question)
    answer = answer_question(req.question, memories)
    return {"answer": answer, "memories_used": len(memories)}

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
    uvicorn.run("server:app", host="127.0.0.1", port=7878, reload=True)