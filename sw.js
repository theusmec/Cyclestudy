/* Service worker de limpeza da raiz do site.
   Antes, o app inteiro morava na raiz (cyclestudy.com.br/) e registrou um service worker com escopo "/". Agora o app mora em /app/ e a raiz é a página inicial.
   Quem abriu o endereço antigo ainda tem aquele service worker, que serviria o app velho no lugar da página nova. Este arquivo o substitui no mesmo endereço (sw.js),
   apaga os caches antigos, se desinstala e recarrega a página. Quem nunca teve o service worker antigo não é afetado: a página inicial não registra nenhum. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var chaves = await caches.keys();
    await Promise.all(chaves.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var janelas = await self.clients.matchAll({ type: "window" });
    janelas.forEach(function (c) { try { c.navigate(c.url); } catch (x) {} });
  })());
});
