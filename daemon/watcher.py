import time
import sys
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import os
IGNORED_DIRS = {'.noah', '.git', '__pycache__', 'node_modules', 'venv', 'dist'}
WATCHED_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java', '.cpp', '.c', '.rb'}

class NoahFileHandler(FileSystemEventHandler):
    def __init__(self, project_root: str):
        self.project_root = project_root
        self._file_cache = {}

    def on_modified(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if any(part in IGNORED_DIRS for part in path.parts):
            return
        if path.suffix not in WATCHED_EXTENSIONS:
            return
        print(f"[Noah] File changed: {path}")
        self._handle_change(path)

    def _get_diff(self, path: Path) -> str:
        try:
            result = subprocess.run(
                ["git", "diff", "HEAD", str(path)],
                cwd=self.project_root,
                capture_output=True,
                timeout=5,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"}
            )
            diff = result.stdout.decode("utf-8", errors="ignore").strip()
            if not diff:
                try:
                    diff = path.read_text(encoding="utf-8", errors="ignore")[:1500]
                except:
                    diff = ""
            return diff
        except Exception as e:
            print(f"[Noah] Diff error: {e}")
            return ""

    def _handle_change(self, path: Path):
        try:
            from memory import store_memory
            from agent import summarize_change

            diff = self._get_diff(path)
            if not diff:
                print(f"[Noah] No diff found for {path}, skipping")
                return

            rel_path = str(path.relative_to(self.project_root))
            print(f"[Noah] Summarizing change in {rel_path}...")
            summary = summarize_change(rel_path, diff)
            print(f"[Noah] Summary: {summary}")
            store_memory(self.project_root, rel_path, summary, diff)
            print(f"[Noah] Stored memory: {summary}")
        except Exception as e:
            import traceback
            print(f"[Noah] Error handling change: {e}")
            traceback.print_exc()

def start_watcher(project_root: str):
    handler = NoahFileHandler(project_root)
    observer = Observer()
    observer.schedule(handler, project_root, recursive=True)
    observer.start()
    print(f"[Noah] Watching: {project_root}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    start_watcher(root)