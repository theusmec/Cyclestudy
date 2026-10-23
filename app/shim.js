/* Cycle: camada para rodar fora do claude.ai.
   Dentro do claude.ai o runtime já existe (window.claude) e este arquivo não faz nada.
   Fora dele, imita o banco (db) com IndexedDB e o download de arquivos. Calendário (mcp), IA (sample) e usuário ficam ausentes.
   Cada documento guarda a data da última alteração (meta), usada para sincronizar aparelhos por QR/código. */
(function () {
  if (window.claude) return;
  window.__CYCLE_STANDALONE__ = true;

  var DBNAME = "cycle-db", STORE = "docs", META = "meta";
  var LOCAL_ONLY = ["timer/current", "settings/ai", "agenda/main"];   // nunca saem do aparelho (a agenda importada é grande e cada aparelho importa a sua)
  var mem = new Map();          // caminho "colecao/id" -> dados
  var meta = new Map();         // caminho -> { t: data da alteração (ms), del: true se foi excluído }
  var listeners = [];
  var writeListeners = [];     // quem quer saber de toda alteração local (a sincronização com a nuvem)
  var idb = null;
  var bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cycle-db") : null;
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };

  function openIDB() {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open(DBNAME, 2);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
          if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
        };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
        rq.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function readAll(store, into) {
    return new Promise(function (res) {
      try {
        var cur = idb.transaction(store).objectStore(store).openCursor();
        cur.onsuccess = function () { var c = cur.result; if (c) { into.set(c.key, c.value); c.continue(); } else res(); };
        cur.onerror = function () { res(); };
      } catch (e) { res(); }
    });
  }
  function loadAll() {
    return openIDB().then(function (d) {
      idb = d;
      if (!idb) { window.__cycleMemoryOnly = true; return; }
      return readAll(STORE, mem).then(function () { return readAll(META, meta); });
    });
  }
  // grava vários itens numa única transação; ops = [[caminho, dados|null, meta]]
  function persistOps(ops) {
    return new Promise(function (res) {
      if (!idb || !ops.length) return res();
      try {
        var tx = idb.transaction([STORE, META], "readwrite"), st = tx.objectStore(STORE), mt = tx.objectStore(META);
        ops.forEach(function (o) { if (o[1] === null) st.delete(o[0]); else st.put(o[1], o[0]); mt.put(o[2], o[0]); });
        tx.oncomplete = tx.onerror = tx.onabort = function () { res(); };
      } catch (e) { res(); }
    });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // data de alteração: sem registro, documento antigo vale 1; inexistente vale 0
  function stamp(path) { var m = meta.get(path); return m ? m.t : (mem.has(path) ? 1 : 0); }

  // ---------- consultas ----------
  function colOf(path) { var i = path.lastIndexOf("/"); return path.slice(0, i); }
  function docsOf(col) {
    var out = [], pre = col + "/";
    mem.forEach(function (v, p) { if (p.indexOf(pre) === 0 && p.indexOf("/", pre.length) < 0) out.push({ id: p.slice(pre.length), v: v }); });
    return out;
  }
  function cmp(a, op, b) {
    switch (op) {
      case "==": case "eq": return a === b;
      case "!=": case "ne": return a !== b;
      case ">": case "gt": return a > b;
      case ">=": case "gte": return a >= b;
      case "<": case "lt": return a < b;
      case "<=": case "lte": return a <= b;
      case "in": return Array.isArray(b) && b.indexOf(a) >= 0;
      case "array-contains": return Array.isArray(a) && a.indexOf(b) >= 0;
      default: return true;
    }
  }
  function runQuery(q) {
    var rows = docsOf(q.col).filter(function (d) { return q.wh.every(function (w) { return d.v[w[0]] !== undefined && cmp(d.v[w[0]], w[1], w[2]); }); });
    q.ord.forEach(function (o) { rows.sort(function (x, y) { var a = x.v[o[0]], b = y.v[o[0]]; var r = a === b ? 0 : a === undefined ? 1 : b === undefined ? -1 : a < b ? -1 : 1; return o[1] === "desc" ? -r : r; }); });
    if (q.lim) rows = rows.slice(0, q.lim);
    var docs = rows.map(function (d) { return { id: d.id, exists: true, data: function () { return clone(d.v); } }; });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
  }
  function snapDoc(path) {
    var has = mem.has(path);
    return { id: path.split("/").pop(), exists: has, data: function () { return has ? clone(mem.get(path)) : undefined; } };
  }

  // ---------- notificações ----------
  function fire(l) { Promise.resolve().then(function () { try { l.cb(l.kind === "doc" ? snapDoc(l.path) : runQuery(l.q)); } catch (e) { if (l.err) l.err(e); } }); }
  function notify(path) { var col = colOf(path); listeners.slice().forEach(function (l) { if (l.kind === "doc" ? l.path === path : l.q.col === col) fire(l); }); }
  function notifyAll() { listeners.slice().forEach(fire); }
  function emitWrite(path) { writeListeners.slice().forEach(function (f) { try { f(path); } catch (e) {} }); }
  function subscribe(l) { listeners.push(l); fire(l); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; }

  function write(path, data) {
    var m = { t: Date.now(), del: data === null };
    if (data === null) mem.delete(path); else mem.set(path, data);
    meta.set(path, m);
    persistOps([[path, data, m]]);
    if (bc) { try { bc.postMessage({ path: path, data: data, m: m }); } catch (e) {} }
    notify(path);
    emitWrite(path);
  }
  if (bc) bc.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.reload) { location.reload(); return; }
    if (typeof m.path === "string") { if (m.data === null) mem.delete(m.path); else mem.set(m.path, m.data); if (m.m) meta.set(m.path, m.m); notify(m.path); emitWrite(m.path); }
  };

  // ---------- API estilo Firestore ----------
  function newId() { var s = "", c = "abcdefghijklmnopqrstuvwxyz0123456789"; for (var i = 0; i < 20; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function docRef(path) {
    return {
      id: path.split("/").pop(), path: path,
      get: function () { return Promise.resolve(snapDoc(path)); },
      set: function (data, opts) { var cur = mem.get(path); write(path, opts && opts.merge && cur ? Object.assign({}, cur, clone(data)) : clone(data)); return Promise.resolve(); },
      update: function (patch) {
        var cur = clone(mem.get(path)) || {}, p = clone(patch) || {};
        Object.keys(p).forEach(function (k) { if (p[k] && typeof p[k] === "object" && p[k].__delete__) delete cur[k]; else cur[k] = p[k]; });
        write(path, cur); return Promise.resolve();
      },
      delete: function () { write(path, null); return Promise.resolve(); },
      onSnapshot: function (cb, err) { return subscribe({ kind: "doc", path: path, cb: cb, err: err }); }
    };
  }
  function query(col, wh, ord, lim) {
    var q = { col: col, wh: wh || [], ord: ord || [], lim: lim || 0 };
    return {
      where: function (f, op, v) { return query(col, q.wh.concat([[f, op, v]]), q.ord, q.lim); },
      orderBy: function (f, dir) { return query(col, q.wh, q.ord.concat([[f, dir || "asc"]]), q.lim); },
      limit: function (n) { return query(col, q.wh, q.ord, n); },
      get: function () { return Promise.resolve(runQuery(q)); },
      onSnapshot: function (cb, err) { return subscribe({ kind: "col", q: q, cb: cb, err: err }); },
      doc: function (id) { return docRef(col + "/" + (id || newId())); },
      add: function (data) { var id = newId(); write(col + "/" + id, clone(data)); return Promise.resolve(docRef(col + "/" + id)); }
    };
  }
  var db = {
    collection: function (name) { return query(name); },
    doc: function (path) { return docRef(path); }
  };

  // ---------- backup bruto e sincronização ----------
  window.__cycleDb = {
    dump: function () { var o = {}; mem.forEach(function (v, p) { o[p] = clone(v); }); return o; },
    count: function () { var n = 0; mem.forEach(function (v, p) { if (LOCAL_ONLY.indexOf(p) < 0) n++; }); return n; },
    // substitui (ou mescla) tudo a partir de um backup bruto; os documentos recebem a data de agora
    load: function (obj, replace) {
      var ops = [], now = Date.now();
      if (replace) { Array.from(mem.keys()).forEach(function (p) { if (!(p in obj)) { mem.delete(p); var m = { t: now, del: true }; meta.set(p, m); ops.push([p, null, m]); } }); }
      Object.keys(obj).forEach(function (p) { var m = { t: now, del: false }; mem.set(p, clone(obj[p])); meta.set(p, m); ops.push([p, obj[p], m]); });
      notifyAll(); emitWrite("*");
      return persistOps(ops).then(function () { if (bc) { try { bc.postMessage({ reload: true }); } catch (e) {} } });
    },
    // resolve quando os dados do aparelho terminaram de carregar
    pronto: function () { return ready; },
    // apaga TUDO deste aparelho (documentos e marcas de exclusão), sem registrar nada para sincronizar; usado ao trocar de conta
    limpar: function () {
      mem.clear(); meta.clear();
      return new Promise(function (res) {
        if (!idb) return res();
        try {
          var tx = idb.transaction([STORE, META], "readwrite"); tx.objectStore(STORE).clear(); tx.objectStore(META).clear();
          tx.oncomplete = tx.onerror = tx.onabort = function () { res(); };
        } catch (e) { res(); }
      }).then(function () { notifyAll(); if (bc) { try { bc.postMessage({ reload: true }); } catch (e) {} } });
    },
    // avisa a cada alteração local (caminho do documento, ou "*" depois de restaurar um backup); devolve a função que cancela
    onWrite: function (cb) { writeListeners.push(cb); return function () { writeListeners = writeListeners.filter(function (x) { return x !== cb; }); }; },
    // pacote para enviar a outro aparelho: { docs: {caminho: {d, t}}, del: {caminho: t} }; since = só o que mudou depois dessa data
    snapshot: function (opts) {
      var since = (opts && opts.since) || 0, docs = {}, del = {};
      mem.forEach(function (v, p) { if (LOCAL_ONLY.indexOf(p) >= 0) return; var t = stamp(p); if (t > since) docs[p] = { d: clone(v), t: t }; });
      meta.forEach(function (m, p) { if (m.del && LOCAL_ONLY.indexOf(p) < 0 && m.t > since) del[p] = m.t; });
      return { docs: docs, del: del };
    },
    // compara um pacote recebido com os dados daqui: o mais recente vence, por documento
    plan: function (pkg) {
      var ops = [], novos = {}, atualizados = {}, excluidos = {}, ignorados = 0, col = function (p) { return colOf(p); };
      var inc = function (o, p) { o[col(p)] = (o[col(p)] || 0) + 1; };
      Object.keys(pkg.docs || {}).forEach(function (p) {
        if (LOCAL_ONLY.indexOf(p) >= 0) return;
        var r = pkg.docs[p], lt = stamp(p);
        if (!r || typeof r.t !== "number" || r.d === undefined) return;
        if (r.t > lt) { ops.push({ p: p, d: r.d, t: r.t }); inc(lt === 0 && !meta.has(p) ? novos : atualizados, p); } else ignorados++;
      });
      Object.keys(pkg.del || {}).forEach(function (p) {
        if (LOCAL_ONLY.indexOf(p) >= 0) return;
        var t = pkg.del[p], lt = stamp(p);
        if (typeof t === "number" && t > lt) { ops.push({ p: p, d: null, t: t }); if (mem.has(p)) inc(excluidos, p); } else ignorados++;
      });
      return { ops: ops, novos: novos, atualizados: atualizados, excluidos: excluidos, ignorados: ignorados, total: ops.length };
    },
    // silent: aplica sem recarregar as outras abas (usado pela nuvem, que aplica o tempo todo); elas recebem só os documentos que mudaram
    apply: function (plan, opts) {
      var ops = [];
      plan.ops.forEach(function (o) {
        var m = { t: o.t, del: o.d === null };
        if (o.d === null) mem.delete(o.p); else mem.set(o.p, clone(o.d));
        meta.set(o.p, m); ops.push([o.p, o.d === null ? null : o.d, m]);
      });
      notifyAll();
      var silent = !!(opts && opts.silent);
      return persistOps(ops).then(function () {
        if (bc) { try { if (silent) ops.forEach(function (o) { bc.postMessage({ path: o[0], data: o[1], m: o[2] }); }); else bc.postMessage({ reload: true }); } catch (e) {} }
        return ops.length;
      });
    }
  };

  // ---------- download de arquivos ----------
  var downloads = {
    save: function (req) {
      var name = String(req.filename || "cycle.txt"), data = req.data;
      var type = /\.json$/i.test(name) ? "application/json" : /\.md$/i.test(name) ? "text/markdown" : "text/plain";
      var blob = data instanceof Blob ? data : new Blob([data], { type: type + ";charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
      return Promise.resolve({ status: "saved" });
    }
  };

  var ready = loadAll();
  window.claude = {
    use: function (name) {
      return ready.then(function () { return name === "db" ? db : name === "downloads" ? downloads : null; });
    }
  };
})();
