import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(__dirname, '../..');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let p = path.join(baseDir, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const ext = path.extname(p);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found: ' + req.url);
  }
});

server.listen(8082, () => {
  console.log('Server started on 8082');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const outPath = 'C:\\Users\\ameti\\.gemini\\antigravity\\brain\\df0f98b4-2cf7-4e3b-92b9-0e675f35e8d0\\preview_b2w2_all.png';
  
  const args = [
    '--headless',
    '--disable-gpu',
    `--screenshot=${outPath}`,
    '--window-size=1040,6500',
    '--virtual-time-budget=2500',
    'http://localhost:8082/odyssee/preview_b2w2.html'
  ];

  execFile(chromePath, args, (err) => {
    if (err) console.error('Exec error:', err);
    else console.log('Screenshot success:', outPath);
    server.close();
  });
});
