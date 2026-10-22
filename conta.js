/* Cycle: conta (cadastro, login, convite, manutenção) e página Conta. Spec: SPEC-conta.md.
   Só liga quando existe configuração do Firebase (firebase-config.js) ou, em localhost, com ?emulador=1 (testes com o emulador local).
   Sem configuração o app funciona como antes: sem conta, só no aparelho.
   Fluxo: entrar/criar conta -> confirmar e-mail -> estar na lista de convidados -> (sem manutenção, ou ser administrador) -> app. */
(function () {
  var CFG = window.CYCLE_FIREBASE || null;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var emulador = local && /[?&]emulador=1(&|$)/.test(location.search);
  if (emulador) CFG = { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-cycle" };
  if (!CFG) return;
  window.__CYCLE_CONTA__ = true;

  // enquanto a conta não é conferida, nada do app aparece (evita piscar dados antes do login)
  var pre = document.createElement("style");
  pre.id = "contaPre"; pre.textContent = "body > *:not(#contaGate):not(script):not(style){visibility:hidden}";
  document.head.appendChild(pre);

  var sdk = null, auth = null, fs = null, user = null, admin = false, nuvem = null, estadoSite = { manutencao: false, mensagem: "" };
  var modo = "entrar", modoAdmin = false, gate = null, desinscreve = [], authPronto = false;
  var N = function () { return window.__cycleNuvem; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var ERROS = {
    "auth/invalid-credential": "E-mail ou senha incorretos.", "auth/wrong-password": "E-mail ou senha incorretos.", "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Esse e-mail não parece válido.", "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Use Entrar.",
    "auth/weak-password": "Senha fraca: use pelo menos 8 caracteres.", "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
    "auth/network-request-failed": "Sem conexão com a internet. Conecte-se e tente de novo.", "auth/user-disabled": "Essa conta foi desativada.",
    "auth/requires-recent-login": "Por segurança, entre de novo antes de continuar.", "auth/missing-password": "Digite a senha."
  };
  var msgErro = function (e) { return ERROS[e && e.code] || ("Algo deu errado" + (e && e.code ? " (" + e.code + ")" : "") + ". Tente de novo."); };
  var semRede = function (e) { return !!e && (e.code === "unavailable" || e.code === "auth/network-request-failed" || e.code === "deadline-exceeded" || !navigator.onLine); };

  // ---------- scripts e SDK ----------
  function carregaScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("não carregou " + src)); }; document.head.appendChild(s); });
  }
  function carregaSdk() {
    if (sdk) return Promise.resolve(sdk);
    return Promise.all([import("./lib/firebase/firebase.js"), window.__cycleNuvem ? null : carregaScript("nuvem.js")]).then(function (r) { var m = r[0];
      sdk = m;
      var app = m.initializeApp(CFG);
      auth = m.getAuth(app); fs = m.getFirestore(app);
      if (emulador) { m.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); m.connectFirestoreEmulator(fs, "127.0.0.1", 8080); }
      return sdk;
    });
  }

  // ---------- tela de bloqueio ----------
  function estilo() {
    if ($("contaCss")) return;
    var s = document.createElement("style"); s.id = "contaCss";
    s.textContent = "#contaGate{position:fixed;inset:0;z-index:9999;background:var(--paper);color:var(--ink);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 16px 32px;font:15px/1.5 var(--body)}" +
      "#contaGate .cg{width:100%;max-width:420px;margin-top:6vh;display:flex;flex-direction:column;gap:14px}" +
      "#contaGate .cg-logo{display:flex;align-items:center;gap:10px;font:700 26px var(--display);justify-content:center}" +
      "#contaGate .cg-logo i{width:26px;height:26px;border-radius:50%;border:6px solid var(--accent);display:inline-block}" +
      "#contaGate .panel{gap:12px}#contaGate input{font:16px var(--body);padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);width:100%}" +
      "#contaGate .btn{padding:11px 14px;font-size:15px}#contaGate .btn.full{width:100%}#contaGate .cg-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center}" +
      "#contaGate .cg-erro{font-size:13px;color:var(--late);min-height:1.2em}#contaGate p{margin:0}#contaGate .cg-peq{font-size:13px;color:var(--muted)}" +
      "#contaGate a.cg-link,#contaGate button.cg-link{background:none;border:0;padding:4px 0;color:var(--muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}";
    document.head.appendChild(s);
  }
  function esconderApp() {
    if (!$("contaPre")) { var s = document.createElement("style"); s.id = "contaPre"; s.textContent = pre.textContent; document.head.appendChild(s); }
  }
  function mostra(html, foco) {
    estilo(); esconderApp();
    if (!gate) { gate = document.createElement("div"); gate.id = "contaGate"; gate.setAttribute("role", "dialog"); gate.setAttribute("aria-modal", "true"); gate.setAttribute("aria-label", "Conta do Cycle"); document.body.appendChild(gate); }
    gate.innerHTML = '<div class="cg"><div class="cg-logo"><i></i>Cycle</div>' + html + "</div>";
    var f = foco && gate.querySelector(foco); if (f) f.focus();
  }
  function abreApp() {
    var p = $("contaPre"); if (p) p.remove();
    if (gate) { gate.remove(); gate = null; }
    var n = document.querySelectorAll('[data-nav="conta"]'); for (var i = 0; i < n.length; i++) n[i].hidden = false;
  }
  var erroEl = function () { return gate && gate.querySelector(".cg-erro"); };
  var falha = function (e) { var el = erroEl(); if (el) el.textContent = typeof e === "string" ? e : msgErro(e); };
  var ocupado = function (b, sim) { if (b) { b.disabled = sim; } };

  function telaCarregando(msg) { mostra('<div class="panel"><p>' + esc(msg || "Carregando…") + "</p></div>"); }
  function telaEntrar() {
    var criar = modo === "criar";
    mostra('<form class="panel" id="cgForm" novalidate>' +
      "<h2>" + (criar ? "Criar conta" : modoAdmin ? "Entrar como administrador" : "Entrar no Cycle") + "</h2>" +
      '<label class="field"><span>E-mail</span><input id="cgEmail" type="email" autocomplete="email" inputmode="email" required></label>' +
      '<label class="field"><span>Senha' + (criar ? " (mínimo 8 caracteres)" : "") + '</span><input id="cgSenha" type="password" autocomplete="' + (criar ? "new-password" : "current-password") + '" required></label>' +
      (criar ? '<label class="field"><span>Curso</span><input id="cgCurso" type="text" autocomplete="off" placeholder="Ex.: Engenharia Elétrica" maxlength="80" required></label>' +
        '<p class="cg-peq">O Cycle é por convite: você só terá acesso se o seu e-mail estiver na lista do criador.</p>' : "") +
      '<div class="cg-erro" role="alert" aria-live="polite"></div>' +
      '<button class="btn primary full" id="cgOk" type="submit">' + (criar ? "Criar conta" : "Entrar") + "</button>" +
      '<div class="cg-row">' + (criar ? '<button class="cg-link" type="button" id="cgAlt">Já tenho conta</button>' :
        '<button class="cg-link" type="button" id="cgAlt">Criar conta</button><button class="cg-link" type="button" id="cgEsq">Esqueci a senha</button>') + "</div></form>", "#cgEmail");
    $("cgAlt").onclick = function () { modo = criar ? "entrar" : "criar"; telaEntrar(); };
    if ($("cgEsq")) $("cgEsq").onclick = esqueci;
    $("cgForm").onsubmit = function (ev) { ev.preventDefault(); criar ? cadastrar() : entrar(); };
  }
  function entrar() {
    var email = $("cgEmail").value.trim(), senha = $("cgSenha").value;
    if (!email || !senha) return falha("Digite o e-mail e a senha.");
    ocupado($("cgOk"), true); falha("");
    sdk.signInWithEmailAndPassword(auth, email, senha).catch(function (e) { falha(e); ocupado($("cgOk"), false); });   // o resto segue pelo onAuthStateChanged
  }
  function cadastrar() {
    var email = $("cgEmail").value.trim(), senha = $("cgSenha").value, curso = $("cgCurso").value.trim();
    if (!email || !senha || !curso) return falha("Preencha e-mail, senha e curso.");
    if (senha.length < 8) return falha(ERROS["auth/weak-password"]);
    ocupado($("cgOk"), true); falha("");
    sdk.createUserWithEmailAndPassword(auth, email, senha).then(function (c) {
      try { localStorage.setItem("cycle.curso.novo", JSON.stringify({ uid: c.user.uid, curso: curso })); } catch (e) {}
      return sdk.sendEmailVerification(c.user).catch(function () {});
    }).catch(function (e) { falha(e); ocupado($("cgOk"), false); });
  }
  function esqueci() {
    var email = $("cgEmail").value.trim();
    if (!email) return falha("Digite o seu e-mail acima e toque em Esqueci a senha de novo.");
    sdk.sendPasswordResetEmail(auth, email).then(function () { falha(""); var el = erroEl(); if (el) { el.style.color = "var(--ok)"; el.textContent = "Se esse e-mail tem conta, enviamos um link para criar uma senha nova. Olhe também o spam."; } }, falha);
  }
  function telaVerificar() {
    mostra('<div class="panel"><h2>Confirme o seu e-mail</h2>' +
      "<p>Enviamos um link para <b>" + esc(user.email) + "</b>. Abra o e-mail (olhe também o spam), toque no link e volte aqui.</p>" +
      '<div class="cg-erro" role="alert" aria-live="polite"></div>' +
      '<button class="btn primary full" id="cgJa" type="button">Já confirmei</button>' +
      '<div class="cg-row"><button class="cg-link" type="button" id="cgReenviar">Reenviar e-mail</button><button class="cg-link" type="button" id="cgSair">Sair</button></div></div>', "#cgJa");
    $("cgJa").onclick = function () { avaliar(auth.currentUser); };
    $("cgReenviar").onclick = function () { sdk.sendEmailVerification(auth.currentUser).then(function () { var el = erroEl(); if (el) { el.style.color = "var(--ok)"; el.textContent = "E-mail reenviado."; } }, falha); };
    $("cgSair").onclick = sair;
  }
  function telaNegado() {
    mostra('<div class="panel"><h2>Seu e-mail ainda não foi convidado</h2>' +
      "<p>O Cycle é por convite. Peça ao criador para incluir <b>" + esc(user.email) + "</b> na lista e toque em Tentar de novo.</p>" +
      '<div class="cg-erro" role="alert" aria-live="polite"></div>' +
      '<button class="btn primary full" id="cgTentar" type="button">Tentar de novo</button>' +
      '<div class="cg-row"><span></span><button class="cg-link" type="button" id="cgSair">Sair</button></div></div>', "#cgTentar");
    $("cgTentar").onclick = function () { avaliar(auth.currentUser); };
    $("cgSair").onclick = sair;
  }
  function telaSemRede() {
    mostra('<div class="panel"><h2>Sem internet</h2><p>O primeiro acesso precisa de internet. Conecte-se e tente de novo.</p>' +
      '<button class="btn primary full" id="cgTentar" type="button">Tentar de novo</button></div>', "#cgTentar");
    $("cgTentar").onclick = function () { avaliar(auth ? auth.currentUser : null); };
  }
  function telaManutencao() {
    mostra('<div class="panel"><h2>Cycle em manutenção</h2><p>' + esc(estadoSite.mensagem || "Voltamos em breve.") + "</p>" +
      '<div class="cg-row"><button class="cg-link" type="button" id="cgAdm">Sou o administrador</button>' + (user ? '<button class="cg-link" type="button" id="cgSair">Sair</button>' : "") + "</div></div>", "#cgAdm");
    $("cgAdm").onclick = function () { modoAdmin = true; if (user) avaliar(user); else telaEntrar(); };
    if ($("cgSair")) $("cgSair").onclick = sair;
  }

  // ---------- decisão: o que mostrar ----------
  // sem rede o Firestore não dá erro: devolve o cache (vazio) como se fosse resposta. Isso precisa virar "sem rede", senão todo mundo pareceria administrador e convidado.
  function doServidor(q) {
    return sdk.getDocs(q).then(function (snap) {
      if (snap.metadata && snap.metadata.fromCache) { var e = new Error("sem rede"); e.code = "unavailable"; throw e; }
      return snap;
    });
  }
  function checaAcesso(u) {   // administrador consegue listar convidados; convidado consegue ler o próprio espaço
    var eAdm = doServidor(sdk.query(sdk.collection(fs, "convidados"), sdk.limit(1))).then(function () { return true; }, function (e) { if (e && e.code === "permission-denied") return false; throw e; });
    return eAdm.then(function (adm) {
      return doServidor(sdk.query(sdk.collection(fs, "usuarios", u.uid, "docs"), sdk.limit(1))).then(function () { return { ok: true, admin: adm }; },
        function (e) { if (e && e.code === "permission-denied") return { ok: false, admin: adm }; throw e; });
    });
  }
  function avaliar(u) {
    user = u; var meu = u;
    if (!u) { admin = false; paraNuvem(); return estadoSite.manutencao && !modoAdmin ? telaManutencao() : telaEntrar(); }
    telaCarregando();
    return sdk.reload(u).catch(function () {}).then(function () {
      // o token guardado ainda diz "e-mail não verificado" até ser renovado; sem isto as regras do servidor negariam o acesso
      return u.emailVerified ? u.getIdToken(true).catch(function () {}) : null;
    }).then(function () {
      if (!u.emailVerified) return telaVerificar();
      return checaAcesso(u).then(function (r) {
        if (meu !== auth.currentUser) return;
        if (!r.ok) return telaNegado();
        admin = r.admin;
        if (estadoSite.manutencao && !admin) { paraNuvem(); return telaManutencao(); }
        abrir(u);
      }, function (e) {
        if (!semRede(e)) { mostra('<div class="panel"><h2>Não foi possível entrar</h2><p>' + esc(msgErro(e)) + '</p><button class="btn primary full" id="cgTentar" type="button">Tentar de novo</button></div>'); $("cgTentar").onclick = function () { avaliar(auth.currentUser); }; return; }
        // sem rede com conta já confirmada neste aparelho: abre para usar os dados locais (sincroniza quando a rede voltar)
        if (u.emailVerified && lembrado(u.uid)) { abrir(u); } else telaSemRede();
      });
    });
  }
  var lembrado = function (uid) { try { return localStorage.getItem("cycle.conta.ok") === uid; } catch (e) { return false; } };

  // De quem são os dados guardados neste aparelho. Sem dono: dados de antes das contas (ou de conta excluída).
  var dono = function () { try { return localStorage.getItem("cycle.conta.dono") || ""; } catch (e) { return ""; } };
  var defineDono = function (uid) { try { if (uid) localStorage.setItem("cycle.conta.dono", uid); else localStorage.removeItem("cycle.conta.dono"); } catch (e) {} };
  function esquecerSincronia() {   // marcas de sincronização de contas anteriores não valem para o que vem a seguir
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("cycle.nuvem.") === 0 || k === "cycle.lastSync") localStorage.removeItem(k); }); } catch (e) {}
  }
  function apagaLocalERecarrega(u) {
    return window.__cycleDb.limpar().then(function () { esquecerSincronia(); defineDono(u.uid); location.reload(); });
  }
  // Antes de abrir o app: os dados deste aparelho podem não ser desta conta. Resolve true quando pode seguir.
  function preparaAparelho(u) {
    var db = window.__cycleDb, d = dono();
    if (!db || d === u.uid) return Promise.resolve(true);
    return db.pronto().then(function () {
      var n = db.count();
      if (d) {   // dados de outra conta: nunca vão para esta; ficam guardados na nuvem da outra conta
        mostra('<div class="panel"><h2>Este aparelho tem dados de outra conta</h2>' +
          "<p>Para entrar como <b>" + esc(u.email) + "</b>, os dados que estão neste aparelho (de outra conta) precisam ser removidos daqui. Eles continuam guardados na nuvem da outra conta.</p>" +
          '<button class="btn primary full" id="cgApaga" type="button">Remover daqui e entrar</button>' +
          '<div class="cg-row"><span></span><button class="cg-link" type="button" id="cgSair">Sair</button></div></div>', "#cgSair");
        $("cgApaga").onclick = function () { $("cgApaga").disabled = true; apagaLocalERecarrega(u); };
        $("cgSair").onclick = sair;
        return false;
      }
      if (n === 0) { defineDono(u.uid); return true; }
      mostra('<div class="panel"><h2>Já existem dados neste aparelho</h2>' +
        "<p>Encontramos " + n + " registro(s) guardados aqui (matérias, tarefas, revisões…). O que você quer fazer com eles ao entrar como <b>" + esc(u.email) + "</b>?</p>" +
        '<button class="btn primary full" id="cgJunta" type="button">Levar para a minha conta</button>' +
        '<p class="cg-peq" style="margin-top:-6px">Junta com o que a conta já tiver; em caso de conflito vale o mais recente.</p>' +
        '<button class="btn full" id="cgDescarta" type="button">Não levar: começar só com os dados da conta</button>' +
        '<p class="cg-peq" style="margin-top:-6px">Apaga os dados deste aparelho.</p>' +
        '<button class="btn full" id="cgBackup" type="button">Baixar um backup destes dados agora</button>' +
        '<p class="cg-peq" style="margin-top:-6px">Um arquivo .json com tudo o que está aqui, por segurança. Depois, em Sincronizar, dá para importar de volta.</p>' +
        '<div class="cg-row"><span></span><button class="cg-link" type="button" id="cgSair">Sair</button></div></div>', "#cgJunta");
      return new Promise(function (res) {
        $("cgJunta").onclick = function () { defineDono(u.uid); res(true); };
        $("cgDescarta").onclick = function () { if (window.confirm("Apagar os dados deste aparelho? Eles não estão em nenhuma conta.")) { $("cgDescarta").disabled = true; apagaLocalERecarrega(u); } };
        $("cgSair").onclick = sair;
        $("cgBackup").onclick = function () { baixaBackup(db); };
      });
    });
  }
  // backup de segurança dos dados do aparelho (mesmo formato do "Todos os dados (.json)" de Sincronizar)
  function baixaBackup(db) {
    var dados = { app: "Cycle", formato: 2, bruto: db.dump(), exportadoEm: new Date().toISOString(), observacao: "Backup feito antes de entrar na conta." };
    var a = document.createElement("a"), url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }));
    a.href = url; a.download = "cycle-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function abrir(u) {
    preparaAparelho(u).then(function (segue) {
      if (!segue || u !== auth.currentUser) return;
      try { localStorage.setItem("cycle.conta.ok", u.uid); } catch (e) {}
      abreApp(); modoAdmin = false;
      aplicaCursoNovo(u);
      faixaManutencao();
      if (!nuvem) iniciaNuvem(u);
    });
  }
  function aplicaCursoNovo(u) {
    var raw; try { raw = JSON.parse(localStorage.getItem("cycle.curso.novo") || "null"); } catch (e) { raw = null; }
    if (!raw || raw.uid !== u.uid || !raw.curso) return;
    window.claude.use("db").then(function (db) { return db.doc("settings/main").update({ curso: raw.curso }); }).then(function () { try { localStorage.removeItem("cycle.curso.novo"); } catch (e) {} }, function () {});
  }

  // ---------- nuvem ----------
  function backendFirestore(uid) {
    var col = sdk.collection(fs, "usuarios", uid, "docs");
    return {
      push: function (entries) {
        var b = sdk.writeBatch(fs);
        entries.forEach(function (e) {
          var ref = sdk.doc(col, N().idDe(e.path));
          b.set(ref, e.d === null ? { t: e.t, del: true, s: sdk.serverTimestamp() } : { data: JSON.stringify(e.d), t: e.t, s: sdk.serverTimestamp() });
        });
        return b.commit();
      },
      subscribe: function (cursor, onBatch, onErr) {
        var q = cursor ? sdk.query(col, sdk.where("s", ">=", new sdk.Timestamp(cursor.sec, cursor.nano)), sdk.orderBy("s")) : sdk.query(col, sdk.orderBy("s"));
        var primeiro = true, cur = cursor;
        return sdk.onSnapshot(q, function (snap) {
          var entries = [];
          snap.docChanges().forEach(function (c) {
            if (c.type === "removed" || c.doc.metadata.hasPendingWrites) return;      // o que acabamos de enviar não precisa voltar
            var d = c.doc.data(), s = d.s;
            if (s && (!cur || s.seconds > cur.sec || (s.seconds === cur.sec && s.nanoseconds > cur.nano))) cur = { sec: s.seconds, nano: s.nanoseconds };
            var corpo = null; if (!d.del) { try { corpo = JSON.parse(d.data); } catch (e) { return; } }
            entries.push({ path: N().caminhoDe(c.doc.id), d: corpo, t: d.t });
          });
          var inicial = primeiro; primeiro = false;
          if (inicial || entries.length) onBatch(entries, { inicial: inicial, cursor: cur });
        }, onErr);
      }
    };
  }
  function iniciaNuvem(u) {
    if (!N() || !window.__cycleDb) return;
    nuvem = N().criar({ uid: u.uid, db: window.__cycleDb, backend: backendFirestore(u.uid), onEstado: atualizaEstado });
    nuvem.start();
  }
  function paraNuvem() { if (nuvem) { nuvem.stop(); nuvem = null; } }

  function observaSite() {
    desinscreve.push(sdk.onSnapshot(sdk.doc(fs, "config", "estado"), function (snap) {
      var d = snap.exists() ? snap.data() : {};
      var antes = estadoSite;
      estadoSite = { manutencao: d.manutencao === true, mensagem: String(d.mensagem || "") };
      atualizaAdmin();
      // só reage se algo mudou de verdade (refazer a tela apagaria o que a pessoa está digitando);
      // antes de saber quem é o usuário, quem decide é o avaliar()
      if (!authPronto || (estadoSite.manutencao === antes.manutencao && estadoSite.mensagem === antes.mensagem)) return;
      if (estadoSite.manutencao && !admin) { if (user || gate) { paraNuvem(); telaManutencao(); } }
      else if (!estadoSite.manutencao && gate && !user) { telaEntrar(); }
      else if (!estadoSite.manutencao && user && gate) { avaliar(user); }
    }, function () {}));
  }

  // ---------- sair, excluir ----------
  function sair() {
    // tenta enviar o que ainda está pendente, para não perder nada se a próxima pessoa a entrar neste aparelho apagar os dados locais
    var envia = nuvem ? Promise.race([nuvem.sincronizarAgora().catch(function () {}), new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve();
    return envia.then(function () {
      paraNuvem();
      try { localStorage.removeItem("cycle.conta.ok"); } catch (e) {}
      return sdk.signOut(auth);
    }).then(function () { location.reload(); });
  }
  function excluirConta(senha) {
    var u = auth.currentUser, cred = sdk.EmailAuthProvider.credential(u.email, senha);
    return sdk.reauthenticateWithCredential(u, cred).then(function () {
      paraNuvem();
      var col = sdk.collection(fs, "usuarios", u.uid, "docs");
      var apaga = function () {
        return sdk.getDocs(sdk.query(col, sdk.limit(400))).then(function (snap) {
          if (snap.empty) return;
          var b = sdk.writeBatch(fs); snap.docs.forEach(function (d) { b.delete(d.ref); });
          return b.commit().then(apaga);
        });
      };
      return apaga();
    }).then(function () { return sdk.deleteUser(u); }).then(function () {
      if (nuvem) nuvem.esquecer();
      try { localStorage.removeItem("cycle.conta.ok"); localStorage.removeItem("cycle.nuvem." + u.uid); } catch (e) {}
      defineDono("");   // os dados daqui ficam sem dono: quem entrar depois escolhe se leva ou descarta
    });
  }

  // ---------- página Conta ----------
  var ROTULOS = { conectando: "Conectando…", sincronizado: "Sincronizado", enviando: "Enviando…", offline: "Sem conexão: guardado neste aparelho, envio assim que a rede voltar", seguidor: "Sincronizado por outra aba aberta deste aparelho", negado: "Acesso negado pelo servidor", parado: "Parado" };
  function textoEstado(st) {
    var fase = st.fase === "enviando" && !navigator.onLine ? "offline" : st.fase;   // sem rede o envio fica na fila: dizer isso, não "Enviando…"
    return "<b>" + esc(ROTULOS[fase] || fase) + "</b>" + (st.pendentes ? " · " + st.pendentes + " pendente(s)" : "") +
      (st.ultimoEnvio ? " · último envio às " + new Date(st.ultimoEnvio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  }
  function atualizaEstado() {   // só o texto do estado: refazer a página apagaria o que a pessoa está digitando
    var el = $("ctEstado"); if (el && nuvem) el.innerHTML = textoEstado(nuvem.estado());
  }
  function renderPagina() {
    var el = $("viewConta"); if (!el || !user) return;
    var st = nuvem ? nuvem.estado() : { fase: "parado", pendentes: 0, ultimoEnvio: 0, grandes: [] };
    el.innerHTML =
      '<section class="panel" aria-labelledby="hConta"><h2 id="hConta">Conta</h2>' +
      '<div class="field"><span>E-mail</span><div id="ctEmail">' + esc(user.email) + (admin ? ' <span class="count">administrador</span>' : "") + "</div></div>" +
      '<form id="ctForm" class="field"><span>Curso</span><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ctCurso" maxlength="80" autocomplete="off" placeholder="Ex.: Engenharia Elétrica" style="flex:1;min-width:200px"><button class="btn primary" type="submit">Salvar</button></div><div class="plan" id="ctSalvo" role="status"></div></form>' +
      '<div><button class="btn" id="ctSair" type="button">Sair</button></div>' +
      '<p class="plan" id="ctVersao" style="margin:0">Versão do app: ' + esc(window.CYCLE_VERSION || "desconhecida") + '</p></section>' +
      (admin ? blocoAdmin() : "") +
      '<section class="panel" aria-labelledby="hNuvem"><h2 id="hNuvem">Seus dados na nuvem</h2>' +
      '<p id="ctEstado" style="margin:0">' + textoEstado(st) + "</p>" +
      (st.grandes && st.grandes.length ? '<div class="gmsg">Alguns documentos são grandes demais para a nuvem e ficaram só neste aparelho: ' + esc(st.grandes.join(", ")) + ".</div>" : "") +
      '<div><button class="btn" id="ctSync" type="button">Sincronizar agora</button></div>' +
      '<p class="plan" style="margin:0">O Cycle guarda os dados no aparelho e também na sua conta, para você abrir em outro aparelho. Só você lê o conteúdo pelo app. O criador do Cycle, por ser o dono do projeto no Firebase (Google), tem acesso técnico ao banco, e os dados ficam em servidores do Google.</p></section>' +
      '<section class="panel" aria-labelledby="hExcl"><h2 id="hExcl">Excluir conta</h2>' +
      '<p class="plan" style="margin:0">Apaga a sua conta e todos os seus dados da nuvem. Os dados que estão neste aparelho continuam nele. Não dá para desfazer.</p>' +
      '<form id="ctExcl" class="field"><span>Digite a sua senha para confirmar</span><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ctSenha" type="password" autocomplete="current-password" style="flex:1;min-width:200px"><button class="btn danger" type="submit">Excluir minha conta</button></div><div class="plan" id="ctExclMsg" role="alert"></div></form></section>';
    window.claude.use("db").then(function (db) { return db.doc("settings/main").get(); }).then(function (d) { var v = d.exists ? d.data().curso : ""; if ($("ctCurso")) $("ctCurso").value = v || ""; });
    $("ctForm").onsubmit = function (ev) {
      ev.preventDefault(); var v = $("ctCurso").value.trim();
      window.claude.use("db").then(function (db) { return db.doc("settings/main").update({ curso: v }); }).then(function () { $("ctSalvo").textContent = "Curso salvo."; });
    };
    if (admin) ligaAdmin();
    $("ctSair").onclick = sair;
    $("ctSync").onclick = function () { if (nuvem) nuvem.sincronizarAgora().then(renderPagina); };
    $("ctExcl").onsubmit = function (ev) {
      ev.preventDefault(); var s = $("ctSenha").value, m = $("ctExclMsg");
      if (!s) { m.textContent = "Digite a senha."; return; }
      if (!window.confirm("Excluir a conta e todos os dados da nuvem? Isso não pode ser desfeito.")) return;
      m.textContent = "Excluindo…";
      excluirConta(s).then(function () { location.reload(); }, function (e) { m.textContent = msgErro(e); });
    };
  }

  // ---------- administração (só o administrador; as regras do servidor também exigem) ----------
  var EMAIL_OK = /^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/;
  var dataCurta = function (ts) { try { return ts && ts.toDate ? ts.toDate().toLocaleDateString("pt-BR") : ""; } catch (e) { return ""; } };
  function faixaManutencao() {
    var f = $("contaFaixa");
    if (!(admin && estadoSite.manutencao)) { if (f) { f.remove(); document.documentElement.classList.remove("com-faixa"); } return; }
    if (f) return;
    if (!$("contaFaixaCss")) {
      var st = document.createElement("style"); st.id = "contaFaixaCss";
      st.textContent = "#contaFaixa{position:fixed;top:0;left:0;right:0;z-index:70;height:38px;display:flex;align-items:center;justify-content:center;gap:12px;background:var(--late);color:#fff;font:600 13px var(--body);padding:0 12px}" +
        "#contaFaixa button{background:#fff;color:var(--late);border:0;border-radius:6px;padding:4px 10px;font:600 12px var(--body);cursor:pointer}html.com-faixa body{margin-top:38px}html.com-faixa .side{top:38px!important;height:calc(100dvh - 38px)!important}";
      document.head.appendChild(st);
    }
    f = document.createElement("div"); f.id = "contaFaixa"; f.setAttribute("role", "status");
    f.innerHTML = '<span>Manutenção ligada. Os amigos estão bloqueados.</span><button type="button" id="contaFaixaOff">Desligar</button>';
    document.body.appendChild(f); document.documentElement.classList.add("com-faixa");
    $("contaFaixaOff").onclick = function () { gravaManutencao(false, estadoSite.mensagem); };
  }
  function gravaManutencao(ligada, mensagem) {
    return sdk.setDoc(sdk.doc(fs, "config", "estado"), { manutencao: ligada, mensagem: String(mensagem || "").slice(0, 200) });
  }
  function atualizaAdmin() {   // o estado do site mudou (por esta tela, por outro aparelho ou pelo console)
    faixaManutencao();
    var chave = $("adManut"); if (!chave) return;
    chave.checked = estadoSite.manutencao;
    var m = $("adMsg"); if (m && document.activeElement !== m) m.value = estadoSite.mensagem;
    var info = $("adManutInfo"); if (info) info.textContent = estadoSite.manutencao ? "Ligada: só você usa o Cycle." : "Desligada: o Cycle está liberado.";
  }
  function blocoAdmin() {
    return '<section class="panel" aria-labelledby="hAdm"><h2 id="hAdm">Administração</h2>' +
      '<div class="field"><span>Manutenção</span><label style="display:flex;gap:8px;align-items:center;justify-content:flex-start"><input type="checkbox" id="adManut" style="width:auto;margin:0;flex:none"> Pausar o Cycle para os amigos</label>' +
      '<p class="plan" id="adManutInfo" style="margin:0"></p></div>' +
      '<label class="field"><span>Mensagem que os amigos veem</span><input id="adMsg" maxlength="200" placeholder="Voltamos em breve." autocomplete="off"></label>' +
      '<div><button class="btn" id="adSalvaMsg" type="button">Salvar mensagem</button></div>' +
      '<h3 style="margin:8px 0 0">Convidados <span class="count" id="adQtd"></span></h3>' +
      '<form id="adForm" class="field" novalidate><span>E-mail do amigo</span><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="adEmail" type="email" inputmode="email" autocomplete="off" style="flex:1;min-width:200px"><button class="btn primary" id="adConvida" type="submit">Convidar</button></div></form>' +
      '<div class="plan" id="adMsgForm" role="status" style="margin:0"></div>' +
      '<ul id="adLista" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px"></ul>' +
      '<p class="plan" style="margin:0">Remover tira o acesso, mas não apaga a conta nem os dados do amigo (isso é feito no console do Firebase). O Cycle não lista contas criadas: convide pelo e-mail que o amigo informar.</p>' +
      '<p class="plan" id="adRede" role="alert" style="margin:0;color:var(--late)"></p></section>';
  }
  function ligaAdmin() {
    var msg = function (t, ruim) { var m = $("adMsgForm"); if (m) { m.textContent = t; m.style.color = ruim ? "var(--late)" : ""; } };
    var semInternet = function () { return !navigator.onLine; };
    var trava = function () {
      if (!$("adManut")) return;
      var off = semInternet();
      ["adManut", "adMsg", "adSalvaMsg", "adEmail", "adConvida"].forEach(function (i) { if ($(i)) $(i).disabled = off; });
      $("adRede").textContent = off ? "Precisa de internet para administrar: nada fica na fila." : "";
      document.querySelectorAll("#adLista button").forEach(function (b) { b.disabled = off; });
    };
    var falhou = function (e) {
      msg(semRede(e) ? "Sem conexão: nada foi alterado." : e && e.code === "permission-denied" ? "O servidor recusou: sua conta não é administradora." : msgErro(e), true);
      atualizaAdmin(); trava();
    };
    function lista() {
      return doServidor(sdk.collection(fs, "convidados")).then(function (snap) {
        if (!$("adLista")) return;
        var itens = snap.docs.map(function (d) { return { email: d.id, em: dataCurta(d.data().em) }; }).sort(function (a, b) { return a.email < b.email ? -1 : 1; });
        $("adQtd").textContent = itens.length;
        $("adLista").innerHTML = itens.length ? itens.map(function (i) {
          return '<li style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>' + esc(i.email) + (i.em ? ' <span class="plan">convidado em ' + esc(i.em) + "</span>" : "") +
            '</span><button class="btn small" type="button" data-rm="' + esc(i.email) + '">Remover</button></li>';
        }).join("") : '<li class="plan">Ninguém convidado ainda.</li>';
        document.querySelectorAll("#adLista [data-rm]").forEach(function (b) {
          b.onclick = function () {
            var em = b.getAttribute("data-rm");
            if (!window.confirm("Remover o acesso de " + em + "? A conta e os dados dele continuam existindo.")) return;
            sdk.deleteDoc(sdk.doc(fs, "convidados", em)).then(function () { msg(em + " removido."); return lista(); }, falhou);
          };
        });
        trava();
      }, function (e) { if (semRede(e)) trava(); else falhou(e); });
    }
    atualizaAdmin();
    $("adManut").onchange = function () {
      var quer = $("adManut").checked;
      if (quer && !window.confirm("Todos os amigos ficam sem acesso até você desligar. Só você continua usando. Ligar a manutenção?")) { $("adManut").checked = false; return; }
      gravaManutencao(quer, $("adMsg").value).then(function () { msg(quer ? "Manutenção ligada." : "Manutenção desligada."); }, function (e) { $("adManut").checked = !quer; falhou(e); });
    };
    $("adSalvaMsg").onclick = function () { gravaManutencao(estadoSite.manutencao, $("adMsg").value).then(function () { msg("Mensagem salva."); }, falhou); };
    $("adForm").onsubmit = function (ev) {
      ev.preventDefault();
      var em = $("adEmail").value.trim().toLowerCase();
      if (!EMAIL_OK.test(em)) return msg("Esse e-mail não parece válido.", true);
      sdk.getDoc(sdk.doc(fs, "convidados", em)).then(function (d) {
        if (d.metadata && d.metadata.fromCache) { var e = new Error("sem rede"); e.code = "unavailable"; throw e; }
        if (d.exists()) return msg(em + " já está na lista.", true);
        return sdk.setDoc(sdk.doc(fs, "convidados", em), { ok: true, em: sdk.serverTimestamp() }).then(function () { $("adEmail").value = ""; msg(em + " convidado."); return lista(); });
      }).catch(falhou);
    };
    var aoMudarRede = function () {
      if (!$("adManut")) { window.removeEventListener("online", aoMudarRede); window.removeEventListener("offline", aoMudarRede); return; }
      trava(); if (!semInternet()) lista();
    };
    window.addEventListener("online", aoMudarRede); window.addEventListener("offline", aoMudarRede);
    trava(); if (!semInternet()) lista();
  }

  // ---------- partida ----------
  function partida() {
    telaCarregando();
    carregaSdk().then(function () {
      observaSite();
      var primeiro = true;
      sdk.onAuthStateChanged(auth, function (u) {
        if (!u && !primeiro && user) { paraNuvem(); }
        primeiro = false; authPronto = true; avaliar(u);
      });
    }, function () { mostra('<div class="panel"><h2>Não foi possível carregar</h2><p>Recarregue a página. Se o problema continuar, tente mais tarde.</p></div>'); });
  }
  window.__cycleConta = {
    renderPagina: renderPagina,
    dono: dono,
    usuario: function () { return user ? { uid: user.uid, email: user.email, admin: admin } : null; },
    estado: function () { return nuvem ? nuvem.estado() : null; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", partida); else partida();
})();
