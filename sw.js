/* Service worker do Cycle: abre mesmo sem internet.
   Arquivos do app: responde do cache e atualiza em segundo plano (a nova versão aparece na abertura seguinte). */
const V = "cycle-v17";
const SHELL = ["./", "index.html", "ajuda.html", "agenda.js", "ementa.js", "planos.js", "cronograma.js", "metas.js", "retrospectiva.js", "interop.js", "ia.js", "tour.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "shim.js", "nuvem.js", "conta.js", "firebase-config.js", "lib/firebase/firebase.js", "manifest.webmanifest", "sync.js", "lib/qrcode.js", "lib/jsQR.js", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== V + "-ext").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !fonts) return;
  const store = same ? V : V + "-ext";
  e.respondWith(
    caches.open(store).then(cache => cache.match(req, { ignoreSearch: same }).then(hit => {
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => hit || (same ? cache.match("index.html") : Response.error()));
      return hit || net;
    }))
  );
});
