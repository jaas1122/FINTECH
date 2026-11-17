/* Persistencia exclusiva de demostración. No almacenar datos reales en este prototipo. */
window.FT = (() => {
  const keys = ['users','loans','applications','transactions','payments'];
  const read = key => JSON.parse(localStorage.getItem('fintech_' + key) || '[]');
  const write = (key, value) => localStorage.setItem('fintech_' + key, JSON.stringify(value));
  const money = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n || 0);
  const date = d => new Date(d).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const installment = (amount, months, rate=.018) => rate === 0 ? amount/months : amount*rate/(1-Math.pow(1+rate,-months));
  const id = prefix => {
    const year = new Date().getFullYear();
    const k = `fintech_counter_${prefix}_${year}`;
    const next = Number(localStorage.getItem(k)||0)+1;
    localStorage.setItem(k,next);
    return `${prefix}-${year}-${String(next).padStart(5,'0')}`;
  };
  const current = () => read('users').find(u=>u.id === JSON.parse(localStorage.getItem('fintech_current_user')||'null'));
  const save = (key,item) => {const all=read(key);const i=all.findIndex(x=>x.id===item.id);if(i<0)all.push(item);else all[i]=item;write(key,all);return item;};
  // Simulación académica exclusivamente: no es un modelo real de riesgo crediticio.
  function scoring({income,expenses,amount,months,seniority}) {
    const capacity = Math.max(0,Number(income)-Number(expenses));
    const ratio = capacity ? installment(amount,months)/capacity : 10;
    return Math.round(Math.max(0,Math.min(1000,420 + Math.min(income/15000,200) + Math.min(seniority*3,120) + Math.max(-420,260-ratio*350) - Math.max(0,amount/income-4)*15)));
  }
  const decision = score => score>=750?'APROBADO':score>=600?'EN REVISIÓN':'RECHAZADO';
  function schedule(loan) {
    let balance=loan.amount;const quota=installment(loan.amount,loan.months);const start=new Date(loan.disbursedAt);
    return Array.from({length:loan.months},(_,i)=>{
      const interest=balance*.018;const principal=i===loan.months-1?balance:Math.min(balance,quota-interest);balance=Math.max(0,balance-principal);
      const due=new Date(start);due.setDate(1);due.setMonth(start.getMonth()+i+1);due.setDate(Math.min(start.getDate(),new Date(due.getFullYear(),due.getMonth()+1,0).getDate()));
      return {number:i+1,date:due.toISOString(),principal,interest,total:principal+interest,balance};
    });
  }
  function accept(applicationId) {
    const a=read('applications').find(a=>a.id===applicationId && a.userId===current()?.id);
    if(!a || a.status!=='APROBADO')throw Error('Esta solicitud no está disponible para aceptación.');
    a.status='PENDIENTE DE DESEMBOLSO';
    save('loans',{id:id('PRE'),applicationId:a.id,userId:a.userId,amount:a.amount,months:a.months,paid:0,status:a.status,createdAt:new Date().toISOString()});save('applications',a);
  }
  function disburse(loanId) {
    const l=read('loans').find(l=>l.id===loanId && l.userId===current()?.id);
    if(!l||l.status!=='PENDIENTE DE DESEMBOLSO')throw Error('El desembolso ya fue procesado o no está disponible.');
    l.status='DESEMBOLSADO';l.disbursedAt=new Date().toISOString();save('loans',l);
    const a=read('applications').find(a=>a.id===l.applicationId);a.status=l.status;save('applications',a);
    save('transactions',{id:id('TRX'),userId:l.userId,loanId:l.id,type:'Desembolso',amount:l.amount,date:l.disbursedAt});
  }
  function pay(loanId,method) {
    const l=read('loans').find(l=>l.id===loanId && l.userId===current()?.id);
    if(!l||l.status!=='DESEMBOLSADO'||l.paid>=l.months)throw Error('No hay cuotas pendientes.');
    const row=schedule(l)[l.paid];const now=new Date().toISOString();
    save('payments',{id:id('PAG'),loanId:l.id,userId:l.userId,number:row.number,amount:row.total,method,date:now});
    save('transactions',{id:id('TRX'),loanId:l.id,userId:l.userId,type:'Pago de cuota',amount:row.total,date:now});
    l.paid++;if(l.paid===l.months)l.status='PAGADO';save('loans',l);
  }
  async function hash(password,salt) { const data=new TextEncoder().encode(salt+password);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join(''); }
  async function seed() {
    keys.forEach(k=>{if(!localStorage.getItem('fintech_'+k))write(k,[]);});
    if(read('users').length)return;
    const users=[{id:'demo-client',firstName:'Valentina',lastName:'Gómez',email:'cliente@fintech.com',role:'client',documentType:'Cédula de ciudadanía',document:'1032456789',birth:'1995-05-12',phone:'3001234567',address:'Calle 85 # 12–30',city:'Bogotá',occupation:'Diseñadora',income:4500000}, {id:'demo-admin',firstName:'Administrador',lastName:'FINTECH',email:'admin@fintech.com',role:'admin'}];
    for(const u of users){u.salt=crypto.randomUUID();u.password=await hash(u.role==='admin'?'Admin123*':'Cliente123*',u.salt);}write('users',users);
    const now=new Date();const prior=new Date(now);prior.setMonth(prior.getMonth()-4);
    const a={id:id('SOL'),userId:'demo-client',amount:5000000,months:12,income:4500000,expenses:1600000,seniority:24,employment:'Empleado',purpose:'Libre inversión',score:862,status:'DESEMBOLSADO',date:prior.toISOString(),approvedAt:prior.toISOString()};save('applications',a);
    const l={id:id('PRE'),applicationId:a.id,userId:a.userId,amount:a.amount,months:a.months,paid:4,status:'DESEMBOLSADO',disbursedAt:prior.toISOString()};save('loans',l);
    save('transactions',{id:id('TRX'),userId:a.userId,loanId:l.id,type:'Desembolso',amount:l.amount,date:l.disbursedAt});
    schedule(l).slice(0,4).forEach(r=>{save('payments',{id:id('PAG'),loanId:l.id,userId:a.userId,number:r.number,amount:r.total,method:'PSE',date:r.date});save('transactions',{id:id('TRX'),loanId:l.id,userId:a.userId,type:'Pago de cuota',amount:r.total,date:r.date});});
    save('applications',{...a,id:id('SOL'),amount:8000000,months:24,score:698,status:'EN REVISIÓN',date:now.toISOString(),approvedAt:null});
  }
  return {read,write,money,date,escape,installment,id,current,save,scoring,decision,schedule,accept,disburse,pay,hash,seed};
})();
