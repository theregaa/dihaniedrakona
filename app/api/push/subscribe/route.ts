import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase server key is not configured');
  return createClient(url,key,{auth:{persistSession:false}});
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const {subscription,staffId,role}=body||{};
    if(!subscription?.endpoint) return NextResponse.json({error:'subscription is required'},{status:400});
    if(!staffId) return NextResponse.json({error:'staffId is required'},{status:400});
    const sb=adminClient();
    const {error}=await sb.from('push_subscriptions').upsert({staff_id:staffId,role:role||null,endpoint:subscription.endpoint,p256dh:subscription.keys?.p256dh||null,auth:subscription.keys?.auth||null,user_agent:req.headers.get('user-agent')||null,updated_at:new Date().toISOString()},{onConflict:'endpoint'});
    if(error) throw error;
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e?.message||'Subscription failed'},{status:500});}
}
