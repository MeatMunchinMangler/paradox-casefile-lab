// Real Chrome acceptance of first-time entry, returning daily, explicit links,
// and private-data-free case sharing. Launches only a temporary loopback server.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const {setTimeout:sleep}=require('node:timers/promises');

(async()=>{
 const root=path.resolve(__dirname,'..');
 const port=await new Promise((resolve,reject)=>{
   const s=net.createServer();s.on('error',reject);
   s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});
 });
 const server=spawn('python3',['-B','-m','http.server',String(port),
   '--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
 let browser;
 const out={suite:'paradox.first-play.real-browser.v1',widths:[],checks:[],pass:false};
 try{
   let ready=false;
   const origin='http://127.0.0.1:'+port+'/';
   for(let i=0;i<70;i++){
     try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
     await sleep(100);
   }
   assert.ok(ready,'Temporary local server did not start');
   browser=await puppeteer.launch({headless:true,
     executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
     args:['--no-sandbox','--disable-background-networking','--disable-extensions','--disable-sync']});
   const errors=[];
   const dailyIndex=Math.floor(Date.UTC(2026,10,11,12)/86400000)%12;
   for(const width of [320,375,390,768,1024,1440]){
     const context=await browser.createBrowserContext();
     const page=await context.newPage();
     page.on('pageerror',e=>errors.push(String(e)));
     await page.setViewport({width,height:width<=390?844:900,isMobile:width<=768,deviceScaleFactor:1});
     await page.goto(origin,{waitUntil:'load'});
     await page.waitForSelector('.clue-card',{timeout:11000});
     const first=await page.evaluate(()=>({
       title:document.querySelector('#case-title')?.textContent,
       reference:document.querySelector('#case-reference')?.textContent,
       scroll:document.documentElement.scrollWidth,
       width:innerWidth
     }));
     assert.equal(first.title,'The Last Lift','New visitor not on rookie '+width);
     assert.match(first.reference,/CASEFILE \/ 001/);
     assert.ok(first.scroll<=width+1,'Horizontal scroll on '+width);
     await page.click('#daily-button');
     const daily=await page.$eval('#case-title',e=>e.textContent);
     assert.equal(daily,'The Clocktower','Daily case changed unexpectedly '+width);
     assert.equal(await page.evaluate(()=>location.search),'?daily=1');
     await page.goto(origin+'?case=blackout-frame',{waitUntil:'load'});
     await page.waitForSelector('.clue-card');
     assert.equal(await page.$eval('#case-title',e=>e.textContent),'Frame 211');
     await page.evaluate(()=>localStorage.setItem('paradox-casefile-progress-v1',
       JSON.stringify({solved:{'the-last-lift':{solved:true,bestScore:100}},dailyDays:[]})));
     await page.goto(origin,{waitUntil:'load'});
     await page.waitForSelector('.clue-card');
     assert.equal(await page.$eval('#case-title',e=>e.textContent),'The Clocktower');
     out.widths.push({width,newUserRookie:true,explicitDaily:true,directCase:true,returningDaily:true});
     await context.close();
   }
   const page=await browser.newPage();
   page.on('pageerror',e=>errors.push(String(e)));
   await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});
   await page.goto(origin+'?case=the-last-lift&token=please-do-not-share&utm_source=private#secret',{waitUntil:'load'});
   await page.waitForSelector('.clue-card[data-clue="A"]');
   await page.click('.clue-card[data-clue="A"]');
   await page.click('.clue-card[data-clue="E"]');
   await page.click('#submit-button');
   await page.waitForFunction(()=>document.querySelector('#result-dialog')?.open,{timeout:10000});
   await page.evaluate(()=>{
     window.__copiedChallenge=null;
     Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
     Object.defineProperty(navigator,'clipboard',{configurable:true,
       value:{writeText:async text=>{window.__copiedChallenge=text;}}});
   });
   await page.click('#share-button');
   await page.waitForFunction(()=>window.__copiedChallenge!==null,{timeout:7000});
   const copied=await page.evaluate(()=>window.__copiedChallenge);
   assert.match(copied,/\?case=the-last-lift/);
   assert.ok(!copied.includes('please-do-not-share'));
   assert.ok(!copied.includes('utm_source'));
   assert.ok(!copied.includes('#secret'));
   out.checks.push('Share copies only case ID; removes unrelated inbound parameters and fragment');
   await page.click('#next-button');
   const next=await page.evaluate(()=>location.href);
   assert.ok(!next.includes('token=')&&!next.includes('utm_source=')&&!next.includes('#secret'));
   out.checks.push('Internal case navigation strips unrelated inbound parameters');
   assert.deepEqual(errors,[]);
   out.checks.push('No browser runtime errors');
   out.pass=true;
   console.log(JSON.stringify(out,null,2));
 }catch(error){
   out.error=String(error.stack||error);
   console.error(JSON.stringify(out,null,2));
   process.exitCode=1;
 }finally{
   await browser?.close();
   server.kill('SIGTERM');
 }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
