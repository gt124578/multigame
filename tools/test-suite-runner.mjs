import fs from 'node:fs';
import { execSync } from 'node:child_process';

const files = fs.readdirSync('tools').filter(f => f.startsWith('test-') && f.endsWith('.mjs') && f !== 'test-suite-runner.mjs');
console.log(`Running ${files.length} test suites with generous timeout...\n`);

const results = [];
for (const file of files) {
  process.stdout.write(`- Testing ${file}... `);
  const start = Date.now();
  try {
    const out = execSync('node tools/' + file, { timeout: 180000, stdio: 'pipe' });
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`PASS (${dur}s)`);
    results.push({ file, status: 'PASS', dur });
  } catch (err) {
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`FAIL (${dur}s)`);
    const errText = err.stderr?.toString() || err.stdout?.toString() || err.message;
    console.error('  ERROR:', errText.trim().split('\n')[0]);
    results.push({ file, status: 'FAIL', dur, error: errText.slice(0, 1000) });
  }
}

const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');
console.log(`\n===========================================`);
console.log(`Bilan global : ${passed.length} PASSÉS, ${failed.length} ÉCHOUÉS sur ${files.length}`);
console.log(`===========================================`);
if (failed.length > 0) {
  console.log('\nDétail des échecs :');
  for (const f of failed) {
    console.log(`\n[${f.file}] :`);
    console.log(f.error);
  }
}
