// Run with: node fintech/verify.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const data = new Map();
global.window = global;
global.localStorage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'js/store.js'),'utf8'));
(async()=>{
  await FT.seed();
  assert.equal(FT.read('users').length,2);
  await FT.seed();assert.equal(FT.read('loans').length,1,'Seed must be idempotent');
  const user=FT.read('users').find(u=>u.role==='client');
  assert.equal(user.password,await FT.hash('Cliente123*',user.salt));
  assert.notEqual(user.password,'Cliente123*');
  localStorage.setItem('fintech_current_user',JSON.stringify(user.id));
  assert.equal(FT.current().email,'cliente@fintech.com');
  assert.equal(FT.decision(750),'APROBADO');assert.equal(FT.decision(749),'EN REVISIÓN');
  assert.equal(FT.decision(600),'EN REVISIÓN');assert.equal(FT.decision(599),'RECHAZADO');
  assert.equal(FT.scoring({income:1000000,expenses:1000000,amount:20000000,months:3,seniority:0}),0);
  const scenario={income:4500000,expenses:1500000,amount:5000000,months:12,seniority:24};
  assert.ok(FT.scoring(scenario)>=750);
  assert.ok(Math.abs(FT.installment(5000000,12)-467010.19)<1);
  for(const months of [3,6,12,18,24,36]){
    const rows=FT.schedule({amount:20000000,months,disbursedAt:'2026-01-31T12:00:00.000Z'});
    assert.ok(Math.abs(rows.reduce((s,r)=>s+r.principal,0)-20000000)<.0001);
    assert.equal(rows.at(-1).balance,0);assert.equal(new Date(rows[0].date).getMonth(),1);
  }
  const app={...scenario,id:FT.id('SOL'),userId:user.id,score:FT.scoring(scenario),status:'APROBADO',date:new Date().toISOString()};
  FT.save('applications',app);FT.accept(app.id);
  assert.throws(()=>FT.accept(app.id));
  let loan=FT.read('loans').find(l=>l.applicationId===app.id);
  assert.equal(loan.status,'PENDIENTE DE DESEMBOLSO');
  FT.disburse(loan.id);assert.throws(()=>FT.disburse(loan.id));
  loan=FT.read('loans').find(l=>l.id===loan.id);
  assert.equal(loan.status,'DESEMBOLSADO');
  FT.pay(loan.id,'PSE');loan=FT.read('loans').find(l=>l.id===loan.id);assert.equal(loan.paid,1);
  assert.ok(FT.schedule(loan)[0].balance<loan.amount);
  for(let i=1;i<loan.months;i++)FT.pay(loan.id,'Cuenta bancaria');
  loan=FT.read('loans').find(l=>l.id===loan.id);assert.equal(loan.status,'PAGADO');
  assert.throws(()=>FT.pay(loan.id,'PSE'));
  assert.equal(FT.read('payments').filter(p=>p.loanId===loan.id).length,12);
  const serialized=localStorage.getItem('fintech_loans');assert.equal(JSON.parse(serialized).find(l=>l.id===loan.id).paid,12);
  localStorage.removeItem('fintech_current_user');assert.equal(FT.current(),undefined);
  assert.throws(()=>FT.disburse(loan.id));
  const expected=['index','login','registro','dashboard','solicitar-prestamo','mis-prestamos','perfil','admin'];
  for(const name of expected){const html=fs.readFileSync(path.join(__dirname,name+'.html'),'utf8');
    for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.join(__dirname,match[1])),match[1]);}
  for(const file of ['app.js','auth.js','prestamos.js','admin.js']){
    const src=fs.readFileSync(path.join(__dirname,'js',file),'utf8');
    for(const m of src.matchAll(/(?:href=\\?"|location\.(?:href|replace)\s*=\s*')[a-z-]+\.html/g)){
      const target=m[0].match(/([a-z-]+\.html)$/)[1];assert.ok(fs.existsSync(path.join(__dirname,target)),target);
    }
  }
  console.log('PASS: seed, password hashing, login/logout state, scoring thresholds, installment, amortization, acceptance, disbursement, duplicate protection, full repayment, persistence, page assets and routes.');
})().catch(err=>{console.error(err);process.exitCode=1;});
