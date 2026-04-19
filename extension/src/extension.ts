import * as vscode from 'vscode';

const DAEMON_URL = 'http://localhost:7878';

export function activate(context: vscode.ExtensionContext) {
    console.log('[Noah] Activating...');

    // Status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(hubot) Noah: Starting...';
    statusBar.tooltip = 'Noah AI Companion';
    statusBar.command = 'noah.showPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // Check daemon status
    checkDaemon(statusBar);
    const interval = setInterval(() => checkDaemon(statusBar), 10000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });

    // Register sidebar webview
    const provider = new NoahSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('noah.chatView', provider)
    );

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('noah.showPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.noah-sidebar');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('noah.ask', async () => {
            const question = await vscode.window.showInputBox({
                prompt: 'Ask Noah anything about your project',
                placeHolder: 'Why did I change auth.py last week?'
            });
            if (!question) return;

            const answer = await askNoah(question);
            vscode.window.showInformationMessage(`Noah: ${answer}`);
        })
    );

    console.log('[Noah] Active');
}

async function checkDaemon(statusBar: vscode.StatusBarItem) {
    try {
        const res = await fetch(`${DAEMON_URL}/status`);
        if (res.ok) {
            const data = await res.json() as { memory_count: number };
            statusBar.text = `$(hubot) Noah: Ready (${data.memory_count} memories)`;
            statusBar.backgroundColor = undefined;
        } else {
            throw new Error('not ok');
        }
    } catch {
        statusBar.text = '$(hubot) Noah: Offline';
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

async function askNoah(question: string): Promise<string> {
    try {
        const res = await fetch(`${DAEMON_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        const data = await res.json() as { answer: string };
        return data.answer;
    } catch {
        return 'Noah daemon is offline. Start it with: python server.py';
    }
}

class NoahSidebarProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ask') {
                const answer = await askNoah(message.question);
                webviewView.webview.postMessage({ type: 'answer', answer });
            }
            if (message.type === 'getMemory') {
                try {
                    const res = await fetch(`${DAEMON_URL}/memory?limit=20`);
                    const data = await res.json();
                    webviewView.webview.postMessage({ type: 'memory', data });
                } catch {
                    webviewView.webview.postMessage({ type: 'memory', data: { memories: [] } });
                }
            }
        });
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); font-size: 13px; padding: 8px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); margin: 0; }
  .tabs { display: flex; gap: 4px; margin-bottom: 12px; }
  .tab { padding: 4px 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); background: transparent; color: var(--vscode-foreground); font-size: 12px; }
  .tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .panel { display: none; }
  .panel.active { display: block; }
  #chat-messages { height: 340px; overflow-y: auto; margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; }
  .msg { padding: 6px 10px; border-radius: 6px; max-width: 90%; line-height: 1.4; }
  .msg.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
  .msg.noah { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
  .input-row { display: flex; gap: 4px; }
  input[type=text] { flex: 1; padding: 5px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-size: 12px; }
  button.send { padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .memory-item { padding: 6px 8px; border-left: 2px solid var(--vscode-button-background); margin-bottom: 6px; font-size: 11px; line-height: 1.4; }
  .memory-file { color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .loading { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 12px; }
</style>
</head>
<body>
<div class="tabs">
  <button class="tab active" onclick="showTab('chat')">Chat</button>
  <button class="tab" onclick="showTab('memory')">Memory</button>
</div>

<div id="chat" class="panel active">
  <div id="chat-messages">
    <div class="msg noah">Hi! I'm Noah. Ask me anything about your project.</div>
  </div>
  <div class="input-row">
    <input type="text" id="chat-input" placeholder="Ask Noah..." onkeydown="if(event.key==='Enter') sendMessage()"/>
    <button class="send" onclick="sendMessage()">Ask</button>
  </div>
</div>

<div id="memory" class="panel">
  <div id="memory-list"><div class="loading">Loading memories...</div></div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['chat','memory'][i] === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(name).classList.add('active');
    if (name === 'memory') vscode.postMessage({ type: 'getMemory' });
  }

  function sendMessage() {
    const input = document.getElementById('chat-input');
    const q = input.value.trim();
    if (!q) return;
    addMessage(q, 'user');
    input.value = '';
    addMessage('Thinking...', 'noah', 'thinking');
    vscode.postMessage({ type: 'ask', question: q });
  }

  function addMessage(text, role, id) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    if (id) div.id = id;
    div.textContent = text;
    const msgs = document.getElementById('chat-messages');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'answer') {
      const thinking = document.getElementById('thinking');
      if (thinking) thinking.remove();
      addMessage(msg.answer, 'noah');
    }
    if (msg.type === 'memory') {
      const list = document.getElementById('memory-list');
      const memories = msg.data.memories || [];
      if (memories.length === 0) {
        list.innerHTML = '<div class="loading">No memories yet. Save some files!</div>';
        return;
      }
      list.innerHTML = memories.map(m => \`
        <div class="memory-item">
          \${m.summary}
          <div class="memory-file">\${m.file} · \${m.timestamp.slice(0,10)}</div>
        </div>
      \`).join('');
    }
  });
</script>
</body>
</html>`;
    }
}

export function deactivate() {}