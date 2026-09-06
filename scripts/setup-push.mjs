import fs from 'node:fs';
import crypto from 'node:crypto';
import webpush from 'web-push';

const envPath = '.env.local';
const examplePath = '.env.example';
if (!fs.existsSync(envPath)) fs.copyFileSync(examplePath, envPath);
let env = fs.readFileSync(envPath, 'utf8');
const keys = webpush.generateVAPIDKeys();
const secret = crypto.randomBytes(32).toString('base64url');
function setVar(text, name, value) {
  const re = new RegExp(`^${name}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${name}=${value}`) : `${text.trimEnd()}\n${name}=${value}\n`;
}
env = setVar(env, 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', keys.publicKey);
env = setVar(env, 'VAPID_PUBLIC_KEY', keys.publicKey);
env = setVar(env, 'VAPID_PRIVATE_KEY', keys.privateKey);
env = setVar(env, 'VAPID_SUBJECT', process.env.VAPID_SUBJECT || 'mailto:admin@example.com');
env = setVar(env, 'PUSH_WEBHOOK_SECRET', secret);
fs.writeFileSync(envPath, env);
console.log('\nГотово! Ключи записаны в .env.local');
console.log('\nPUSH_WEBHOOK_SECRET для webhook:');
console.log(secret);
console.log('\nНе публикуй .env.local и никому не отправляй VAPID_PRIVATE_KEY или SUPABASE_SECRET_KEY.');
