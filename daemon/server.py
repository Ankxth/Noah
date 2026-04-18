from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="Noah Daemon", version="0.1.0")

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
    return {"status": "online", "version": "0.1.0"}

@app.post("/ask")
def ask(req: AskRequest):
    # Stub — wired up in Phase 2 & 3
    return {"answer": f"[stub] You asked: {req.question}"}

@app.get("/memory")
def get_memory(limit: int = 20):
    # Stub — wired up in Phase 2
    return {"memories": [], "count": 0}

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