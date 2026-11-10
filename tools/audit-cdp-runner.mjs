import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 8095;
const CDP_PORT = 9224;

// 1. Static file server
import fs from 'node:fs';
import path from 'node:path';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report_audit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('\n>>> POST /report_audit PAYLOAD RECEIVED:');
      try {
        const data = JSON.parse(body);
        console.log('Steps completed:', data.steps);
        console.log('Errors:', data.errors);
      } catch (e) {
        console.log('Raw body:', body);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }
  const urlPath = req.url.split('?')[0];
  const cleanPath = urlPath.replace(/^\/+/, '');
  const filePath = path.join(process.cwd(), cleanPath === '' ? 'odyssee/index.html' : cleanPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log('Static server listening on port', PORT);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = `http://localhost:${PORT}/odyssee/test_automated_gameplay.html`;

  const chrome = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1280,720',
    url
  ]);

  // Wait for CDP target
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const resp = await fetch(`http://localhost:${CDP_PORT}/json`);
      const list = await resp.json();
      if (list && list.length && list[0].webSocketDebuggerUrl) {
        wsUrl = list[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Could not get CDP WebSocket URL');
    chrome.kill();
    server.close();
    process.exit(1);
  }

  console.log('Connected to Chrome CDP:', wsUrl);
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url } }));
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      console.log(`[BROWSER CONSOLE ${msg.params.type.toUpperCase()}]:`, args);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]:', msg.params.exceptionDetails);
    }
  };

  // Wait 6 seconds, then evaluate window.__auditResults
  setTimeout(async () => {
    ws.send(JSON.stringify({
      id: 10,
      method: 'Runtime.evaluate',
      params: { expression: 'JSON.stringify(window.__auditResults)', returnByValue: true }
    }));
  }, 5000);

  // Read response
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id === 10) {
      console.log('\n=== IN-GAME AUDIT RESULTS ===');
      const val = msg.result?.result?.value;
      if (val) {
        const parsed = JSON.parse(val);
        console.log('Steps:', parsed.steps);
        console.log('Errors:', parsed.errors);
      } else {
        console.log('Raw evaluate result:', msg.result);
      }
      ws.close();
      chrome.kill();
      server.close();
      process.exit(0);
    }
  });
});
