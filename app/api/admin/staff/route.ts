import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('Нет токена авторизации');
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) throw new Error('Сессия недействительна');
  const { data: profile } = await admin.from('staff_profiles').select('id,role,active').eq('id', userData.user.id).single();
  if (!profile?.active || profile.role !== 'admin') throw new Error('Недостаточно прав');
  return userData.user;
}

function fail(message: string, status = 400) { return NextResponse.json({ message }, { status }); }

export async function GET(req: Request) {
  try { await requireAdmin(req); } catch (e:any) { return fail(e.message, 401); }
  const { data, error } = await admin.from('staff_profiles').select('id,full_name,role,active,created_at').order('created_at');
  if (error) return fail(error.message, 500);
  const ids = (data || []).map(x => x.id);
  const emails = new Map<string,string>();
  for (const id of ids) { const r = await admin.auth.admin.getUserById(id); if (r.data.user?.email) emails.set(id, r.data.user.email); }
  return NextResponse.json({ staff: (data || []).map(x => ({...x, email: emails.get(x.id) || null})) });
}

export async function POST(req: Request) {
  try { await requireAdmin(req); } catch (e:any) { return fail(e.message, 401); }
  const body = await req.json().catch(() => ({}));
  const { full_name, email, pin, role } = body;
  if (!full_name?.trim() || !email?.trim() || !/^\d{6}$/.test(pin || '')) return fail('Имя, email и PIN из 6 цифр обязательны');
  const allowed = ['waiter','hookah','bar','kitchen','admin'];
  if (!allowed.includes(role)) return fail('Недопустимая роль');
  const { data: created, error: ce } = await admin.auth.admin.createUser({ email: email.trim().toLowerCase(), password: pin, email_confirm: true });
  if (ce || !created.user) return fail(ce?.message || 'Не удалось создать пользователя');
  const { error: pe } = await admin.from('staff_profiles').insert({ id: created.user.id, full_name: full_name.trim(), role, active: true });
  if (pe) { await admin.auth.admin.deleteUser(created.user.id); return fail(pe.message); }
  return NextResponse.json({ ok: true, id: created.user.id });
}

export async function PATCH(req: Request) {
  try { await requireAdmin(req); } catch (e:any) { return fail(e.message, 401); }
  const body = await req.json().catch(() => ({}));
  const { id, full_name, role, active, pin } = body;
  if (!id) return fail('Не указан сотрудник');
  if (role && !['waiter','hookah','bar','kitchen','admin'].includes(role)) return fail('Недопустимая роль');
  const { data: currentData } = await admin.auth.getUser((req.headers.get('authorization') || '').slice(7));
  if (currentData.user?.id === id && active === false) return fail('Нельзя отключить свой собственный аккаунт');
  if (currentData.user?.id === id && role && role !== 'admin') return fail('Нельзя снять роль администратора со своего аккаунта');
  if (pin !== undefined && pin !== '' && !/^\d{6}$/.test(pin)) return fail('PIN должен состоять из 6 цифр');
  const patch:any = {};
  if (full_name !== undefined) patch.full_name = String(full_name).trim();
  if (role !== undefined) patch.role = role;
  if (active !== undefined) patch.active = Boolean(active);
  if (Object.keys(patch).length) { const { error } = await admin.from('staff_profiles').update(patch).eq('id',id); if (error) return fail(error.message); }
  if (pin) { const { error } = await admin.auth.admin.updateUserById(id, { password: pin }); if (error) return fail(error.message); }
  return NextResponse.json({ ok: true });
}
