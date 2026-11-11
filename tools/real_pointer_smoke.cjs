'use strict';
// Optional integration proof; use NODE_PATH to point to an existing Puppeteer.
// Unlike DOM element.click(), Puppeteer's click uses hit-testing and catches
// fixed/sticky overlays blocking the real center of a first evidence card.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {spawn}=require('node:child_process');
const net=require('node:net');
const {setTimeout:sleep}=require('node:timers/promises');
const path=require('node:path');

(async()=>{
 const port=await new Promise((resolve,reject)=>{
  const s=net.createServer();s.on('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});
 });
 const server=spawn('python3',['-B','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.resolve(__dirname,'..')],{stdio:'ignore'});
 let b;
 try {
  const url='http://127.0.0.1:'+port+'/?case=the-last-lift';
  let ready=false;
  for(let i=0;i<60;i++) {
   try{if((await fetch(url)).ok){ready=true;break;}}catch{}
   await sleep(100);
  }
  assert.ok(ready,'Local game did not start');
  b=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-background-networking','--disable-extensions','--disable-sync']});
  const p=await b.newPage();
  const err=[];p.on('pageerror',e=>err.push(String(e)));
  for(const width of [320,375,390,768,1024,1440]){
   await p.setViewport({width,height:844,isMobile:width<=768,deviceScaleFactor:1});
   await p.goto(url,{waitUntil:'load'});
   await p.waitForSelector('.clue-card[data-clue="A"]',{timeout:10000});
   await p.click('.clue-card[data-clue="A"]');
   const afterA=await p.$eval('.clue-card[data-clue="A"]',x=>x.getAttribute('aria-pressed'));
   assert.equal(afterA,'true','First real hit did not select card A at '+width+'px');
   await p.click('.clue-card[data-clue="E"]');
   assert.equal(await p.$eval('#submit-button',x=>x.disabled),false,'Verdict button should be enabled '+width);
   await p.click('#submit-button');
   await p.waitForFunction(()=>document.querySelector('#result-dialog')?.open,{timeout:7000});
   const link=await p.$eval('#optional-playtest-link',a=>a.href);
   assert.equal(link,'https://moonshot-launch-deck-20261111.vercel.app/playtest.html?app=paradox');
   console.log('PASS REAL_POINTER_'+width,'case solved; optional link safe');
  }
  assert.deepEqual(err,[]);
  console.log('REAL_POINTER_GAMEPLAY_PASS 6 widths');
 }finally{
  await b?.close();server.kill('SIGTERM');
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
