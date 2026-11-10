import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8096;
const CDP_PORT = 9225;
const ARTIFACT_DIR = 'C:\\Users\\ameti\\.gemini\\antigravity\\brain\\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
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
  console.log(`Server listening on port ${PORT}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1280,720',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1200));

  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find(t => t.type === 'page');
  const wsUrl = pageTarget.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let idCounter = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const resolve = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch (e) {}
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = idCounter++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  async function capturePage(url, outFilename, waitMs = 2000) {
    console.log(`Navigating to ${url}...`);
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs));
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const data = res.result?.data;
    if (data) {
      const buffer = Buffer.from(data, 'base64');
      const outPath = path.join(ARTIFACT_DIR, outFilename);
      fs.writeFileSync(outPath, buffer);
      console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
    } else {
      console.error('Screenshot data missing!', res);
    }
  }

  try {
    // 1. Capture map preview
    await capturePage(`http://localhost:${PORT}/odyssee/preview_map_b2w2.html`, 'b2w2_map_preview_clean.png', 2000);

    // 2. Capture trainer card preview
    await capturePage(`http://localhost:${PORT}/odyssee/preview_card_b2w2.html`, 'b2w2_card_preview_clean.png', 2000);

    // 3. Flip card to badges face and capture
    await send('Runtime.evaluate', { expression: "window.setFace && window.setFace('badges')" });
    await new Promise(r => setTimeout(r, 800));
    const ssBadges = await send('Page.captureScreenshot', { format: 'png' });
    if (ssBadges.result?.data) {
      const buffer = Buffer.from(ssBadges.result.data, 'base64');
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'b2w2_card_badges_preview_clean.png'), buffer);
      console.log('Saved badges screenshot!');
    }

    console.log('\nAll preview screenshots captured successfully!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    ws.close();
    chrome.kill();
    server.close();
    process.exit(0);
  }
});
