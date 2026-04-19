import os
from pathlib import Path
from memory import store_memory, is_project_scanned, mark_project_scanned
from agent import ask_llm

IGNORED_DIRS = {'.noah', '.git', '__pycache__', 'node_modules', 'venv', 'dist', '.venv'}
WATCHED_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java', '.cpp', '.c', '.rb'}
MAX_FILE_SIZE = 50_000  # skip files over 50kb

def scan_project(project_root: str):
    if is_project_scanned(project_root):
        print("[Noah] Project already scanned, skipping.")
        return

    print("[Noah] Starting initial project scan...")
    root = Path(project_root)
    files_scanned = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.suffix not in WATCHED_EXTENSIONS:
            continue
        if path.stat().st_size > MAX_FILE_SIZE:
            continue

        try:
            content = path.read_text(errors="ignore")
            if not content.strip():
                continue

            rel_path = str(path.relative_to(root))
            summary = summarize_file(rel_path, content)
            store_memory(project_root, rel_path, summary, tags=["initial-scan"])
            print(f"[Noah] Scanned: {rel_path} → {summary}")
            files_scanned += 1
        except Exception as e:
            print(f"[Noah] Error scanning {path}: {e}")

    # Store a project-level summary
    project_summary = summarize_project(project_root)
    store_memory(project_root, "PROJECT", project_summary, tags=["project-overview"])
    print(f"[Noah] Project overview: {project_summary}")

    mark_project_scanned(project_root)
    print(f"[Noah] Initial scan complete. {files_scanned} files scanned.")

def summarize_file(file_path: str, content: str) -> str:
    system = (
        "You are Noah, an AI that builds context about a codebase. "
        "Write one concise sentence (max 20 words) describing what this file does. "
        "Be specific. No preamble."
    )
    prompt = f"File: {file_path}\n\nContent:\n{content[:3000]}"
    return ask_llm(prompt, system=system)

def summarize_project(project_root: str) -> str:
    root = Path(project_root)
    
    # Collect file tree
    file_list = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.suffix in WATCHED_EXTENSIONS:
            file_list.append(str(path.relative_to(root)))

    file_tree = "\n".join(file_list[:50])

    system = (
        "You are Noah. Based on the file structure, write 2-3 sentences describing "
        "what this project is, what it does, and its main tech stack. Be specific."
    )
    prompt = f"Project files:\n{file_tree}"
    return ask_llm(prompt, system=system)