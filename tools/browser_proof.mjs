/** Independent Chrome DevTools Protocol smoke; no npm packages, no screen takeover. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const requested = process.argv[2] || '';
const base = new URL(requested);
assert.equal(base.hostname, '127.0.0.1', 'Browser tests only use the ephemeral loopback server.');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(path.join(os.tmpdir(), 'paradox-cdp-'));
let chrome;
let ws;
let currentID = 0;
const pending = new Map();
const result = { test: 'paradox.chrome.local-v1', source: base.origin, viewports: [], checks: [] };

async function waitFor(fn, label, maxMs = 12000) {
  const begun = Date.now();
  while (Date.now() - begun < maxMs) {
    try {
      const x = await fn();
      if (x) return x;
    } catch {}
    await sleep(90);
  }
  throw new Error('Timed out waiting for: ' + label);
}

function send(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('CDP not connected');
  const id = ++currentID;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 12000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error('JS exception: ' + res.exceptionDetails.text);
  return res.result?.value;
}

async function goto(url) {
  await send('Page.navigate', {url});
  await waitFor(() => evaluate('document.readyState === "complete" && document.querySelectorAll(".clue-card").length === 6'), 'rendered case');
  await sleep(140);
}

async function click(selector) {
  const exact = JSON.stringify(selector);
  const message = JSON.stringify("Missing " + selector);
  return evaluate('(() => {const e=document.querySelector(' + exact + '); if(!e) throw Error(' + message + '); e.click(); return true;})()');
}

try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync',
    '--remote-debugging-port=0', '--user-data-dir='+profile,
    '--window-size=1440,900', 'about:blank'
  ], {stdio: 'ignore'});
  const debugging = await waitFor(async () => {
    const raw = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
    const port = Number(raw.split('\n')[0]);
    return port > 0 ? port : null;
  }, 'Chrome debugging port');

  const targets = await waitFor(async () => {
    const res = await fetch('http://127.0.0.1:' + debugging + '/json/list');
    const tabs = await res.json();
    const target = tabs.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
    return target?.webSocketDebuggerUrl;
  }, 'Chrome page target');
  ws = new WebSocket(targets);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once:true});
    ws.addEventListener('error', reject, {once:true});
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const holder = pending.get(message.id);
    if (!holder) return;
    clearTimeout(holder.timeout);
    pending.delete(message.id);
    if (message.error) holder.reject(new Error(JSON.stringify(message.error)));
    else holder.resolve(message.result || {});
  });
  await send('Page.enable');
  await send('Runtime.enable');

  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    const height = width <= 400 ? 844 : 900;
    await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<=768});
    await goto(base.origin + '/?case=the-last-lift');
    const shape = await evaluate('(() => ({innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,header:!!document.querySelector(".topbar"),clueCount:document.querySelectorAll(".clue-card").length,buttons:[...document.querySelectorAll(".clue-card")].filter(x=>x.offsetWidth>0).length,headerWidth:Math.ceil(document.querySelector(".topbar").getBoundingClientRect().width),caseTitle:document.querySelector("#case-title").textContent}))()');
    assert.equal(shape.innerWidth, width, 'Emulated viewport width changed');
    assert.ok(shape.scrollWidth <= width + 1, 'Horizontal overflow at ' + width + ': ' + JSON.stringify(shape));
    assert.equal(shape.buttons, 6);
    assert.equal(shape.caseTitle, 'The Last Lift');
    result.viewports.push({ width, height, scrollWidth:shape.scrollWidth, clues:shape.buttons, pass:true });
    if (width === 390 || width === 1440) {
      const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      const folder = path.join(process.cwd(),'.test-artifacts');
      await mkdir(folder,{recursive:true,mode:0o700});
      await writeFile(path.join(folder,'paradox-'+width+'.png'),Buffer.from(shot.data,'base64'),{mode:0o600});
    }
  }

  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await goto(base.origin+'/?case=the-last-lift');
  await click('.clue-card[data-clue="B"]');
  await click('.clue-card[data-clue="C"]');
  assert.equal(await evaluate('document.querySelector("#submit-button").disabled'),false);
  assert.equal(await evaluate('document.querySelectorAll(".clue-card.selected").length'),2);
  await click('#submit-button');
  assert.equal(await evaluate('document.querySelector("#result-dialog").open'),false,'Incorrect verdict must not reveal solution');
  assert.match(await evaluate('document.querySelector("#dock-status").textContent'),/rejected/);
  result.checks.push({name:'incorrect verdict does not disclose answer',pass:true});

  await click('.clue-card[data-clue="A"]');
  await click('.clue-card[data-clue="E"]');
  await click('#submit-button');
  await waitFor(() => evaluate('document.querySelector("#result-dialog").open'), 'successful verdict dialog');
  assert.match(await evaluate('document.querySelector("#result-heading").textContent'),/fracture/);
  assert.match(await evaluate('document.querySelector("#result-stats").textContent'),/78 POINTS/);
  assert.equal(await evaluate('document.querySelector("#solved-number").textContent'),'01');
  result.checks.push({name:'real UI case solved after one error with correct scoring and persistence',pass:true});

  await click('#next-button');
  assert.equal(await evaluate('document.querySelector("#result-dialog").open'),false);
  assert.equal(await evaluate('document.querySelector("#case-title").textContent'),'Dead Air');
  assert.equal(await evaluate('document.querySelectorAll(".clue-card").length'),6);
  result.checks.push({name:'next case navigation and modal closing',pass:true});

  await click('#hint-button');
  assert.equal(await evaluate('document.querySelector("#hints-left").textContent'),'01 LEFT');
  await click('#hint-button');
  assert.equal(await evaluate('document.querySelector("#hint-button").disabled'),true);
  result.checks.push({name:'two unique hints, third blocked',pass:true});

  await click('#daily-button');
  assert.match(await evaluate('document.querySelector("#case-reference").textContent'),/DAILY/);
  assert.equal(await evaluate('new URL(location.href).searchParams.get("daily")'),'1');
  result.checks.push({name:'daily selection changes mode and shareable route',pass:true});

  await click('#how-button');
  assert.equal(await evaluate('document.querySelector("#how-dialog").open'),true);
  await click('#how-start');
  assert.equal(await evaluate('document.querySelector("#how-dialog").open'),false);
  result.checks.push({name:'accessible field guide opens and closes',pass:true});

  await goto(base.origin+'/?case=the-last-lift');
  assert.equal(await evaluate('document.querySelector("#solved-number").textContent'),'01');
  result.checks.push({name:'progress preserved across navigation on same device',pass:true});

  console.log(JSON.stringify({...result,pass:true},null,2));
} catch (error) {
  console.error(JSON.stringify({...result,pass:false,error:String(error?.stack || error)},null,2));
  process.exitCode = 1;
} finally {
  for(const request of pending.values()) { clearTimeout(request.timeout);request.reject(new Error('CDP closing')); }
  pending.clear();
  try { ws?.close(); } catch {}
  try { chrome?.kill('SIGTERM'); } catch {}
  await sleep(300);
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:80});
}
