// Optional Windows smoke test using the installed Microsoft Edge, without npm dependencies.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=__dirname;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fintech-browser-'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(body);});});
let browser,socket;const pending=new Map();let sequence=0;const errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function until(expression){for(let i=0;i<80;i++){try{if(await evaluate(expression))return;}catch{}await sleep(100);}throw Error('Timed out: '+expression);}
async function navigate(page){await call('Page.navigate',{url:'http://127.0.0.1:4178/'+page});await until('document.readyState === "complete" && document.querySelector("#app") && !document.querySelector("#app > .loading")');}
(async()=>{
 await new Promise(r=>server.listen(4178,'127.0.0.1',r));
 browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9228','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<15;i++){try{const pages=await (await fetch('http://127.0.0.1:9228/json',{signal:AbortSignal.timeout(1000)})).json();target=pages.find(p=>p.type==='page');if(target)break;}catch{}await sleep(150);}if(!target)throw Error('Edge remote debugging did not start.');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p?.reject(Error(msg.error.message));else p?.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);};
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate('index.html');await until('!!document.querySelector("#sim-quota")');
 assert.ok((await evaluate('document.querySelector("#sim-quota").textContent')).includes('467'));
 await evaluate('document.querySelector("#sim-range").value=10000000;document.querySelector("#sim-range").dispatchEvent(new Event("input"))');
 assert.ok((await evaluate('document.querySelector("#sim-principal").textContent')).includes('10.000.000'));
 fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
 let shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'screenshots','inicio-desktop.png'),Buffer.from(shot.data,'base64'));
 for(const width of [375,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`Landing overflow at ${width}`);}
 await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'screenshots','inicio-mobile.png'),Buffer.from(shot.data,'base64'));
 await navigate('login.html');await evaluate('document.querySelector("#fill-demo").click();document.querySelector("#auth-form").requestSubmit()');await until('location.pathname.endsWith("dashboard.html") && !!document.querySelector("#content .stats")');
 assert.ok(await evaluate('document.body.innerText.includes("Valentina")'));
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'screenshots','dashboard.png'),Buffer.from(shot.data,'base64'));
 await navigate('solicitar-prestamo.html');await until('!!document.querySelector("#request-form")');
 for(let i=0;i<4;i++){await evaluate('if(document.querySelector("#request-form [type=checkbox]"))document.querySelector("#request-form [type=checkbox]").checked=true;document.querySelector("#request-form").requestSubmit()');await sleep(150);}
 await until('!!document.querySelector(".result")');assert.ok(await evaluate('document.body.innerText.includes("APROBADO")'));
 await evaluate('document.querySelector("[data-application]").click();document.querySelector("#modal-confirm").click()');await until('location.pathname.endsWith("mis-prestamos.html") && !!document.querySelector("[data-disburse]")');
 await evaluate('document.querySelector("[data-disburse]").click();document.querySelector("#modal-confirm").click()');await until('!document.querySelector("[data-disburse]")');
 const before=await evaluate('FT.read("payments").length');await evaluate('document.querySelectorAll("[data-pay]")[1].click();document.querySelector("#modal-confirm").click()');assert.equal(await evaluate('FT.read("payments").length'),before+1);
 for(const page of ['dashboard.html','mis-prestamos.html?view=pagos','perfil.html','solicitar-prestamo.html']){await navigate(page);for(const width of [375,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`${page} overflow at ${width}`);}}
 await evaluate('document.querySelector("#logout").click()');await until('!!document.querySelector("#auth-form")');assert.equal(await evaluate('localStorage.getItem("fintech_current_user")'),null);
 await evaluate('document.querySelector("[name=email]").value="admin@fintech.com";document.querySelector("[name=password]").value="Admin123*";document.querySelector("#auth-form").requestSubmit()');await until('!!document.querySelector(".admin-stats")');
 await evaluate('Array.from(document.querySelectorAll("[data-filter]")).find(b=>b.dataset.filter==="EN REVISIÓN").click();document.querySelector("[data-review]").click();document.querySelector("[name=decision][value=APROBADO]").checked=true;document.querySelector("#modal-confirm").click()');
 assert.equal(await evaluate('FT.read("applications").filter(a=>a.status==="EN REVISIÓN").length'),0);
 for(const width of [375,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===375});assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`Admin overflow at ${width}`);}
 await evaluate('document.querySelector("#logout").click()');await until('!!document.querySelector("#auth-form")');await navigate('registro.html');
 await evaluate(`(()=>{const values={firstName:'Prueba',lastName:'Navegador',document:'999888777',birth:'1990-04-20',phone:'3001234567',address:'Calle demo 123',city:'Bogotá',occupation:'Diseño',income:'5000000',email:'prueba@example.com',password:'Prueba123*',confirm:'Prueba123*'};for(const [name,value] of Object.entries(values))document.querySelector('[name='+name+']').value=value;document.querySelector('[type=checkbox]').checked=true;document.querySelector('#auth-form').requestSubmit();})()`);
 await until('location.pathname.endsWith("dashboard.html") && !!document.querySelector("#content")');assert.ok(await evaluate('FT.current().firstName === "Prueba"'));
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS browser: simulator, login/logout, registration, 4-step application, scoring, approval, acceptance, disbursement, payment, admin decision, no uncaught JS errors, responsive overflow at 375/768/1440. Screenshots saved.');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{if(socket?.readyState===1){try{await call('Browser.close');}catch{}socket.close();}browser?.kill();server.close();});
