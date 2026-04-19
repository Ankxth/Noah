"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const DAEMON_URL = 'http://localhost:7878';
let sidebarProvider;
function activate(context) {
    console.log('[Noah] Activating...');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(hubot) Noah: Starting...';
    statusBar.tooltip = 'Noah AI Companion';
    statusBar.command = 'noah.showPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);
    checkDaemon(statusBar);
    const interval = setInterval(() => checkDaemon(statusBar), 10000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
    sidebarProvider = new NoahSidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('noah.chatView', sidebarProvider));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file', language: '*' }, new NoahCodeLensProvider()));
    context.subscriptions.push(vscode.commands.registerCommand('noah.showPanel', () => {
        vscode.commands.executeCommand('workbench.view.extension.noah-sidebar');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noah.ask', async () => {
        const question = await vscode.window.showInputBox({
            prompt: 'Ask Noah anything about your project',
            placeHolder: 'Why did I change auth.py last week?'
        });
        if (!question) {
            return;
        }
        const answer = await askNoah(question);
        vscode.window.showInformationMessage(`Noah: ${answer}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noah.askAboutSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showInformationMessage('Select some code first.');
            return;
        }
        await vscode.commands.executeCommand('workbench.view.extension.noah-sidebar');
        const filePath = vscode.workspace.asRelativePath(editor.document.fileName);
        await sidebarProvider?.postMessage({
            type: 'externalAnswer',
            question: `Explain selection in ${filePath}`,
            answer: null
        });
        const answer = await askNoah(`Explain this code from ${filePath}:\n\n${selection}`);
        await sidebarProvider?.postMessage({
            type: 'externalAnswer',
            question: null,
            answer
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noah.fixSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            return;
        }
        await vscode.commands.executeCommand('workbench.view.extension.noah-sidebar');
        const filePath = vscode.workspace.asRelativePath(editor.document.fileName);
        await sidebarProvider?.postMessage({
            type: 'fixProposal',
            question: `Fix code in ${filePath}`,
            answer: null
        });
        const answer = await askNoah(`Analyze this code from ${filePath} for bugs or issues. Explain what is wrong and provide the fixed version clearly marked with FIXED CODE:\n\n${selection}`);
        await sidebarProvider?.postMessage({
            type: 'fixProposal',
            question: null,
            answer,
            filePath: editor.document.fileName,
            selectionStart: { line: editor.selection.start.line, character: editor.selection.start.character },
            selectionEnd: { line: editor.selection.end.line, character: editor.selection.end.character }
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('noah.askAboutLine', async (file, line, code) => {
        await vscode.commands.executeCommand('workbench.view.extension.noah-sidebar');
        await sidebarProvider?.postMessage({
            type: 'externalAnswer',
            question: `Explain line ${line} in ${file}`,
            answer: null
        });
        const answer = await askNoah(`In ${file} at line ${line}, explain this: ${code}`);
        await sidebarProvider?.postMessage({
            type: 'externalAnswer',
            question: null,
            answer
        });
    }));
    console.log('[Noah] Active');
}
async function checkDaemon(statusBar) {
    try {
        const res = await fetch(`${DAEMON_URL}/status`);
        if (res.ok) {
            const data = await res.json();
            statusBar.text = `$(hubot) Noah: Ready (${data.memory_count} memories)`;
            statusBar.backgroundColor = undefined;
        }
        else {
            throw new Error('not ok');
        }
    }
    catch {
        statusBar.text = '$(hubot) Noah: Offline';
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}
async function askNoah(question) {
    try {
        const res = await fetch(`${DAEMON_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        const data = await res.json();
        return data.answer;
    }
    catch {
        return 'Noah daemon is offline. Start it with: python server.py';
    }
}
async function applyFix(message) {
    const uri = vscode.Uri.file(message.filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const range = new vscode.Range(message.selectionStart.line, message.selectionStart.character, message.selectionEnd.line, message.selectionEnd.character);
    await editor.edit(editBuilder => {
        editBuilder.replace(range, message.fixedCode);
    });
    vscode.window.showInformationMessage('Noah applied the fix.');
}
async function handleAction(action, webviewView) {
    const post = (msg, answer) => webviewView.webview.postMessage({ type: 'actionResult', message: msg, answer });
    if (action === 'scan') {
        try {
            await fetch(`${DAEMON_URL}/scan?force=true`, { method: 'POST' });
            post('Scan started! Watch the status bar for updates.');
        }
        catch {
            post('Daemon offline.');
        }
    }
    else if (action === 'summary') {
        const answer = await askNoah('What is this project about? Give a detailed summary.');
        post('Done.', answer);
    }
    else if (action === 'recent') {
        const answer = await askNoah('What have I been working on recently? List the last 5 changes.');
        post('Done.', answer);
    }
    else if (action === 'patterns') {
        const answer = await askNoah('What coding patterns, libraries, and conventions do I use in this project?');
        post('Done.', answer);
    }
    else if (action === 'readme') {
        const answer = await askNoah('Generate a README.md for this project. Include description, tech stack, and setup instructions.');
        post('Done.', answer);
    }
}
class NoahCodeLensProvider {
    async provideCodeLenses(document) {
        const lenses = [];
        const lines = document.getText().split('\n');
        const patterns = [
            /^(async\s+)?def\s+\w+/,
            /^(export\s+)?(async\s+)?function\s+\w+/,
            /^(export\s+)?(default\s+)?class\s+\w+/,
            /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\(/
        ];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!patterns.some(p => p.test(line.trim()))) {
                continue;
            }
            const range = new vscode.Range(i, 0, i, line.length);
            const fileName = vscode.workspace.asRelativePath(document.fileName);
            lenses.push(new vscode.CodeLens(range, {
                title: '$(hubot) Ask Noah about this',
                command: 'noah.askAboutLine',
                arguments: [fileName, i + 1, line.trim()]
            }));
        }
        return lenses;
    }
}
class NoahSidebarProvider {
    extensionUri;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    _view;
    async postMessage(message) {
        if (this._view) {
            await this._view.webview.postMessage(message);
        }
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ask') {
                const answer = await askNoah(message.question);
                webviewView.webview.postMessage({ type: 'answer', answer });
            }
            if (message.type === 'getMemory') {
                try {
                    const res = await fetch(`${DAEMON_URL}/memory?limit=50`);
                    const data = await res.json();
                    webviewView.webview.postMessage({ type: 'memory', data });
                }
                catch {
                    webviewView.webview.postMessage({ type: 'memory', data: { memories: [] } });
                }
            }
            if (message.type === 'action') {
                await handleAction(message.action, webviewView);
            }
            if (message.type === 'applyFix') {
                await applyFix(message);
            }
        });
    }
    getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: transparent; height: 100vh; display: flex; flex-direction: column; }
  .tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  .tab { flex: 1; padding: 8px 4px; cursor: pointer; border: none; background: transparent; color: var(--vscode-foreground); font-size: 12px; opacity: 0.6; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
  .panel { display: none; flex: 1; flex-direction: column; overflow: hidden; padding: 8px; }
  .panel.active { display: flex; }
  #chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; padding-right: 2px; }
  .msg { padding: 7px 10px; border-radius: 8px; max-width: 92%; line-height: 1.5; font-size: 12px; word-wrap: break-word; }
  .msg.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-bottom-right-radius: 2px; }
  .msg.noah { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; border-bottom-left-radius: 2px; }
  .msg.thinking { opacity: 0.6; font-style: italic; }
  .input-row { display: flex; gap: 4px; flex-shrink: 0; }
  .input-row input { flex: 1; padding: 6px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 12px; font-family: inherit; }
  .input-row input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .btn { padding: 6px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #memory-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .memory-item { padding: 8px 10px; border-left: 2px solid var(--vscode-focusBorder); background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 0 6px 6px 0; }
  .memory-summary { font-size: 12px; line-height: 1.4; margin-bottom: 4px; }
  .memory-meta { display: flex; gap: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .memory-tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 5px; border-radius: 3px; font-size: 10px; }
  .memory-controls { display: flex; gap: 4px; margin-bottom: 8px; flex-shrink: 0; }
  .memory-controls input { flex: 1; padding: 5px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 12px; }
  #actions-panel { gap: 8px; }
  .action-group { margin-bottom: 4px; }
  .action-group-title { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .action-btn { width: 100%; padding: 8px 12px; margin-bottom: 4px; text-align: left; background: var(--vscode-editor-inactiveSelectionBackground); color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 6px; cursor: pointer; font-size: 12px; font-family: inherit; display: flex; align-items: center; gap: 8px; }
  .action-btn:hover { background: var(--vscode-list-hoverBackground); border-color: var(--vscode-focusBorder); }
  .action-btn .icon { font-size: 14px; width: 18px; text-align: center; }
  .action-btn .desc { font-size: 11px; color: var(--vscode-descriptionForeground); display: block; margin-top: 1px; }
  .status-msg { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 6px 8px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; margin-top: 4px; display: none; }
  .status-msg.show { display: block; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 12px; font-style: italic; text-align: center; padding: 20px; }
  .fix-actions { display: flex; gap: 6px; margin-top: 2px; padding-left: 4px; }
</style>
</head>
<body>
<div class="tabs">
  <button class="tab active" onclick="showTab('chat')">&#x1F4AC; Chat</button>
  <button class="tab" onclick="showTab('memory')">&#x1F9E0; Memory</button>
  <button class="tab" onclick="showTab('actions')">&#x26A1; Actions</button>
</div>
<div id="chat" class="panel active">
  <div id="chat-messages">
    <div class="msg noah">Hi! I am Noah. I know your codebase. Ask me anything.</div>
  </div>
  <div class="input-row">
    <input type="text" id="chat-input" placeholder="Ask Noah..." onkeydown="if(event.key==='Enter')sendMessage()"/>
    <button class="btn" onclick="sendMessage()">Ask</button>
  </div>
</div>
<div id="memory" class="panel">
  <div class="memory-controls">
    <input type="text" id="memory-search" placeholder="Search memories..." oninput="filterMemories(this.value)"/>
    <button class="btn secondary" onclick="loadMemory()">&#x21BB;</button>
  </div>
  <div id="memory-list"><div class="empty">Loading memories...</div></div>
</div>
<div id="actions-panel" class="panel">
  <div class="action-group">
    <div class="action-group-title">Project</div>
    <button class="action-btn" onclick="runAction('scan')">
      <span class="icon">&#x1F50D;</span>
      <span><strong>Scan project</strong><span class="desc">Re-index all files into memory</span></span>
    </button>
    <button class="action-btn" onclick="runAction('readme')">
      <span class="icon">&#x1F4C4;</span>
      <span><strong>Generate README</strong><span class="desc">Auto-write README from project context</span></span>
    </button>
    <button class="action-btn" onclick="runAction('summary')">
      <span class="icon">&#x1F4CA;</span>
      <span><strong>Project summary</strong><span class="desc">What is this project about?</span></span>
    </button>
  </div>
  <div class="action-group">
    <div class="action-group-title">Memory</div>
    <button class="action-btn" onclick="runAction('recent')">
      <span class="icon">&#x1F550;</span>
      <span><strong>Recent changes</strong><span class="desc">What have I worked on lately?</span></span>
    </button>
    <button class="action-btn" onclick="runAction('patterns')">
      <span class="icon">&#x1F50E;</span>
      <span><strong>My coding patterns</strong><span class="desc">What patterns do I follow?</span></span>
    </button>
  </div>
  <div id="action-status" class="status-msg"></div>
</div>
<script>
  const vscode = acquireVsCodeApi();
  let allMemories = [];

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t, i) => {
      t.classList.toggle('active', ['chat','memory','actions-panel'][i] === name || t.textContent.toLowerCase().includes(name));
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panel = name === 'actions' ? document.getElementById('actions-panel') : document.getElementById(name);
    if (panel) { panel.classList.add('active'); }
    if (name === 'memory') { loadMemory(); }
  }

  function sendMessage() {
    const input = document.getElementById('chat-input');
    const q = input.value.trim();
    if (!q) { return; }
    addMessage(q, 'user');
    input.value = '';
    addMessage('Thinking...', 'noah thinking', 'thinking-msg');
    vscode.postMessage({ type: 'ask', question: q });
  }

  function addMessage(text, cls, id) {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    if (id) { div.id = id; }
    div.textContent = text;
    const msgs = document.getElementById('chat-messages');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function loadMemory() {
    vscode.postMessage({ type: 'getMemory' });
  }

  function filterMemories(query) {
    const q = query.toLowerCase();
    const filtered = q ? allMemories.filter(m =>
      m.summary.toLowerCase().includes(q) || m.file.toLowerCase().includes(q)
    ) : allMemories;
    renderMemories(filtered);
  }

  function renderMemories(memories) {
    const list = document.getElementById('memory-list');
    if (!memories.length) {
      list.innerHTML = '<div class="empty">No memories yet. Save some files!</div>';
      return;
    }
    list.innerHTML = memories.map(m => {
      const tags = (m.tags || []).map(t => '<span class="memory-tag">' + t + '</span>').join('');
      return '<div class="memory-item">' +
        '<div class="memory-summary">' + escHtml(m.summary) + '</div>' +
        '<div class="memory-meta">' +
          '<span>' + escHtml(m.file) + '</span>' +
          '<span>' + (m.timestamp || '').slice(0,16).replace('T',' ') + '</span>' +
          tags +
        '</div></div>';
    }).join('');
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function runAction(type) {
    const status = document.getElementById('action-status');
    status.className = 'status-msg show';
    const messages = { scan: 'Scanning project...', readme: 'Generating README...', summary: 'Summarizing project...', recent: 'Loading recent changes...', patterns: 'Analyzing coding patterns...' };
    status.textContent = messages[type] || 'Running...';
    vscode.postMessage({ type: 'action', action: type });
  }

  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'answer') {
      const t = document.getElementById('thinking-msg');
      if (t) { t.remove(); }
      addMessage(msg.answer, 'noah');
    }

    if (msg.type === 'memory') {
      allMemories = msg.data.memories || [];
      renderMemories(allMemories);
    }

    if (msg.type === 'actionResult') {
      const status = document.getElementById('action-status');
      status.textContent = msg.message || 'Done.';
      if (msg.answer) { showTab('chat'); addMessage(msg.answer, 'noah'); }
      setTimeout(() => status.classList.remove('show'), 3000);
    }

    if (msg.type === 'externalAnswer') {
      if (msg.question) {
        showTab('chat');
        addMessage(msg.question, 'user');
        addMessage('Thinking...', 'noah thinking', 'external-thinking');
      }
      if (msg.answer) {
        const t = document.getElementById('external-thinking');
        if (t) { t.remove(); }
        addMessage(msg.answer, 'noah');
      }
    }

        if (msg.type === 'fixProposal') {
      if (msg.question) {
        showTab('chat');
        addMessage(msg.question, 'user');
        addMessage('Analyzing code...', 'noah thinking', 'fix-thinking');
      }
      if (msg.answer) {
        const t = document.getElementById('fix-thinking');
        if (t) { t.remove(); }
        addMessage(msg.answer, 'noah');

        const re = new RegExp('FIXED CODE[^\\n]*\\n([\\s\\S]+?)(?:\\n\\n|$)', 'i');
        const fixMatch = msg.answer.match(re);
        let fixedCode = fixMatch ? fixMatch[1].trim() : null;
        if (fixedCode) {
          fixedCode = fixedCode.replace(new RegExp('^[\\w]*\\n'), '').replace(new RegExp('\\n?$'), '').trim();
        }

        if (fixedCode) {
          const msgs = document.getElementById('chat-messages');
          const row = document.createElement('div');
          row.className = 'fix-actions';

          const applyBtn = document.createElement('button');
          applyBtn.className = 'btn';
          applyBtn.textContent = 'Apply fix';
          applyBtn.onclick = () => {
            vscode.postMessage({
              type: 'applyFix',
              fixedCode: fixedCode,
              filePath: msg.filePath,
              selectionStart: msg.selectionStart,
              selectionEnd: msg.selectionEnd
            });
            applyBtn.textContent = 'Applied!';
            applyBtn.disabled = true;
            dismissBtn.disabled = true;
          };

          const dismissBtn = document.createElement('button');
          dismissBtn.className = 'btn secondary';
          dismissBtn.textContent = 'Dismiss';
          dismissBtn.onclick = () => { row.remove(); };

          row.appendChild(applyBtn);
          row.appendChild(dismissBtn);
          msgs.appendChild(row);
          msgs.scrollTop = msgs.scrollHeight;
        }
      }
    }
  });
</script>
</body>
</html>`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map