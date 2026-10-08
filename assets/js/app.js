/* ══════════════════════════════════════════════════════════════════
   Temario TIC C1 · Ayuntamiento de Madrid — lógica común
   Sin servidor, sin cuenta y sin datos personales: el progreso y los
   intentos se guardan solo en el navegador (localStorage).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BASE = document.body.getAttribute('data-base') || '';
  var VER = document.body.getAttribute('data-v') || '';
  var LS_KEY = 'temario-tic-c1-v1';
  var LETRAS = ['A', 'B', 'C'];

  /* ── Almacenamiento ─────────────────────────────────────────── */
  function emptyState() { return { leidos: {}, intentos: [], ultimo: null, avisoOk: false }; }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (!s || typeof s !== 'object') return emptyState();
      var e = emptyState();
      for (var k in e) if (!(k in s)) s[k] = e[k];
      return s;
    } catch (err) { return emptyState(); }
  }
  function save(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (err) { /* modo privado o cuota llena */ } }
  var store = {
    get: load,
    update: function (fn) { var s = load(); fn(s); save(s); return s; },
    clear: function () { try { localStorage.removeItem(LS_KEY); } catch (err) {} }
  };

  /* ── Utilidades ─────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(name, cls) { return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function fmtNota(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); }
  function fmtFecha(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDur(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ' min ' + (s < 10 ? '0' : '') + s + ' s'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function notaColor(n) { return n >= 5 ? 'var(--verde)' : n >= 4 ? 'var(--amber)' : 'var(--rojo)'; }
  function notaBadge(n) { return n >= 5 ? '<span class="badge badge-verde">Apto</span>' : '<span class="badge badge-rojo">No apto</span>'; }

  /* Calificación de las bases (BOAM 10.032, base 5.2): acierto +1,
     error −1/3, en blanco 0; escala de 0 a 10, redondeo a dos decimales. */
  function calificar(ok, ko, total) {
    if (!total) return 0;
    var n = (ok - ko / 3) / total * 10;
    return Math.max(0, Math.round(n * 100) / 100);
  }

  /* ── Progreso de lectura ────────────────────────────────────── */
  function avanceTema(n, s) {
    var t = (window.TEMAS || []).find(function (x) { return x.n === n; });
    var total = t ? t.nEp : 0;
    var hechos = ((s || load()).leidos[n] || []).length;
    return { hechos: Math.min(hechos, total), total: total, pct: total ? Math.round(Math.min(hechos, total) / total * 100) : 0 };
  }

  /* ── Cabecera móvil, aviso de almacenamiento y menú ─────────── */
  function initChrome() {
    var sb = $('.sidebar'), ov = $('.overlay'), tg = $('.menu-toggle');
    function close() { if (sb) sb.classList.remove('open'); if (ov) ov.classList.remove('visible'); if (tg) tg.setAttribute('aria-expanded', 'false'); }
    if (tg && sb) tg.addEventListener('click', function () {
      var open = !sb.classList.contains('open');
      sb.classList.toggle('open', open); if (ov) ov.classList.toggle('visible', open); tg.setAttribute('aria-expanded', String(open));
    });
    if (ov) ov.addEventListener('click', close);
    $$('.sidebar a').forEach(function (a) { a.addEventListener('click', close); });

    // Buzón de sugerencias: la página de origen va en el asunto.
    $$('a[data-buzon]').forEach(function (a) {
      a.addEventListener('click', function () {
        var pagina = document.title.replace(/ · Temario TIC C1.*$/, '') + ' — ' + location.href;
        a.href = 'mailto:procesosselectivostic@madrid.es?subject=' + encodeURIComponent('Sugerencia temario TIC C1 · ' + pagina);
      });
    });

    var aviso = $('.aviso');
    if (aviso) {
      if (load().avisoOk) aviso.hidden = true;
      var b = $('button', aviso);
      if (b) b.addEventListener('click', function () { aviso.hidden = true; store.update(function (s) { s.avisoOk = true; }); });
    }
  }

  /* ── Motor de preguntas ─────────────────────────────────────── */
  // items: [{q, o:[3], c, r, e}] · opts: {numStart, prefix}
  function renderPreguntas(container, items, opts) {
    opts = opts || {};
    var resp = items.map(function () { return null; });
    container.innerHTML = items.map(function (it, i) {
      return '<div class="question" data-i="' + i + '">'
        + '<div class="q-num">' + esc(opts.prefix || 'Pregunta') + ' ' + (i + 1) + (opts.tag ? ' · ' + esc(opts.tag(it)) : '') + '</div>'
        + '<div class="q-text">' + esc(it.q) + '</div>'
        + '<div class="q-options" role="group" aria-label="Respuestas de la pregunta ' + (i + 1) + '">'
        + it.o.map(function (o, j) {
          return '<button type="button" class="q-opt" aria-pressed="false" data-j="' + j + '"><span class="q-letter">' + LETRAS[j] + '</span><span>' + esc(o) + '</span></button>';
        }).join('')
        + '</div><div class="q-fb"></div></div>';
    }).join('');
    var locked = false;
    container.addEventListener('click', function (ev) {
      var b = ev.target.closest('.q-opt');
      if (!b || locked || !container.contains(b)) return;
      var qd = b.closest('.question'), i = +qd.getAttribute('data-i'), j = +b.getAttribute('data-j');
      resp[i] = resp[i] === j ? null : j;          // un segundo clic deja la pregunta en blanco
      $$('.q-opt', qd).forEach(function (x) { x.setAttribute('aria-pressed', String(+x.getAttribute('data-j') === resp[i])); });
      if (opts.onChange) opts.onChange(api);
    });
    var api = {
      respuestas: resp,
      contestadas: function () { return resp.filter(function (r) { return r !== null; }).length; },
      corregir: function () {
        locked = true;
        var ok = 0, ko = 0, blanco = 0;
        items.forEach(function (it, i) {
          var qd = container.children[i], r = resp[i];
          $$('.q-opt', qd).forEach(function (x) {
            var j = +x.getAttribute('data-j'); x.disabled = true;
            if (j === it.c) x.classList.add('correct'); else if (j === r) x.classList.add('wrong');
          });
          var cls, txt;
          if (r === null) { blanco++; cls = 'blank'; txt = '<strong>En blanco.</strong> La correcta es la ' + LETRAS[it.c] + '.'; }
          else if (r === it.c) { ok++; cls = ''; txt = '<strong style="color:var(--verde)">Correcta.</strong>'; }
          else { ko++; cls = 'ko'; txt = '<strong style="color:var(--rojo)">Incorrecta.</strong> La correcta es la ' + LETRAS[it.c] + '.'; }
          if (it.e) txt += ' ' + esc(it.e);
          if (it.r) txt += '<div class="q-ref">Referencia: ' + esc(it.r) + '</div>';
          $('.q-fb', qd).innerHTML = '<div class="q-feedback ' + cls + '">' + txt + '</div>';
        });
        return { ok: ok, ko: ko, blanco: blanco, total: items.length, nota: calificar(ok, ko, items.length) };
      }
    };
    return api;
  }

  function guardarIntento(intento) {
    intento.id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    intento.fecha = Date.now();
    store.update(function (s) {
      s.intentos.push(intento);
      if (s.intentos.length > 300) s.intentos = s.intentos.slice(-300);
    });
    return intento;
  }

  /* ══════════════════════════════════════════════════════════════
     PÁGINA DE TEMA
     ══════════════════════════════════════════════════════════════ */
  function initTema() {
    var T = window.TEMA; if (!T) return;
    var n = T.n;
    store.update(function (s) { s.ultimo = { n: n, ts: Date.now() }; });

    // Pestañas (con enlace directo por #hash).
    var tabs = $$('.tab'), panels = $$('.panel');
    function alPanel() { var bar = $('.tabs'); if (!bar) return; var y = bar.getBoundingClientRect().top + window.pageYOffset - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64); window.scrollTo({ top: Math.max(0, y) }); }
    function show(key, focus) {
      if (!$('#panel-' + key)) key = 'indice';
      tabs.forEach(function (t) { var on = t.getAttribute('data-tab') === key; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
      panels.forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + key); });
      $$('.sb-tema a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-tab') === key); });
      if (key === 'test') initBanco();
      if (key === 'casos') initCasosTest();
    }
    tabs.forEach(function (t, idx) {
      t.addEventListener('click', function () { history.replaceState(null, '', '#' + t.getAttribute('data-tab')); show(t.getAttribute('data-tab')); alPanel(); });
      t.addEventListener('keydown', function (ev) {
        var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        var nx = tabs[(idx + d + tabs.length) % tabs.length]; nx.click(); nx.focus();
      });
    });
    $$('.sb-tema a').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); history.replaceState(null, '', '#' + a.getAttribute('data-tab')); show(a.getAttribute('data-tab')); alPanel(); }); });
    window.addEventListener('hashchange', function () { show(location.hash.slice(1).split('/')[0] || 'indice'); });

    // Enlaces del índice a cada epígrafe del contenido.
    $$('.outline a[data-ep]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault(); show('contenido'); history.replaceState(null, '', '#contenido');
        var el = document.getElementById(a.getAttribute('data-ep')); if (el) el.scrollIntoView();
      });
    });

    // Epígrafes leídos: casillas del índice + botones del contenido.
    function pintarLeidos() {
      var s = load(), hechos = s.leidos[n] || [];
      $$('.outline input[data-ep]').forEach(function (c) { var on = hechos.indexOf(c.getAttribute('data-ep')) > -1; c.checked = on; c.closest('.ep').classList.toggle('done', on); });
      $$('.leido-btn').forEach(function (b) { var on = hechos.indexOf(b.getAttribute('data-ep')) > -1; b.setAttribute('aria-pressed', String(on)); b.lastChild.textContent = on ? ' Leído' : ' Marcar como leído'; });
      $$('.ep-done-mark').forEach(function (m) { m.hidden = hechos.indexOf(m.getAttribute('data-ep')) === -1; });
      var a = avanceTema(n, s);
      $$('.avance-fill').forEach(function (f) { f.style.width = a.pct + '%'; });
      $$('.avance-txt').forEach(function (t) { t.textContent = 'Mi avance: ' + a.pct + ' % · ' + a.hechos + ' de ' + a.total + ' epígrafes leídos'; });
    }
    function setLeido(ep, on) {
      store.update(function (s) {
        var l = s.leidos[n] || (s.leidos[n] = []), k = l.indexOf(ep);
        if (on && k === -1) l.push(ep); if (!on && k > -1) l.splice(k, 1);
      });
      pintarLeidos();
    }
    $$('.outline input[data-ep]').forEach(function (c) { c.addEventListener('change', function () { setLeido(c.getAttribute('data-ep'), c.checked); }); });
    $$('.leido-btn').forEach(function (b) { b.addEventListener('click', function () { setLeido(b.getAttribute('data-ep'), b.getAttribute('aria-pressed') !== 'true'); }); });
    pintarLeidos();

    // Banco de preguntas del tema (pestaña Test).
    var banco = null;
    function initBanco() {
      if (banco) return;
      var cont = $('#banco'), bar = $('#banco-bar');
      var res = $('#banco-res');
      function kpis() { $('#banco-cont').textContent = banco.contestadas() + ' / ' + T.preguntas.length; }
      banco = renderPreguntas(cont, T.preguntas, { onChange: kpis });
      kpis();
      $('#banco-corregir').addEventListener('click', function () {
        if (!banco.contestadas() && !confirm('No has contestado ninguna pregunta. ¿Corregir igualmente?')) return;
        var r = banco.corregir();
        res.textContent = fmtNota(r.nota); res.style.color = notaColor(r.nota);
        $('#banco-detalle').textContent = r.ok + ' aciertos · ' + r.ko + ' fallos · ' + r.blanco + ' en blanco';
        $('#banco-corregir').disabled = true;
        if (r.ok + r.ko > 0) guardarIntento({ tipo: 'banco', tema: n, total: r.total, ok: r.ok, ko: r.ko, blanco: r.blanco, nota: r.nota, dur: 0, preguntas: T.preguntas.map(function (_, i) { return [n, i]; }), resp: banco.respuestas.slice() });
      });
      $('#banco-reiniciar').addEventListener('click', function () {
        banco = null; res.textContent = '—'; res.style.color = ''; $('#banco-detalle').textContent = 'Cada error resta 1/3 de acierto';
        var nc = cont.cloneNode(false); cont.parentNode.replaceChild(nc, cont);
        var b2 = $('#banco-corregir'), b3 = b2.cloneNode(true); b3.disabled = false; b2.parentNode.replaceChild(b3, b2);
        var r2 = $('#banco-reiniciar'), r3 = r2.cloneNode(true); r2.parentNode.replaceChild(r3, r2);
        initBanco(); window.scrollTo({ top: $('#panel-test').offsetTop - 120 });
      });
    }

    // Casos con preguntas de opción múltiple (Tema 1).
    var casosHechos = false;
    function initCasosTest() {
      if (casosHechos || !T.casosTest) return; casosHechos = true;
      $$('[data-caso]').forEach(function (box) {
        var k = +box.getAttribute('data-caso'), c = T.casosTest[k];
        var api = renderPreguntas($('.caso-qs', box), c.preguntas, { prefix: 'Caso ' + (k + 1) + ' · Pregunta' });
        $('.caso-corregir', box).addEventListener('click', function (ev) {
          var r = api.corregir(); ev.target.disabled = true;
          $('.caso-res', box).textContent = r.ok + ' de ' + r.total + ' correctas · nota ' + fmtNota(r.nota);
        });
      });
    }

    // Imprimir / Guardar PDF: tema completo; si hay epígrafes leídos,
    // cabecera «Mi avance» y marca en cada epígrafe estudiado (variante δ).
    var printBtn = $('#imprimir');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    var abiertos = [];
    window.addEventListener('beforeprint', function () {
      var a = avanceTema(n);
      $$('.avance-print').forEach(function (e) { e.hidden = a.hechos === 0; e.textContent = 'Mi avance: ' + a.pct + ' % (' + a.hechos + ' de ' + a.total + ' epígrafes estudiados)'; });
      ['indice', 'contenido', 'diagramas', 'casos', 'fuentes'].forEach(function (k, i) { var p = $('#panel-' + k); if (p) { p.classList.add('print'); if (i === 0) p.classList.add('first'); } });
      abiertos = $$('details.solucion').filter(function (d) { return !d.open; });
      abiertos.forEach(function (d) { d.open = true; });
    });
    window.addEventListener('afterprint', function () {
      $$('.panel.print').forEach(function (p) { p.classList.remove('print', 'first'); });
      abiertos.forEach(function (d) { d.open = false; });
    });

    show(location.hash.slice(1).split('/')[0] || 'indice');
  }

  /* ══════════════════════════════════════════════════════════════
     APLICACIÓN (index.html): progreso, temario, test y estadísticas
     ══════════════════════════════════════════════════════════════ */
  function initApp() {
    var TEMAS = window.TEMAS || [];
    var datos = null, practico = null;
    function cargarPreguntas() {
      if (datos) return Promise.resolve(datos);
      return fetch(BASE + 'assets/data/preguntas.json' + '?v=' + VER).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { datos = d; return d; });
    }
    function cargarPractico() {
      if (practico) return Promise.resolve(practico);
      return fetch(BASE + 'assets/data/simulacro-practico.json' + '?v=' + VER).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { practico = d; return d; });
    }
    function pregunta(ref) {
      var p = ref[0] === 'sp' ? (practico && practico.preguntas[ref[1]]) : (datos && datos[ref[0]] && datos[ref[0]][ref[1]]);
      if (!p) return null;
      var o = { t: ref[0] }; for (var k in p) o[k] = p[k]; return o;
    }
    var TIPOS = { simteo: 'Simulacro teórico', simprac: 'Simulacro práctico', tema: 'Examen de tema', banco: 'Banco completo' };

    /* Router por #/ruta */
    var running = null;
    function route() {
      var h = location.hash.replace(/^#\/?/, ''), parts = h.split('/');
      var screen = parts[0] || 'inicio';
      if (running && screen !== 'examen-en-curso') {
        if (!confirm('Tienes un examen en curso. Si sales, se perderá. ¿Salir?')) { history.pushState(null, '', '#/examen-en-curso'); return; }
        stopRunner();
      }
      var map = { inicio: 'landing', progreso: 'progreso', temario: 'temario', test: 'test', 'simulacro-teorico': 'simteo', 'simulacro-practico': 'simprac', examenes: 'extemas', examen: 'extema', resultado: 'resultado', estadisticas: 'stats', 'examen-en-curso': 'runner' };
      var id = map[screen] || 'landing';
      if (id === 'runner' && !running) { location.replace('#/test'); return; }
      $$('.screen').forEach(function (s) { s.hidden = s.id !== 'screen-' + id; });
      var nav = { progreso: 'progreso', temario: 'temario', test: 'test', simteo: 'test', simprac: 'test', extemas: 'test', extema: 'test', resultado: 'test', runner: 'test', stats: 'stats' }[id];
      $$('.sidebar .sb-link').forEach(function (a) { if (a.getAttribute('data-nav') === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      document.body.classList.toggle('is-landing', id === 'landing');
      var sk = $('.skip-link'); if (sk) sk.setAttribute('href', id === 'landing' ? '#screen-landing' : '#contenido-principal');
      var render = { progreso: renderProgreso, temario: renderTemario, test: renderTestHub, simteo: function () { renderHistorial('simteo', '#hist-simteo'); }, simprac: function () { renderHistorial('simprac', '#hist-simprac'); }, extemas: renderExamenes, extema: function () { renderExamenTema(+parts[1]); }, resultado: function () { renderResultado(parts[1]); }, stats: renderStats }[id];
      if (render) render();
      var t = $('#screen-' + id + ' h1'); document.title = (t && id !== 'landing' ? t.textContent + ' · ' : '') + 'Temario TIC C1 · Ayuntamiento de Madrid';
      window.scrollTo(0, 0);
      var main = $('#screen-' + id + ' .main-body') || $('#screen-' + id); if (main && location.hash) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    }
    window.addEventListener('hashchange', route);

    /* Mi progreso */
    function renderProgreso() {
      var s = load(), totalEp = 0, hechos = 0, completos = 0, empezados = 0;
      TEMAS.forEach(function (t) { var a = avanceTema(t.n, s); totalEp += a.total; hechos += a.hechos; if (a.total && a.hechos >= a.total) completos++; else if (a.hechos) empezados++; });
      var pct = totalEp ? Math.round(hechos / totalEp * 100) : 0;
      var ints = s.intentos, sims = ints.filter(function (i) { return i.tipo === 'simteo' || i.tipo === 'simprac'; });
      var media = ints.length ? ints.reduce(function (a, i) { return a + i.nota; }, 0) / ints.length : null;
      $('#prog-stats').innerHTML =
        stat('Avance del temario', pct + ' %', '<div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:' + pct + '%"></div></div>')
        + stat('Temas completados', completos + ' <small>/ 40</small>', '<div class="stat-sub">' + empezados + ' en curso</div>')
        + stat('Tests realizados', String(ints.length), '<div class="stat-sub">' + sims.length + ' simulacros</div>')
        + stat('Nota media', media === null ? '—' : fmtNota(media), '<div class="stat-sub">sobre 10, con penalización</div>');
      var u = s.ultimo && TEMAS.find(function (t) { return t.n === s.ultimo.n; });
      var cont = $('#prog-continuar');
      if (u) {
        var a = avanceTema(u.n, s);
        cont.innerHTML = '<div class="card card-pad" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">'
          + '<div><div class="stat-label">Continuar donde lo dejaste</div><div style="font-size:15.5px;font-weight:700;margin-top:4px">Tema ' + u.n + ' · ' + esc(u.titulo) + '</div>'
          + '<div class="progress-bar" style="width:240px;max-width:100%;margin-top:8px"><div class="progress-fill" style="width:' + a.pct + '%"></div></div></div>'
          + '<a class="btn btn-azul" href="temas/tema-' + pad(u.n) + '.html">Continuar ' + icon('arrow-right') + '</a></div>';
      } else {
        cont.innerHTML = '<div class="card card-pad" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><div class="stat-label">Empieza por aquí</div><div style="font-size:15.5px;font-weight:700;margin-top:4px">Tema 1 · ' + esc(TEMAS[0].titulo) + '</div></div><a class="btn btn-azul" href="temas/tema-01.html">Empezar ' + icon('arrow-right') + '</a></div>';
      }
    }
    function stat(lbl, val, extra) { return '<div class="card stat-card"><div class="stat-label">' + lbl + '</div><div class="stat-value">' + val + '</div>' + (extra || '') + '</div>'; }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /* Temario en fichas */
    var filtro = { q: '', bloque: 'todos' };
    function fichaHTML(t, s, href) {
      var a = avanceTema(t.n, s), est = a.total && a.hechos >= a.total ? '<span class="badge badge-verde">' + icon('check', 'icon-sm') + ' Completado</span>' : a.hechos ? '<span class="badge badge-amber">En curso · ' + a.pct + ' %</span>' : '<span class="badge badge-gris">Sin empezar</span>';
      return '<a class="card card-link ficha" href="' + href + '"><div class="ficha-num">Tema ' + t.n + ' · Bloque ' + (t.parte === 1 ? 'I' : 'II') + '</div>'
        + '<div class="ficha-title">' + esc(t.titulo) + '</div>'
        + '<div class="progress-bar"><div class="progress-fill' + (a.pct === 100 ? ' verde' : '') + '" style="width:' + a.pct + '%"></div></div>'
        + '<div class="ficha-foot">' + est + '<span>' + t.nPreg + ' preguntas</span></div></a>';
    }
    function filtrar(list, s) {
      var q = filtro.q.trim().toLowerCase();
      return list.filter(function (t) {
        if (filtro.bloque === 'I' && t.parte !== 1) return false;
        if (filtro.bloque === 'II' && t.parte !== 2) return false;
        if (filtro.bloque === 'pendientes') { var a = avanceTema(t.n, s); if (a.total && a.hechos >= a.total) return false; }
        return !q || (t.n + ' ' + t.titulo + ' ' + t.oficial).toLowerCase().indexOf(q) > -1;
      });
    }
    function renderTemario() {
      var s = load(), out = '', l1 = filtrar(TEMAS.filter(function (t) { return t.parte === 1; }), s), l2 = filtrar(TEMAS.filter(function (t) { return t.parte === 2; }), s);
      if (l1.length) out += '<h2 class="group-title">Bloque I · Grupo I del programa (temas 1-10)</h2><div class="fichas">' + l1.map(function (t) { return fichaHTML(t, s, 'temas/tema-' + pad(t.n) + '.html'); }).join('') + '</div>';
      if (l2.length) out += '<h2 class="group-title">Bloque II · Grupo II del programa (temas 11-40)</h2><div class="fichas">' + l2.map(function (t) { return fichaHTML(t, s, 'temas/tema-' + pad(t.n) + '.html'); }).join('') + '</div>';
      $('#temario-fichas').innerHTML = out || '<div class="empty">Ningún tema coincide con la búsqueda.</div>';
    }
    $$('#screen-temario .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        filtro.bloque = c.getAttribute('data-f');
        $$('#screen-temario .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        renderTemario();
      });
    });
    var qIn = $('#temario-q'); if (qIn) qIn.addEventListener('input', function () { filtro.q = qIn.value; renderTemario(); });

    /* Hub de test */
    function renderTestHub() {
      var s = load();
      function n(t) { return s.intentos.filter(function (i) { return i.tipo === t; }).length; }
      $('#hub-simteo').textContent = n('simteo') + ' intentos realizados';
      $('#hub-simprac').textContent = n('simprac') + ' intentos realizados';
      $('#hub-extemas').textContent = n('tema') + ' exámenes de tema realizados';
    }

    /* Historiales */
    function filaHist(i, conTema) {
      return '<tr tabindex="0" data-href="#/resultado/' + i.id + '"><td>' + fmtFecha(i.fecha) + '</td>'
        + (conTema ? '<td>' + (i.tema ? 'Tema ' + i.tema : '') + '</td>' : '')
        + '<td>' + (i.dur ? fmtDur(i.dur) : '—') + '</td><td>' + i.ok + ' / ' + i.total + '</td>'
        + '<td class="nota" style="color:' + notaColor(i.nota) + '">' + fmtNota(i.nota) + '</td><td>' + notaBadge(i.nota) + '</td>'
        + '<td style="color:var(--azul);font-weight:700;font-size:12.5px;white-space:nowrap">Ver revisión ' + icon('chevron-right', 'icon-sm') + '</td></tr>';
    }
    function renderHistorial(tipo, sel, tema) {
      var list = load().intentos.filter(function (i) { return i.tipo === tipo && (!tema || i.tema === tema); }).reverse();
      var el = $(sel);
      el.innerHTML = list.length ? list.map(function (i) { return filaHist(i, false); }).join('') : '<tr><td colspan="6" class="empty">Todavía no hay intentos. Cuando hagas uno, aparecerá aquí con su revisión.</td></tr>';
      $$('tr[data-href]', el).forEach(function (tr) {
        tr.addEventListener('click', function () { location.hash = tr.getAttribute('data-href'); });
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.hash = tr.getAttribute('data-href'); });
      });
    }

    /* Exámenes por tema */
    function renderExamenes() {
      var s = load();
      $('#extemas-fichas').innerHTML = '<div class="fichas">' + TEMAS.map(function (t) {
        var ints = s.intentos.filter(function (i) { return i.tipo === 'tema' && i.tema === t.n; });
        var ult = ints.length ? ints[ints.length - 1] : null;
        return '<a class="card card-link ficha" href="#/examen/' + t.n + '"><div class="ficha-num">Tema ' + t.n + ' · Bloque ' + (t.parte === 1 ? 'I' : 'II') + '</div><div class="ficha-title">' + esc(t.titulo) + '</div>'
          + '<div class="ficha-foot"><span class="badge badge-gris">' + ints.length + ' intentos</span>' + (ult ? '<span style="font-weight:700;color:' + notaColor(ult.nota) + '">Última: ' + fmtNota(ult.nota) + '</span>' : '') + '</div></a>';
      }).join('') + '</div>';
    }
    function renderExamenTema(n) {
      var t = TEMAS.find(function (x) { return x.n === n; }); if (!t) { location.replace('#/examenes'); return; }
      $('#extema-crumb').textContent = 'Tema ' + n;
      $('#extema-badge').textContent = 'Tema ' + n + ' · Bloque ' + (t.parte === 1 ? 'I' : 'II');
      $('#extema-title').textContent = t.titulo;
      $('#extema-link').href = 'temas/tema-' + pad(n) + '.html';
      $('#extema-start').onclick = function () { empezar({ tipo: 'tema', tema: n }); };
      renderHistorial('tema', '#hist-extema', n);
    }

    /* Ejecución de un examen o simulacro */
    var timerId = null;
    function stopRunner() { running = null; if (timerId) clearInterval(timerId); timerId = null; window.onbeforeunload = null; }
    function empezar(cfg) {
      var p = cfg.tipo === 'simprac' ? cargarPractico() : cargarPreguntas();
      $$('.btn-empezar').forEach(function (b) { b.disabled = true; });
      p.then(function () {
        var refs = [], items, titulo, minutos, supuesto = null;
        if (cfg.tipo === 'tema') {
          refs = shuffle(datos[cfg.tema].map(function (_, i) { return [cfg.tema, i]; })).slice(0, 15);
          titulo = 'Examen de tema · Tema ' + cfg.tema; minutos = 15;
        } else if (cfg.tipo === 'simteo') {
          // 90 preguntas de los dos grupos del programa: 2 por tema + 10 de temas al azar.
          TEMAS.forEach(function (t) { shuffle(datos[t.n].map(function (_, i) { return [t.n, i]; })).slice(0, 2).forEach(function (r) { refs.push(r); }); });
          var extra = shuffle(TEMAS.map(function (t) { return t.n; })).slice(0, 10);
          extra.forEach(function (tn) {
            var usadas = refs.filter(function (r) { return r[0] === tn; }).map(function (r) { return r[1]; });
            var libres = datos[tn].map(function (_, i) { return i; }).filter(function (i) { return usadas.indexOf(i) === -1; });
            refs.push([tn, shuffle(libres)[0]]);
          });
          refs = shuffle(refs); titulo = 'Simulacro · Parte teórica'; minutos = 90;
        } else {
          refs = practico.preguntas.map(function (_, i) { return ['sp', i]; });
          supuesto = practico; titulo = 'Simulacro · Parte práctica'; minutos = 60;
        }
        items = refs.map(pregunta);
        running = { cfg: cfg, refs: refs, items: items, inicio: Date.now(), limite: minutos * 60 };
        $('#runner-title').textContent = titulo;
        $('#runner-crumb').textContent = titulo;
        var sp = $('#runner-supuesto');
        if (supuesto) { sp.hidden = false; sp.innerHTML = '<h2>' + esc(supuesto.titulo) + '</h2>' + supuesto.enunciado.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); }
        else { sp.hidden = true; sp.innerHTML = ''; }
        var api = renderPreguntas($('#runner-qs'), items, { onChange: function (a) { $('#runner-cont').textContent = a.contestadas() + ' / ' + items.length; }, tag: cfg.tipo === 'simteo' ? function (it) { return 'Tema ' + it.t; } : null });
        running.api = api;
        $('#runner-cont').textContent = '0 / ' + items.length;
        tick(); timerId = setInterval(tick, 1000);
        window.onbeforeunload = function () { return 'Tienes un examen en curso.'; };
        location.hash = '#/examen-en-curso';
      }).catch(function () {
        alert('No se han podido cargar las preguntas. Comprueba la conexión y vuelve a intentarlo.');
      }).then(function () { $$('.btn-empezar').forEach(function (b) { b.disabled = false; }); });
    }
    function tick() {
      if (!running) return;
      var pasado = Math.floor((Date.now() - running.inicio) / 1000), resta = Math.max(0, running.limite - pasado);
      var m = Math.floor(resta / 60), s = resta % 60, el = $('#runner-timer');
      el.lastChild.textContent = ' ' + m + ':' + (s < 10 ? '0' : '') + s;
      el.classList.toggle('low', resta <= 300);
      if (resta === 0) { entregar(true); }
    }
    function entregar(porTiempo) {
      if (!running) return;
      if (!porTiempo) {
        var pend = running.items.length - running.api.contestadas();
        if (!confirm(pend ? 'Te quedan ' + pend + ' preguntas en blanco. ¿Entregar el examen?' : '¿Entregar el examen?')) return;
      }
      var r = running.api.corregir();
      var dur = Math.min(running.limite, Math.floor((Date.now() - running.inicio) / 1000));
      var it = guardarIntento({ tipo: running.cfg.tipo, tema: running.cfg.tema || null, total: r.total, ok: r.ok, ko: r.ko, blanco: r.blanco, nota: r.nota, dur: dur, preguntas: running.refs, resp: running.api.respuestas.slice(), porTiempo: !!porTiempo });
      stopRunner();
      if (porTiempo) alert('Se ha acabado el tiempo. El examen se ha entregado automáticamente.');
      location.hash = '#/resultado/' + it.id;
    }
    $('#runner-entregar').addEventListener('click', function () { entregar(false); });
    $('#runner-entregar-2').addEventListener('click', function () { entregar(false); });
    $$('[data-empezar]').forEach(function (b) { b.addEventListener('click', function () { empezar({ tipo: b.getAttribute('data-empezar') }); }); });

    /* Resultado y revisión */
    function renderResultado(id) {
      var i = load().intentos.find(function (x) { return x.id === id; });
      if (!i) { $('#res-body').innerHTML = '<div class="empty">No se encuentra este intento en este navegador.</div>'; return; }
      var need = i.preguntas.some(function (r) { return r[0] === 'sp'; }) ? cargarPractico() : cargarPreguntas();
      $('#res-body').innerHTML = '<div class="empty">Cargando la revisión…</div>';
      need.then(function () {
        var col = notaColor(i.nota), tit = TIPOS[i.tipo] + (i.tema ? ' · Tema ' + i.tema : '');
        $('#res-title').textContent = 'Resultado · ' + tit;
        var html = '<p class="page-sub">' + fmtFecha(i.fecha) + (i.dur ? ' · ' + fmtDur(i.dur) : '') + (i.porTiempo ? ' · entregado al agotarse el tiempo' : '') + '</p>'
          + '<div class="card result-hero"><div class="result-ring" style="border-color:' + col + ';background:#fff"><div class="rn" style="color:' + col + '">' + fmtNota(i.nota) + '</div><div class="rd">sobre 10</div></div>'
          + '<div style="flex:1;min-width:260px"><div class="result-breakdown">'
          + '<div class="rb-item"><div class="rb-num" style="color:var(--verde)">' + i.ok + '</div><div class="rb-lbl">Aciertos</div></div>'
          + '<div class="rb-item"><div class="rb-num" style="color:var(--rojo)">' + i.ko + '</div><div class="rb-lbl">Fallos</div></div>'
          + '<div class="rb-item"><div class="rb-num" style="color:var(--g500)">' + i.blanco + '</div><div class="rb-lbl">En blanco</div></div></div>'
          + '<p class="result-note">Calificación como en el examen: cada acierto suma, cada error resta 1/3 de acierto y las preguntas en blanco no puntúan. Para aprobar cada parte hacen falta 5 puntos.</p></div></div>'
          + '<h2 class="section-title">Revisión pregunta a pregunta</h2><div id="res-qs"></div>'
          + '<div style="display:flex;gap:12px;margin-top:22px;flex-wrap:wrap">'
          + (i.tipo === 'tema' ? '<a class="btn btn-azul" href="#/examen/' + i.tema + '">' + icon('refresh') + ' Otro examen de este tema</a>' : i.tipo === 'simteo' ? '<a class="btn btn-azul" href="#/simulacro-teorico">' + icon('refresh') + ' Volver al simulacro</a>' : i.tipo === 'simprac' ? '<a class="btn btn-azul" href="#/simulacro-practico">' + icon('refresh') + ' Volver al simulacro</a>' : '<a class="btn btn-azul" href="temas/tema-' + pad(i.tema) + '.html#test">Volver al tema</a>')
          + '<a class="btn btn-ghost" href="#/test">Ir a Test</a></div>';
        $('#res-body').innerHTML = html;
        var items = i.preguntas.map(pregunta).filter(Boolean);
        var api = renderPreguntas($('#res-qs'), items, { tag: i.tipo === 'simteo' ? function (it) { return 'Tema ' + it.t; } : null });
        i.resp.forEach(function (r, k) {
          api.respuestas[k] = r;
          var qd = $('#res-qs').children[k]; if (!qd) return;
          $$('.q-opt', qd).forEach(function (x) { x.setAttribute('aria-pressed', String(+x.getAttribute('data-j') === r)); });
        });
        api.corregir();
      }).catch(function () { $('#res-body').innerHTML = '<div class="empty">No se ha podido cargar la revisión.</div>'; });
    }

    /* Estadísticas */
    function renderStats() {
      var s = load(), ints = s.intentos;
      function media(l) { return l.length ? l.reduce(function (a, i) { return a + i.nota; }, 0) / l.length : null; }
      var teo = ints.filter(function (i) { return i.tipo === 'simteo'; }), pra = ints.filter(function (i) { return i.tipo === 'simprac'; });
      var totalEp = 0, hechos = 0, completos = 0;
      TEMAS.forEach(function (t) { var a = avanceTema(t.n, s); totalEp += a.total; hechos += a.hechos; if (a.total && a.hechos >= a.total) completos++; });
      $('#stats-cards').innerHTML =
        stat('Temas completados', completos + ' <small>/ 40</small>', '<div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:' + (totalEp ? Math.round(hechos / totalEp * 100) : 0) + '%"></div></div>')
        + stat('Media simulacro teórico', media(teo) === null ? '—' : fmtNota(media(teo)), '<div class="stat-sub">' + teo.length + ' intentos</div>')
        + stat('Media simulacro práctico', media(pra) === null ? '—' : fmtNota(media(pra)), '<div class="stat-sub">' + pra.length + ' intentos</div>')
        + stat('Tests realizados', String(ints.length), '<div class="stat-sub">exámenes, simulacros y bancos</div>');
      var porTema = TEMAS.map(function (t) { var l = ints.filter(function (i) { return i.tema === t.n; }); return { t: t, m: media(l), n: l.length }; }).filter(function (x) { return x.n; });
      $('#stats-temas').innerHTML = porTema.length ? porTema.map(function (x) { return barra('Tema ' + x.t.n, x.m); }).join('') : '<div class="empty">Haz exámenes de tema o corrige el banco de preguntas de un tema para ver tu rendimiento aquí.</div>';
      var sims = teo.concat(pra).sort(function (a, b) { return a.fecha - b.fecha; }).slice(-10);
      $('#stats-sims').innerHTML = sims.length ? sims.map(function (i) { return barra((i.tipo === 'simteo' ? 'Teórico' : 'Práctico') + ' ' + new Date(i.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), i.nota); }).join('') : '<div class="empty">Aún no has hecho ningún simulacro.</div>';
    }
    function barra(lbl, nota) {
      var w = Math.max(4, Math.round(nota * 10));
      return '<div class="bar-row"><div class="bar-label">' + esc(lbl) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + w + '%;background:' + notaColor(nota) + '">' + fmtNota(nota) + '</div></div></div>';
    }
    var borrar = $('#borrar-datos');
    if (borrar) borrar.addEventListener('click', function () {
      if (!confirm('Se borrarán de este navegador tu avance de lectura y todos tus intentos. No se puede deshacer. ¿Continuar?')) return;
      store.clear(); renderStats();
    });

    route();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initChrome();
    var page = document.body.getAttribute('data-page');
    if (page === 'tema') initTema();
    if (page === 'app') initApp();
  });
})();
