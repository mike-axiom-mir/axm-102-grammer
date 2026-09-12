'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const {spawn, spawnSync} = require('child_process');
const desk = require('./direction-desk-server.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findBrowser() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync('sh', ['-lc', `command -v ${JSON.stringify(candidate)}`], {encoding:'utf8'});
    if (check.status === 0 && check.stdout.trim()) return check.stdout.trim();
  }
  throw new Error('CHROMIUM_NOT_AVAILABLE');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function poll(fn, label, timeoutMs=10000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; last = value; } catch (error) { last = error; }
    await sleep(80);
  }
  throw new Error(`TIMEOUT:${label}:${last?.message || last || ''}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once:true});
      this.ws.addEventListener('error', reject, {once:true});
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const {resolve, reject} = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result || {});
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }
  send(method, params={}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async eval(expression) {
    const out = await this.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || 'RUNTIME_EVALUATION_FAILED');
    return out.result?.value;
  }
  close() { this.ws.close(); }
}

async function screenshot(cdp, artifactDir, name) {
  const shot = await cdp.send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  fs.writeFileSync(path.join(artifactDir, name), Buffer.from(shot.data, 'base64'));
}

(async () => {
  const browser = findBrowser();
  const server = desk.createServer();
  await new Promise(resolve => server.listen(0, desk.LOOPBACK_HOST, resolve));
  const appPort = server.address().port;
  const debugPort = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-direction-desk-chrome-'));
  const artifactDir = process.env.AXM_DIRECTION_DESK_ARTIFACT_DIR || path.join(process.cwd(), 'direction-desk-browser-artifacts');
  fs.mkdirSync(artifactDir, {recursive:true});

  const chrome = spawn(browser, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, 'about:blank'
  ], {stdio:['ignore','ignore','pipe']});
  let stderr = '';
  chrome.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let cdp;
  try {
    await poll(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return response.ok;
    }, 'chrome-debug-port');
    const pageResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${appPort}/`, {method:'PUT'});
    assert.equal(pageResponse.ok, true);
    const target = await pageResponse.json();
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});

    await poll(() => cdp.eval(`document.readyState === 'complete' && document.querySelector('#goal') !== null`), 'desk-load');
    assert.equal(await cdp.eval(`document.body.innerText.includes('DISPLAY ≠ AUTHORITY')`), true);

    await cdp.eval(`(() => { const goal=document.querySelector('#goal'); goal.value='Build a local-first multiplayer RTS game with world simulation and deterministic replay.'; goal.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#suggest').click(); return true; })()`);
    await poll(() => cdp.eval(`document.querySelectorAll('[data-add]').length >= 2`), 'suggestions');
    assert.equal(await cdp.eval(`document.querySelector('#suggestStatus').innerText.includes('0 selected by you')`), true);

    const added = await cdp.eval(`(() => { const wanted=['game','collaboration-multiplayer']; let n=0; for (const id of wanted) { const b=document.querySelector('[data-add="'+id+'"]'); if (b) { b.click(); n++; } } if (!n) document.querySelectorAll('[data-add]')[0]?.click(); return n || 1; })()`);
    assert.ok(added >= 1);
    assert.equal(await cdp.eval(`document.querySelector('#inspect').disabled`), false);
    assert.equal(await cdp.eval(`document.querySelector('#suggestStatus').innerText.includes('selected by you')`), true);
    await cdp.eval(`document.querySelector('#inspect').click()`);
    await poll(() => cdp.eval(`document.querySelector('#inspection .receipt') !== null && document.querySelector('#inspection').innerText.includes('Stack ready')`), 'inspection');
    assert.equal(await cdp.eval(`document.querySelector('#inspection').innerText.includes('Next honest checks')`), true);

    const evidenceCount = await cdp.eval(`document.querySelectorAll('[data-evidence-kind]').length`);
    assert.ok(evidenceCount > 0);
    await cdp.eval(`(() => { document.querySelector('[data-evidence-kind="capability"]')?.click(); document.querySelector('[data-evidence-kind="verifier"]')?.click(); document.querySelector('#recheck').click(); })()`);
    await poll(() => cdp.eval(`document.querySelector('#evidenceStatus')?.innerText.includes('Updated')`), 'evidence-recheck');

    await cdp.eval(`window.scrollTo(0,0)`);
    await sleep(100);
    await screenshot(cdp, artifactDir, 'direction-desk-desktop.png');
    await cdp.eval(`document.querySelector('#inspectionPanel').scrollIntoView({block:'start'})`);
    await sleep(100);
    await screenshot(cdp, artifactDir, 'direction-desk-inspection-desktop.png');

    await cdp.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
    await cdp.eval(`window.scrollTo(0,0)`);
    await sleep(200);
    const mobileOverflow = await cdp.eval(`Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth`);
    assert.ok(mobileOverflow <= 0, `mobile horizontal overflow ${mobileOverflow}`);
    await screenshot(cdp, artifactDir, 'direction-desk-mobile.png');
    await cdp.eval(`document.querySelector('#inspectionPanel').scrollIntoView({block:'start'})`);
    await sleep(100);
    await screenshot(cdp, artifactDir, 'direction-desk-inspection-mobile.png');

    const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
    const consoleErrors = cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error');
    assert.equal(runtimeErrors.length, 0, `runtime errors: ${runtimeErrors.length}`);
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.length}`);

    process.stdout.write(JSON.stringify({
      result:'PASS', browser:path.basename(browser), candidates:await cdp.eval(`document.querySelectorAll('[data-add]').length`),
      selected:await cdp.eval(`document.querySelectorAll('[data-remove]').length`), evidenceRows:evidenceCount,
      desktopViewport:'1440x1100', mobileViewport:'390x844', mobileOverflow, runtimeErrors:0, consoleErrors:0,
      screenshots:['direction-desk-desktop.png','direction-desk-inspection-desktop.png','direction-desk-mobile.png','direction-desk-inspection-mobile.png']
    }, null, 2) + '\n');
  } finally {
    try { cdp?.close(); } catch {}
    if (chrome.exitCode === null) {
      chrome.kill('SIGTERM');
      await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), sleep(1000)]);
    }
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(userDataDir, {recursive:true, force:true, maxRetries:5, retryDelay:100}); } catch {}
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
