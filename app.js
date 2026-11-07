'use strict';

/* =================================================================
   Configuración y utilidades
   ================================================================= */
const API_URL = (window.BOCATAS_CONFIG && window.BOCATAS_CONFIG.API_URL) || '';
const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';

// Prefijo: en GitHub Pages todos tus repos comparten origen (usuario.github.io)
const PFX = 'bocatas:';
const LS = {
  get(k) { try { return localStorage.getItem(PFX + k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(PFX + k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(PFX + k); } catch (e) {} },
};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** Llama a la API de Apps Script. Sin cabeceras propias → petición "simple", sin preflight CORS. */
async function call(action, ...args) {
  if (!navigator.onLine) throw new Error('Sin conexión.');
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, args }), redirect: 'follow' });
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor. Revisa la conexión o la URL de config.js.');
  }
  if (!res.ok) throw new Error('Error del servidor (' + res.status + ').');
  let json;
  try { json = await res.json(); }
  catch (e) { throw new Error('Respuesta inesperada del servidor. ¿La aplicación web tiene acceso "Cualquier usuario"?'); }
  if (!json.ok) throw new Error(json.error || 'Error desconocido.');
  return json.data;
}

function errMsg(e) { return String((e && e.message) || e); }
function flash(text, type) {
  $('#msg').innerHTML = text ? `<div class="msg ${type || 'ok'}">${esc(text)}</div>` : '';
  if (text && type !== 'err') setTimeout(() => { if ($('#msg').textContent === text) flash(''); }, 4000);
}
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fechaCorta(iso) { const [, m, d] = iso.split('-'); return d + '/' + m; }
const esErrorDeCodigo = m => /código .*incorrecto/i.test(m);

/* ---------- pantalla de código ---------- */
function pantallaCodigo(clave, titulo, alEntrar) {
  $('#app').innerHTML = `
    <form id="fc" class="card">
      <label class="lbl" for="code">${esc(titulo)}</label>
      <div class="row">
        <input id="code" type="password" class="grow" autocomplete="current-password" autocapitalize="off" spellcheck="false" required>
        <button type="submit">Entrar</button>
      </div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">Solo hay que ponerlo la primera vez en este dispositivo.</p>
    </form>`;
  $('#code').focus();
  $('#fc').onsubmit = ev => {
    ev.preventDefault();
    LS.set(clave, $('#code').value.trim());
    flash('');
    alEntrar();
  };
}

/* =================================================================
   VISTA COMPAÑEROS
   ================================================================= */
const U = { code: '', nombre: LS.get('nombre'), data: null };

async function cargarUsuario() {
  U.code = LS.get('team_code');
  if (!U.code) return pantallaCodigo('team_code', 'Código del equipo', cargarUsuario);
  try {
    U.data = await call('inicio', U.code, U.nombre);
    renderUsuario();
  } catch (e) {
    const m = errMsg(e);
    if (esErrorDeCodigo(m)) { LS.del('team_code'); flash(m, 'err'); return pantallaCodigo('team_code', 'Código del equipo', cargarUsuario); }
    flash(m, 'err');
    if (!U.data) $('#app').innerHTML = '<div class="card"><button id="reintentar" class="sec">Reintentar</button></div>';
    const r = $('#reintentar'); if (r) r.onclick = cargarUsuario;
  }
}

function renderUsuario() {
  const d = U.data;
  const mio = d.miPedido;
  $('#subtitulo').textContent = fechaLarga(d.hoy);
  const puedeEditar = d.abierto && !(mio && mio.pagado);

  $('#app').innerHTML = `
    <div class="card row spread">
      <span class="estado ${d.abierto ? 'on' : 'off'}">${d.abierto ? 'Pedidos abiertos' : 'Pedidos cerrados'}</span>
      <button class="link" id="recargar">Actualizar</button>
    </div>

    <div class="card">
      <label class="lbl" for="nombre">Tu nombre</label>
      <input id="nombre" type="text" maxlength="40" value="${esc(U.nombre)}" placeholder="Ej. Lucía M." autocomplete="name">
    </div>

    ${mio ? `
    <div class="card">
      <span class="lbl">Tu pedido de hoy</span>
      <div class="big">${esc(mio.bocadillo)}</div>
      <div class="muted">${eur(mio.precio)}${mio.notas ? ' · ' + esc(mio.notas) : ''}${mio.pagado ? ' · Pagado' : ''}</div>
    </div>` : ''}

    ${d.menu.length ? `
    <form id="fp" class="card">
      <span class="lbl">${mio ? 'Cambiar bocadillo' : 'Elige tu bocadillo'}</span>
      <div class="menu">
        ${d.menu.map(m => `
          <label class="op${mio && mio.bocadillo === m.nombre ? ' sel' : ''}">
            <input type="radio" name="b" value="${esc(m.nombre)}" ${mio && mio.bocadillo === m.nombre ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'}>
            <span><span class="n">${esc(m.nombre)}</span>${m.descripcion ? `<span class="d">${esc(m.descripcion)}</span>` : ''}</span>
            <span class="p">${eur(m.precio)}</span>
          </label>`).join('')}
      </div>
      <label class="lbl" for="notas" style="margin-top:16px">Notas (opcional)</label>
      <textarea id="notas" maxlength="120" placeholder="Sin tomate, pan integral…" ${puedeEditar ? '' : 'disabled'}>${esc(mio ? mio.notas : '')}</textarea>
      <div class="row" style="margin-top:12px">
        <button type="submit" class="grow" ${puedeEditar ? '' : 'disabled'}>${mio ? 'Actualizar pedido' : 'Hacer pedido'}</button>
        ${mio && puedeEditar ? '<button type="button" class="sec" id="cancelar">Cancelar pedido</button>' : ''}
      </div>
      ${!d.abierto ? '<p class="muted" style="font-size:13px;margin:10px 0 0">Ahora mismo no se aceptan pedidos.</p>' : ''}
    </form>` : '<div class="card muted">El menú está vacío.</div>'}

    ${U.nombre ? `
    <div class="card">
      <span class="lbl">Pendiente de pagar</span>
      <div class="big">${eur(d.deuda)}</div>
      ${d.pendientes.length ? `<ul class="plain">${d.pendientes.map(p =>
        `<li><span>${fechaCorta(p.fecha)} · ${esc(p.bocadillo)}</span><span>${eur(p.precio)}</span></li>`).join('')}</ul>`
        : '<p class="muted" style="margin:6px 0 0;font-size:14px">Estás al día.</p>'}
    </div>` : ''}

    <p style="text-align:center"><button class="link" id="salir">Cambiar código del equipo</button></p>
  `;

  $('#recargar').onclick = cargarUsuario;
  $('#salir').onclick = () => { LS.del('team_code'); U.data = null; cargarUsuario(); };
  $('#nombre').onchange = () => {
    U.nombre = $('#nombre').value.trim().replace(/\s+/g, ' ');
    LS.set('nombre', U.nombre);
    cargarUsuario();
  };
  document.querySelectorAll('.op input').forEach(r => r.onchange = () => {
    document.querySelectorAll('.op').forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
  });

  const fp = $('#fp');
  if (fp) fp.onsubmit = async ev => {
    ev.preventDefault();
    U.nombre = $('#nombre').value.trim().replace(/\s+/g, ' ');
    if (!U.nombre) { flash('Escribe tu nombre antes de pedir.', 'err'); $('#nombre').focus(); return; }
    LS.set('nombre', U.nombre);
    const sel = document.querySelector('input[name=b]:checked');
    if (!sel) { flash('Elige un bocadillo.', 'err'); return; }
    const btn = fp.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      U.data = await call('pedir', U.code, U.nombre, sel.value, $('#notas').value);
      renderUsuario();
      flash('¡Pedido guardado!', 'ok');
    } catch (e) { flash(errMsg(e), 'err'); btn.disabled = false; btn.textContent = 'Reintentar'; }
  };

  const cancelar = $('#cancelar');
  if (cancelar) cancelar.onclick = async () => {
    if (cancelar.dataset.confirm !== '1') { cancelar.dataset.confirm = '1'; cancelar.textContent = '¿Seguro? Pulsa otra vez'; return; }
    cancelar.disabled = true;
    try {
      U.data = await call('cancelar', U.code, U.nombre);
      renderUsuario();
      flash('Pedido cancelado.', 'ok');
    } catch (e) { flash(errMsg(e), 'err'); cancelar.disabled = false; }
  };
}

/* =================================================================
   VISTA ADMINISTRADOR (?admin=1)
   ================================================================= */
const A = { code: '', data: null };

async function cargarAdmin(silencioso) {
  A.code = LS.get('admin_code');
  if (!A.code) return pantallaCodigo('admin_code', 'Código de administrador', () => cargarAdmin());
  try {
    A.data = await call('admin', A.code);
    renderAdmin();
  } catch (e) {
    const m = errMsg(e);
    if (esErrorDeCodigo(m)) { LS.del('admin_code'); flash(m, 'err'); return pantallaCodigo('admin_code', 'Código de administrador', () => cargarAdmin()); }
    if (!silencioso) flash(m, 'err');
    if (!A.data) {
      $('#app').innerHTML = '<div class="card"><button id="reintentar" class="sec">Reintentar</button></div>';
      $('#reintentar').onclick = () => cargarAdmin();
    }
  }
}

async function accionAdmin(action, ...args) {
  try {
    A.data = await call(action, A.code, ...args);
    renderAdmin();
  } catch (e) { flash(errMsg(e), 'err'); cargarAdmin(true); }
}

function renderAdmin() {
  const d = A.data;
  document.title = 'Bocadillos · Admin';
  $('#titulo').textContent = 'Panel de bocadillos';
  $('#subtitulo').textContent = fechaLarga(d.hoy);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(d.texto);

  $('#app').innerHTML = `
    <div class="card row spread">
      <span class="estado ${d.abierto ? 'on' : 'off'}">${d.abierto ? 'Pedidos abiertos' : 'Pedidos cerrados'}</span>
      <div class="row">
        <button class="sec small" id="recargar">Actualizar</button>
        <button class="small" id="toggle">${d.abierto ? 'Cerrar pedidos' : 'Abrir pedidos'}</button>
      </div>
    </div>

    <div class="card">
      <span class="lbl">Para el restaurante</span>
      ${d.texto ? `
        <pre>${esc(d.texto)}</pre>
        <div class="row spread">
          <div class="row">
            <button class="small" id="copiar">Copiar</button>
            <a class="btn sec small" href="${wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
          </div>
          <span>Total: <strong>${eur(d.total)}</strong></span>
        </div>` : '<p class="muted" style="margin:0">Todavía no hay pedidos hoy.</p>'}
    </div>

    <div class="card">
      <span class="lbl">Pedidos de hoy (${d.pedidos.length})</span>
      ${d.pedidos.length ? `
      <table>
        <thead><tr><th>Nombre</th><th>Bocadillo</th><th class="num">€</th><th class="num">Pagado</th></tr></thead>
        <tbody>${d.pedidos.map(p => `
          <tr>
            <td>${esc(p.nombre)}</td>
            <td>${esc(p.bocadillo)}${p.notas ? `<br><span class="muted">${esc(p.notas)}</span>` : ''}</td>
            <td class="num">${eur(p.precio)}</td>
            <td class="num"><input type="checkbox" class="pag" data-id="${esc(p.id)}" ${p.pagado ? 'checked' : ''} aria-label="Pagado"></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p class="muted" style="margin:0">—</p>'}
    </div>

    <div class="card">
      <div class="row spread"><span class="lbl" style="margin:0">Pendiente de cobro</span><strong>${eur(d.totalPendiente)}</strong></div>
      ${d.deudas.length ? `
      <table style="margin-top:8px">
        <thead><tr><th>Nombre</th><th class="num">Días</th><th class="num">Debe</th><th></th></tr></thead>
        <tbody>${d.deudas.map((x, i) => `
          <tr>
            <td>${esc(x.nombre)}</td>
            <td class="num">${x.dias}</td>
            <td class="num"><strong>${eur(x.total)}</strong></td>
            <td class="num"><button class="sec small cobrar" data-i="${i}">Cobrado</button></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p class="muted" style="margin:6px 0 0">Nadie debe nada.</p>'}
    </div>

    <p style="text-align:center"><button class="link" id="salir">Cerrar sesión de admin</button></p>
  `;

  $('#recargar').onclick = () => cargarAdmin();
  $('#salir').onclick = () => { LS.del('admin_code'); A.data = null; cargarAdmin(); };
  $('#toggle').onclick = ev => { ev.target.disabled = true; accionAdmin('abrir', !d.abierto); };

  document.querySelectorAll('.pag').forEach(cb => cb.onchange = () => {
    cb.disabled = true;
    accionAdmin('pagado', cb.dataset.id, cb.checked);
  });

  document.querySelectorAll('.cobrar').forEach(b => b.onclick = () => {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Confirmar?'; return; }
    b.disabled = true;
    accionAdmin('pagarTodo', d.deudas[Number(b.dataset.i)].nombre);
  });

  const copiar = $('#copiar');
  if (copiar) copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(d.texto); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = d.texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    copiar.textContent = '¡Copiado!';
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2000);
  };
}

/* =================================================================
   PWA: service worker, instalación y estado de red
   ================================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

let promptInstalar = null;
window.addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  promptInstalar = ev;
  $('#instalar').classList.remove('hidden');
});
$('#instalar').onclick = async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice.catch(() => {});
  promptInstalar = null;
  $('#instalar').classList.add('hidden');
};

function estadoRed() { $('#offline').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', () => { estadoRed(); IS_ADMIN ? cargarAdmin(true) : cargarUsuario(); });
window.addEventListener('offline', estadoRed);

// Al volver a la app (p. ej. desde otra pestaña o tras bloquear el móvil), refresca los datos
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !navigator.onLine) return;
  if (IS_ADMIN && A.data) cargarAdmin(true);
  else if (!IS_ADMIN && U.data) cargarUsuario();
});

/* =================================================================
   Arranque
   ================================================================= */
estadoRed();
if (!API_URL || /PEGA_AQUI/.test(API_URL)) {
  $('#app').innerHTML = '<div class="card"><strong>Falta configurar la app.</strong><p class="muted" style="margin:6px 0 0">Edita <code>config.js</code> y pon la URL de tu aplicación web de Apps Script (termina en <code>/exec</code>).</p></div>';
} else if (IS_ADMIN) {
  cargarAdmin();
  setInterval(() => { if (!document.hidden && navigator.onLine && LS.get('admin_code')) cargarAdmin(true); }, 60000);
} else {
  cargarUsuario();
}
