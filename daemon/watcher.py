import time
import sys
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

IGNORED_DIRS = {'.noah', '.git', '__pycache__', 'node_modules', 'venv', 'dist'}
WATCHED_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java', '.cpp', '.c', '.rb'}

class NoahFileHandler(FileSystemEventHandler):
    def __init__(self, project_root: str):
        self.project_root = project_root

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

    def _handle_change(self, path: Path):
        # Will call memory.py to log the change in Phase 2
        pass

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