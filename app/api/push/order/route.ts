import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

function adminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase server key is not configured');
  return createClient(url,key,{auth:{persistSession:false}});
}

export async function POST(req:NextRequest){
  try{
    const secret=process.env.PUSH_WEBHOOK_SECRET;
    if(secret && req.headers.get('x-push-secret')!==secret) return NextResponse.json({error:'Unauthorized'},{status:401});
    const body=await req.json();
    const orderId=Number(body?.orderId ?? body?.record?.id ?? body?.new?.id);
    if(!orderId) return NextResponse.json({error:'orderId is required'},{status:400});
    const vapidPublic=process.env.VAPID_PUBLIC_KEY, vapidPrivate=process.env.VAPID_PRIVATE_KEY, subject=process.env.VAPID_SUBJECT;
    if(!vapidPublic||!vapidPrivate||!subject) throw new Error('VAPID variables are not configured');
    webpush.setVapidDetails(subject,vapidPublic,vapidPrivate);
    const sb=adminClient();
    const [{data:order,error:oe},{data:items,error:ie}]=await Promise.all([
      sb.from('orders').select('id,table_id,staff_id').eq('id',orderId).single(),
      sb.from('order_items').select('department,item_name,qty').eq('order_id',orderId)
    ]);
    if(oe) throw oe; if(ie) throw ie;
    const hasHookah=(items||[]).some((x:any)=>x.department==='hookah');
    const recipients=hasHookah?['waiter','hookah']:['waiter'];
    const {data:subs,error:se}=await sb.from('push_subscriptions').select('id,staff_id,role,endpoint,p256dh,auth').in('role',recipients);
    if(se) throw se;
    const payload=JSON.stringify({title:hasHookah?'Новый заказ на кальян':'Новый заказ',body:`Стол ${order?.table_id ?? ''} · заказ #${orderId}`,tag:`order-${orderId}`,url:'/'});
    let sent=0;
    for(const s of subs||[]){
      if(s.staff_id===order?.staff_id) continue;
      try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);sent++;}
      catch(err:any){if(err?.statusCode===404||err?.statusCode===410) await sb.from('push_subscriptions').delete().eq('id',s.id);}
    }
    return NextResponse.json({ok:true,sent});
  }catch(e:any){return NextResponse.json({error:e?.message||'Push failed'},{status:500});}
}
