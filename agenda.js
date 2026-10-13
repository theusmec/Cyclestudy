/* Cycle: importar o Google Agenda (arquivo .zip exportado ou .ics) sem conta e sem servidor.
   Lê os eventos, inclusive os que se repetem (RRULE, EXDATE, exceções), e devolve no mesmo formato que o app já usa
   para o Google Calendar. Tudo roda no aparelho. */
(function () {
  var DAY = 86400000;
  var DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var fail = function (code, msg) { var e = new Error(msg); e.code = code; return e; };

  // ---------- zip ----------
  function inflateRaw(u8) {
    if (typeof DecompressionStream === "undefined") throw fail("zip", "Este navegador não abre arquivos .zip. Envie o arquivo .ics de dentro do zip.");
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), n = u8.length, e = -1, i;
    for (i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return Promise.reject(fail("zip", "Esse arquivo .zip não parece válido."));
    var total = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), jobs = [];
    for (var k = 0; k < total; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true),
        xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lh = dv.getUint32(off + 42, true);
      var name = new TextDecoder("utf-8").decode(u8.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + xlen + clen;
      if (!/\.ics$/i.test(name)) continue;
      var ds = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), raw = u8.subarray(ds, ds + csize);
      jobs.push({ name: name, method: method, raw: raw });
    }
    return jobs.reduce(function (p, j) {
      return p.then(function (out) {
        if (j.method !== 0 && j.method !== 8) return out;
        return (j.method === 0 ? Promise.resolve(j.raw) : inflateRaw(j.raw)).then(function (d) { out.push({ name: j.name, data: d }); return out; });
      });
    }, Promise.resolve([]));
  }

  // ---------- datas e fusos ----------
  var wallMs = function (w) { return Date.UTC(w[0], w[1] - 1, w[2], w[3], w[4], w[5]); };
  var fromWallMs = function (ms) { var d = new Date(ms); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; };
  var keyOf = function (w, ad) { return "" + w[0] + pad(w[1]) + pad(w[2]) + (ad ? "" : "T" + pad(w[3]) + pad(w[4]) + pad(w[5])); };
  var dtfCache = {};
  function tzOffset(utc, tz) {
    var f = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
    var p = {}; f.formatToParts(new Date(utc)).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
  }
  function toUtc(wall, z) {                      // horário "de parede" no fuso z -> instante UTC
    if (z === "Z") return wall;
    if (z) {
      try { var g = wall - tzOffset(wall, z); return wall - tzOffset(g, z); } catch (e) { /* fuso desconhecido: usa o do aparelho */ }
    }
    var w = fromWallMs(wall); return new Date(w[0], w[1] - 1, w[2], w[3], w[4], w[5]).getTime();
  }
  function utcToWall(utc, z) {
    if (z === "Z") return utc;
    if (z) { try { return utc + tzOffset(utc, z); } catch (e) { /* idem */ } }
    return utc - new Date(utc).getTimezoneOffset() * 60000;
  }
  var localMs = function (ymd) { var p = ymd.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]).getTime(); };
  var ymdOf = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  // ---------- ICS ----------
  function unesc(s) { return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }
  function parseLine(l) {
    var i = 0, q = false;
    for (; i < l.length; i++) { var c = l.charAt(i); if (c === '"') q = !q; else if (c === ":" && !q) break; }
    if (i >= l.length) return null;
    var parts = l.slice(0, i).split(";"), params = {};
    for (var k = 1; k < parts.length; k++) { var m = parts[k].split("="); params[m[0].toUpperCase()] = (m[1] || "").replace(/"/g, ""); }
    return { name: parts[0].toUpperCase(), params: params, val: l.slice(i + 1) };
  }
  function parseDT(val, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(val.trim());
    if (!m) return null;
    return { w: [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)], ad: !m[4], z: m[7] ? "Z" : (params.TZID || "") };
  }
  function parseDur(s) {
    var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
    if (!m) return null;
    var ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
    return m[1] === "-" ? -ms : ms;
  }

  function parseICS(text) {
    var lines = text.replace(/\r+\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n"), calName = "", raw = [], cur = null, skip = 0, i, p;
    for (i = 0; i < lines.length; i++) {
      p = parseLine(lines[i]); if (!p) continue;
      if (p.name === "BEGIN") { if (p.val === "VEVENT") cur = []; else if (cur) skip++; continue; }
      if (p.name === "END") { if (p.val === "VEVENT") { if (cur) raw.push(cur); cur = null; } else if (cur && skip) skip--; continue; }
      if (!cur) { if (p.name === "X-WR-CALNAME") calName = unesc(p.val); continue; }
      if (!skip) cur.push(p);
    }
    var events = [], overrides = {}, from = Date.now() - 45 * DAY;
    raw.forEach(function (props) {
      var f = {}, ex = [];
      props.forEach(function (x) { if (x.name === "EXDATE") ex.push(x); else if (!f[x.name]) f[x.name] = x; });
      if (!f.DTSTART || (f.STATUS && /cancel/i.test(f.STATUS.val))) return;
      var st = parseDT(f.DTSTART.val, f.DTSTART.params); if (!st) return;
      var z = st.z, dur;
      if (st.ad) {
        var de = f.DTEND && parseDT(f.DTEND.val, f.DTEND.params);
        dur = de ? Math.max(1, Math.round((Date.UTC(de.w[0], de.w[1] - 1, de.w[2]) - Date.UTC(st.w[0], st.w[1] - 1, st.w[2])) / DAY)) : (f.DURATION && parseDur(f.DURATION.val) != null ? Math.max(1, Math.round(parseDur(f.DURATION.val) / DAY)) : 1);
      } else {
        var s0 = toUtc(wallMs(st.w), z), de2 = f.DTEND && parseDT(f.DTEND.val, f.DTEND.params);
        if (de2) dur = Math.max(0, toUtc(wallMs(de2.w), de2.z || z) - s0);
        else dur = f.DURATION && parseDur(f.DURATION.val) != null ? Math.max(0, parseDur(f.DURATION.val)) : 0;
      }
      var xs = [];
      ex.forEach(function (x) { x.val.split(",").forEach(function (v) { var d = parseDT(v, x.params); if (!d) return; var w = d.w; if (!st.ad && d.z !== z && !d.ad) w = fromWallMs(utcToWall(toUtc(wallMs(d.w), d.z), z)); xs.push(keyOf(w, st.ad)); }); });
      var uid = f.UID ? f.UID.val : "ev" + events.length;
      var ev = { u: uid, s: f.SUMMARY ? unesc(f.SUMMARY.val) : "", d: f.DESCRIPTION ? unesc(f.DESCRIPTION.val).slice(0, 300) : "", l: f.LOCATION ? unesc(f.LOCATION.val) : "", a: st.ad ? 1 : 0, w: st.w, z: z, dur: dur, rr: f.RRULE ? f.RRULE.val : "", x: xs };
      if (f["RECURRENCE-ID"]) {                   // exceção de um evento repetido: some a ocorrência original e fica este evento
        var rid = parseDT(f["RECURRENCE-ID"].val, f["RECURRENCE-ID"].params);
        if (rid) { var w2 = rid.w; if (!rid.ad && rid.z !== z && !st.ad) w2 = fromWallMs(utcToWall(toUtc(wallMs(rid.w), rid.z), z)); (overrides[uid] = overrides[uid] || []).push(keyOf(rid.ad ? rid.w : w2, rid.ad)); }
        ev.rr = ""; ev.x = [];
      }
      events.push(ev);
    });
    events.forEach(function (ev) { if (ev.rr && overrides[ev.u]) ev.x = ev.x.concat(overrides[ev.u]); });
    // descarta o que já terminou há mais de 45 dias e não se repete mais
    events = events.filter(function (ev) {
      if (ev.rr && !/UNTIL=|COUNT=/i.test(ev.rr)) return true;
      var last = ev.rr ? Infinity : (ev.a ? Date.UTC(ev.w[0], ev.w[1] - 1, ev.w[2]) + ev.dur * DAY : toUtc(wallMs(ev.w), ev.z) + ev.dur);
      if (last === Infinity) { var occ = expandOne(ev, Date.now() - 45 * DAY, Date.now() + 3650 * DAY, 1); return occ.length > 0; }
      return last >= from;
    });
    return { name: calName, events: events };
  }

  // ---------- repetição (RRULE) ----------
  function parseRule(s) {
    var r = { freq: "", interval: 1, count: 0, until: "", byday: [], bymd: [], bymo: [], bysp: [], wkst: 1 };
    s.split(";").forEach(function (part) {
      var kv = part.split("="), k = (kv[0] || "").toUpperCase(), v = kv[1] || "";
      if (k === "FREQ") r.freq = v.toUpperCase();
      else if (k === "INTERVAL") r.interval = Math.max(1, +v || 1);
      else if (k === "COUNT") r.count = +v || 0;
      else if (k === "UNTIL") r.until = v;
      else if (k === "BYDAY") v.split(",").forEach(function (t) { var m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(t.trim()); if (m) r.byday.push({ n: m[1] ? +m[1] : 0, d: DOW[m[2].toUpperCase()] }); });
      else if (k === "BYMONTHDAY") r.bymd = v.split(",").map(Number).filter(function (n) { return n; });
      else if (k === "BYMONTH") r.bymo = v.split(",").map(Number).filter(function (n) { return n; });
      else if (k === "BYSETPOS") r.bysp = v.split(",").map(Number).filter(function (n) { return n; });
      else if (k === "WKST" && DOW[v.toUpperCase()] != null) r.wkst = DOW[v.toUpperCase()];
    });
    return r;
  }
  var daysIn = function (y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); };     // m = 0..11
  function monthDays(y, m, r, defDay) {                // dias (1..31) do mês que a regra pede
    var dim = daysIn(y, m), out = [], i, d;
    if (r.bymd.length) {
      r.bymd.forEach(function (v) { d = v > 0 ? v : dim + 1 + v; if (d >= 1 && d <= dim) out.push(d); });
      if (r.byday.length) out = out.filter(function (dd) { var w = new Date(Date.UTC(y, m, dd)).getUTCDay(); return r.byday.some(function (b) { return b.d === w; }); });
    } else if (r.byday.length) {
      r.byday.forEach(function (b) {
        var list = []; for (i = 1; i <= dim; i++) if (new Date(Date.UTC(y, m, i)).getUTCDay() === b.d) list.push(i);
        if (!b.n) out = out.concat(list); else { var idx = b.n > 0 ? b.n - 1 : list.length + b.n; if (list[idx]) out.push(list[idx]); }
      });
    } else if (defDay <= dim) out.push(defDay);
    return out;
  }
  function expandOne(ev, fromWall, toWall, limit) {    // inícios (ms "de parede") das ocorrências entre fromWall e toWall
    var start = wallMs(ev.w), out = [];
    if (!ev.rr) { if (start >= fromWall && start <= toWall) out.push(start); return out; }
    var r = parseRule(ev.rr), sd = new Date(start), sy = sd.getUTCFullYear(), sm = sd.getUTCMonth(), sdom = sd.getUTCDate(), sdow = sd.getUTCDay();
    var startDay = Date.UTC(sy, sm, sdom), tod = start - startDay, iv = r.interval, count = 0;
    var untilUtc = Infinity;
    if (r.until) { var u = parseDT(r.until, {}); if (u) untilUtc = u.ad ? toUtc(wallMs(u.w) + DAY, ev.z) : toUtc(wallMs(u.w), u.z === "Z" ? "Z" : ev.z); }
    var p0 = 0;
    if (!r.count) {
      var gap = Math.max(0, fromWall - start);
      if (r.freq === "DAILY") p0 = Math.floor(gap / (DAY * iv)) - 1;
      else if (r.freq === "WEEKLY") p0 = Math.floor(gap / (7 * DAY * iv)) - 1;
      else if (r.freq === "MONTHLY") p0 = Math.floor(gap / (28 * DAY * iv)) - 1;
      else if (r.freq === "YEARLY") p0 = Math.floor(gap / (365 * DAY * iv)) - 1;
      p0 = Math.max(0, p0);
    }
    for (var p = p0, guard = 0; guard < 40000; p++, guard++) {
      var cands = [], pStart;
      if (r.freq === "DAILY") {
        pStart = startDay + p * iv * DAY; cands = [pStart];
        if (r.byday.length) cands = cands.filter(function (c) { return r.byday.some(function (b) { return b.d === new Date(c).getUTCDay(); }); });
        if (r.bymd.length) cands = cands.filter(function (c) { var dd = new Date(c).getUTCDate(), dim = daysIn(new Date(c).getUTCFullYear(), new Date(c).getUTCMonth()); return r.bymd.some(function (v) { return (v > 0 ? v : dim + 1 + v) === dd; }); });
        if (r.bymo.length) cands = cands.filter(function (c) { return r.bymo.indexOf(new Date(c).getUTCMonth() + 1) >= 0; });
      } else if (r.freq === "WEEKLY") {
        var ws0 = startDay - ((sdow - r.wkst + 7) % 7) * DAY; pStart = ws0 + p * iv * 7 * DAY;
        var days = r.byday.length ? r.byday.map(function (b) { return b.d; }) : [sdow];
        cands = days.map(function (d) { return pStart + ((d - r.wkst + 7) % 7) * DAY; });
        if (r.bymo.length) cands = cands.filter(function (c) { return r.bymo.indexOf(new Date(c).getUTCMonth() + 1) >= 0; });
      } else if (r.freq === "MONTHLY") {
        var mm = sm + p * iv, yy = sy + Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12; pStart = Date.UTC(yy, mm, 1);
        if (!r.bymo.length || r.bymo.indexOf(mm + 1) >= 0) cands = monthDays(yy, mm, r, sdom).map(function (d) { return Date.UTC(yy, mm, d); });
      } else if (r.freq === "YEARLY") {
        var y2 = sy + p * iv; pStart = Date.UTC(y2, 0, 1);
        (r.bymo.length ? r.bymo : [sm + 1]).forEach(function (mo) { monthDays(y2, mo - 1, r, sdom).forEach(function (d) { cands.push(Date.UTC(y2, mo - 1, d)); }); });
      } else return out;
      if (pStart > toWall) break;
      cands.sort(function (a, b) { return a - b; });
      cands = cands.filter(function (c, i) { return i === 0 || c !== cands[i - 1]; });
      if (r.bysp.length) { var all = cands; cands = []; r.bysp.forEach(function (sp) { var c = sp > 0 ? all[sp - 1] : all[all.length + sp]; if (c != null) cands.push(c); }); cands.sort(function (a, b) { return a - b; }); }
      for (var i = 0; i < cands.length; i++) {
        var occ = cands[i] + tod;
        if (occ < start) continue;
        count++; if (r.count && count > r.count) return out;
        if (occ > toWall) return out;
        if (toUtc(occ, ev.z) > untilUtc) return out;
        if (occ >= fromWall) { out.push(occ); if (limit && out.length >= limit) return out; }
      }
    }
    return out;
  }

  // ---------- eventos no formato do Google Calendar ----------
  function expand(events, startYmd, endYmd) {
    var rs = localMs(startYmd), re = localMs(endYmd), out = [];
    events.forEach(function (ev) {
      if (!ev._xs) Object.defineProperty(ev, "_xs", { value: new Set(ev.x || []), enumerable: false });   // não enumerável: não vai para o banco
      var xs = ev._xs;
      var durMs = ev.a ? ev.dur * DAY : ev.dur;
      expandOne(ev, rs - 2 * DAY - durMs, re + 2 * DAY, 0).forEach(function (wall) {
        var w = fromWallMs(wall); if (xs.has(keyOf(w, ev.a))) return;
        var id = ev.u + "@" + keyOf(w, ev.a), base = { id: id, summary: ev.s, description: ev.d, location: ev.l };
        if (ev.a) {
          var s = new Date(w[0], w[1] - 1, w[2]).getTime(), e = new Date(w[0], w[1] - 1, w[2] + ev.dur).getTime();
          if (s < re && e > rs) out.push(Object.assign(base, { start: { date: ymdOf(new Date(s)) }, end: { date: ymdOf(new Date(e)) } }));
        } else {
          var su = toUtc(wall, ev.z), eu = su + ev.dur;
          if (su < re && (eu > rs || (ev.dur === 0 && su >= rs))) out.push(Object.assign(base, { start: { dateTime: new Date(su).toISOString() }, end: { dateTime: new Date(eu).toISOString() } }));
        }
      });
    });
    out.sort(function (a, b) { return (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date); });
    return out;
  }

  // ---------- arquivo ----------
  function decode(u8) { return new TextDecoder("utf-8").decode(u8).replace(/^﻿/, ""); }
  function load(file) {
    return file.arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf), isZip = u8[0] === 0x50 && u8[1] === 0x4b;
      var files = isZip ? unzip(buf) : Promise.resolve([{ name: file.name, data: u8 }]);
      return files.then(function (fs) {
        if (!fs.length) throw fail("vazio", "Não achei nenhum arquivo .ics dentro do .zip.");
        var cals = fs.map(function (f) {
          var c = parseICS(decode(f.data));
          return { name: c.name || f.name.replace(/^.*\//, "").replace(/\.ics$/i, ""), file: f.name, events: c.events };
        }).filter(function (c) { return c.events.length; });
        if (!cals.length) throw fail("vazio", "Não encontrei compromissos nesse arquivo.");
        return { calendars: cals };
      });
    });
  }

  window.__cycleAgenda = { load: load, parseICS: parseICS, expand: expand, _unzip: unzip };
})();
