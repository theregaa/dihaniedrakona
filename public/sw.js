const CACHE = 'dyhanie-drakona-v67';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('message', event => { if(event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (event.request.mode === 'navigate' || url.pathname.startsWith('/_next/static/'))) {
      const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(r => r || caches.match('/'))));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Дыхание Дракона', body: event.data?.text() || 'Новый заказ' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Дыхание Дракона', {
    body:data.body || 'Новый заказ поступил в систему', icon:'/icon-192.png', badge:'/icon-192.png',
    tag:data.tag || 'dyhanie-order', renotify:true, data:{url:data.url || '/'}
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url=event.notification?.data?.url || '/';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const existing=list.find(c=>'focus' in c);
    if(existing) return existing.focus();
    return clients.openWindow(url);
  }));
});
