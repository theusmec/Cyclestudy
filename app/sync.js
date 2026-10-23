/* Cycle: sincronização entre aparelhos da mesma conta por QR animado ou código, sem internet e sem servidor.
   Carregado sob demanda (junto de lib/qrcode.js e lib/jsQR.js). Usa window.__cycleDb (shim.js). */
(function () {
  if (window.__cycleSync) return;
  var db = window.__cycleDb;
  var FRAME_CHARS = 260;                    // caracteres do código por quadro de QR
  var enc = new TextEncoder(), dec = new TextDecoder();
  var NAMES = { subjects: "matérias", contents: "conteúdos", sessions: "sessões de estudo", exams: "provas", tasks: "trabalhos", notes: "anotações", grades: "matérias com notas", settings: "configurações" };

  // ---------- codificação ----------
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function b64u(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "=";
    var bin = atob(str), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  var crcT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(str) { var c = 0xFFFFFFFF; for (var i = 0; i < str.length; i++) c = crcT[(c ^ str.charCodeAt(i)) & 0xFF] ^ (c >>> 8); return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0"); }
  function pipe(bytes, stream) { return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function deriveKey(pw, salt) {
    return crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encrypt(bytes, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt).then(function (key) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes); }).then(function (ct) {
      ct = new Uint8Array(ct); var out = new Uint8Array(28 + ct.length); out.set(salt, 0); out.set(iv, 16); out.set(ct, 28); return out;
    });
  }
  function decrypt(bytes, pw) {
    var salt = bytes.slice(0, 16), iv = bytes.slice(16, 28), ct = bytes.slice(28);
    return deriveKey(pw, salt).then(function (key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct); }).then(function (b) { return new Uint8Array(b); }, function () { throw err("senha", "Senha incorreta."); });
  }
  // código = CYC1:<p|e>:<crc32>:<dados em base64url>   (p = sem senha, e = com senha)
  function packCode(obj, pw) {
    var json = enc.encode(JSON.stringify(obj));
    return pipe(json, new CompressionStream("gzip")).then(function (gz) { return pw ? encrypt(gz, pw) : gz; }).then(function (body) {
      var b = b64u(body); return "CYC1:" + (pw ? "e" : "p") + ":" + crc32(b) + ":" + b;
    });
  }
  function codeIsEncrypted(code) { return /^CYC1:e:/.test(String(code || "").trim()); }
  function unpackCode(code, pw) {
    code = String(code || "").replace(/\s+/g, "");
    var parts = code.split(":");
    if (parts.length !== 4 || parts[0] !== "CYC1") return Promise.reject(err("formato", "Isso não parece um código do Cycle."));
    if (crc32(parts[3]) !== parts[2]) return Promise.reject(err("crc", "O código está incompleto ou foi alterado. Copie de novo."));
    var bytes; try { bytes = unb64u(parts[3]); } catch (e) { return Promise.reject(err("formato", "Código inválido.")); }
    var p = parts[1] === "e" ? (pw ? decrypt(bytes, pw) : Promise.reject(err("senha-necessaria", "Esse código tem senha."))) : Promise.resolve(bytes);
    return p.then(function (b) { return pipe(b, new DecompressionStream("gzip")); }).then(function (u) {
      var obj = JSON.parse(dec.decode(u));
      if (!obj || obj.app !== "Cycle" || obj.formato !== 3) throw err("formato", "Versão de código não reconhecida.");
      return obj;
    }, function (e) { if (e && e.code) throw e; throw err("formato", "Não consegui ler o código."); });
  }
  // QR animado: o código é cortado em quadros  CYC1|<id>|<i>|<n>|<trecho>
  function makeFrames(code) {
    var sid = Math.random().toString(36).slice(2, 6).padEnd(4, "0"), n = Math.ceil(code.length / FRAME_CHARS), out = [];
    for (var i = 0; i < n; i++) out.push("CYC1|" + sid + "|" + (i + 1) + "|" + n + "|" + code.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS));
    return out;
  }
  function Assembler() { this.sid = null; this.n = 0; this.parts = {}; }
  Assembler.prototype.add = function (text) {
    var m = /^CYC1\|([a-z0-9]{4})\|(\d+)\|(\d+)\|(.+)$/.exec(String(text || ""));
    if (!m) return null;
    var sid = m[1], i = +m[2], n = +m[3];
    if (this.sid !== sid) { this.sid = sid; this.n = n; this.parts = {}; }
    this.parts[i] = m[4];
    var got = Object.keys(this.parts).length, done = got === this.n, self = this;
    return { sid: sid, got: got, n: this.n, done: done, code: done ? Array.from({ length: this.n }, function (_, k) { return self.parts[k + 1]; }).join("") : null };
  };
  function drawQR(canvas, text) {
    var qr = qrcode(0, "M"); qr.addData(text, "Byte"); qr.make();
    var n = qr.getModuleCount(), size = 420, mod = Math.max(2, Math.floor(size / (n + 8))), off = Math.floor((size - mod * n) / 2);
    canvas.width = canvas.height = size;
    var c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); c.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(off + k * mod, off + r * mod, mod, mod);
  }
  function decodeImageData(img) { var r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" }); return r && r.data ? r.data : null; }

  // ---------- interface ----------
  var $ = function (id) { return document.getElementById(id); };
  var contaId = function () { var c = window.__cycleConta, u = c && c.usuario(); return u ? u.uid : null; };   // null quando o app roda sem conta
  var modal = null, S = { frames: [], idx: 0, timer: null, sentAt: 0, stream: null, scanTimer: null, asm: new Assembler(), plan: null };
  var lastSync = function () { try { return +localStorage.getItem("cycle.lastSync") || 0; } catch (e) { return 0; } };
  var setLastSync = function (t) { try { localStorage.setItem("cycle.lastSync", String(t)); } catch (e) {} };
  var fmtDate = function (t) { return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  function build() {
    if (modal) return;
    var st = document.createElement("style");
    st.textContent = "#syBack{z-index:60}.sy-sec{display:flex;flex-direction:column;gap:12px}.sy-qr{display:block;width:min(100%,360px);aspect-ratio:1;height:auto;margin:0 auto;background:#fff;border-radius:10px;image-rendering:pixelated}.sy-video{width:100%;max-height:320px;object-fit:cover;border-radius:10px;background:#000}.sy-code{font-family:var(--mono);font-size:11px;min-height:84px;word-break:break-all}.sy-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sy-ok{color:var(--ok);font-weight:600}.sy-bad{color:var(--late)}";
    document.head.appendChild(st);
    modal = document.createElement("div"); modal.className = "qz-back"; modal.id = "syBack"; modal.hidden = true;
    modal.innerHTML =
      '<div class="qz" role="dialog" aria-modal="true" aria-labelledby="syTitle">' +
      '<div class="qz-head"><div><div class="eyebrow">Sincronizar</div><h2 id="syTitle">Passar dados entre aparelhos</h2></div><button class="btn small ghost" data-sy="close" type="button" aria-label="Fechar">✕</button></div>' +
      '<p class="plan" style="margin:0">' + (contaId() ? "Para dois aparelhos da mesma conta, mesmo sem internet: os dados vão direto de um para o outro, por QR ou por código." : "Sem conta e sem servidor: os dados vão direto de um aparelho para o outro, por QR ou por código.") + ' Em cada aparelho vale o que foi alterado por último, documento por documento.</p>' +
      '<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true" data-sy="tab" data-t="send" type="button">Enviar</button><button class="tab" role="tab" aria-selected="false" data-sy="tab" data-t="recv" type="button">Receber</button></div>' +
      '<section class="sy-sec" id="sySend">' +
        '<label class="field"><span>O que enviar</span><select id="syWhat"></select></label>' +
        '<label class="field"><span>Senha (opcional)</span><input id="syPw" type="password" autocomplete="new-password" placeholder="Deixe em branco para não proteger"></label>' +
        '<div class="sy-row"><button class="btn primary" id="syGen" data-sy="gen" type="button">Gerar QR e código</button></div>' +
        '<div class="sy-sec" id="syOut" hidden>' +
          '<canvas class="sy-qr" id="syCanvas" width="420" height="420" role="img" aria-label="QR code animado com os dados"></canvas>' +
          '<div class="sy-row" style="justify-content:space-between"><span class="plan" id="syFrame"></span><label class="sy-row plan">Velocidade <input type="range" id="sySpeed" min="1" max="6" value="3" style="width:110px"></label><button class="btn small" data-sy="pause" id="syPause" type="button">Pausar</button></div>' +
          '<p class="plan" id="syInfo" style="margin:0"></p>' +
          '<label class="field"><span>Código (para copiar e colar no outro aparelho)</span><textarea id="syCode" class="sy-code" readonly></textarea></label>' +
          '<div class="sy-row"><button class="btn" data-sy="copy" type="button">Copiar código</button><button class="btn small ghost" data-sy="sent" type="button">Já recebi no outro aparelho</button></div>' +
        '</div>' +
        '<p class="plan" id="syMsgS" style="margin:0"></p>' +
      '</section>' +
      '<section class="sy-sec" id="syRecv" hidden>' +
        '<div class="sy-row"><button class="btn primary" id="syScan" data-sy="scan" type="button">Escanear com a câmera</button></div>' +
        '<div class="sy-sec" id="syCam" hidden><video class="sy-video" id="syVideo" playsinline muted></video><p class="plan" id="syProg" style="margin:0">Aponte a câmera para o QR animado do outro aparelho e mantenha firme.</p><div class="sy-row"><button class="btn small" data-sy="stopcam" type="button">Parar câmera</button></div></div>' +
        '<label class="field"><span>Ou cole o código</span><textarea id="syPaste" class="sy-code" placeholder="CYC1:p:…" spellcheck="false"></textarea></label>' +
        '<label class="field"><span>Senha (só se o código tiver senha)</span><input id="syPw2" type="password" autocomplete="off"></label>' +
        '<div class="sy-row"><button class="btn" data-sy="read" type="button">Ler código</button></div>' +
        '<div class="sy-sec" id="syPlan" hidden></div>' +
        '<p class="plan" id="syMsgR" style="margin:0"></p>' +
      '</section></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) return close();
      var b = e.target.closest("[data-sy]"); if (!b) return;
      var k = b.dataset.sy;
      if (k === "close") close();
      else if (k === "tab") tab(b.dataset.t);
      else if (k === "gen") generate();
      else if (k === "pause") togglePause();
      else if (k === "copy") copy();
      else if (k === "sent") { setLastSync(S.sentAt); $("syMsgS").innerHTML = '<span class="sy-ok">Marcado.</span> Na próxima vez você pode enviar só o que mudou depois de agora.'; }
      else if (k === "scan") scan();
      else if (k === "stopcam") stopCam();
      else if (k === "read") handle($("syPaste").value);
      else if (k === "apply") applyPlan();
      else if (k === "cancel") { S.plan = null; $("syPlan").hidden = true; }
    });
    $("sySpeed").addEventListener("input", restartAnim);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  }
  function tab(t) {
    modal.querySelectorAll('[data-sy="tab"]').forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.t === t)); });
    $("sySend").hidden = t !== "send"; $("syRecv").hidden = t !== "recv";
    if (t !== "recv") stopCam();
  }
  function open() {
    build();
    var since = lastSync(), n = db.count(), sel = $("syWhat");
    sel.innerHTML = '<option value="all">Tudo (' + n + ' documentos)</option>';
    if (since) { var d = db.snapshot({ since: since }), k = Object.keys(d.docs).length + Object.keys(d.del).length; sel.innerHTML += '<option value="delta">Só o que mudou desde ' + fmtDate(since) + ' (' + k + ' documentos)</option>'; }
    $("syOut").hidden = true; $("syMsgS").textContent = ""; $("syMsgR").textContent = ""; $("syPlan").hidden = true; $("syPw").value = ""; $("syPw2").value = ""; $("syPaste").value = "";
    $("syScan").hidden = !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    tab("send"); modal.hidden = false;
  }
  function close() { stopAnim(); stopCam(); if (modal) modal.hidden = true; }

  // enviar
  function stopAnim() { clearInterval(S.timer); S.timer = null; }
  function showFrame() { if (!S.frames.length) return; drawQR($("syCanvas"), S.frames[S.idx]); $("syFrame").textContent = "Quadro " + (S.idx + 1) + " de " + S.frames.length; S.idx = (S.idx + 1) % S.frames.length; }
  function restartAnim() { stopAnim(); if (!S.frames.length || S.paused) return; S.timer = setInterval(showFrame, Math.round(1000 / +$("sySpeed").value)); }
  function togglePause() { S.paused = !S.paused; $("syPause").textContent = S.paused ? "Continuar" : "Pausar"; restartAnim(); }
  function generate() {
    var since = $("syWhat").value === "delta" ? lastSync() : 0, snap = db.snapshot({ since: since }), nDocs = Object.keys(snap.docs).length + Object.keys(snap.del).length;
    if (!nDocs) { $("syMsgS").textContent = "Não há nada novo para enviar."; return; }
    var pw = $("syPw").value, btn = $("syGen"); btn.disabled = true; btn.textContent = "Gerando…"; $("syMsgS").textContent = "";
    S.sentAt = Date.now();
    packCode({ app: "Cycle", formato: 3, em: S.sentAt, desde: since, conta: contaId(), docs: snap.docs, del: snap.del }, pw).then(function (code) {
      S.frames = makeFrames(code); S.idx = 0; S.paused = false; $("syPause").textContent = "Pausar";
      $("syCode").value = code; $("syOut").hidden = false;
      var many = S.frames.length > 60;
      $("syInfo").innerHTML = nDocs + " documentos · " + code.length.toLocaleString("pt-BR") + " caracteres · " + S.frames.length + " quadros" + (pw ? " · protegido com senha" : "") +
        (many ? '<br><span class="sy-bad">São muitos quadros e o QR vai demorar. Prefira copiar o código ou envie só o que mudou.</span>' : "");
      showFrame(); restartAnim();
    }).catch(function (e) { $("syMsgS").innerHTML = '<span class="sy-bad">Não consegui gerar: ' + esc(e.message || e) + "</span>"; })
      .then(function () { btn.disabled = false; btn.textContent = "Gerar QR e código"; });
  }
  function copy() {
    var t = $("syCode"); t.select();
    var done = function () { $("syMsgS").innerHTML = '<span class="sy-ok">Código copiado.</span> Cole no outro aparelho, em Receber.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, function () { try { document.execCommand("copy"); done(); } catch (e) {} });
    else { try { document.execCommand("copy"); done(); } catch (e) {} }
  }

  // receber
  function stopCam() {
    clearTimeout(S.scanTimer); S.scanTimer = null;
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    if (modal) { $("syCam").hidden = true; $("syVideo").srcObject = null; }
  }
  function scan() {
    $("syMsgR").textContent = ""; S.asm = new Assembler();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (stream) {
      S.stream = stream; var v = $("syVideo"); v.srcObject = stream; $("syCam").hidden = false; $("syProg").textContent = "Aponte a câmera para o QR animado do outro aparelho e mantenha firme.";
      return v.play().then(function () { loop(v); });
    }).catch(function (e) { $("syMsgR").innerHTML = '<span class="sy-bad">Não consegui abrir a câmera' + (e && e.name === "NotAllowedError" ? ": a permissão foi negada" : "") + ". Você pode colar o código abaixo.</span>"; });
  }
  function loop(v) {
    var cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
    (function tick() {
      if (!S.stream) return;
      if (v.readyState >= 2 && v.videoWidth) {
        var sc = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc);
        cx.drawImage(v, 0, 0, cv.width, cv.height);
        var txt = null; try { txt = decodeImageData(cx.getImageData(0, 0, cv.width, cv.height)); } catch (e) {}
        var r = txt && S.asm.add(txt);
        if (r) {
          $("syProg").textContent = "Quadros recebidos: " + r.got + " de " + r.n;
          if (r.done) { stopCam(); $("syPaste").value = r.code; handle(r.code); return; }
        }
      }
      S.scanTimer = setTimeout(tick, 70);
    })();
  }
  function summary(plan) {
    var parts = [];
    [["novos", "Novos"], ["atualizados", "Atualizados"], ["excluidos", "Excluídos"]].forEach(function (p) {
      var o = plan[p[0]], items = Object.keys(o).map(function (c) { return (NAMES[c] || c) + ": " + o[c]; });
      if (items.length) parts.push("<li><b>" + p[1] + "</b> · " + esc(items.join(", ")) + "</li>");
    });
    return parts.join("");
  }
  function handle(code) {
    $("syMsgR").textContent = ""; $("syPlan").hidden = true; code = String(code || "").trim();
    if (!code) { $("syMsgR").innerHTML = '<span class="sy-bad">Cole o código primeiro.</span>'; return; }
    unpackCode(code, $("syPw2").value).then(function (pkg) {
      var eu = contaId();
      if (eu && pkg.conta && pkg.conta !== eu) throw err("outra-conta", "Esse código é de outra conta do Cycle. Só dá para receber de um aparelho com a mesma conta.");
      var plan = db.plan(pkg); S.plan = plan;
      var box = $("syPlan");
      if (!plan.total) box.innerHTML = '<p class="sy-ok" style="margin:0">Este aparelho já está com tudo o que veio nesse código.</p>';
      else box.innerHTML = '<p style="margin:0"><b>O que vai mudar neste aparelho</b></p><ul class="plan" style="margin:0;padding-left:18px">' + summary(plan) + '</ul>' +
        '<p class="plan" style="margin:0">' + (plan.ignorados ? plan.ignorados + " documento(s) daqui são mais recentes e serão mantidos. " : "") + 'Enviado em ' + fmtDate(pkg.em) + '.</p>' +
        '<div class="sy-row"><button class="btn primary" data-sy="apply" type="button">Aplicar ' + plan.total + ' alterações</button><button class="btn" data-sy="cancel" type="button">Cancelar</button></div>';
      box.hidden = false;
    }).catch(function (e) {
      var msg = e && e.code === "senha-necessaria" ? "Esse código tem senha. Digite a senha e toque em Ler código." : (e && e.message) || "Não consegui ler o código.";
      $("syMsgR").innerHTML = '<span class="sy-bad">' + esc(msg) + "</span>";
    });
  }
  function applyPlan() {
    if (!S.plan) return;
    var plan = S.plan; S.plan = null;
    db.apply(plan).then(function (n) {
      setLastSync(Date.now());
      $("syPlan").innerHTML = '<p class="sy-ok" style="margin:0">Pronto: ' + n + ' documentos atualizados neste aparelho.</p><p class="plan" style="margin:0">Para o outro aparelho receber o que só existe aqui, use Enviar neste aparelho.</p>';
    }).catch(function (e) { $("syMsgR").innerHTML = '<span class="sy-bad">Não consegui aplicar: ' + esc(e.message || e) + "</span>"; });
  }

  window.__cycleSync = { open: open, close: close, _t: { packCode: packCode, unpackCode: unpackCode, makeFrames: makeFrames, Assembler: Assembler, drawQR: drawQR, decodeImageData: decodeImageData, crc32: crc32, codeIsEncrypted: codeIsEncrypted, FRAME_CHARS: FRAME_CHARS } };
})();
