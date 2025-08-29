// API base can be provided via localStorage or ?api= query param (useful for GitHub Pages)
let API_BASE = localStorage.getItem("apiUrl") || "";
try {
  const urlApi = new URLSearchParams(location.search).get("api");
  if (urlApi) {
    API_BASE = decodeURIComponent(urlApi);
    localStorage.setItem("apiUrl", API_BASE);
  }
} catch {}

// Supabase отключён — работаем только через backend API
// Объявляем supa как null, чтобы условные проверки if (supa) не падали
let supa = null;

const el = (id)=>document.getElementById(id);
const qs = (s)=>document.querySelector(s);

const ui = {
  login: el("login"),
  app: el("app"),
  email: el("email"),
  password: el("password"),
  doLogin: el("doLogin"),
  logout: el("logout"),
  editApi: el("editApi"),
  apiUrl: el("apiUrl"),
  saveApi: el("saveApi"),
  userInfo: el("userInfo"),
  tabs: document.querySelectorAll(".tab"),
  tabPanels: {
    floors: el("tab-floors"),
    reports: el("tab-reports"),
    leaderboard: el("tab-leaderboard"),
    admin: el("tab-admin"),
  },
  chips: document.querySelectorAll(".chip"),
  floorTitle: el("floorTitle"),
  tables: el("tables"),
  karaokeTools: el("karaokeTools"),
  addKaraokeTable: el("addKaraokeTable"),
  // drawer
  drawer: el("drawer"),
  drawerTitle: el("drawerTitle"),
  drawerClose: el("drawerClose"),
  filterCat: el("filterCat"),
  filterQ: el("filterQ"),
  menuCards: el("menuCards"),
  orderItems: el("orderItems"),
  orderSum: el("orderSum"),
  btnPay: el("btnPay"),
  btnPrint: el("btnPrint"),
  // reports
  statSales: el("statSales"),
  statUnpaid: el("statUnpaid"),
  statLow: el("statLow"),
  stockBody: el("stockBody"), borrowBody: el("borrowBody"),
  history: el("history"),
  sbpBody: el("sbpBody"), sbpFrom: el("sbpFrom"), sbpTo: el("sbpTo"), sbpReload: el("sbpReload"),
  btnDeleteAllOrders: el("btnDeleteAllOrders"),
  // admin
  menuForm: el("menuForm"), menuList: el("menuList"),
  userForm: el("userForm"), usersList: el("usersList"),
  stockForm: el("stockForm"), stockProduct: el("stockProduct"), stockQty: el("stockQty"), stockType: el("stockType"),
  borrowForm: el("borrowForm"), borrowUser: el("borrowUser"), borrowProduct: el("borrowProduct"), borrowQty: el("borrowQty"),
  returnForm: el("returnForm"), returnBorrowId: el("returnBorrowId"), returnQty: el("returnQty"),
  stockEntriesBody: el("stockEntriesBody"),
  // leaderboard
  lbBody: el("lbBody"),
};

const state = {
  token: localStorage.getItem("token") || null,
  role: localStorage.getItem("role") || null,
  name: localStorage.getItem("name") || null,
  floor: localStorage.getItem("floor") || null,
  currentFloor: "zal",
  tables: [], menu: [],
  currentTable: null,
  currentOrder: { items: [], total: 0, paid: false, id: null },
  lastMetrics: { sales: 0, unpaid: 0, low: 0 },
};

function showToast(msg){
  const c = el("toast"); const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; c.appendChild(t); setTimeout(()=>t.remove(), 3500);
}

function setAuth({ token, role, name, floor }){
  state.token = token; state.role = role; state.name = name; state.floor = floor ?? null;
  localStorage.setItem("token", token); localStorage.setItem("role", role); localStorage.setItem("name", name); localStorage.setItem("floor", floor ?? "");
}
function clearAuth(){
  state.token = null; state.role = null; state.name = null; state.floor = null;
  localStorage.removeItem("token"); localStorage.removeItem("role"); localStorage.removeItem("name"); localStorage.removeItem("floor");
}

async function api(path, options={}){
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok){
    let err = "Ошибка"; try { err = (await res.json()).error || err; } catch {}
    throw new Error(err);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function switchScreen(appMode){ ui.login.classList.toggle("visible", !appMode); ui.app.classList.toggle("visible", appMode); }
function updateRoleUI(){ document.querySelectorAll('.admin-only').forEach(x=> x.style.display = state.role==='admin' ? 'inline-block':'none'); }

// Auth
ui.doLogin.addEventListener('click', async ()=>{
  try{
    const email = ui.email.value.trim(); const password = ui.password.value.trim();
    const data = await api('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
    setAuth(data); ui.userInfo.textContent = `${data.name} (${data.role})`; updateRoleUI(); switchScreen(true); await loadInitial();
  }catch(e){ showToast(e.message); }
});
ui.logout.addEventListener('click', ()=>{ clearAuth(); switchScreen(false); });
ui.apiUrl.value = API_BASE; ui.saveApi.addEventListener('click', ()=>{ API_BASE = ui.apiUrl.value.trim() || API_BASE; localStorage.setItem('apiUrl', API_BASE); showToast('API сохранён'); });
ui.editApi?.addEventListener('click', ()=>{ const u = prompt('API URL', API_BASE); if (!u) return; API_BASE = u.trim(); localStorage.setItem('apiUrl', API_BASE); showToast('API обновлён'); });

// Tabs
ui.tabs.forEach(btn => btn.addEventListener('click', async ()=>{
  ui.tabs.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  const key = btn.dataset.tab; Object.entries(ui.tabPanels).forEach(([k,el])=> el.classList.toggle('visible', k===key));
  try{
    if (key==='reports') await loadReports();
    if (key==='leaderboard') await loadLeaderboard();
    if (key==='admin') await Promise.all([loadUsersIfAdmin(), loadStockEntries()]);
  }catch(e){ showToast(e.message); }
}));
// Manual refresh for reports
ui.btnRefreshReports?.addEventListener('click', ()=> loadReports());
ui.sbpReload?.addEventListener('click', ()=> loadSalesByProduct());

// Floors
ui.chips.forEach(chip => chip.addEventListener('click', async ()=>{
  const f = chip.dataset.floor; if (state.role==='waiter' && f!==state.floor) return; state.currentFloor=f; updateFloorUI(); await loadTables();
}));
function updateFloorUI(){ ui.chips.forEach(ch=> ch.classList.toggle('active', ch.dataset.floor===state.currentFloor)); ui.floorTitle.textContent = state.currentFloor==='zal'?'Зал':state.currentFloor==='tepa'?'Тепа':'Караоке'; ui.karaokeTools.classList.toggle('hidden', !(state.currentFloor==='karaoke' && state.role==='admin')); }

async function loadInitial(){ state.currentFloor = state.role==='waiter' ? (state.floor||'zal') : 'zal'; updateFloorUI(); await Promise.all([loadMenu(), loadTables(), loadReports(), loadLeaderboard(), loadUsersIfAdmin(), loadStockEntries()]); }

async function loadTables(){
  const floor = state.currentFloor;
  if (supa) {
    const { data, error } = await supa.from('tables').select('*').eq('floor', floor).order('number');
    if (error) { showToast(error.message); state.tables = []; }
    else state.tables = data || [];
  } else {
    const rows = await api(`/orders/tables/${floor}`);
    state.tables = rows;
  }
  renderTables(); await refreshOrdersSummary();
}

function renderTables(){ ui.tables.innerHTML=''; for (const t of state.tables){ const card=document.createElement('div'); card.className='table-card'; const inner=document.createElement('div'); inner.className='table-inner'; inner.innerHTML=`<div class="status">Стол ${t.number}</div><div class="kpis"><div class="kpi">Заказов: <strong id="cnt-${t.id}">0</strong></div><div class="kpi">Сумма: <strong id="sum-${t.id}">0</strong></div><div class="kpi">Статус: <strong id="paid-${t.id}">—</strong></div></div>`; inner.addEventListener('click',()=>openDrawer(t)); card.appendChild(inner); ui.tables.appendChild(card);} }

async function refreshOrdersSummary(){
  if (supa) {
    const tableIds = state.tables.map(t=>t.id);
    if (tableIds.length===0) return;
    const { data, error } = await supa.from('orders').select('id,table_id,total,paid,created_at').in('table_id', tableIds);
    if (error) { showToast(error.message); return; }
    const byTable=new Map();
    for (const o of data){ if(!byTable.has(o.table_id)) byTable.set(o.table_id,[]); byTable.get(o.table_id).push(o);} 
    for (const [tid,arr] of byTable){ const total=arr.reduce((s,o)=>s+Number(o.total||0),0); const paid = arr.every(o=>!!o.paid); const cnt=el(`cnt-${tid}`), sum=el(`sum-${tid}`), p=el(`paid-${tid}`); if(cnt) cnt.textContent=String(arr.length); if(sum) sum.textContent=String(total); if(p) p.textContent = paid? 'оплачено':'не оплачено'; }
  } else {
    const list = await api(`/orders?floor=${state.currentFloor}`); const byTable=new Map(); for (const o of list){ if(!byTable.has(o.table_id)) byTable.set(o.table_id,[]); byTable.get(o.table_id).push(o);} for (const [tid,arr] of byTable){ const total=arr.reduce((s,o)=>s+Number(o.total),0); const paid = arr.every(o=>!!o.paid); const cnt=el(`cnt-${tid}`), sum=el(`sum-${tid}`), p=el(`paid-${tid}`); if(cnt) cnt.textContent=String(arr.length); if(sum) sum.textContent=String(total); if(p) p.textContent = paid? 'оплачено':'не оплачено'; }
  }
}

// Drawer / Order
async function loadMenu(){
  if (supa) {
    const { data, error } = await supa.from('menu').select('*').order('category', { ascending: true }).order('name', { ascending: true });
    if (error) { showToast(error.message); state.menu=[]; }
    else state.menu = data || [];
  } else {
    state.menu = await api('/menu');
  }
  populateAdminSelects();
}

async function loadUsersIfAdmin(){ if (state.role!=='admin') return; try{ const users = await api('/auth/users'); if (ui.borrowUser) ui.borrowUser.innerHTML = users.map(u=>`<option value="${u.id}">${u.name} (${u.role}${u.floor?'-'+u.floor:''})</option>`).join(''); }catch{} }

function populateAdminSelects(){
  if (ui.stockProduct) ui.stockProduct.innerHTML = state.menu.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  if (ui.borrowProduct) ui.borrowProduct.innerHTML = ui.stockProduct.innerHTML;
}
async function openDrawer(table){ state.currentTable = table; ui.drawerTitle.textContent = `${ui.floorTitle.textContent} — Стол ${table.number}`; ui.drawer.classList.add('visible'); renderMenuCards(); await loadCurrentOrder(); }
ui.drawerClose.addEventListener('click', ()=> ui.drawer.classList.remove('visible'));
ui.filterCat.addEventListener('change', renderMenuCards); ui.filterQ.addEventListener('input', renderMenuCards);

function renderMenuCards(){ const filter=ui.filterCat.value, q=(ui.filterQ.value||'').toLowerCase(); const list=state.menu.filter(m=> (filter==='all'||m.category===filter) && m.name.toLowerCase().includes(q)); ui.menuCards.innerHTML=''; for (const m of list){ const card=document.createElement('div'); card.className='list-item'; card.innerHTML=`<div><strong>${m.name}</strong> <span class="muted">${m.price}</span></div>`; const add=document.createElement('button'); add.className='btn btn-primary'; add.textContent='+'; add.addEventListener('click',()=>addToOrder(m)); card.appendChild(add); ui.menuCards.appendChild(card);} }

async function loadCurrentOrder(){ const orders = await api(`/orders?floor=${state.currentFloor}`); const cur = orders.filter(o=> o.table_id===state.currentTable.id).find(o=> !o.paid) || null; if(cur){ const items = Array.isArray(cur.items)?cur.items:JSON.parse(cur.items); state.currentOrder = { items, total:Number(cur.total), paid:!!cur.paid, id:cur.id }; } else { state.currentOrder = { items:[], total:0, paid:false, id:null }; } renderOrder(); }
function renderOrder(){ ui.orderItems.innerHTML=''; for (let i=0;i<state.currentOrder.items.length;i++){ const it=state.currentOrder.items[i]; const row=document.createElement('div'); row.className='list-item'; row.innerHTML=`<div>${it.name} x${it.qty} — ${it.price*it.qty}</div>`; const del=document.createElement('button'); del.className='btn btn-ghost'; del.textContent='Удалить'; del.addEventListener('click',()=>{ state.currentOrder.items.splice(i,1); renderOrder();}); row.appendChild(del); ui.orderItems.appendChild(row);} const sum=state.currentOrder.items.reduce((s,it)=>s+it.price*it.qty,0); state.currentOrder.total=sum; ui.orderSum.textContent=String(sum); }
function addToOrder(m){ const ex=state.currentOrder.items.find(it=>it.productId===m.id); if(ex) ex.qty+=1; else state.currentOrder.items.push({ productId:m.id, name:m.name, price:Number(m.price), qty:1 }); renderOrder(); }

ui.btnPay.addEventListener('click', async ()=>{ try{ await ensureOrderSaved(); if(!state.currentOrder.id) throw new Error('Нет заказа'); await api(`/orders/${state.currentOrder.id}/pay`, { method:'PATCH' }); showToast('Оплачено'); ui.drawer.classList.remove('visible'); state.currentOrder={ items:[], total:0, paid:true, id:null }; await Promise.all([loadTables(), loadReports(), loadLeaderboard()]); }catch(e){ showToast(e.message); } });

ui.btnPrint.addEventListener('click', async ()=>{ try{ await ensureOrderSaved(); if(!state.currentOrder.id) throw new Error('Нет заказа'); const res = await fetch(`${API_BASE}/orders/${state.currentOrder.id}/receipt`, { headers: state.token?{Authorization:`Bearer ${state.token}`}:{}}); const txt = await res.text(); const w=window.open('', 'print'); w.document.write(`<pre>${txt.replace(/</g,'&lt;')}</pre>`); w.document.close(); w.focus(); w.print(); }catch(e){ showToast(e.message); } });

async function ensureOrderSaved(){ if(state.currentOrder.id) return; const payload = { table_id: state.currentTable.id, items: state.currentOrder.items, total: state.currentOrder.total }; const res = await api('/orders', { method:'POST', body: JSON.stringify(payload) }); state.currentOrder.id = res.id; }

// Reports
async function loadReports(){
  // daily
  try{
    if (supa) {
      const { data, error } = await supa.from('v_daily_sales').select('*').limit(1);
      if (error) throw error; const today = data[0] || { total_sales:0, unpaid_total:0 };
      ui.statSales.textContent=String(today.total_sales||0); ui.statUnpaid.textContent=String(today.unpaid_total||0);
      const tbody = document.getElementById('dailyBody');
      const { data: rows } = await supa.from('v_daily_sales').select('*').limit(30);
      if (tbody) tbody.innerHTML = (rows||[]).map(r=>`<tr><td>${r.day||''}</td><td>${r.total_sales||0}</td><td>${r.unpaid_total||0}</td><td>${r.orders_count||0}</td></tr>`).join('');
    } else {
      const daily = await api('/reports/daily'); const today = daily[0] || { total_sales:0, unpaid_total:0 }; ui.statSales.textContent=String(today.total_sales||0); ui.statUnpaid.textContent=String(today.unpaid_total||0);
      const tbody = document.getElementById('dailyBody'); if (tbody) tbody.innerHTML = (daily||[]).map(r=>`<tr><td>${r.day||''}</td><td>${r.total_sales||0}</td><td>${r.unpaid_total||0}</td><td>${r.orders_count||0}</td></tr>`).join('');
    }
  }catch(e){ showToast('Отчёт: '+e.message); }
  // stock
  try{
    if (supa) {
      const { data, error } = await supa.from('v_stock_current').select('*'); if (error) throw error;
      const stock = { stock: data, lowStock: data.filter(r=> Number(r.stock)<3) };
      ui.statLow.textContent=String(stock.lowStock.length);
      ui.stockBody.innerHTML = stock.stock.map(r=>`<tr><td>${r.name}</td><td>${r.category}</td><td>${r.stock}</td><td>${r.sold||0}</td>${state.role==='admin'?`<td><button class='btn btn-secondary btn-add-stock' data-id='${r.id}'>+Приход</button></td>`:''}</tr>`).join('');
    } else {
      const stock = await api('/stock/current'); ui.statLow.textContent=String(stock.lowStock.length); ui.stockBody.innerHTML = stock.stock.map(r=>`<tr><td>${r.name}</td><td>${r.category}</td><td>${r.stock}</td><td>${r.sold||0}</td>${state.role==='admin'?`<td><button class='btn btn-secondary btn-add-stock' data-id='${r.id}'>+Приход</button></td>`:''}</tr>`).join('');
    }
  }catch(e){ showToast('Остатки: '+e.message); }
  // unpaid history (простая версия)
  try{
    if (supa) {
      const { data, error } = await supa.from('orders').select('id,table_id,total,paid,created_at').eq('paid', false).order('created_at', { ascending:false }); if (error) throw error;
      const tableById = new Map(state.tables.map(t=>[t.id,t]));
      ui.history.innerHTML = (data||[]).map(o=>{ const t=tableById.get(o.table_id); const label = t? `${t.floor.toUpperCase()} Стол ${t.number}` : `Стол ${o.table_id}`; return `<div class="list-item">${label} — ${o.total} (${o.paid?'оплачено':'не оплачено'})</div>`; }).join('');
    } else {
      const orders = await api('/reports/unpaid'); ui.history.innerHTML = orders.map(o=>`<div class="list-item">${o.floor.toUpperCase()} Стол ${o.table_number} — ${o.total} (${o.paid?'оплачено':'не оплачено'})</div>`).join('');
    }
  }catch(e){ showToast('История: '+e.message); }
  await loadSalesByProduct();
}

async function loadSalesByProduct(){
  try{
    const params = new URLSearchParams();
    if (ui.sbpFrom?.value) params.set('from', ui.sbpFrom.value);
    if (ui.sbpTo?.value) params.set('to', ui.sbpTo.value);
    const qs = params.toString();
    const rows = await api(`/reports/sales-by-product${qs?`?${qs}`:''}`);
    if (ui.sbpBody) ui.sbpBody.innerHTML = rows.map(r=>`<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.amount}</td></tr>`).join('');
  }catch(e){ showToast('Продажи по товарам: '+e.message); }
}

// Stock entries (admin)
async function loadStockEntries(){ if (state.role!=='admin' || !ui.stockEntriesBody) return; try{ const entries = await api('/stock/entries?limit=100'); ui.stockEntriesBody.innerHTML = entries.map(e=>`<tr><td>${e.id}</td><td>${e.product_name}</td><td><input type='number' data-id='${e.id}' data-field='qty' value='${e.qty}' style='width:90px' /></td><td><select data-id='${e.id}' data-field='type'><option ${e.type==='incoming'?'selected':''} value='incoming'>incoming</option><option ${e.type==='opening'?'selected':''} value='opening'>opening</option><option ${e.type==='adjustment'?'selected':''} value='adjustment'>adjustment</option></select></td><td>${e.created_at?.slice(0,10)||''}</td><td><button class='btn btn-secondary btn-save' data-id='${e.id}'>Сохранить</button> <button class='btn btn-danger btn-del-entry' data-id='${e.id}'>Удалить</button></td></tr>`).join('');
  // Attach actions
  ui.stockEntriesBody.querySelectorAll('.btn-save').forEach(b=> b.addEventListener('click', async (ev)=>{
    const id = ev.currentTarget.getAttribute('data-id');
    const qty = Number(ui.stockEntriesBody.querySelector(`input[data-id='${id}'][data-field='qty']`).value);
    const type = ui.stockEntriesBody.querySelector(`select[data-id='${id}'][data-field='type']`).value;
    try{ await api(`/stock/entries/${id}`, { method:'PUT', body: JSON.stringify({ qty, type })}); showToast('Сохранено'); await loadReports(); await loadStockEntries(); }catch(err){ showToast(err.message); }
  }));
  ui.stockEntriesBody.querySelectorAll('.btn-del-entry').forEach(b=> b.addEventListener('click', async (ev)=>{
    const id = ev.currentTarget.getAttribute('data-id');
    if (!confirm('Удалить приход?')) return;
    try{ await api(`/stock/entries/${id}`, { method:'DELETE' }); showToast('Удалено'); await loadReports(); await loadStockEntries(); }catch(err){ showToast(err.message); }
  }));
}catch(e){ /* ignore */ }}

// Leaderboard
async function loadLeaderboard(){ try{ const data = await api('/reports/leaderboard'); ui.lbBody.innerHTML = data.map((r,i)=>`<tr class="${i===0?'winner':''}"><td>${r.name}</td><td>${r.total_sales}</td><td>${r.orders_count}</td></tr>`).join(''); }catch(e){ showToast('Лидерборд: '+e.message); } }

// Admin
ui.menuForm?.addEventListener('submit', async (e)=>{ e.preventDefault(); const name=el('menuName').value.trim(); const price=Number(el('menuPrice').value); const category=el('menuCat').value; const stock=Number(el('menuStock').value||0); try{ const m=await api('/menu',{ method:'POST', body: JSON.stringify({ name, price, category }) }); if(stock>0){ await api('/stock',{ method:'POST', body: JSON.stringify({ product_id:m.id, qty:stock, type:'opening' })}); } showToast('Товар добавлен'); await loadMenu(); }catch(e){ showToast(e.message); } });
ui.userForm?.addEventListener('submit', async (e)=>{ e.preventDefault(); const name=el('uName').value.trim(); const email=el('uEmail').value.trim(); const password=el('uPass').value; const role=el('uRole').value; const floor=el('uFloor').value||null; try{ await api('/auth/register',{ method:'POST', body: JSON.stringify({ name,email,password,role,floor }) }); showToast('Сотрудник добавлен'); }catch(e){ showToast(e.message); } });

// Admin: приход
ui.stockForm?.addEventListener('submit', async (e)=>{ e.preventDefault(); try{ const product_id=Number(ui.stockProduct.value); const qty=Number(ui.stockQty.value); const type=ui.stockType.value; await api('/stock',{ method:'POST', body: JSON.stringify({ product_id, qty, type })}); showToast('Остатки обновлены'); await loadReports(); }catch(err){ showToast(err.message);} });

// Admin: заем
ui.borrowForm?.addEventListener('submit', async (e)=>{ e.preventDefault(); try{ const user_id=Number(ui.borrowUser.value); const product_id=Number(ui.borrowProduct.value); const qty=Number(ui.borrowQty.value); await api('/stock/borrow',{ method:'POST', body: JSON.stringify({ user_id, product_id, qty })}); showToast('Выдано'); await loadReports(); }catch(err){ showToast(err.message);} });

// Admin: возврат
ui.returnForm?.addEventListener('submit', async (e)=>{ e.preventDefault(); try{ const borrow_id=Number(ui.returnBorrowId.value); const qty=Number(ui.returnQty.value); await api('/stock/borrow/return',{ method:'POST', body: JSON.stringify({ borrow_id, qty })}); showToast('Возврат принят'); await loadReports(); }catch(err){ showToast(err.message);} });

// Auto start
if(state.token){ ui.userInfo.textContent=`${state.name} (${state.role})`; updateRoleUI(); switchScreen(true); loadInitial(); }

// Background polling for notifications (every 20s)
setInterval(async ()=>{
  if (!state.token) return;
  try{
    const daily = await api('/reports/daily');
    const today = daily[0] || { total_sales:0, unpaid_total:0 };
    const sales = Number(today.total_sales||0), unpaid = Number(today.unpaid_total||0);
    if (sales > state.lastMetrics.sales) showToast(`Сегодня продано на сумму: ${sales}`);
    if (unpaid > state.lastMetrics.unpaid) showToast(`Внимание: возросла сумма неоплаченного: ${unpaid}`);
    state.lastMetrics.sales = sales; state.lastMetrics.unpaid = unpaid;
  }catch {}
  try {
    const stock = await api('/stock/current');
    const low = Number(stock.lowStock.length||0);
    if (low > state.lastMetrics.low) showToast(`Низких остатков: ${low}`);
    state.lastMetrics.low = low;
  } catch {}
  try { await loadLeaderboard(); } catch {}
}, 20000);

// Admin: delete all orders
ui.btnDeleteAllOrders?.addEventListener('click', async ()=>{
  if (state.role !== 'admin') return;
  if (!confirm('Удалить все заказы?')) return;
  try { await api('/orders', { method:'DELETE' }); showToast('Все заказы удалены'); await Promise.all([loadReports(), loadTables(), loadLeaderboard()]); } catch(e){ showToast(e.message); }
});
