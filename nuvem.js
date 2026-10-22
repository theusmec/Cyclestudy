/* Cycle: sincronização com a nuvem (Firestore), uma camada por cima do IndexedDB do shim.js.
   O app continua lendo e gravando só no aparelho; esta camada leva as alterações para a conta do usuário e traz as dos outros aparelhos.
   Vale o mais recente por documento (a data `t` de cada documento, a mesma do QR). Dois aparelhos que editam o mesmo documento: fica o mais novo.

   criar({ uid, db, backend, ... }) devolve { start, stop, estado, sincronizarAgora, esquecer }.
   - db: window.__cycleDb (snapshot, plan, apply, onWrite).
   - backend: { push(entries), subscribe(cursor, onBatch, onError) -> cancelar }. Uma entry é { path, d, t } (d = null quando o documento foi excluído).
     onBatch(entries, { inicial, cursor }) traz o que mudou na nuvem; `inicial` marca a primeira entrega, mesmo vazia.
   O backend do Firestore fica em conta.js; os testes usam um backend falso, então esta lógica não depende do SDK. */
(function () {
  var MAX_CHARS = 700000;        // as regras do Firestore recusam texto maior que isso
  var CHUNK = 400;               // documentos por envio
  var idDe = function (path) { return path.split("/").join("~"); };
  var caminhoDe = function (id) { return id.split("~").join("/"); };
  // "~" é o separador no id do documento da nuvem; um caminho que já o tenha não pode ser enviado
  var caminhoValido = function (p) { return typeof p === "string" && p.indexOf("~") < 0 && p.length > 0 && p.length < 400; };

  function criar(o) {
    var db = o.db, backend = o.backend, uid = o.uid;
    var store = o.storage === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : o.storage;
    var locks = o.locks === undefined ? (typeof navigator !== "undefined" && navigator.locks) || null : o.locks;
    var espera = o.espera != null ? o.espera : 3000;            // espera para juntar várias gravações num envio só
    var esperaMax = o.esperaMax != null ? o.esperaMax : 10000;  // mesmo editando sem parar, envia pelo menos a cada tanto
    var chave = "cycle.nuvem." + uid;
    var est = { fase: "parado", pendentes: 0, ultimoEnvio: 0, erro: "", grandes: [] };
    var cursor = null, known = {};   // known: caminho -> data `t` que a nuvem já tem
    var pronto = false, parado = true, enviando = false, outraVez = false, emVoo = Promise.resolve();
    var timer = null, timerDesde = 0, retry = null, resub = null, tentativas = 0, lastOk = 0;
    var cancelaSub = null, cancelaWrite = null, soltaLock = null, resolveIni = null;

    function muda(fase, extra) {
      est.fase = fase; if (extra) Object.keys(extra).forEach(function (k) { est[k] = extra[k]; });
      if (o.onEstado) { try { o.onEstado(estado()); } catch (e) {} }
    }
    function estado() { return { fase: est.fase, pendentes: est.pendentes, ultimoEnvio: est.ultimoEnvio, erro: est.erro, grandes: est.grandes.slice() }; }
    function carrega() {
      if (!store) return;
      try { var s = JSON.parse(store.getItem(chave) || "null"); if (s && typeof s === "object") { cursor = s.cursor === undefined ? null : s.cursor; known = s.known || {}; } } catch (e) {}
    }
    function salva() { if (store) { try { store.setItem(chave, JSON.stringify({ cursor: cursor, known: known })); } catch (e) {} } }

    // ---------- nuvem -> aparelho ----------
    function aoReceber(entries, info) {
      if (parado) return Promise.resolve();
      var pkg = { docs: {}, del: {} };
      (entries || []).forEach(function (e) {
        if (!e || !caminhoValido(e.path) || typeof e.t !== "number") return;
        if (e.d === null) pkg.del[e.path] = e.t; else pkg.docs[e.path] = { d: e.d, t: e.t };
        if ((known[e.path] || 0) < e.t) known[e.path] = e.t;
      });
      if (info && info.cursor !== undefined) cursor = info.cursor;
      var plano = db.plan(pkg);
      return (plano.total ? db.apply(plano, { silent: true }) : Promise.resolve()).then(function () {
        salva();
        if (info && info.inicial && !pronto) { pronto = true; return flush().then(function () { if (resolveIni) { resolveIni(); resolveIni = null; } }); }
      });
    }
    function aoErro(err) {
      if (parado) return;
      var code = err && err.code;
      if (code === "permission-denied") { muda("negado", { erro: String((err && err.message) || code) }); return; }   // sem convite, e-mail não verificado ou manutenção: não adianta insistir
      muda("offline", { erro: String((err && err.message) || err) });
      tentativas++;
      clearTimeout(resub); resub = setTimeout(assina, Math.min(60000, 2000 * Math.pow(2, Math.min(tentativas, 5))));
    }
    function assina() {
      if (parado) return;
      if (cancelaSub) { try { cancelaSub(); } catch (e) {} cancelaSub = null; }
      cancelaSub = backend.subscribe(cursor, function (entries, info) { aoReceber(entries, info).catch(function (e) { aoErro(e); }); }, aoErro);
    }

    // ---------- aparelho -> nuvem ----------
    function marcar() { if (!pronto || parado) return; agenda(); }
    function agenda() {
      var agora = Date.now();
      if (!timer) { timerDesde = agora; timer = setTimeout(flush, espera); return; }
      var resta = esperaMax - (agora - timerDesde);       // vai empurrando o envio, mas nunca além do limite
      clearTimeout(timer); timer = setTimeout(flush, Math.max(0, Math.min(espera, resta)));
    }
    function varre() {
      var pkg = db.snapshot({ since: lastOk }), entries = [], grandes = [];
      Object.keys(pkg.docs).forEach(function (p) {
        var r = pkg.docs[p];
        if (!caminhoValido(p) || r.t <= (known[p] || 0)) return;
        if (JSON.stringify(r.d).length > MAX_CHARS) { grandes.push(p); return; }
        entries.push({ path: p, d: r.d, t: r.t });
      });
      Object.keys(pkg.del).forEach(function (p) { if (caminhoValido(p) && pkg.del[p] > (known[p] || 0)) entries.push({ path: p, d: null, t: pkg.del[p] }); });
      return { entries: entries, grandes: grandes };
    }
    function flush() {
      clearTimeout(timer); timer = null; clearTimeout(retry); retry = null;
      if (parado || !pronto) return Promise.resolve();
      if (enviando) { outraVez = true; return emVoo; }
      enviando = true;
      var inicio = Date.now() - 5000;                       // margem para alterações no mesmo instante
      var v = varre(), fila = v.entries.slice(), partes = [];
      for (var i = 0; i < fila.length; i += CHUNK) partes.push(fila.slice(i, i + CHUNK));
      est.grandes = v.grandes;
      if (!fila.length) { lastOk = inicio; enviando = false; muda("sincronizado", { pendentes: 0, erro: "" }); return Promise.resolve(); }
      muda("enviando", { pendentes: fila.length });
      emVoo = partes.reduce(function (p, parte) {
        return p.then(function () {
          return backend.push(parte).then(function () {
            parte.forEach(function (e) { known[e.path] = e.t; }); salva();
            est.pendentes -= parte.length; muda("enviando");
          });
        });
      }, Promise.resolve()).then(function () {
        lastOk = inicio; tentativas = 0; muda("sincronizado", { pendentes: 0, erro: "", ultimoEnvio: Date.now() });
      }, function (err) {
        tentativas++; muda("offline", { erro: String((err && err.message) || err) });
        if (err && err.code === "permission-denied") { muda("negado"); return; }
        clearTimeout(retry); retry = setTimeout(flush, Math.min(60000, 2000 * Math.pow(2, Math.min(tentativas, 5))));
      }).then(function () {
        enviando = false;
        if (outraVez) { outraVez = false; return flush(); }
      });
      return emVoo;
    }
    function aoVoltarARede() { if (!parado) { tentativas = 0; if (!cancelaSub) assina(); flush(); } }

    // ---------- ciclo de vida ----------
    function arrancar() {
      carrega(); pronto = false; lastOk = 0; tentativas = 0;
      muda("conectando", { erro: "" });
      cancelaWrite = db.onWrite(marcar);
      if (typeof window !== "undefined") window.addEventListener("online", aoVoltarARede);
      var inicial = new Promise(function (res) {
        resolveIni = res;
        setTimeout(function () { res(); }, o.esperaInicial != null ? o.esperaInicial : 15000);   // offline: não prende quem espera
      });
      assina();
      return inicial;
    }
    // Só uma aba por aparelho sincroniza (as outras recebem os documentos pelo BroadcastChannel do shim)
    function start() {
      if (!parado) return Promise.resolve();
      parado = false;
      if (!locks) return arrancar();
      return new Promise(function (res) {
        locks.request("cycle-nuvem-" + uid, { ifAvailable: true }, function (lock) {
          if (!lock) { muda("seguidor"); res(); return; }
          return new Promise(function (solta) { soltaLock = solta; arrancar().then(res, res); });
        });
      });
    }
    function stop() {
      parado = true; pronto = false;
      clearTimeout(timer); clearTimeout(retry); clearTimeout(resub); timer = retry = resub = null;
      if (cancelaSub) { try { cancelaSub(); } catch (e) {} cancelaSub = null; }
      if (cancelaWrite) { cancelaWrite(); cancelaWrite = null; }
      if (typeof window !== "undefined") window.removeEventListener("online", aoVoltarARede);
      if (soltaLock) { soltaLock(); soltaLock = null; }
      muda("parado");
    }
    function esquecer() { if (store) { try { store.removeItem(chave); } catch (e) {} } cursor = null; known = {}; }
    function sincronizarAgora() { return flush(); }
    return { start: start, stop: stop, estado: estado, sincronizarAgora: sincronizarAgora, esquecer: esquecer };
  }

  window.__cycleNuvem = { criar: criar, idDe: idDe, caminhoDe: caminhoDe, caminhoValido: caminhoValido };
})();
