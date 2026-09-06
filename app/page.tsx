'use client';

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Bell, Eye, EyeOff, Flame, LogIn, LogOut, Loader2, RefreshCw, LayoutGrid, ClipboardList, Menu as MenuIcon, UserRound, ChevronRight, Plus, Minus, ArrowLeft, Send, CheckCircle2, Settings, Pencil, Power, Save, X, UserPlus, UserCog, Trash2, CreditCard, Banknote, ReceiptText, CalendarDays, LockKeyholeOpen, LockKeyhole, History } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';

type Profile = { id: string; full_name: string; role: string; username?: string };
type RestaurantTable = { id: number; name: string; is_vip: boolean; is_bar?: boolean; status: 'free' | 'busy'; guests: number; active_order_id: number | null; active: boolean };
type Category = { id: number; name: string; icon: string | null; active: boolean; parent_id: number | null; sort_order?: number };
type MenuItem = { id: number; category_id: number; name: string; price: number; large_price: number | null; description: string | null; active: boolean };
type CartItem = { menu_item_id: number; item_name: string; unit_price: number; qty: number; details: Record<string,string> };
type OrderItem = { id: number; item_name: string; qty: number; unit_price: number; details: Record<string,string>; department: 'hookah'|'waiter'; item_status: string };
type Order = { id: number; table_id: number; table_name: string; staff_name: string; status: string; created_at: string; items: OrderItem[]; payment_method?: string | null; cash_received?: number | null; cash_amount?: number | null; card_amount?: number | null; change_amount?: number | null; closed_at?: string | null };
type Receipt = { id:number; table_id:number; table_name:string; guests:number; total:number; payment_method:'cash'|'card'|'mixed'; cash_amount:number; card_amount:number; cash_received:number; change_amount:number; closed_at:string; staff_name:string; shift_id:number|null; order_ids:number[]; items?:CheckItem[] };
type CheckItem = { item_name:string; qty:number; unit_price:number; details:Record<string,string> };
type Check = { table_id:number; table_name:string; guests:number; orders:number[]; items:CheckItem[]; total:number };
type Analytics = { total:number; cash:number; card:number; checks:number; avg:number; top:{name:string;qty:number}[] };
type Shift = { id:number; opened_at:string; closed_at:string|null; status:'open'|'closed'; opening_cash:number; closing_cash:number|null; opened_by:string; closed_by:string|null; opened_by_name?:string; closed_by_name?:string };
type View = 'tables' | 'orders' | 'menu' | 'shift' | 'profile';
type Staff = { id:string; full_name:string; username:string; role:string; active:boolean; email?:string|null; created_at?:string };
type Role = 'waiter'|'hookah'|'admin';
type AuditLog = { id:number; created_at:string; staff_id:string|null; staff_name:string; role:string; action:string; entity_type:string; entity_id:string|null; details:Record<string,any> };

const icons: Record<string,string> = { 'Кальяны':'💨','Кофе':'☕','Чай':'🍵','Матча':'🍵','Б/А напитки':'🥤','Авторские напитки':'🍹','Снэки':'🍟','Сэндвичи':'🥪','Алкоголь':'🍸','Напитки':'🥤' };
function topCategoryId(categories:Category[], id:number){ let cur=categories.find(c=>c.id===id); const seen=new Set<number>(); while(cur?.parent_id!=null&&!seen.has(cur.id)){seen.add(cur.id);cur=categories.find(c=>c.id===cur!.parent_id)} return cur?.id??id }
function categoryIsHookah(categories:Category[], id:number){ const top=categories.find(c=>c.id===topCategoryId(categories,id)); return top?.name==='Кальяны' }
function categoryName(categories:Category[], id:number){return categories.find(c=>c.id===id)?.name||''}


function viewTitle(view: View){
  if(view==='tables') return 'Столы';
  if(view==='orders') return 'Заказы';
  if(view==='menu') return 'Меню';
  if(view==='shift') return 'Смена';
  return 'Профиль';
}

function NavButton({active,icon,text,onClick}:{active:boolean;icon:ReactNode;text:string;onClick:()=>void}){return <button type="button" className={`nav-btn ${active?'active':''}`} onClick={onClick}>{icon}<span>{text}</span></button>}

function roleName(r:string){return({waiter:'Официант',hookah:'Кальянщик',admin:'Администратор'} as Record<string,string>)[r]||r}
function statusName(s:string){return({new:'Новый',work:'В работе',ready:'Готов',done:'Выдан',cancelled:'Отменён'} as Record<string,string>)[s]||s}
function itemStatusName(s:string){return({new:'Новый',work:'В работе',ready:'Готов',done:'Выдан'} as Record<string,string>)[s]||s}
function money(n:number){return Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽'}
function plural(n:number,a:string,b:string,c:string){const x=n%100,y=n%10;return x>=11&&x<=14?c:y===1?a:y>=2&&y<=4?b:c}


export default function Page() {
  const [profile,setProfile]=useState<Profile|null>(null),[login,setLogin]=useState(''),[pin,setPin]=useState(''),[showPin,setShowPin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [view,setView]=useState<View>('tables'),[adminOpen,setAdminOpen]=useState(false),[tables,setTables]=useState<RestaurantTable[]>([]),[tableError,setTableError]=useState(''),[loading,setLoading]=useState(false),[filter,setFilter]=useState<'all'|'normal'|'vip'>('all');
  const [selectedTable,setSelectedTable]=useState<RestaurantTable|null>(null),[tableSummary,setTableSummary]=useState<Record<number,{total:number;newCount:number;workCount:number;readyCount:number;orders:number}>>({}),[orderFilter,setOrderFilter]=useState<'all'|'new'|'work'|'ready'>('all'),[check,setCheck]=useState<Check|null>(null),[paymentMethod,setPaymentMethod]=useState<'cash'|'card'|'mixed'>('card'),[cashReceived,setCashReceived]=useState(''),[mixedCash,setMixedCash]=useState(''),[mixedCard,setMixedCard]=useState(''),[closeSaving,setCloseSaving]=useState(false),[categories,setCategories]=useState<Category[]>([]),[items,setItems]=useState<MenuItem[]>([]),[menuCategory,setMenuCategory]=useState<number|null>(null),[cart,setCart]=useState<CartItem[]>([]),[orders,setOrders]=useState<Order[]>([]),[ordersLoading,setOrdersLoading]=useState(false),[receipts,setReceipts]=useState<Receipt[]>([]),[receiptsLoading,setReceiptsLoading]=useState(false),[toast,setToast]=useState(''),[notificationsOn,setNotificationsOn]=useState(true),[currentShift,setCurrentShift]=useState<Shift|null>(null),[tableDetail,setTableDetail]=useState<RestaurantTable|null>(null),[barDetail,setBarDetail]=useState<RestaurantTable|null>(null),[barPaymentOrder,setBarPaymentOrder]=useState<Order|null>(null),[analytics,setAnalytics]=useState<Analytics>({total:0,cash:0,card:0,checks:0,avg:0,top:[]}),[auditLogs,setAuditLogs]=useState<AuditLog[]>([]),[auditLoading,setAuditLoading]=useState(false);
  const seenOrders=useRef<Set<number>>(new Set());
  const audioCtxRef=useRef<AudioContext|null>(null);
  const initialOrdersLoaded=useRef(false);
  const ordersLoadSeq=useRef(0);
  const currentShiftRef=useRef<Shift|null>(null);
  const sb=useMemo(()=>supabaseBrowser(),[]);
  async function logAction(action:string, entityType:string, entityId?:string|number|null, details:Record<string,any>={}){if(!profile)return;try{await sb.from('audit_logs').insert({staff_id:profile.id,action,entity_type:entityType,entity_id:entityId==null?null:String(entityId),details});}catch{}}

  useEffect(()=>{ sb.auth.getSession().then(async({data})=>{ if(!data.session?.user)return; const {data:staff}=await sb.from('staff_profiles').select('id,full_name,role,active,username').eq('id',data.session.user.id).single(); if(staff?.active)setProfile({id:staff.id,full_name:staff.full_name,role:staff.role==='bar'?'waiter':staff.role}); }); },[sb]);
  useEffect(()=>{
    if(!profile)return;
    let alive=true;
    let pollTimer:ReturnType<typeof setInterval>|null=null;
    const refreshAll=()=>{ if(!alive || !currentShiftRef.current)return; loadTables(); loadOrders(false); };
    loadMenu(); loadCurrentShift();

    // Realtime is the primary path. The polling fallback keeps all devices in sync
    // even if a browser/network temporarily loses the Supabase realtime socket.
    const channel=sb.channel(`restaurant-live-${profile.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'restaurant_tables'},()=>refreshAll())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},async(payload:any)=>{
        if(!currentShiftRef.current)return;
        await loadOrders(false);
        const id=Number(payload.new?.id);
        if(!id||seenOrders.current.has(id)||!initialOrdersLoaded.current)return;
        const staffId=payload.new?.staff_id;
        if(staffId===profile.id)return;
        if(profile.role==='hookah'){
          const {data:hookahItems}=await sb.from('order_items').select('id').eq('order_id',id).eq('department','hookah').limit(1);
          if(!hookahItems?.length)return;
        }
        await notifyNewOrder(id);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders'},()=>refreshAll())
      .on('postgres_changes',{event:'*',schema:'public',table:'order_items'},()=>refreshAll())
      .subscribe();

    // Safety net: refresh every 4 seconds. This is deliberately lightweight and
    // makes the app usable on phones where WebSocket/Realtime may be interrupted.
    pollTimer=setInterval(()=>{
      if(!alive || !currentShiftRef.current)return;
      loadTables();
      loadOrders(false);
    },4000);

    return()=>{alive=false;if(pollTimer)clearInterval(pollTimer);sb.removeChannel(channel)}
  },[profile,sb]);
  useEffect(()=>{if(profile&&currentShift){loadTables(); if(view==='orders')loadOrders(true)}},[view,profile,currentShift]);
  useEffect(()=>{if(profile?.role==='admin'&&adminOpen){loadReceipts(true);loadAnalytics();loadAuditLogs()}},[adminOpen,profile]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),2500);return()=>clearTimeout(t)}},[toast]);
  useEffect(()=>{
    if(!profile||typeof window==='undefined')return;
    try{
      if('serviceWorker' in navigator){
        navigator.serviceWorker.register('/sw.js').then(reg=>reg.update().catch(()=>{})).catch(()=>{});
      }
    }catch{}
  },[profile]);

  async function unlockAudio(){
    try{
      const Ctx=window.AudioContext||(window as any).webkitAudioContext;
      if(!Ctx)return;
      if(!audioCtxRef.current)audioCtxRef.current=new Ctx();
      if(audioCtxRef.current.state==='suspended')await audioCtxRef.current.resume();
      // A silent oscillator during a real user gesture unlocks audio on iOS PWA.
      const ctx=audioCtxRef.current;
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      gain.gain.value=0.0001;
      osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.03);
    }catch{}
  }
  function enableNotifications(){
    setNotificationsOn(v=>{const next=!v; setToast(next?'Звуковые уведомления включены':'Звуковые уведомления выключены'); if(next){unlockAudio().then(()=>beep())} return next});
  }
  function beep(){
    try{
      const Ctx=window.AudioContext||(window as any).webkitAudioContext;if(!Ctx)return;
      const ctx=audioCtxRef.current||new Ctx();audioCtxRef.current=ctx;
      const play=()=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type='sine';osc.frequency.value=880;gain.gain.setValueAtTime(.001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.18,ctx.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.42);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.43)};
      if(ctx.state==='suspended')ctx.resume().then(play).catch(()=>{});else play();
    }catch{}
    try{navigator.vibrate?.([120,60,120])}catch{}
  }
  async function notifyNewOrder(id:number){
    if(seenOrders.current.has(id)||!notificationsOn)return; seenOrders.current.add(id);
    beep();
    const title=profile?.role==='hookah'?'Новый заказ на кальян':'Новый заказ';
    setToast(`🔔 ${title} · заказ #${id}`);
  }
  async function loadTables(){
    const shift=currentShiftRef.current;
    if(!shift){setTableSummary({});setLoading(false);return;}
    setLoading(true);setTableError('');
    const {data,error:e}=await sb.from('restaurant_tables').select('id,name,is_vip,is_bar,status,guests,active_order_id,active').eq('active',true).order('is_vip').order('id');
    if(e){setTableError(e.message);setLoading(false);return}
    const tableData=(data||[]) as RestaurantTable[]; setTables(tableData);
    const ids=tableData.map(t=>t.id); const summary:Record<number,{total:number;newCount:number;workCount:number;readyCount:number;orders:number}>={};
    ids.forEach(id=>summary[id]={total:0,newCount:0,workCount:0,readyCount:0,orders:0});
    if(ids.length){
      const {data:os}=await sb.from('orders').select('id,table_id').in('table_id',ids).not('status','in','(done,cancelled)').eq('shift_id',shift.id);
      const orderIds=(os||[]).map((o:any)=>o.id); for(const o of os||[]) if(summary[o.table_id]) summary[o.table_id].orders++;
      if(orderIds.length){
        const {data:oi}=await sb.from('order_items').select('order_id,qty,unit_price,item_status').in('order_id',orderIds);
        const orderTable=new Map((os||[]).map((o:any)=>[o.id,o.table_id]));
        for(const x of oi||[]){const tid=orderTable.get(x.order_id);if(!tid||!summary[tid])continue;const q=Number(x.qty)||0;summary[tid].total+=q*Number(x.unit_price||0);if(x.item_status==='new')summary[tid].newCount+=q;else if(x.item_status==='work')summary[tid].workCount+=q;else if(x.item_status==='ready')summary[tid].readyCount+=q;}
      }
    }
    setTableSummary(summary);setLoading(false)
  }
  async function loadMenu(){const [{data:c},{data:i}]=await Promise.all([sb.from('menu_categories').select('id,name,icon,active,parent_id,sort_order').order('sort_order').order('id'),sb.from('menu_items').select('id,category_id,name,price,large_price,description,active').order('id')]);setCategories((c||[]) as Category[]);setItems((i||[]) as MenuItem[])}
  function departmentForCategory(categoryName:string){return categoryName==='Кальяны'?'hookah':'waiter'}
  function departmentForCategoryId(categoryId:number){return categoryIsHookah(categories,categoryId)?'hookah':'waiter'}
  function aggregateOrderStatus(items:OrderItem[]){
    if(!items.length)return 'new';
    if(items.every(x=>x.item_status==='done'||x.item_status==='ready')) return 'ready';
    if(items.some(x=>x.item_status==='work'||x.item_status==='ready')) return 'work';
    return 'new';
  }
  async function loadOrders(show=true){
    const requestSeq=++ordersLoadSeq.current;
    if(show)setOrdersLoading(true);
    const shift=currentShiftRef.current;
    try{
      if(!shift){
        if(requestSeq===ordersLoadSeq.current)setOrders([]);
        return;
      }
      const {data:os,error:e}=await sb.from('orders').select('id,table_id,staff_id,status,created_at,shift_id').eq('shift_id',shift.id).order('created_at',{ascending:false}).limit(100);
      if(e)throw e;
      // Load table names independently from the tables screen state. Realtime/polling
      // can refresh orders while `tables` is temporarily empty or stale; using that
      // React state here caused table names to turn into the generic "Стол" after a few seconds.
      const tableIds=[...new Set((os||[]).map((o:any)=>Number(o.table_id)).filter(Boolean))];
      let tableMap=new Map<number,string>();
      if(tableIds.length){
        const {data:ts,error:te}=await sb.from('restaurant_tables').select('id,name').in('id',tableIds);
        if(te)throw te;
        tableMap=new Map((ts||[]).map((t:any)=>[Number(t.id),t.name]));
      }
      const staffIds=[...new Set((os||[]).map((o:any)=>o.staff_id).filter(Boolean))];
      let staffMap=new Map<string,string>();
      if(staffIds.length){const {data:s}=await sb.from('staff_profiles').select('id,full_name').in('id',staffIds);staffMap=new Map((s||[]).map((x:any)=>[x.id,x.full_name]));}
      const ids=(os||[]).map((o:any)=>o.id);
      let itemMap=new Map<number,OrderItem[]>();
      if(ids.length){
        const {data:oi,error:ie}=await sb.from('order_items').select('id,order_id,item_name,qty,unit_price,details,menu_item_id,department,item_status').in('order_id',ids);
        if(ie)throw ie;
        for(const x of oi||[]){
          const item:OrderItem={id:Number(x.id),item_name:x.item_name,qty:Number(x.qty),unit_price:Number(x.unit_price),details:x.details||{},department:(x.department==='hookah'?'hookah':'waiter'),item_status:x.item_status||'new'};
          if(!itemMap.has(x.order_id))itemMap.set(x.order_id,[]); itemMap.get(x.order_id)!.push(item);
        }
      }
      const role=profile?.role||'waiter';
      const allowed=(arr:OrderItem[])=>role==='admin'||role==='waiter'||arr.some(x=>x.department===role);
      const visibleItems=(arr:OrderItem[])=>role==='admin'||role==='waiter'?arr:arr.filter(x=>x.department===role);
      const currentIds=new Set<number>((os||[]).map((o:any)=>Number(o.id)));
      if(!initialOrdersLoaded.current){seenOrders.current=currentIds;initialOrdersLoaded.current=true;}
      if(requestSeq!==ordersLoadSeq.current)return;
      setOrders((os||[]).map((o:any)=>{
        const all=itemMap.get(o.id)||[]; const visible=visibleItems(all);
        return {id:o.id,table_id:o.table_id,table_name:tableMap.get(o.table_id)||'Стол',staff_name:staffMap.get(o.staff_id)||'Сотрудник',status:o.status,created_at:o.created_at,items:visible}
      }).filter((o:any)=>allowed(itemMap.get(o.id)||[])));
    }catch(e:any){
      if(requestSeq===ordersLoadSeq.current)setToast(e?.message||'Не удалось загрузить заказы');
    }finally{
      if(requestSeq===ordersLoadSeq.current)setOrdersLoading(false);
    }
  }
  async function signIn(){
    setError('');
    if(!login.trim()||!pin.trim())return setError('Введите логин и PIN-код');
    if(!/^[a-zA-Z0-9_.-]{3,30}$/.test(login.trim()))return setError('Логин: 3–30 символов, латиница, цифры, точка, _ или -');
    if(!/^\d{6}$/.test(pin))return setError('PIN-код должен состоять из 6 цифр');
    setBusy(true);
    try{
      const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:login.trim(),pin})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.session)return setError(j.message||'Неверный логин или PIN-код');
      const {error:se}=await sb.auth.setSession({access_token:j.session.access_token,refresh_token:j.session.refresh_token});
      if(se)return setError('Не удалось сохранить сессию');
      const staff=j.staff;
      if(!staff?.active){await sb.auth.signOut();return setError('Профиль сотрудника не найден или отключён.')}
      setProfile({id:staff.id,full_name:staff.full_name,role:staff.role==='bar'?'waiter':staff.role,username:staff.username});
      await sb.from('audit_logs').insert({staff_id:staff.id,action:'Вошёл в систему',entity_type:'auth',details:{method:'username+pin'}})
    }catch{setError('Не удалось выполнить вход')}
    finally{setBusy(false)}
  }
  async function signOut(){if(profile)await logAction('Вышел из системы','auth',null,{});await sb.auth.signOut();setProfile(null);setTables([]);setCart([]);setOrders([])}
  async function openTable(t:RestaurantTable){
    if(t.is_bar){setBarDetail(t);return}
    if(t.status==='busy'){setTableDetail(t);return}
    const raw=window.prompt(`Количество гостей — ${t.name}`,'2');
    const guests=Math.max(1,Number.parseInt(raw||'2',10)||2);
    const {data,error:e}=await sb.from('restaurant_tables').update({status:'busy',guests}).eq('id',t.id).select('id,name,is_vip,is_bar,status,guests,active_order_id,active').single();
    if(e)return setToast(e.message);
    setSelectedTable(data as RestaurantTable);setCart([]);setMenuCategory(null);setView('menu');
    await logAction('Открыл стол','table',t.id,{table:t.name,guests});await loadTables()
  }
  async function openCheck(t:RestaurantTable){
    if(t.status!=='busy')return;
    const {data:os,error:e}=await sb.from('orders').select('id,table_id').eq('table_id',t.id).eq('shift_id',currentShift?.id||-1).not('status','in','(done,cancelled)').order('created_at');
    if(e)return setToast(e.message);
    const ids=(os||[]).map((x:any)=>x.id);
    if(!ids.length){
      setCheck({table_id:t.id,table_name:t.name,guests:t.guests,orders:[],items:[],total:0});
      return;
    }
    const {data:oi,error:ie}=await sb.from('order_items').select('item_name,qty,unit_price,details').in('order_id',ids);
    if(ie)return setToast(ie.message);
    const items=(oi||[]).map((x:any)=>({item_name:x.item_name,qty:x.qty,unit_price:Number(x.unit_price),details:x.details||{}}));
    const total=items.reduce((sum,x)=>sum+x.qty*x.unit_price,0);
    setCheck({table_id:t.id,table_name:t.name,guests:t.guests,orders:ids,items,total});
  }
  function paymentNumbers(){const total=check?.total||0;if(paymentMethod==='cash'){const received=Number(cashReceived)||0;return {cashAmount:total,cardAmount:0,cashReceived:received,change:Math.max(0,received-total),valid:received>=total};}if(paymentMethod==='card')return {cashAmount:0,cardAmount:total,cashReceived:0,change:0,valid:true};const ca=Number(mixedCash)||0,card=Number(mixedCard)||0;return {cashAmount:ca,cardAmount:card,cashReceived:ca,change:0,valid:ca+card===total};}
  function openBarPayment(order:Order){setBarPaymentOrder(order);setPaymentMethod('card');setCashReceived('');setMixedCash('');setMixedCard('')}
  async function closeBarOrder(order:Order){
    if(profile?.role!=='waiter'&&profile?.role!=='admin')return setToast('Оплатить чек может только официант или администратор');
    const total=order.items.reduce((sum,x)=>sum+Number(x.unit_price)*Number(x.qty),0);
    if(!total)return setToast('Нельзя оплатить пустой чек');
    const payment=paymentNumbersForTotal(total);
    if(paymentMethod==='cash'&&!payment.valid){return setToast(`Недостаточно наличных. Нужно ещё ${money(total-(Number(cashReceived)||0))}`)}
    if(paymentMethod==='mixed'&&!payment.valid){return setToast(`Наличные + карта должны быть ровно ${money(total)}`)}
    setCloseSaving(true);
    const {data:receipt,error:re}=await sb.from('cash_register_receipts').insert({table_id:order.table_id,shift_id:currentShiftRef.current?.id||null,order_ids:[order.id],guests:0,total,payment_method:paymentMethod,cash_amount:payment.cashAmount,card_amount:payment.cardAmount,cash_received:payment.cashReceived,change_amount:payment.change,staff_id:profile.id,closed_at:new Date().toISOString()}).select('id').single();
    if(re||!receipt){setCloseSaving(false);return setToast(re?.message||'Не удалось сохранить чек')}
    const now=new Date().toISOString();
    const {error:oe}=await sb.from('orders').update({status:'done',payment_method:paymentMethod,cash_amount:payment.cashAmount,card_amount:payment.cardAmount,cash_received:payment.cashReceived,change_amount:payment.change,closed_at:now,updated_at:now}).eq('id',order.id);
    setCloseSaving(false);
    if(oe)return setToast(oe.message);
    await logAction('Принял оплату на баре','order',order.id,{table:order.table_name,total,payment_method:paymentMethod,receipt_id:receipt.id});
    setPaymentMethod('card');setCashReceived('');setMixedCash('');setMixedCard('');
    setToast(`Бар · заказ #${order.id} оплачен · Чек #${receipt.id}`);await loadOrders(false);await loadTables();if(profile.role==='admin')await loadReceipts(false)
  }
  function paymentNumbersForTotal(total:number){
    if(paymentMethod==='cash'){const received=Number(cashReceived)||0;return {cashAmount:total,cardAmount:0,cashReceived:received,change:Math.max(0,received-total),valid:received>=total};}
    if(paymentMethod==='card')return {cashAmount:0,cardAmount:total,cashReceived:0,change:0,valid:true};
    const ca=Number(mixedCash)||0,cb=Number(mixedCard)||0;return {cashAmount:ca,cardAmount:cb,cashReceived:ca,change:0,valid:Math.abs(ca+cb-total)<0.01};
  }
  async function closeTable(){if(!check)return;if(!currentShift)return setToast('Сначала откройте рабочую смену');setCloseSaving(true);if(check.orders.length===0){const {error:te}=await sb.from('restaurant_tables').update({status:'free',guests:0,active_order_id:null}).eq('id',check.table_id);setCloseSaving(false);if(te)return setToast(te.message);await logAction('Закрыл пустой стол','table',check.table_id,{table:check.table_name,guests:check.guests});setCheck(null);setSelectedTable(null);setPaymentMethod('card');setCashReceived('');setMixedCash('');setMixedCard('');setToast(`Стол ${check.table_name} закрыт без заказа`);await loadTables();await loadOrders(false);return;}const pay=paymentNumbers();if(paymentMethod==='cash'&&!pay.valid){setCloseSaving(false);return setToast(`Недостаточно наличных. Нужно ещё ${money(check.total-(Number(cashReceived)||0))}`)}if(paymentMethod==='mixed'&&!pay.valid){setCloseSaving(false);return setToast(`Наличные + карта должны быть ровно ${money(check.total)}`)}const {data:oi,error:ie}=await sb.from('order_items').select('order_id,item_status').in('order_id',check.orders);if(ie){setCloseSaving(false);return setToast(ie.message)}if((oi||[]).some((x:any)=>x.item_status!=='ready'&&x.item_status!=='done')){setCloseSaving(false);return setToast('Не все позиции готовы. Стол можно закрыть только после готовности заказа.')}const now=new Date().toISOString();const {data:receipt,error:re}=await sb.from('cash_register_receipts').insert({table_id:check.table_id,shift_id:currentShift?.id||null,order_ids:check.orders,guests:check.guests,total:check.total,payment_method:paymentMethod,cash_amount:pay.cashAmount,card_amount:pay.cardAmount,cash_received:pay.cashReceived,change_amount:pay.change,staff_id:profile!.id,closed_at:now}).select('id').single();if(re||!receipt){setCloseSaving(false);return setToast(re?.message||'Не удалось сохранить чек')}const {error:oe}=await sb.from('orders').update({status:'done',payment_method:paymentMethod,cash_amount:pay.cashAmount,card_amount:pay.cardAmount,cash_received:pay.cashReceived,change_amount:pay.change,closed_at:now,updated_at:now}).in('id',check.orders);if(oe){setCloseSaving(false);return setToast(oe.message)}const {error:te}=await sb.from('restaurant_tables').update({status:'free',guests:0,active_order_id:null}).eq('id',check.table_id);setCloseSaving(false);if(te)return setToast(te.message);await logAction('Закрыл стол и принял оплату','table',check.table_id,{table:check.table_name,total:check.total,payment_method:paymentMethod,receipt_id:receipt.id,guests:check.guests});setCheck(null);setSelectedTable(null);setPaymentMethod('card');setCashReceived('');setMixedCash('');setMixedCard('');setToast(`Стол ${check.table_name} закрыт · ${money(check.total)} · Чек #${receipt.id}`);await loadTables();await loadOrders(false);if(profile?.role==='admin')await loadReceipts(false)}
  async function loadReceipts(show=true){if(profile?.role!=='admin')return;if(show)setReceiptsLoading(true);const {data,error:e}=await sb.from('cash_register_receipts').select('id,table_id,guests,total,payment_method,cash_amount,card_amount,cash_received,change_amount,closed_at,staff_id,shift_id,order_ids').order('closed_at',{ascending:false}).limit(200);if(e){setToast(e.message);setReceiptsLoading(false);return}const ids=[...new Set((data||[]).map((x:any)=>x.staff_id).filter(Boolean))];let staffMap=new Map<string,string>();if(ids.length){const {data:st}=await sb.from('staff_profiles').select('id,full_name').in('id',ids);staffMap=new Map((st||[]).map((x:any)=>[x.id,x.full_name]))}const tableMap=new Map(tables.map(t=>[t.id,t.name]));setReceipts((data||[]).map((x:any)=>({...x,total:Number(x.total),cash_amount:Number(x.cash_amount||0),card_amount:Number(x.card_amount||0),cash_received:Number(x.cash_received||0),change_amount:Number(x.change_amount||0),shift_id:x.shift_id==null?null:Number(x.shift_id),order_ids:Array.isArray(x.order_ids)?x.order_ids.map(Number):[],table_name:tableMap.get(x.table_id)||'Стол',staff_name:staffMap.get(x.staff_id)||'Сотрудник'})));setReceiptsLoading(false)}
  async function loadAnalytics(from?:string,to?:string){
    if(profile?.role!=='admin')return;
    const now=new Date();
    const fromDate=from||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const toDate=to||fromDate;
    const startIso=new Date(`${fromDate}T00:00:00`).toISOString();
    const endDate=new Date(`${toDate}T00:00:00`); endDate.setDate(endDate.getDate()+1);
    const endIso=endDate.toISOString();
    const {data:r}=await sb.from('cash_register_receipts').select('total,cash_amount,card_amount,closed_at').gte('closed_at',startIso).lt('closed_at',endIso).order('closed_at',{ascending:false});
    const rows=(r||[]) as any[];
    const total=rows.reduce((a,x)=>a+Number(x.total||0),0),cash=rows.reduce((a,x)=>a+Number(x.cash_amount||0),0),card=rows.reduce((a,x)=>a+Number(x.card_amount||0),0);
    const {data:doneOrders}=await sb.from('orders').select('id,closed_at').eq('status','done').gte('closed_at',startIso).lt('closed_at',endIso).limit(2000);
    const doneIds=(doneOrders||[]).map((x:any)=>x.id);
    const {data:oi}=doneIds.length?await sb.from('order_items').select('item_name,qty,order_id').in('order_id',doneIds):{data:[]};
    const m=new Map<string,number>();for(const x of oi||[])m.set(x.item_name,(m.get(x.item_name)||0)+Number(x.qty||0));
    const top=[...m.entries()].map(([name,qty])=>({name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,10);
    setAnalytics({total,cash,card,checks:rows.length,avg:rows.length?total/rows.length:0,top});
  }
  async function loadAuditLogs(){if(profile?.role!=='admin')return;setAuditLoading(true);const {data,error}=await sb.from('audit_logs').select('id,created_at,staff_id,action,entity_type,entity_id,details').order('created_at',{ascending:false}).limit(300);if(error){setAuditLoading(false);return setToast(error.message)}const ids=[...new Set((data||[]).map((x:any)=>x.staff_id).filter(Boolean))];let names=new Map<string,{name:string;role:string}>();if(ids.length){const {data:st}=await sb.from('staff_profiles').select('id,full_name,role').in('id',ids);names=new Map((st||[]).map((x:any)=>[x.id,{name:x.full_name,role:x.role}]))}setAuditLogs((data||[]).map((x:any)=>({...x,staff_name:names.get(x.staff_id)?.name||'Система',role:names.get(x.staff_id)?.role||'',details:x.details||{}})));setAuditLoading(false)}

  async function loadCurrentShift(){
    const {data,error:e}=await sb.from('cash_register_shifts').select('id,opened_at,closed_at,status,opening_cash,closing_cash,opened_by,closed_by').eq('status','open').order('opened_at',{ascending:false}).limit(1).maybeSingle();
    if(e){currentShiftRef.current=null;setCurrentShift(null);return;}
    if(!data){currentShiftRef.current=null;setCurrentShift(null);return;}
    const ids=[data.opened_by,data.closed_by].filter(Boolean); let names=new Map<string,string>();
    if(ids.length){const {data:st}=await sb.from('staff_profiles').select('id,full_name').in('id',ids);names=new Map((st||[]).map((x:any)=>[x.id,x.full_name]));}
    const next={...data,opening_cash:Number(data.opening_cash||0),closing_cash:data.closing_cash==null?null:Number(data.closing_cash),opened_by_name:names.get(data.opened_by)||'Сотрудник',closed_by_name:data.closed_by?names.get(data.closed_by)||'Сотрудник':undefined};
    currentShiftRef.current=next;
    setCurrentShift(next);
  }
  function addItem(item:MenuItem,details:Record<string,string>={}){setCart(c=>{const key=JSON.stringify(details);const found=c.find(x=>x.menu_item_id===item.id&&JSON.stringify(x.details)===key);return found?c.map(x=>x===found?{...x,qty:x.qty+1}:x):[...c,{menu_item_id:item.id,item_name:item.name,unit_price:Number(item.price),qty:1,details}]})}
  function changeQty(i:number,d:number){setCart(c=>c.map((x,n)=>n===i?{...x,qty:x.qty+d}:x).filter(x=>x.qty>0))}
  async function sendOrder(){
    if(!selectedTable||!cart.length)return;
    const shift=currentShiftRef.current;
    if(!shift)return setToast('Сначала откройте рабочую смену');
    setBusy(true);
    const {data:o,error:e}=await sb.from('orders').insert({table_id:selectedTable.id,staff_id:profile!.id,status:'new',shift_id:shift.id}).select('id').single();
    if(e||!o){setBusy(false);return setToast(e?.message||'Не удалось создать заказ')}
    const rows=cart.map(x=>{
      const item=items.find(i=>i.id===x.menu_item_id);
      const department=item?departmentForCategoryId(item.category_id):'waiter';
      return {order_id:o.id,menu_item_id:x.menu_item_id,item_name:x.item_name,qty:x.qty,unit_price:x.unit_price,details:x.details,department,item_status:'new'};
    });
    const {error:ie}=await sb.from('order_items').insert(rows);
    if(ie){await sb.from('orders').delete().eq('id',o.id);setBusy(false);return setToast(ie.message)}
    const initialStatus='new';
    await sb.from('orders').update({status:initialStatus,updated_at:new Date().toISOString()}).eq('id',o.id);
    let te:any=null;
    if(!selectedTable.is_bar){
      const r=await sb.from('restaurant_tables').update({active_order_id:o.id,status:'busy'}).eq('id',selectedTable.id);
      te=r.error;
    }
    setBusy(false);if(te)return setToast(te.message);
    await logAction('Создал заказ','order',o.id,{table_id:selectedTable.id,table:selectedTable.name,total:rows.reduce((sum:any,x:any)=>sum+Number(x.qty)*Number(x.unit_price),0),items:rows.map((x:any)=>({name:x.item_name,qty:x.qty,department:x.department}))});setCart([]);setToast(profile?.role==='hookah'?'Заказ принят и отправлен в работу':'Заказ отправлен');setView('orders');await loadTables();await loadOrders(false)
  }
  async function editOrderItemQty(order:Order,item:OrderItem,delta:number){
    if(profile?.role!=='waiter'&&profile?.role!=='admin')return setToast('Редактировать заказ может только официант');
    if(item.department!=='waiter')return setToast('Позицию кальянщика нельзя изменить здесь');
    if(item.item_status!=='new')return setToast('Позиция уже взята в работу и больше не редактируется');
    const nextQty=item.qty+delta;
    if(nextQty<=0){
      if(!window.confirm(`Удалить «${item.item_name}» из заказа #${order.id}?`))return;
      const {error:e}=await sb.from('order_items').delete().eq('id',item.id).eq('order_id',order.id);
      if(e)return setToast(e.message);
      await logAction('Удалил позицию из заказа','order',order.id,{table:order.table_name,item:item.item_name,qty:item.qty});
    }else{
      const {error:e}=await sb.from('order_items').update({qty:nextQty}).eq('id',item.id).eq('order_id',order.id);
      if(e)return setToast(e.message);
      await logAction('Изменил количество позиции','order',order.id,{table:order.table_name,item:item.item_name,from:item.qty,to:nextQty});
    }
    // Recalculate the order from the actual DB state. This avoids a stale realtime/loadOrders response
    // bringing a deleted position back into the UI.
    await syncOrderStatus(order.id);
    await loadOrders(false);
    await loadTables();
    setToast(nextQty<=0?`Позиция «${item.item_name}» удалена из заказа #${order.id}`:`Количество «${item.item_name}» изменено: ${nextQty} шт.`);
  }

  async function nextStatus(o:Order){
    if(!profile?.role)return;
    const hasNew=o.items.some(x=>x.item_status==='new');
    const hasWork=o.items.some(x=>x.item_status==='work');
    const next=hasNew?'work':hasWork?'ready':null;
    if(!next)return setToast('Все позиции этого заказа уже готовы');
    const fromStatus=next==='work'?'new':'work';
    const {error:e}=await sb.from('order_items').update({item_status:next}).eq('order_id',o.id).eq('item_status',fromStatus);
    if(e)return setToast(e.message);
    await logAction('Изменил статус позиций','order',o.id,{from:fromStatus,to:next});
    await syncOrderStatus(o.id);
    setToast(next==='work'?'Позиции взяты в работу':'Позиции готовы');
    await loadTables();await loadOrders(false)
  }
  async function syncOrderStatus(orderId:number){
    const {data:all}=await sb.from('order_items').select('item_status').eq('order_id',orderId);
    const list=all||[];
    const allReady=list.length>0&&list.every((x:any)=>x.item_status==='ready'||x.item_status==='done');
    const anyWork=list.some((x:any)=>x.item_status==='work');
    const orderStatus=allReady?'ready':anyWork?'work':'new';
    await sb.from('orders').update({status:orderStatus,updated_at:new Date().toISOString()}).eq('id',orderId);
  }

  if(!profile)return <LoginScreen login={login} pin={pin} setLogin={setLogin} setPin={setPin} showPin={showPin} setShowPin={setShowPin} busy={busy} error={error} onSignIn={signIn}/>;
  if(!currentShift){ return <main className="app-shell"><header className="app-header"><div><div className="brand">ДЫХАНИЕ ДРАКОНА</div><h1>Открытие смены</h1></div><div className="header-actions"><button className="icon-btn" onClick={loadCurrentShift}><RefreshCw size={19}/></button></div></header><section className="app-content shift-gate"><ShiftPage currentShift={null} onReload={loadCurrentShift} toast={setToast} profile={profile} onShiftClosed={signOut} onLog={logAction}/></section>{toast&&<div className="toast">{toast}</div>}</main> }
  const bar=tables.filter(t=>t.is_bar),normal=tables.filter(t=>!t.is_vip&&!t.is_bar),vip=tables.filter(t=>t.is_vip&&!t.is_bar),shown=filter==='normal'?normal:filter==='vip'?vip:normal;
  return <main className="app-shell"><header className="app-header"><div><div className="brand">ДЫХАНИЕ ДРАКОНА</div><h1>{viewTitle(view)}</h1></div><div className="header-actions"><button className={`icon-btn notification-btn ${notificationsOn?'enabled':''}`} title={notificationsOn?'Уведомления включены':'Включить уведомления'} onClick={enableNotifications}><Bell size={18}/>{notificationsOn&&<span className="notification-dot"/>}</button><button className="icon-btn" onClick={()=>view==='orders'?loadOrders(true):loadTables()}><RefreshCw size={19} className={loading||ordersLoading?'spin':''}/></button></div></header>
  <section className="app-content">
  {view==='tables'&&<><div className="filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Все {tables.length}</button><button className={filter==='normal'?'active':''} onClick={()=>setFilter('normal')}>Обычные {normal.length}</button><button className={filter==='vip'?'active':''} onClick={()=>setFilter('vip')}>VIP {vip.length}</button></div>{tableError&&<div className="error-box">{tableError}<button onClick={loadTables}>Повторить</button></div>}{loading&&!tables.length?<div className="loading-card"><Loader2 className="spin"/> Загружаем столы...</div>:<>{filter==='all'&&bar.length>0&&<BarGroup tables={bar} summary={tableSummary} onOpen={openTable} onAdd={t=>{setSelectedTable(t);setCart([]);setMenuCategory(null);setBarDetail(null);setView('menu')}}/>} {(filter==='all'||filter==='normal')&&<TableGroup title="Обычные столы" tables={filter==='all'?normal:shown} summary={tableSummary} onOpen={openTable} onAdd={t=>{setSelectedTable(t);setCart([]);setMenuCategory(null);setView('menu')}} onClose={openCheck} canClose={profile.role==='waiter'||profile.role==='admin'}/>} {(filter==='all'||filter==='vip')&&<TableGroup title="VIP столы" tables={filter==='all'?vip:shown} summary={tableSummary} onOpen={openTable} onAdd={t=>{setSelectedTable(t);setCart([]);setMenuCategory(null);setView('menu')}} onClose={openCheck} canClose={profile.role==='waiter'||profile.role==='admin'} vip/>}</>}</>}
  {view==='orders'&&<OrdersView orders={orders} loading={ordersLoading} onStatus={nextStatus} role={profile.role} filter={orderFilter} setFilter={setOrderFilter}/>} 
  {view==='menu'&&<MenuView categories={categories} items={items} category={menuCategory} setCategory={setMenuCategory} cart={cart} addItem={addItem} changeQty={changeQty} selectedTable={selectedTable} onSend={sendOrder} busy={busy}/>} 
  {view==='shift'&&<ShiftPage currentShift={currentShift} onReload={loadCurrentShift} toast={setToast} profile={profile} onShiftClosed={signOut} onLog={logAction}/>}
  {view==='profile'&&<ProfileCard profile={profile} onSignOut={signOut} isAdmin={profile.role==='admin'} onAdmin={()=>setAdminOpen(true)}/>} {adminOpen&&profile.role==='admin'&&<AdminMenu categories={categories} items={items} onReload={loadMenu} onClose={()=>setAdminOpen(false)} toast={setToast} receipts={receipts} receiptsLoading={receiptsLoading} onReloadReceipts={()=>loadReceipts(true)} analytics={analytics} onReloadAnalytics={loadAnalytics} currentShift={currentShift} onReloadShift={loadCurrentShift} onAuditReload={loadAuditLogs} onLog={logAction} auditLogs={auditLogs} auditLoading={auditLoading}/>}</section>
  {barPaymentOrder&&<CheckModal check={{table_id:barPaymentOrder.table_id,table_name:barPaymentOrder.table_name,guests:0,orders:[barPaymentOrder.id],items:barPaymentOrder.items.map(x=>({item_name:x.item_name,qty:x.qty,unit_price:Number(x.unit_price),details:x.details||{}})),total:barPaymentOrder.items.reduce((sum,x)=>sum+Number(x.unit_price)*Number(x.qty),0)}} paymentMethod={paymentMethod} setPaymentMethod={m=>{setPaymentMethod(m);setCashReceived('');setMixedCash('');setMixedCard('')}} cashReceived={cashReceived} setCashReceived={setCashReceived} mixedCash={mixedCash} setMixedCash={setMixedCash} mixedCard={mixedCard} setMixedCard={setMixedCard} onClose={()=>setBarPaymentOrder(null)} onConfirm={()=>{const o=barPaymentOrder;setBarPaymentOrder(null);closeBarOrder(o)}} saving={closeSaving}/>}   {barDetail&&<BarDetailModal table={barDetail} orders={orders.filter(o=>o.table_id===barDetail.id&&o.status!=='done'&&o.status!=='cancelled')} canPay={profile.role==='waiter'||profile.role==='admin'} onNew={()=>{setSelectedTable(barDetail);setCart([]);setMenuCategory(null);setBarDetail(null);setView('menu')}} onPay={order=>{setBarDetail(null);openBarPayment(order)}} onDismiss={()=>setBarDetail(null)}/>}  {tableDetail&&<TableDetailModal table={tableDetail} summary={tableSummary[tableDetail.id]||{total:0,newCount:0,workCount:0,readyCount:0,orders:0}} orders={orders.filter(o=>o.table_id===tableDetail.id && o.status!=='done' && o.status!=='cancelled')} canClose={profile.role==='waiter'||profile.role==='admin'} canEdit={profile.role==='waiter'||profile.role==='admin'} onEditItem={editOrderItemQty} onAdd={()=>{setSelectedTable(tableDetail);setCart([]);setMenuCategory(null);setTableDetail(null);setView('menu')}} onClose={()=>{setTableDetail(null);openCheck(tableDetail)}} onDismiss={()=>setTableDetail(null)}/>} {check&&<CheckModal check={check} paymentMethod={paymentMethod} setPaymentMethod={m=>{setPaymentMethod(m);setCashReceived('');setMixedCash('');setMixedCard('')}} cashReceived={cashReceived} setCashReceived={setCashReceived} mixedCash={mixedCash} setMixedCash={setMixedCash} mixedCard={mixedCard} setMixedCard={setMixedCard} onClose={()=>setCheck(null)} onConfirm={closeTable} saving={closeSaving}/>} 
  <nav className="bottom-nav"><NavButton active={view==='tables'} icon={<LayoutGrid size={19}/>} text="Столы" onClick={()=>setView('tables')}/><NavButton active={view==='orders'} icon={<ClipboardList size={19}/>} text="Заказы" onClick={()=>{setView('orders');loadOrders(true)}}/><NavButton active={view==='shift'} icon={<LockKeyholeOpen size={19}/>} text="Смена" onClick={()=>{setView('shift');loadCurrentShift()}}/><NavButton active={view==='profile'} icon={<UserRound size={19}/>} text="Профиль" onClick={()=>setView('profile')}/></nav>{toast&&<div className="toast">{toast}</div>}</main>
}

function LoginScreen({login,pin,setLogin,setPin,showPin,setShowPin,busy,error,onSignIn}:any){return <main className="login-page reference-login"><div className="login-smoke smoke-a"/><div className="login-smoke smoke-b"/><div className="login-fire login-fire-left"/><div className="login-fire login-fire-right"/><div className="login-fire login-fire-bottom"/><div className="login-embers"><i/><i/><i/><i/><i/><i/><i/><i/></div><section className="login-content reference-login-content"><div className="reference-logo"><img className="reference-dragon-svg" src="/dragon-logo.svg" alt="Дракон"/><div className="reference-brand">ДЫХАНИЕ<br/>ДРАКОНА</div><div className="reference-subtitle">LOUNGE &amp; HOOKAH</div></div><div className="reference-system">ОФИЦИАНТСКАЯ СИСТЕМА</div><div className="login-panel reference-login-panel"><div className="reference-input"><UserRound size={18}/><input value={login} onChange={(e:any)=>setLogin(e.target.value)} placeholder="Логин" autoComplete="username" inputMode="text"/></div><div className="pin-wrap reference-input"><LockKeyhole size={18}/><input value={pin} onChange={(e:any)=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="PIN-код" type={showPin?'text':'password'} inputMode="numeric" autoComplete="current-password" maxLength={6}/><button type="button" onClick={()=>setShowPin(!showPin)}>{showPin?<EyeOff size={20}/>:<Eye size={20}/>}</button></div>{error&&<div className="error-box">{error}</div>}<button className="orange-btn reference-login-btn" onClick={onSignIn} disabled={busy}>{busy?<Loader2 className="spin"/>:<LogIn size={18}/>} {busy?'ВХОДИМ...':'ВОЙТИ'}</button><button className="forgot" onClick={()=>alert('Обратитесь к администратору заведения.')}>Забыли PIN-код?</button></div><img className="reference-bottom-dragon" src="/dragon-logo.svg" alt="" aria-hidden="true"/></section></main>}
function BarGroup({tables,summary,onOpen,onAdd}:{tables:RestaurantTable[],summary:Record<number,{total:number;newCount:number;workCount:number;readyCount:number;orders:number}>,onOpen:(t:RestaurantTable)=>void,onAdd:(t:RestaurantTable)=>void}){return <section className="table-section bar-section"><div className="section-title"><b>Барная стойка</b><span>ОТДЕЛЬНЫЕ ЧЕКИ</span></div><div className="bar-grid">{tables.map(t=>{const s=summary[t.id]||{total:0,newCount:0,workCount:0,readyCount:0,orders:0};return <div key={t.id} className={`bar-work-card ${s.orders ? 'busy' : 'free'}`} onClick={()=>onOpen(t)}><div className="bar-card-top"><div className="bar-icon">🍸</div><div><div className="bar-card-kicker">БАРНАЯ СТОЙКА</div><div className="bar-card-title">{t.name}</div></div><div className={`bar-live ${s.orders ? 'busy' : 'free'}`}><span className={`dot ${s.orders ? 'orange' : 'green'}`}/><span>{s.orders ? 'Есть открытые чеки' : ''}</span></div></div><div className="bar-card-meta"><span>{s.orders?`${s.orders} ${plural(s.orders,'открытый чек','открытых чека','открытых чеков')}`:'Нет открытых чеков'}</span></div><div className="bar-card-total"><small>ОТКРЫТЫЕ ЧЕКИ</small><strong>{money(s.total)}</strong><span>{s.orders?'Текущая сумма по бару':'Можно создать новый чек'}</span></div><div className="bar-card-progress"><span className={s.newCount?'has-new':''}>Новых {s.newCount}</span><span>В работе {s.workCount}</span><span>Готово {s.readyCount}</span></div><div className="bar-card-actions"><button className="bar-add-btn" onClick={e=>{e.stopPropagation();onAdd(t)}}><Plus size={15}/> Новый чек</button></div></div>})}</div></section>} 

function TableGroup({title,tables,summary,onOpen,onAdd,onClose,canClose,vip=false}:{title:string,tables:RestaurantTable[],summary:Record<number,{total:number;newCount:number;workCount:number;readyCount:number;orders:number}>,onOpen:(t:RestaurantTable)=>void,onAdd:(t:RestaurantTable)=>void,onClose:(t:RestaurantTable)=>void,canClose:boolean,vip?:boolean}){return <section className="table-section"><div className="section-title"><b>{title}</b><span>{tables.length}</span></div><div className="table-grid">{tables.map(t=>{const s=summary[t.id]||{total:0,newCount:0,workCount:0,readyCount:0,orders:0};return <div key={t.id} className={`table-card ${t.status} ${vip?'vip':''}`} onClick={()=>onOpen(t)}><div className="table-name">{t.name}</div><div className="table-status"><span className={`dot ${t.status==='free'?'green':'orange'}`}/>{t.status==='free'?'Свободен':`${t.guests} ${plural(t.guests,'гость','гостя','гостей')}`}</div>{t.status==='busy'&&<><div className="table-money">{money(s.total)}</div><div className="table-progress"><span className={s.newCount?'has-new':''}>Новых {s.newCount}</span><span>В работе {s.workCount}</span><span>Готово {s.readyCount}</span></div><div className="table-actions"><button className="add-order-btn" onClick={e=>{e.stopPropagation();onAdd(t)}}><Plus size={15}/> Заказ</button>{canClose&&<button className="close-table-btn" onClick={e=>{e.stopPropagation();onClose(t)}}><ReceiptText size={15}/> Закрыть</button>}</div></>}</div>})}</div></section>}
function BarDetailModal({table,orders,canPay,onNew,onPay,onDismiss}:{table:RestaurantTable;orders:Order[];canPay:boolean;onNew:()=>void;onPay:(o:Order)=>void;onDismiss:()=>void}){const total=orders.reduce((sum,o)=>sum+o.items.reduce((s,x)=>s+Number(x.unit_price)*Number(x.qty),0),0);return <div className="modal-backdrop"><div className="table-detail-modal bar-detail-modal"><div className="modal-head"><div><div className="brand">БАРНАЯ СТОЙКА</div><h2>{table.name}</h2><span className="muted">{orders.length} {plural(orders.length,'открытый чек','открытых чека','открытых чеков')} · {money(total)}</span></div><button className="icon-btn" onClick={onDismiss}><X/></button></div><div className="bar-check-list">{orders.length?orders.map(o=>{const sum=o.items.reduce((s,x)=>s+Number(x.unit_price)*Number(x.qty),0);return <div className="bar-check-card" key={o.id}><div className="row"><div><b>Чек / Заказ #{o.id}</b><small>{new Date(o.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} · {o.staff_name}</small></div><strong>{money(sum)}</strong></div><div className="bar-check-items">{o.items.map((x,i)=><div key={i}><span>{x.qty}× {x.item_name}</span><span>{money(Number(x.unit_price)*x.qty)}</span></div>)}</div><div className="bar-check-footer"><span className="muted">{statusName(o.status)}</span>{canPay&&<button className="orange-small" onClick={()=>onPay(o)}><ReceiptText size={15}/> Оплатить</button>}</div></div>}) : <div className="placeholder compact"><div>🧾</div><p>Открытых чеков пока нет.</p></div>}</div><div className="detail-actions"><button className="orange-btn" onClick={onNew}><Plus size={18}/> НОВЫЙ ЧЕК</button><button className="secondary-btn" onClick={onDismiss}>ЗАКРЫТЬ</button></div></div></div>}
function TableDetailModal({table,summary,orders,canClose,canEdit,onEditItem,onAdd,onClose,onDismiss}:{table:RestaurantTable,summary:{total:number;newCount:number;workCount:number;readyCount:number;orders:number},orders:Order[],canClose:boolean,canEdit:boolean,onEditItem:(o:Order,i:OrderItem,d:number)=>Promise<void>,onAdd:()=>void,onClose:()=>void,onDismiss:()=>void}){
  const [editingOrder,setEditingOrder]=useState<number|null>(null);
  const currentEdit=orders.find(o=>o.id===editingOrder)||null;
  if(currentEdit)return <OrderEditModal order={currentEdit} canEdit={canEdit} onChange={onEditItem} onBack={()=>setEditingOrder(null)}/>;
  return <div className="modal-backdrop"><div className="table-detail-modal"><div className="modal-head"><div><div className="brand">{table.is_bar?'БАР':'СТОЛ'}</div><h2>{table.name}</h2><span className="muted">{table.guests} {plural(table.guests,'гость','гостя','гостей')} · {summary.orders} {plural(summary.orders,'заказ','заказа','заказов')}</span></div><button className="icon-btn" onClick={onDismiss}><X/></button></div><div className="detail-summary"><div><small>Текущий счёт</small><b>{money(summary.total)}</b></div><div><small>Новые</small><b>{summary.newCount}</b></div><div><small>В работе</small><b>{summary.workCount}</b></div><div><small>Готово</small><b>{summary.readyCount}</b></div></div><div className="table-order-history">{orders.length?orders.map(o=><div className="table-order" key={o.id}><div className="row"><div><b>Заказ #{o.id}</b><small>{new Date(o.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>{canEdit&&o.items.some(x=>x.department==='waiter'&&x.item_status==='new')&&<button className="mini-btn" onClick={()=>setEditingOrder(o.id)} title="Редактировать заказ"><Pencil size={16}/></button>}</div>{o.items.map((x,i)=><div className="table-order-line" key={i}><span>{x.qty}× {x.item_name}</span><span>{itemStatusName(x.item_status)}</span></div>)}</div>):<div className="placeholder compact"><div>🧾</div><p>Открытые заказы ещё не загружены.</p></div>}</div><div className="detail-actions"><button className="orange-btn" onClick={onAdd}><Plus size={18}/> ДОБАВИТЬ ЗАКАЗ</button>{canClose&&<button className="secondary-btn" onClick={onClose}><ReceiptText size={18}/> ЗАКРЫТЬ СТОЛ</button>}</div></div></div>
}

function OrderEditModal({order,canEdit,onChange,onBack}:{order:Order,canEdit:boolean,onChange:(o:Order,i:OrderItem,d:number)=>Promise<void>,onBack:()=>void}){
  const editable=order.items.filter(x=>x.department==='waiter');
  return <div className="modal-backdrop"><div className="table-detail-modal order-edit-modal"><div className="modal-head"><div><button className="back-btn small-back" onClick={onBack}><ArrowLeft size={17}/> Назад</button><div className="brand">РЕДАКТИРОВАНИЕ</div><h2>Заказ #{order.id}</h2><span className="muted">{order.table_name}</span></div><button className="icon-btn" onClick={onBack}><X/></button></div><div className="edit-hint">Можно изменить только позиции официанта, которые ещё не взяты в работу.</div><div className="edit-order-items">{order.items.map((x,i)=>{const locked=!canEdit||x.department!=='waiter'||x.item_status!=='new';return <div className={`edit-order-line ${locked?'locked':''}`} key={x.id||i}><div><b>{x.item_name}</b><small>{x.department==='hookah'?'Кальянщик':itemStatusName(x.item_status)}{Object.values(x.details||{}).filter(Boolean).length?` · ${Object.values(x.details||{}).filter(Boolean).join(' · ')}`:''}</small></div><div className="qty">{locked?<b>{x.qty}</b>:<><button onClick={()=>onChange(order,x,-1)}><Minus size={15}/></button><b>{x.qty}</b><button onClick={()=>onChange(order,x,1)}><Plus size={15}/></button></>}</div></div>})}</div>{editable.some(x=>x.item_status==='new')&&<p className="admin-hint">Если убрать количество до нуля, позиция будет удалена из заказа.</p>}<button className="secondary-btn" onClick={onBack}>ГОТОВО</button></div></div>
}


function AdminStats({analytics,onReload}:{analytics:Analytics,onReload:(from:string,to:string)=>Promise<void>}){
  const now=new Date(); const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const [from,setFrom]=useState(today),[to,setTo]=useState(today),[loading,setLoading]=useState(false);
  async function apply(){if(from>to)return;setLoading(true);await onReload(from,to);setLoading(false)}
  return <div className="stats-panel"><div className="period-picker"><div><small>С</small><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><small>По</small><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div><button className="mini-btn" onClick={apply} disabled={loading}>{loading?<Loader2 className="spin"/>:<CalendarDays size={15}/>} Применить</button></div><div className="stats-period">Период: {new Date(`${from}T00:00:00`).toLocaleDateString('ru-RU')} — {new Date(`${to}T00:00:00`).toLocaleDateString('ru-RU')}</div><div className="stats-grid"><div><small>Выручка</small><b>{money(analytics.total)}</b></div><div><small>Чеков</small><b>{analytics.checks}</b></div><div><small>Средний чек</small><b>{money(analytics.avg)}</b></div><div><small>Наличные</small><b>{money(analytics.cash)}</b></div><div><small>Карта</small><b>{money(analytics.card)}</b></div></div><div className="admin-form"><b>Самые продаваемые позиции</b>{analytics.top.map((x,i)=><div className="stat-line" key={x.name}><span>{i+1}. {x.name}</span><strong>{x.qty} шт.</strong></div>)}{!analytics.top.length&&<p className="muted">Продаж за выбранный период нет.</p>}</div></div>}

function ShiftPage({currentShift,onReload,toast,profile,onShiftClosed,onLog}:{currentShift:Shift|null,onReload:()=>Promise<void>,toast:(s:string)=>void,profile:Profile,onShiftClosed:()=>Promise<void>,onLog:(action:string,entityType:string,entityId?:string|number|null,details?:Record<string,any>)=>Promise<void>}){
  const [opening,setOpening]=useState('0'),[closing,setClosing]=useState(''),[saving,setSaving]=useState(false),[summary,setSummary]=useState({total:0,cash:0,card:0,checks:0});
  const sb=useMemo(()=>supabaseBrowser(),[]);
  async function loadSummary(){if(!currentShift)return;const {data}=await sb.from('cash_register_receipts').select('total,cash_amount,card_amount').eq('shift_id',currentShift.id);const rows=data||[];setSummary({total:rows.reduce((s:any,x:any)=>s+Number(x.total||0),0),cash:rows.reduce((s:any,x:any)=>s+Number(x.cash_amount||0),0),card:rows.reduce((s:any,x:any)=>s+Number(x.card_amount||0),0),checks:rows.length})}
  useEffect(()=>{loadSummary()},[currentShift?.id]);
  async function openShift(){const value=Number(opening)||0;if(value<0)return toast('Начальная касса не может быть отрицательной');setSaving(true);const {data:{user}}=await sb.auth.getUser();if(!user){setSaving(false);return toast('Сессия истекла')}const {data:existing}=await sb.from('cash_register_shifts').select('id').eq('status','open').limit(1);if(existing?.length){setSaving(false);await onReload();return toast('Смена уже открыта')}const {error}=await sb.from('cash_register_shifts').insert({opened_by:user.id,opening_cash:value,status:'open'});setSaving(false);if(error)return toast(error.message);await onLog('Открыл смену','shift',undefined,{opening_cash:value});toast('Смена открыта');setOpening('0');await onReload()}
  async function closeShift(){if(!currentShift)return;setSaving(true);const {data:busyTables}=await sb.from('restaurant_tables').select('id').eq('status','busy').limit(1);if(busyTables?.length){setSaving(false);return toast('Нельзя закрыть смену: есть занятые столы')}const value=closing===''?summary.cash+currentShift.opening_cash:Number(closing);if(value<0){setSaving(false);return toast('Конечная касса не может быть отрицательной')}const {data:{user}}=await sb.auth.getUser();const {error}=await sb.from('cash_register_shifts').update({status:'closed',closed_at:new Date().toISOString(),closed_by:user?.id||null,closing_cash:value}).eq('id',currentShift.id).eq('status','open');setSaving(false);if(error)return toast(error.message);await onLog('Закрыл смену','shift',currentShift.id,{closing_cash:value,revenue:summary.total,checks:summary.checks});toast('Смена закрыта');setClosing('');await onReload();await onShiftClosed()}
  return <div className="shift-panel">{currentShift?<><div className="shift-status open"><span className="dot green"/> Смена открыта</div><div className="shift-card"><div><small>Открыта</small><b>{new Date(currentShift.opened_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b></div><div><small>Открыл</small><b>{currentShift.opened_by_name}</b></div><div><small>Начальная касса</small><b>{money(currentShift.opening_cash)}</b></div></div><div className="stats-grid"><div><small>Выручка смены</small><b>{money(summary.total)}</b></div><div><small>Наличные</small><b>{money(summary.cash)}</b></div><div><small>Карта</small><b>{money(summary.card)}</b></div><div><small>Чеков</small><b>{summary.checks}</b></div></div><div className="admin-form"><b>Закрытие смены</b><label className="payment-fields"><span>Фактическая сумма наличных в кассе</span><input type="number" min="0" step="1" inputMode="decimal" value={closing} onChange={e=>setClosing(e.target.value)} placeholder={String(Math.round(summary.cash+currentShift.opening_cash))}/></label><p className="admin-hint">Если оставить поле пустым, система использует начальную кассу + наличные продажи.</p><button className="orange-btn" onClick={closeShift} disabled={saving}><LockKeyhole size={18}/> ЗАКРЫТЬ СМЕНУ</button></div></>:<div className="shift-empty"><div className="shift-status closed"><span className="dot orange"/> Смена не открыта</div><h3>Новая рабочая смена</h3><p>Откройте смену перед началом работы. Все новые чеки будут привязаны к ней.</p><div className="admin-form"><b>Открытие смены</b><label className="payment-fields"><span>Начальная сумма в кассе</span><input type="number" min="0" step="1" inputMode="decimal" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button className="orange-btn" onClick={openShift} disabled={saving}><LockKeyholeOpen size={18}/> ОТКРЫТЬ СМЕНУ</button></div></div>} </div>}

function CheckModal({check,paymentMethod,setPaymentMethod,cashReceived,setCashReceived,mixedCash,setMixedCash,mixedCard,setMixedCard,onClose,onConfirm,saving}:{check:Check,paymentMethod:'cash'|'card'|'mixed',setPaymentMethod:(x:'cash'|'card'|'mixed')=>void,cashReceived:string,setCashReceived:(x:string)=>void,mixedCash:string,setMixedCash:(x:string)=>void,mixedCard:string,setMixedCard:(x:string)=>void,onClose:()=>void,onConfirm:()=>void,saving:boolean}){const total=check.total,received=Number(cashReceived)||0,change=Math.max(0,received-total),mc=Number(mixedCash)||0,mcard=Number(mixedCard)||0,mixedValid=mc+mcard===total;return <div className="modal-backdrop"><div className="check-modal"><div className="modal-head"><div><div className="brand">{check.guests===0?'ЧЕК БАРА':'ОБЩИЙ ЧЕК'}</div><h2>{check.table_name}</h2><span className="muted">{check.guests===0?`Заказ #${check.orders[0]}`:`${check.guests} ${plural(check.guests,'гость','гостя','гостей')} · ${check.orders.length} ${plural(check.orders.length,'заказ','заказа','заказов')}`}</span></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="check-items">{check.items.map((x,i)=><div className="check-line" key={i}><div><b>{x.item_name}</b>{Object.keys(x.details).length>0&&<small>{Object.values(x.details).join(' · ')}</small>}</div><span>{x.qty} × {money(x.unit_price)}<strong>{money(x.qty*x.unit_price)}</strong></span></div>)}</div><div className="check-total"><span>ИТОГО</span><strong>{money(total)}</strong></div>{total>0&&<><div className="payment-title">Способ оплаты</div><div className="payment-row"><button className={paymentMethod==='cash'?'selected':''} onClick={()=>setPaymentMethod('cash')}><Banknote size={18}/> Наличные</button><button className={paymentMethod==='card'?'selected':''} onClick={()=>setPaymentMethod('card')}><CreditCard size={18}/> Карта</button><button className={paymentMethod==='mixed'?'selected':''} onClick={()=>setPaymentMethod('mixed')}><ReceiptText size={18}/> Смешанная</button></div></>}{total>0&&paymentMethod==='cash'&&<div className="payment-fields"><label>Дали наличными<input type="number" min="0" step="1" inputMode="decimal" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} placeholder="Например: 7000"/></label><div className={received>=total?'payment-result':'payment-result warning'}><span>{received>=total?'Сдача':'Не хватает'}</span><b>{received>=total?money(change):money(total-received)}</b></div></div>}{total>0&&paymentMethod==='mixed'&&<div className="payment-fields"><div className="mixed-grid"><label>Наличными<input type="number" min="0" step="1" inputMode="decimal" value={mixedCash} onChange={e=>setMixedCash(e.target.value)} placeholder="0"/></label><label>Картой<input type="number" min="0" step="1" inputMode="decimal" value={mixedCard} onChange={e=>setMixedCard(e.target.value)} placeholder="0"/></label></div><div className={mixedValid?'payment-result':'payment-result warning'}><span>{mixedValid?'Оплата совпадает':'Нужно распределить'}</span><b>{mixedValid?money(total):money(Math.abs(total-(mc+mcard)))}</b></div></div>}{total>0&&paymentMethod==='card'&&<div className="payment-result"><span>К оплате картой</span><b>{money(total)}</b></div>}<button className="orange-btn" onClick={onConfirm} disabled={saving||(paymentMethod==='cash'&&received<total)||(paymentMethod==='mixed'&&!mixedValid)}>{saving?<Loader2 className="spin"/>:<CheckCircle2 size={18}/>} {saving?'ЗАКРЫВАЕМ...':total===0?'ЗАКРЫТЬ ПУСТОЙ СТОЛ':check.guests===0?'ОПЛАТА ПОЛУЧЕНА · ЗАКРЫТЬ ЧЕК':'ОПЛАТА ПОЛУЧЕНА · ЗАКРЫТЬ СТОЛ'}</button></div></div>}

function MenuView({categories,items,category,setCategory,cart,addItem,changeQty,selectedTable,onSend,busy}:{categories:Category[],items:MenuItem[],category:number|null,setCategory:(n:number|null)=>void,cart:CartItem[],addItem:(i:MenuItem,d?:Record<string,string>)=>void,changeQty:(i:number,d:number)=>void,selectedTable:RestaurantTable|null,onSend:()=>void,busy:boolean}){
  const [strength,setStrength]=useState('Средний'),[picked,setPicked]=useState<MenuItem|null>(null),[hookahComment,setHookahComment]=useState(''),[itemNote,setItemNote]=useState(''),[pickedSize,setPickedSize]=useState<'small'|'large'>('small'),[search,setSearch]=useState('');
  const total=cart.reduce((s,x)=>s+x.unit_price*x.qty,0);
  const pickedCategory=picked?categories.find(c=>c.id===picked.category_id):null;
  const isHookah=picked?categoryIsHookah(categories,picked.category_id):false;
  const isHookahBase=isHookah && pickedCategory?.name!=='Дополнительно';
  const sizeLabel=pickedCategory?.name==='Чай'?'Чайник':'Размер';
  const price=picked?(picked.large_price!=null&&pickedSize==='large'?Number(picked.large_price):Number(picked.price)):0;
  function openItem(i:MenuItem){setPicked(i);setPickedSize('small');setStrength('Средний');setHookahComment('');setItemNote('')}
  if(picked)return <div><button className="back-btn" onClick={()=>setPicked(null)}><ArrowLeft size={17}/> Назад</button><div className="menu-detail"><div className="detail-icon">{icons[categoryName(categories,topCategoryId(categories,picked.category_id))]||'🍽️'}</div><h2>{picked.name}</h2><div className="price-big">{money(price)}</div>{picked.description&&<p className="muted">{picked.description}</p>}{picked.large_price!=null&&<div className="option-block"><b>{sizeLabel}</b><div className="choice-row"><button className={pickedSize==='small'?'selected':''} onClick={()=>setPickedSize('small')}>Маленький · {money(picked.price)}</button><button className={pickedSize==='large'?'selected':''} onClick={()=>setPickedSize('large')}>Большой · {money(picked.large_price)}</button></div></div>}{isHookahBase&&<div className="option-block"><b>Крепость</b><div className="choice-row">{['Лёгкий','Средний','Крепкий'].map(x=><button className={strength===x?'selected':''} onClick={()=>setStrength(x)} key={x}>{x}</button>)}</div></div>}<label className="detail-note"><span>{isHookah?'Комментарий':'Комментарий к позиции'}</span><textarea value={isHookah?hookahComment:itemNote} onChange={e=>isHookah?setHookahComment(e.target.value):setItemNote(e.target.value)} placeholder={isHookah?'Например: Blackburn Berry Lemonade + Cherry, без холодка':'Комментарий к позиции'} rows={3}/></label><button className="orange-btn" onClick={()=>{const details:Record<string,string>={};if(picked.large_price!=null)details.size=pickedSize==='large'?'Большой':'Маленький';if(isHookahBase)details.strength=strength;if(isHookah)details.comment=hookahComment;else if(itemNote)details.comment=itemNote;addItem(picked,{...details});setPicked(null)}}>ДОБАВИТЬ В ЗАКАЗ · {money(price)}</button></div></div>;
  const current=category?categories.find(c=>c.id===category):null;
  const children=current?categories.filter(c=>c.parent_id===current.id&&c.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)):[];
  const directItems=category?items.filter(i=>i.category_id===category&&i.active):[];
  const topCategories=categories.filter(c=>c.active&&c.parent_id===null).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const countItems=(catId:number)=>{const ids=new Set<number>([catId]);let changed=true;while(changed){changed=false;for(const c of categories)if(c.parent_id!=null&&ids.has(c.parent_id)&&!ids.has(c.id)){ids.add(c.id);changed=true}}return items.filter(i=>ids.has(i.category_id)&&i.active).length};
  const searchItems=search.trim()?items.filter(i=>i.active&&(`${i.name} ${i.description||''}`).toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU'))):[];
  return <div>{selectedTable&&<div className="selected-table-card"><div><div className="brand">ТЕКУЩИЙ СТОЛ</div><b>{selectedTable.name}</b><span className="muted"> · {selectedTable.guests} {plural(selectedTable.guests,'гость','гостя','гостей')}</span></div><button className="back-btn small-back" onClick={()=>setCategory(null)}>Меню</button></div>}<div className="menu-search"><span>⌕</span><input value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value)setCategory(null)}} placeholder="Поиск по позициям..."/><button type="button" onClick={()=>setSearch('')} aria-label="Очистить">{search?'×':''}</button></div>{search.trim()?<div className="items-list search-results">{searchItems.map(i=><button className="menu-item" key={i.id} onClick={()=>openItem(i)}><div className="item-icon">{icons[categoryName(categories,topCategoryId(categories,i.category_id))]||'🍽️'}</div><div className="item-main"><b>{i.name}</b><small>{categoryName(categories,i.category_id)}</small></div><strong>{i.large_price!=null?`${money(i.price)} / ${money(i.large_price)}`:money(i.price)}</strong><ChevronRight size={17}/></button>)}{!searchItems.length&&<div className="placeholder compact"><div>🔎</div><p>Ничего не найдено.</p></div>}</div>:null}{!search.trim()&&!category?<><div className="menu-category-list">{topCategories.map(c=><button key={c.id} className="menu-category" onClick={()=>setCategory(c.id)}><span><span className="category-icon">{c.icon||icons[c.name]||'🍽️'}</span><b>{c.name}</b><small>{countItems(c.id)} поз.</small></span><ChevronRight/></button>)}</div>{!topCategories.length&&<div className="placeholder"><div>🍽️</div><h2>Меню пока пустое</h2><p>Добавьте категории и позиции в Supabase.</p></div>}</>:!search.trim()?<><button className="back-btn" onClick={()=>setCategory(current?.parent_id??null)}><ArrowLeft size={17}/> {current?.parent_id?'Назад':'Все категории'}</button>{children.length>0?<div className="menu-category-list">{children.map(c=><button key={c.id} className="menu-category" onClick={()=>setCategory(c.id)}><span><span className="category-icon">{c.icon||'🍽️'}</span><b>{c.name}</b><small>{countItems(c.id)} поз.</small></span><ChevronRight/></button>)}</div>:null}{directItems.length>0&&<div className="items-list">{directItems.map(i=><button className="menu-item" key={i.id} onClick={()=>openItem(i)}><div className="item-icon">{icons[categoryName(categories,topCategoryId(categories,i.category_id))]||'🍽️'}</div><div className="item-main"><b>{i.name}</b><small>{i.description||'Добавить в заказ'}</small></div><strong>{i.large_price!=null?`${money(i.price)} / ${money(i.large_price)}`:money(i.price)}</strong><ChevronRight size={17}/></button>)}</div>}{!children.length&&!directItems.length&&<div className="placeholder compact"><div>🍽️</div><p>В этой категории пока нет позиций.</p></div>}</>:null}{cart.length>0&&<div className="cart-card"><div className="row"><b>Текущий заказ</b><strong>{money(total)}</strong></div>{cart.map((x,i)=><div className="cart-line" key={i}><div><b>{x.item_name}</b><small>{Object.values(x.details).filter(Boolean).join(' · ')}</small></div><div className="qty"><button onClick={()=>changeQty(i,-1)}><Minus size={15}/></button><b>{x.qty}</b><button onClick={()=>changeQty(i,1)}><Plus size={15}/></button></div></div>)}<button className="orange-btn" onClick={onSend} disabled={busy}><Send size={17}/> ОТПРАВИТЬ ЗАКАЗ · {money(total)}</button></div>}</div>
}
function OrdersView({orders,loading,onStatus,role,filter,setFilter}:{orders:Order[],loading:boolean,onStatus:(o:Order)=>void,role:string,filter:'all'|'new'|'work'|'ready',setFilter:(x:'all'|'new'|'work'|'ready')=>void}){
  const title='Все заказы';
  const deptStatus=(o:Order)=>{if(o.status==='done')return 'done';if(o.status==='cancelled')return 'cancelled';const mine=o.items;if(!mine.length)return 'new';if(mine.every(x=>x.item_status==='ready'||x.item_status==='done'))return 'ready';if(mine.some(x=>x.item_status==='work'||x.item_status==='ready'))return 'work';return 'new'};
  const actionLabel=(o:Order)=>{if(o.items.some(x=>x.item_status==='new'))return 'В работу';if(o.items.some(x=>x.item_status==='work'))return 'Готово';return null};
  const visible=orders.filter(o=>filter==='all'||deptStatus(o)===filter);
  return <div><div className="role-banner"><b>{title}</b><span>{role==='admin'?'Администратор видит и контролирует все заказы':'Сотрудник видит все заказы и может взять любые позиции в работу'}</span></div>
    <div className="order-filters">{([['all','Все'],['new','Новые'],['work','В работе'],['ready','Готовы']] as const).map(([v,n])=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{n}{v==='all'?'':` ${orders.filter(o=>deptStatus(o)===v).length}`}</button>)}</div>
    {loading&&!orders.length?<div className="loading-card"><Loader2 className="spin"/> Загружаем заказы...</div>:visible.map(o=><div className="order-card" key={o.id}>
      <div className="row"><div><b>{o.table_name}</b><div className="muted">Заказ #{o.id} · {o.staff_name} · {new Date(o.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</div></div><span className={`status-pill ${deptStatus(o)}`}>{statusName(deptStatus(o))}</span></div>
      <div className="order-items">{o.items.map((x,i)=><div className="order-item" key={i}><span><b>{x.item_name}</b>{x.details&&Object.keys(x.details).length>0?<small>{Object.values(x.details).join(' · ')}</small>:null}<small>{x.department==='hookah'?'💨 Кальян · '+itemStatusName(x.item_status):'🧑‍🍳 Бар · '+itemStatusName(x.item_status)}</small></span><b>{x.qty} × {money(Number(x.unit_price))}</b></div>)}</div>
      <div className="row order-footer"><strong>{money(o.items.reduce((s,x)=>s+Number(x.unit_price)*x.qty,0))}</strong>{o.status==='done'?<span className="muted ready-label order-paid-label"><CheckCircle2 size={15}/> Заказ выдан, стол оплачен</span>:actionLabel(o)?<button className="orange-small" onClick={()=>onStatus(o)}>{actionLabel(o)}</button>:deptStatus(o)==='ready'?<span className="muted ready-label"><CheckCircle2 size={15}/> Всё готово</span>:<span className="muted">Ожидаем работу</span>}</div>
    </div>)}
    {!loading&&!visible.length&&<div className="placeholder"><div>📋</div><h2>Здесь пока пусто</h2><p>{filter==='all'?'Создайте первый заказ со страницы стола.':`Заказов со статусом «${statusName(filter)}» нет.`}</p></div>}
  </div>
}
function ProfileCard({profile,onSignOut,isAdmin,onAdmin}:{profile:Profile,onSignOut:()=>void,isAdmin:boolean,onAdmin:()=>void}){return <div className="profile-card"><div className="avatar"><UserRound/></div><div className="brand">ДЫХАНИЕ ДРАКОНА</div><h2>{profile.full_name}</h2><p>{roleName(profile.role)}</p>{isAdmin&&<button className="admin-btn" onClick={onAdmin}><Settings size={18}/> ПАНЕЛЬ АДМИНИСТРАТОРА</button>}<button className="orange-btn" onClick={onSignOut}><LogOut size={18}/> ВЫЙТИ</button></div>}

function AdminMenu({categories,items,onReload,onClose,toast,receipts,receiptsLoading,onReloadReceipts,analytics,onReloadAnalytics,currentShift,onReloadShift,onAuditReload,onLog,auditLogs,auditLoading}:{categories:Category[],items:MenuItem[],onReload:()=>Promise<void>,onClose:()=>void,toast:(s:string)=>void,receipts:Receipt[],receiptsLoading:boolean,onReloadReceipts:()=>Promise<void>,analytics:Analytics,onReloadAnalytics:(from?:string,to?:string)=>Promise<void>,currentShift:Shift|null,onReloadShift:()=>Promise<void>,onAuditReload:()=>Promise<void>,onLog:(action:string,entityType:string,entityId?:string|number|null,details?:Record<string,any>)=>Promise<void>,auditLogs:AuditLog[],auditLoading:boolean}){
  const [tab,setTab]=useState<'items'|'categories'|'tables'|'staff'|'cash'|'stats'|'audit'>('items');
  const [editing,setEditing]=useState<number|null>(null),[draft,setDraft]=useState({name:'',price:'',large_price:'',description:'',category_id:''});
  const [newItem,setNewItem]=useState({name:'',price:'',large_price:'',description:'',category_id:''});
  const [newCat,setNewCat]=useState({name:'',icon:'🍽️',parent_id:''});
  const [staff,setStaff]=useState<Staff[]>([]),[staffLoading,setStaffLoading]=useState(false);
  const [newStaff,setNewStaff]=useState({full_name:'',username:'',pin:'',role:'waiter'}),[staffSaving,setStaffSaving]=useState(false);
  const [editingStaff,setEditingStaff]=useState<string|null>(null),[staffDraft,setStaffDraft]=useState({full_name:'',username:'',role:'waiter',pin:''});
  const [saving,setSaving]=useState(false); const sb=useMemo(()=>supabaseBrowser(),[]);
  const [adminTables,setAdminTables]=useState<RestaurantTable[]>([]),[tablesLoading,setTablesLoading]=useState(false),[newTableName,setNewTableName]=useState(''),[newTableVip,setNewTableVip]=useState(false),[editingTable,setEditingTable]=useState<number|null>(null),[tableDraft,setTableDraft]=useState({name:'',is_vip:false}),[tableSaving,setTableSaving]=useState(false);
  async function loadAdminTables(){setTablesLoading(true);const {data,error}=await sb.from('restaurant_tables').select('id,name,is_vip,is_bar,status,guests,active_order_id,active').order('is_vip').order('id');setTablesLoading(false);if(error)return toast(error.message);setAdminTables((data||[]) as RestaurantTable[])}
  useEffect(()=>{if(tab==='tables')loadAdminTables()},[tab])
  function beginTable(t:RestaurantTable){setEditingTable(t.id);setTableDraft({name:t.name,is_vip:t.is_vip})}
  async function saveTable(id:number){if(!tableDraft.name.trim())return toast('Введите название стола');setTableSaving(true);const {error}=await sb.from('restaurant_tables').update({name:tableDraft.name.trim(),is_vip:tableDraft.is_vip}).eq('id',id);setTableSaving(false);if(error)return toast(error.message);setEditingTable(null);toast('Стол обновлён');await onLog('Изменил стол','table',id,{name:tableDraft.name.trim(),is_vip:tableDraft.is_vip});await onAuditReload();await loadAdminTables();await onReload()}
  async function addTable(){if(!newTableName.trim())return toast('Введите название стола');const tableName=newTableName.trim(),isVip=newTableVip;setTableSaving(true);const {data:created,error}=await sb.from('restaurant_tables').insert({name:tableName,is_vip:isVip,active:true,status:'free',guests:0}).select('id').single();setTableSaving(false);if(error)return toast(error.message);setNewTableName('');setNewTableVip(false);toast('Стол добавлен');await onLog('Добавил стол','table',created?.id,{name:tableName,is_vip:isVip});await onAuditReload();await loadAdminTables();await onReload()}
  async function toggleTable(t:RestaurantTable){if(t.active&&t.status==='busy')return toast('Занятый стол нельзя скрыть');setTableSaving(true);const {error}=await sb.from('restaurant_tables').update({active:!t.active}).eq('id',t.id);setTableSaving(false);if(error)return toast(error.message);toast(t.active?'Стол скрыт из работы':'Стол возвращён в работу');await onLog(t.active?'Скрыл стол':'Вернул стол в работу','table',t.id,{name:t.name});await onAuditReload();await loadAdminTables();await onReload()}

  function begin(i:MenuItem){setEditing(i.id);setDraft({name:i.name,price:String(i.price),large_price:i.large_price==null?'':String(i.large_price),description:i.description||'',category_id:String(i.category_id)})}
  async function saveItem(id:number){if(!draft.name.trim()||Number(draft.price)<0||(!draft.large_price?false:Number(draft.large_price)<Number(draft.price))||!draft.category_id)return toast('Заполните название, цены и категорию');setSaving(true);const {error}=await sb.from('menu_items').update({name:draft.name.trim(),price:Number(draft.price),large_price:draft.large_price===''?null:Number(draft.large_price),description:draft.description.trim()||null,category_id:Number(draft.category_id)}).eq('id',id);setSaving(false);if(error)return toast(error.message);setEditing(null);toast('Позиция обновлена');await onLog('Изменил позицию меню','menu_item',id,{name:draft.name.trim(),price:Number(draft.price),large_price:draft.large_price===''?null:Number(draft.large_price),category_id:Number(draft.category_id)});await onReload()}
  async function addNewItem(){if(!newItem.name.trim()||newItem.price===''||Number(newItem.price)<0||(!newItem.large_price?false:Number(newItem.large_price)<Number(newItem.price))||!newItem.category_id)return toast('Заполните новую позицию полностью');setSaving(true);const {error}=await sb.from('menu_items').insert({name:newItem.name.trim(),price:Number(newItem.price),large_price:newItem.large_price===''?null:Number(newItem.large_price),description:newItem.description.trim()||null,category_id:Number(newItem.category_id),active:true});setSaving(false);if(error)return toast(error.message);setNewItem({name:'',price:'',large_price:'',description:'',category_id:''});toast('Позиция добавлена');await onLog('Добавил позицию меню','menu_item',undefined,{name:newItem.name.trim(),price:Number(newItem.price),category_id:Number(newItem.category_id)});await onReload()}
  async function toggleItem(i:MenuItem){const {data}=await sb.from('menu_items').select('active').eq('id',i.id).single();if(data==null)return;const {error}=await sb.from('menu_items').update({active:!data.active}).eq('id',i.id);if(error)return toast(error.message);toast(!data.active?'Позиция включена':'Позиция выключена');await onLog(!data.active?'Включил позицию меню':'Выключил позицию меню','menu_item',i.id,{name:i.name});await onReload()}
  async function addCategory(){if(!newCat.name.trim())return toast('Введите название категории');setSaving(true);const {data:mx}=await sb.from('menu_categories').select('sort_order').order('sort_order',{ascending:false}).limit(1);const {error}=await sb.from('menu_categories').insert({name:newCat.name.trim(),icon:newCat.icon||'🍽️',sort_order:(mx?.[0]?.sort_order||0)+1,active:true,parent_id:newCat.parent_id===''?null:Number(newCat.parent_id)});setSaving(false);if(error)return toast(error.message);setNewCat({name:'',icon:'🍽️',parent_id:''});toast('Категория добавлена');await onLog('Добавил категорию','category',undefined,{name:newCat.name.trim()});await onReload()}
  async function toggleCategory(c:Category){const {data}=await sb.from('menu_categories').select('active').eq('id',c.id).single();if(!data)return;const {error}=await sb.from('menu_categories').update({active:!data.active}).eq('id',c.id);if(error)return toast(error.message);toast(!data.active?'Категория включена':'Категория выключена');await onLog(!data.active?'Включил категорию':'Выключил категорию','category',c.id,{name:c.name});await onReload()}
  async function apiStaff(method:'GET'|'POST'|'PATCH',body?:any){const {data:{session}}=await sb.auth.getSession();if(!session)return {ok:false,message:'Сессия истекла'};const r=await fetch('/api/admin/staff',{method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:body?JSON.stringify(body):undefined});let j:any={};try{j=await r.json()}catch{}return {ok:r.ok,...j}}
  async function loadStaff(){setStaffLoading(true);const r=await apiStaff('GET');setStaffLoading(false);if(!r.ok)return toast(r.message||'Не удалось загрузить сотрудников');setStaff(r.staff||[])}
  useEffect(()=>{if(tab==='staff')loadStaff()},[tab])
  async function createStaff(){if(!newStaff.full_name.trim()||!/^[a-zA-Z0-9_.-]{3,30}$/.test(newStaff.username.trim())||!/^[0-9]{6}$/.test(newStaff.pin))return toast('Имя, логин и PIN из 6 цифр обязательны');setStaffSaving(true);const r=await apiStaff('POST',{...newStaff,full_name:newStaff.full_name.trim(),username:newStaff.username.trim().toLowerCase()});setStaffSaving(false);if(!r.ok)return toast(r.message||'Не удалось создать сотрудника');setNewStaff({full_name:'',username:'',pin:'',role:'waiter'});toast('Сотрудник создан');await onLog('Создал сотрудника','staff',undefined,{name:newStaff.full_name.trim(),username:newStaff.username.trim().toLowerCase(),role:newStaff.role});await loadStaff()}
  function beginStaff(s:Staff){setEditingStaff(s.id);setStaffDraft({full_name:s.full_name,username:s.username||'',role:s.role,pin:''})}
  async function saveStaff(id:string){if(!staffDraft.full_name.trim()||!/^[a-zA-Z0-9_.-]{3,30}$/.test(staffDraft.username.trim()))return toast('Введите корректный логин');if(staffDraft.pin && !/^[0-9]{6}$/.test(staffDraft.pin))return toast('PIN должен состоять из 6 цифр');setStaffSaving(true);const r=await apiStaff('PATCH',{id,full_name:staffDraft.full_name.trim(),username:staffDraft.username.trim().toLowerCase(),role:staffDraft.role,active:staff.find(x=>x.id===id)?.active,pin:staffDraft.pin||undefined});setStaffSaving(false);if(!r.ok)return toast(r.message||'Не удалось сохранить');setEditingStaff(null);toast('Данные сотрудника обновлены');await onLog('Изменил сотрудника','staff',id,{name:staffDraft.full_name.trim(),role:staffDraft.role,pin_changed:!!staffDraft.pin});await loadStaff()}
  async function toggleStaff(s:Staff){setStaffSaving(true);const r=await apiStaff('PATCH',{id:s.id,active:!s.active});setStaffSaving(false);if(!r.ok)return toast(r.message||'Не удалось изменить статус');toast(!s.active?'Сотрудник включён':'Сотрудник отключён');await onLog(!s.active?'Включил сотрудника':'Отключил сотрудника','staff',s.id,{name:s.full_name});await loadStaff()}
  return <div className="admin-panel"><div className="admin-head"><div><div className="brand">АДМИНИСТРАТОР</div><h2>Панель управления</h2><p>Меню и сотрудники управляются из одного места.</p></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="admin-tabs"><button className={tab==='items'?'active':''} onClick={()=>setTab('items')}>Позиции</button><button className={tab==='categories'?'active':''} onClick={()=>setTab('categories')}>Категории</button><button className={tab==='tables'?'active':''} onClick={()=>setTab('tables')}><LayoutGrid size={15}/> Столы</button><button className={tab==='staff'?'active':''} onClick={()=>setTab('staff')}><UserCog size={15}/> Сотрудники</button><button className={tab==='cash'?'active':''} onClick={()=>setTab('cash')}><ReceiptText size={15}/> Чеки</button><button className={tab==='stats'?'active':''} onClick={()=>setTab('stats')}>📊 Статистика</button><button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}><History size={15}/> Журнал</button></div>
  <div className="admin-tab-content">{tab==='items'?(<><div className="admin-form"><b>Добавить позицию</b><input placeholder="Название" value={newItem.name} onChange={e=>setNewItem({...newItem,name:e.target.value})}/><div className="admin-row"><input type="number" min="0" step="0.01" placeholder="Цена малая" value={newItem.price} onChange={e=>setNewItem({...newItem,price:e.target.value})}/><input type="number" min="0" step="0.01" placeholder="Цена большая (необязательно)" value={newItem.large_price} onChange={e=>setNewItem({...newItem,large_price:e.target.value})}/></div><div className="admin-row"><select value={newItem.category_id} onChange={e=>setNewItem({...newItem,category_id:e.target.value})}><option value="">Категория</option>{categories.map(c=><option key={c.id} value={c.id}>{c.parent_id?'↳ ':''}{c.icon||''} {c.name}</option>)}</select></div><input placeholder="Описание (необязательно)" value={newItem.description} onChange={e=>setNewItem({...newItem,description:e.target.value})}/><button className="orange-btn" onClick={addNewItem} disabled={saving}><Plus size={18}/> ДОБАВИТЬ ПОЗИЦИЮ</button></div><div className="admin-list">{items.map(i=>editing===i.id?<div className="admin-item edit" key={i.id}><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/><div className="admin-row"><input type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/><input type="number" min="0" step="0.01" placeholder="Большая" value={draft.large_price} onChange={e=>setDraft({...draft,large_price:e.target.value})}/></div><div className="admin-row"><select value={draft.category_id} onChange={e=>setDraft({...draft,category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.parent_id?'↳ ':''}{c.name}</option>)}</select></div><input value={draft.description} placeholder="Описание" onChange={e=>setDraft({...draft,description:e.target.value})}/><div className="admin-actions"><button className="save-btn" onClick={()=>saveItem(i.id)} disabled={saving}><Save size={16}/> Сохранить</button><button className="cancel-btn" onClick={()=>setEditing(null)}>Отмена</button></div></div>:<div className="admin-item" key={i.id}><div><b>{i.name}</b><small>{categories.find(c=>c.id===i.category_id)?.name||'Без категории'} · {i.large_price!=null?`${money(i.price)} / ${money(i.large_price)}`:money(i.price)} · {i.active?'Включена':'Выключена'}</small>{i.description&&<small>{i.description}</small>}</div><div className="admin-actions"><button className="mini-btn" onClick={()=>begin(i)}><Pencil size={16}/></button><button className="mini-btn" onClick={()=>toggleItem(i)}><Power size={16}/></button></div></div>)}</div></>):tab==='categories'?(<><div className="admin-form"><b>Добавить категорию</b><div className="admin-row"><input placeholder="Например: Десерты" value={newCat.name} onChange={e=>setNewCat({...newCat,name:e.target.value})}/><input className="emoji-input" value={newCat.icon} onChange={e=>setNewCat({...newCat,icon:e.target.value})} maxLength={4}/><select value={newCat.parent_id} onChange={e=>setNewCat({...newCat,parent_id:e.target.value})}><option value="">Верхний уровень</option>{categories.filter(c=>c.parent_id===null).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><button className="orange-btn" onClick={addCategory} disabled={saving}><Plus size={18}/> ДОБАВИТЬ КАТЕГОРИЮ</button></div><div className="admin-list">{categories.map(c=><div className="admin-item" key={c.id}><div><b>{c.icon||'🍽️'} {c.name}</b><small>{items.filter(i=>i.category_id===c.id).length} позиций · {c.active?'Включена':'Выключена'}</small></div><button className="mini-btn" onClick={()=>toggleCategory(c)}><Power size={16}/></button></div>)}</div></>):tab==='tables'?(<><div className="admin-section-title"><div><b>Управление столами</b><small>Добавляйте столы, меняйте название и VIP-статус. Скрытые столы не показываются официантам.</small></div></div><div className="admin-form"><b>Добавить стол</b><div className="admin-row"><input placeholder="Название, например: Стол 12" value={newTableName} onChange={e=>setNewTableName(e.target.value)}/><label className="check-label"><input type="checkbox" checked={newTableVip} onChange={e=>setNewTableVip(e.target.checked)}/> VIP</label></div><button className="orange-btn" onClick={addTable} disabled={tableSaving}><Plus size={18}/> ДОБАВИТЬ СТОЛ</button></div><div className="admin-list">{tablesLoading?<div className="loading-card"><Loader2 className="spin"/> Загружаем столы...</div>:adminTables.map(t=>editingTable===t.id?<div className="admin-item edit" key={t.id}><input value={tableDraft.name} onChange={e=>setTableDraft({...tableDraft,name:e.target.value})}/><label className="check-label"><input type="checkbox" checked={tableDraft.is_vip} onChange={e=>setTableDraft({...tableDraft,is_vip:e.target.checked})}/> VIP стол</label><div className="admin-actions"><button className="save-btn" onClick={()=>saveTable(t.id)} disabled={tableSaving}><Save size={16}/> Сохранить</button><button className="cancel-btn" onClick={()=>setEditingTable(null)}>Отмена</button></div></div>:<div className="admin-item" key={t.id}><div><b>{t.name}{t.is_vip?' · VIP':''}</b><small>{t.status==='busy'?`Занят · ${t.guests} ${plural(t.guests,'гость','гостя','гостей')}`:'Свободен'} · {t.active?'В работе':'Скрыт'}</small></div><div className="admin-actions"><button className="mini-btn" onClick={()=>beginTable(t)}><Pencil size={16}/></button><button className="mini-btn" onClick={()=>toggleTable(t)} title={t.active?'Скрыть стол':'Вернуть стол'}><Power size={16}/></button></div></div>)}</div></>):tab==='staff'?(<><div className="admin-form"><b>Добавить сотрудника</b><input placeholder="Имя и фамилия" value={newStaff.full_name} onChange={e=>setNewStaff({...newStaff,full_name:e.target.value})}/><input placeholder="Логин для входа" autoComplete="username" value={newStaff.username} onChange={e=>setNewStaff({...newStaff,username:e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,30)})}/><div className="admin-row"><input inputMode="numeric" maxLength={6} placeholder="PIN · 6 цифр" value={newStaff.pin} onChange={e=>setNewStaff({...newStaff,pin:e.target.value.replace(/\D/g,'').slice(0,6)})}/><select value={newStaff.role} onChange={e=>setNewStaff({...newStaff,role:e.target.value})}>{[['waiter','Официант'],['hookah','Кальянщик'],['admin','Администратор']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></div><button className="orange-btn" onClick={createStaff} disabled={staffSaving}><UserPlus size={18}/> СОЗДАТЬ СОТРУДНИКА</button><p className="admin-hint">Для входа используется логин и PIN-код. Логин должен быть уникальным.</p></div><div className="admin-list">{staffLoading?<div className="loading-card"><Loader2 className="spin"/> Загружаем сотрудников...</div>:staff.map(s=>editingStaff===s.id?<div className="admin-item edit" key={s.id}><input value={staffDraft.full_name} onChange={e=>setStaffDraft({...staffDraft,full_name:e.target.value})}/><input placeholder="Логин" autoComplete="username" value={staffDraft.username} onChange={e=>setStaffDraft({...staffDraft,username:e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,30)})}/><div className="admin-row"><select value={staffDraft.role} onChange={e=>setStaffDraft({...staffDraft,role:e.target.value})}>{[['waiter','Официант'],['hookah','Кальянщик'],['admin','Администратор']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select><input inputMode="numeric" maxLength={6} placeholder="Новый PIN (необязательно)" value={staffDraft.pin} onChange={e=>setStaffDraft({...staffDraft,pin:e.target.value.replace(/\D/g,'').slice(0,6)})}/></div><div className="admin-actions"><button className="save-btn" onClick={()=>saveStaff(s.id)} disabled={staffSaving}><Save size={16}/> Сохранить</button><button className="cancel-btn" onClick={()=>setEditingStaff(null)}>Отмена</button></div></div>:<div className="admin-item" key={s.id}><div><b>{s.full_name}</b><small>{roleName(s.role)} · {s.email||'email не указан'} · {s.active?'Включён':'Отключён'}</small></div><div className="admin-actions"><button className="mini-btn" onClick={()=>beginStaff(s)}><Pencil size={16}/></button><button className="mini-btn" onClick={()=>toggleStaff(s)} title={s.active?'Отключить':'Включить'}><Power size={16}/></button></div></div>)}</div></>):tab==='cash'?<AdminCash receipts={receipts} loading={receiptsLoading} onReload={onReloadReceipts} currentShift={currentShift}/>:tab==='stats'?<AdminStats analytics={analytics} onReload={onReloadAnalytics}/>:tab==='audit'?<AdminAudit logs={auditLogs} loading={auditLoading} onReload={onAuditReload}/>:<div className="placeholder compact"><div>ℹ️</div><p>Смена теперь доступна всем сотрудникам в нижнем меню.</p></div>}
  </div></div>
}

function auditDetailLabel(key:string){return({method:'Способ входа',email:'Email',pin:'PIN',table:'Стол',table_id:'Стол',items:'Позиции',amount:'Сумма',total:'Сумма',payment_method:'Оплата',guests:'Гости',order_id:'Заказ',order_ids:'Заказы',shift_id:'Смена',name:'Название',old_name:'Было',new_name:'Стало',role:'Роль',status:'Статус',item_status:'Статус позиции',from:'Было',to:'Стало',category:'Категория',category_id:'Категория',price:'Цена',qty:'Количество',reason:'Причина'} as Record<string,string>)[key]||key}
function auditRole(v:any){return typeof v==='string'&&['waiter','hookah','admin'].includes(v)?roleName(v):String(v)}
function auditPayment(v:any){return({cash:'Наличные',card:'Карта',mixed:'Смешанная'})[String(v)]||String(v)}
function auditValue(key:string,v:any){
 if(key==='method'&&String(v)==='email+pin') return 'Email + PIN';
 if(key==='payment_method') return auditPayment(v);
 if(key==='role') return auditRole(v);
 if(key==='status'||key==='item_status') return statusName(String(v));
 if(key==='amount'||key==='total'||key==='price') return money(Number(v)||0);
 if(key==='guests'||key==='qty') return String(v);
 if(key==='items'&&Array.isArray(v)) return v.map((x:any)=>{if(typeof x==='string')return x; const q=x.qty||x.quantity||1; const n=x.name||x.item_name||x.title||'Позиция'; return `${q}× ${n}`}).join(', ');
 if(key==='table'&&typeof v==='object'&&v?.name) return v.name;
 if(typeof v==='object'&&v!==null) return JSON.stringify(v);
 return String(v);
}
function AdminAudit({logs,loading,onReload}:{logs:AuditLog[],loading:boolean,onReload:()=>Promise<void>}){
 const today=new Date().toISOString().slice(0,10);
 const [period,setPeriod]=useState<'all'|'period'>('all');
 const [from,setFrom]=useState(today); const [to,setTo]=useState(today);
 const filtered=period==='all'?logs:logs.filter(l=>{const d=new Date(l.created_at); const start=new Date(`${from}T00:00:00`); const end=new Date(`${to}T23:59:59.999`); return d>=start&&d<=end});
 return <div><div className="admin-section-title"><div><b>Журнал действий</b><small>Кто, когда и что изменил в системе.</small></div></div><div className="cash-toolbar"><button className={`mini-btn ${period==='all'?'active':''}`} onClick={()=>setPeriod('all')}>Весь журнал</button><button className={`mini-btn ${period==='period'?'active':''}`} onClick={()=>setPeriod('period')}>Период</button><button className="mini-btn" onClick={onReload}><RefreshCw size={15}/> Обновить</button></div>{period==='period'&&<div className="period-filter"><label>С<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}<div className="audit-list">{loading&&!logs.length?<div className="loading-card"><Loader2 className="spin"/> Загружаем журнал...</div>:filtered.map(l=><div className="audit-item" key={l.id}><div className="audit-top"><b>{l.action}</b><small>{new Date(l.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><div className="audit-meta">{l.staff_name} · {roleName(l.role)}{l.entity_id?` · ${l.entity_type==='restaurant_table'?'Стол':l.entity_type==='order'?'Заказ':l.entity_type==='staff_profile'?'Сотрудник':l.entity_type==='menu_item'?'Позиция':l.entity_type==='category'?'Категория':l.entity_type} #${l.entity_id}`:''}</div>{Object.keys(l.details||{}).filter(k=>k!=='scope').length>0&&<div className="audit-details">{Object.entries(l.details).filter(([k])=>k!=='scope').map(([k,v])=><span key={k}><b>{auditDetailLabel(k)}:</b> {auditValue(k,v)}</span>)}</div>}</div>)}{!loading&&!filtered.length&&<div className="placeholder"><div>📋</div><h2>{period==='period'?'За этот период записей нет':'Журнал пока пуст'}</h2><p>{period==='period'?'Выберите другой диапазон дат.':'Действия сотрудников появятся здесь.'}</p></div>}</div></div>
}

function AdminCash({receipts,loading,onReload,currentShift}:{receipts:Receipt[],loading:boolean,onReload:()=>Promise<void>,currentShift:Shift|null}){
 const [mode,setMode]=useState<'shift'|'period'>('shift');
 const [from,setFrom]=useState(()=>new Date().toISOString().slice(0,10)); const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
 const [expanded,setExpanded]=useState<number|null>(null); const [itemsLoading,setItemsLoading]=useState<number|null>(null); const [localItems,setLocalItems]=useState<Record<number,CheckItem[]>>({}); const sb=useMemo(()=>supabaseBrowser(),[]);
 const list=useMemo(()=>{if(mode==='shift')return currentShift?receipts.filter(r=>r.shift_id===currentShift.id):[];const a=new Date(`${from}T00:00:00`),b=new Date(`${to}T00:00:00`);b.setDate(b.getDate()+1);return receipts.filter(r=>new Date(r.closed_at)>=a&&new Date(r.closed_at)<b)},[receipts,mode,currentShift,from,to]);
 const total=list.reduce((s,r)=>s+r.total,0),cash=list.reduce((s,r)=>s+r.cash_amount,0),card=list.reduce((s,r)=>s+r.card_amount,0);
 async function toggle(r:Receipt){if(expanded===r.id){setExpanded(null);return}setExpanded(r.id);if(localItems[r.id])return;if(!r.order_ids.length){setLocalItems(v=>({...v,[r.id]:[]}));return}setItemsLoading(r.id);const {data}=await sb.from('order_items').select('item_name,qty,unit_price,details').in('order_id',r.order_ids).order('created_at');setLocalItems(v=>({...v,[r.id]:(data||[]).map((x:any)=>({item_name:x.item_name,qty:Number(x.qty),unit_price:Number(x.unit_price),details:x.details||{}}))}));setItemsLoading(null)}
 return <div><div className="admin-section-title"><div><b>Чеки и продажи</b><small>Оплаченные столы и состав каждого чека.</small></div></div><div className="cash-toolbar"><div className="cash-switch"><button className={mode==='shift'?'active':''} onClick={()=>setMode('shift')}>Текущая смена</button><button className={mode==='period'?'active':''} onClick={()=>setMode('period')}>Период</button></div><button className="mini-btn" onClick={onReload}><RefreshCw size={15}/> Обновить</button></div>{mode==='period'&&<div className="period-picker"><div><small>С</small><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><small>По</small><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div></div>}<div className="cash-summary"><div><small>{mode==='shift'?'Выручка смены':'Выручка за период'}</small><b>{money(total)}</b></div><div><small>Наличные</small><b>{money(cash)}</b></div><div><small>Карта</small><b>{money(card)}</b></div></div><div className="cash-list">{loading&&!receipts.length?<div className="loading-card"><Loader2 className="spin"/> Загружаем чеки...</div>:list.map(r=><div className="cash-receipt" key={r.id} onClick={()=>toggle(r)}><div className="row"><div><b>Чек #{r.id} · {r.table_name}</b><small>{new Date(r.closed_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} · {r.staff_name}</small></div><strong>{money(r.total)}</strong></div><small>{r.payment_method==='cash'?`Наличные · дали ${money(r.cash_received)} · сдача ${money(r.change_amount)}`:r.payment_method==='card'?'Карта':`Смешанная · наличные ${money(r.cash_amount)} · карта ${money(r.card_amount)}`}</small>{expanded===r.id&&<div className="receipt-items"><b>Позиции чека</b>{itemsLoading===r.id?<div className="muted">Загружаем позиции...</div>:!(localItems[r.id]||[]).length?<div className="muted">Позиции не найдены.</div>:(localItems[r.id]||[]).map((it,i)=><div className="receipt-item" key={`${r.id}-${i}`}><span>{it.item_name}{Object.keys(it.details||{}).length?<small>{Object.entries(it.details).map(([k,v])=>`${k}: ${v}`).join(' · ')}</small>:null}</span><strong>{it.qty} × {money(it.unit_price)}</strong></div>)}</div>}</div>)}{!loading&&!list.length&&<div className="placeholder"><div>🧾</div><h2>{mode==='shift'?(currentShift?'В этой смене чеков нет':'Смена не открыта'):'За выбранный период чеков нет'}</h2><p>Выберите другой режим или период.</p></div>}</div></div>
}
