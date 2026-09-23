/* V2H Studio — visual canvas editor
 * Ported from the original client-only builder, upgraded with:
 * server project sync, one-click live publishing, live data lists,
 * opacity + z-order controls, canvas background picker.
 */
'use strict';

const AN = {none:{l:'None',c:''},fadeIn:{l:'Fade In',c:'@keyframes fadeIn{from{opacity:0}to{opacity:1}}'},fadeOut:{l:'Fade Out',c:'@keyframes fadeOut{from{opacity:1}to{opacity:0}}'},slideLeft:{l:'Slide Left',c:'@keyframes slideLeft{from{transform:translateX(-120px);opacity:0}to{transform:translateX(0);opacity:1}}'},slideRight:{l:'Slide Right',c:'@keyframes slideRight{from{transform:translateX(120px);opacity:0}to{transform:translateX(0);opacity:1}}'},slideUp:{l:'Slide Up',c:'@keyframes slideUp{from{transform:translateY(80px);opacity:0}to{transform:translateY(0);opacity:1}}'},slideDown:{l:'Slide Down',c:'@keyframes slideDown{from{transform:translateY(-80px);opacity:0}to{transform:translateY(0);opacity:1}}'},bounceIn:{l:'Bounce In',c:'@keyframes bounceIn{0%{transform:scale(0);opacity:0}50%{transform:scale(1.15)}70%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}'},rotateIn:{l:'Rotate In',c:'@keyframes rotateIn{from{transform:rotate(-200deg) scale(0);opacity:0}to{transform:rotate(0) scale(1);opacity:1}}'},pulse:{l:'Pulse',c:'@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}'},shake:{l:'Shake',c:'@keyframes shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}30%{transform:translateX(8px)}45%{transform:translateX(-6px)}60%{transform:translateX(6px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}}'},float:{l:'Float',c:'@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}'},scaleUp:{l:'Scale Up',c:'@keyframes scaleUp{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}'},swing:{l:'Swing',c:'@keyframes swing{20%{transform:rotate(15deg)}40%{transform:rotate(-10deg)}60%{transform:rotate(5deg)}80%{transform:rotate(-5deg)}100%{transform:rotate(0)}}'},flash:{l:'Flash',c:'@keyframes flash{0%,50%,100%{opacity:1}25%,75%{opacity:0}}'},rubberBand:{l:'Rubber Band',c:'@keyframes rubberBand{0%{transform:scaleX(1)}30%{transform:scaleX(1.25) scaleY(.75)}40%{transform:scaleX(.75) scaleY(1.25)}50%{transform:scaleX(1.15) scaleY(.85)}65%{transform:scaleX(.95) scaleY(1.05)}75%{transform:scaleX(1.05) scaleY(.95)}100%{transform:scaleX(1) scaleY(1)}}'},zoomOut:{l:'Zoom Out',c:'@keyframes zoomOut{from{transform:scale(1.5);opacity:0}to{transform:scale(1);opacity:1}}'}};
{ let c = ''; Object.values(AN).forEach(a => { if (a.c) c += a.c + '\n'; }); const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }

function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function freshState() {
  return { els: [], pages: [{ id: 'index', name: 'Home' }], activePageId: 'index', sel: null, mode: 'select', fc: '#ffffff', sc: '#000000', sw: 2, fs: 32, bg: '#ffffff', nid: 1, undo: [], redo: [], grid: true, snap: true, exCode: '', gesture: 'IDLE', projectId: null, serverId: null, projectName: 'Untitled', dirty: false };
}
let S = freshState();
const IX = { pid: -1, dx: 0, dy: 0, pts: new Map(), pinchD: 0, pinchW: 0, pinchH: 0, pinchCX: 0, pinchCY: 0, pinchIP: null, pinchIL: null, rh: '', rs: {}, ep: '', fhPts: [], sbShape: null, txPos: null };
let collCache = [];

const ws = document.getElementById('ws'), svgO = document.getElementById('svgO'), so = document.getElementById('so'), lL = document.getElementById('lL'), aP = document.getElementById('aP'), fSw = document.getElementById('fSw'), sSw = document.getElementById('sSw'), ghost = document.getElementById('dragGhost'), tm = document.getElementById('txtMeasure'), ctxBar = document.getElementById('ctxBar');

/* ---------------- sync indicator & autosave ---------------- */

function uSync(kind) {
  const dot = document.getElementById('syncDot');
  const map = {
    local: '<i class="fas fa-hard-drive"></i> local',
    saved: '<i class="fas fa-cloud" style="color:var(--tl)"></i> saved',
    saving: '<i class="fas fa-cloud-arrow-up"></i> saving…',
    dirty: '<i class="fas fa-cloud"></i> unsaved'
  };
  dot.innerHTML = map[kind] || map.local;
}
setInterval(() => {
  if (S.serverId && S.dirty && V2H.isAuthed() && S.gesture === 'IDLE') saveProject();
}, 20000);
window.addEventListener('pagehide', () => {
  if (S.serverId && S.dirty && V2H.isAuthed()) {
    getActivePage().els = S.els;
    try {
      fetch('/api/projects/' + S.serverId, {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + V2H.state.token },
        body: JSON.stringify({ state: serializeState() })
      }).catch(() => {});
    } catch (e) { /* best effort */ }
  }
});
function serializeState() {
  return JSON.parse(JSON.stringify(Object.assign({}, S, { undo: [], redo: [], sel: null, gesture: 'IDLE', dirty: false })));
}

/* ---------------- prompts / color pickers ---------------- */

let promptCallback = null;
function showPrompt(title, val, cb) { document.getElementById('promptTitle').textContent = title; document.getElementById('promptInput').value = val; document.getElementById('promptM').style.display = 'flex'; promptCallback = cb; setTimeout(() => document.getElementById('promptInput').focus(), 50); }
function submitPrompt() { const v = document.getElementById('promptInput').value.trim(); if (v && promptCallback) promptCallback(v); document.getElementById('promptM').style.display = 'none'; }
function closePrompt() { document.getElementById('promptM').style.display = 'none'; promptCallback = null; }
document.getElementById('promptInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPrompt(); if (e.key === 'Escape') closePrompt(); });

let colorTarget = null;
function openColorPicker(target) {
  colorTarget = target; let currentColor = '#ffffff';
  if (target === 'fill') currentColor = S.sel ? gel(S.sel).fill : S.fc;
  if (target === 'stroke') currentColor = S.sel ? gel(S.sel).stroke : S.sc;
  if (target === 'bg') currentColor = S.bg;
  document.getElementById('colorTitle').textContent = 'Pick ' + target + ' Color';
  document.getElementById('colorWheel').value = currentColor;
  document.getElementById('colorHex').value = currentColor.replace('#', '').toUpperCase();
  document.getElementById('colorM').style.display = 'flex';
}
document.getElementById('colorWheel').addEventListener('input', e => { document.getElementById('colorHex').value = e.target.value.replace('#', '').toUpperCase(); applyColor(e.target.value); });
function updateColorFromHex(val) { if (val.length === 6 || val.length === 3) { const fullVal = '#' + val; document.getElementById('colorWheel').value = fullVal; applyColor(fullVal); } }
function applyColor(val) {
  if (colorTarget === 'fill') { if (S.sel) { uProp(S.sel, 'fill', val); document.getElementById('ctxFillSw').style.background = val; } else { S.fc = val; fSw.style.background = val; } }
  else if (colorTarget === 'stroke') { if (S.sel) { uProp(S.sel, 'stroke', val); document.getElementById('ctxStrokeSw').style.background = val; } else { S.sc = val; sSw.style.background = val; } }
  else if (colorTarget === 'bg') chgBg(val);
}
function closeColorPicker() { document.getElementById('colorM').style.display = 'none'; }
function chgBgPrompt() { openColorPicker('bg'); }

/* ---------------- links ---------------- */

function openLinkMenu() {
  const el = gel(S.sel); if (!el) return;
  document.getElementById('linkHref').value = el.href || '';
  document.getElementById('linkAnchor').value = el.anchorId || '';
  document.getElementById('linkM').style.display = 'flex';
}
function closeLinkMenu() { document.getElementById('linkM').style.display = 'none'; }
function setLinkHref(val) { const el = gel(S.sel); if (el) { el.href = val; S.dirty = true; uEl(el); V2H.toast('Link updated', 'ok'); } }
function setLinkAnchor(val) { const el = gel(S.sel); if (el) { el.anchorId = val; S.dirty = true; uEl(el); V2H.toast('Anchor ID set', 'ok'); } }

/* ---------------- pages ---------------- */

function getActivePage() { return S.pages.find(p => p.id === S.activePageId); }
function renderPagesList() {
  const list = document.getElementById('pageList');
  list.innerHTML = S.pages.map(p => `
    <div class="li ${p.id === S.activePageId ? 'on' : ''}" onclick="switchPage('${p.id}')">
      <span class="ic"><i class="fas fa-file"></i></span>
      <span class="nm">${escHtml(p.name)}.html</span>
      ${S.pages.length > 1 ? `<span class="dl" onclick="event.stopPropagation();deletePage('${p.id}')"><i class="fas fa-xmark"></i></span>` : ''}
    </div>`).join('');
}
function addPage() {
  showPrompt('New Page Name', 'page', name => {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!id || S.pages.find(p => p.id === id)) { V2H.toast('Page already exists', 'er'); return; }
    getActivePage().els = S.els;
    S.pages.push({ id, name, els: [] });
    S.activePageId = id; S.els = []; S.dirty = true;
    ws.querySelectorAll('.we, g').forEach(e => e.remove());
    desel(); renderPagesList();
    V2H.toast('Page added', 'ok');
  });
}
function switchPage(id) {
  if (id === S.activePageId) return;
  getActivePage().els = S.els;
  S.activePageId = id;
  S.els = getActivePage().els || [];
  ws.querySelectorAll('.we, g').forEach(e => e.remove());
  S.els.forEach(rEl);
  desel(); renderPagesList();
}
function deletePage(id) {
  if (S.pages.length <= 1) return;
  S.pages = S.pages.filter(p => p.id !== id); S.dirty = true;
  if (S.activePageId === id) {
    S.activePageId = S.pages[0].id;
    S.els = S.pages[0].els || [];
    ws.querySelectorAll('.we, g').forEach(e => e.remove());
    S.els.forEach(rEl);
    desel();
  }
  renderPagesList();
  V2H.toast('Page deleted', 'ok');
}

/* ---------------- project persistence (cloud + local) ---------------- */

function getLocalProjects() { return JSON.parse(localStorage.getItem('v2h_projects') || '[]'); }
function setLocalProjects(p) { localStorage.setItem('v2h_projects', JSON.stringify(p)); }

function newProject(skipConfirm) {
  S = freshState();
  ws.style.backgroundColor = S.bg;
  ws.querySelectorAll('.we, g').forEach(e => e.remove());
  desel();
  document.getElementById('projLabel').textContent = 'Untitled';
  hidePublishBar();
  uSync(V2H.isAuthed() ? 'saved' : 'local');
  history.replaceState(null, '', '/studio.html');
  renderPagesList();
}
function exitToDashboard() {
  if (S.serverId) { saveProject(); setTimeout(() => location.href = '/', 400); return; }
  if (S.els.length > 0) {
    showPrompt('Save current project locally?', S.projectName || 'Untitled', newName => {
      S.projectName = newName; S.projectId = Date.now(); saveLocalProject(); location.href = '/';
    });
    return;
  }
  location.href = '/';
}
function applyState(state, name, serverId) {
  S = Object.assign(freshState(), state || {}, { sel: null, undo: [], redo: [], gesture: 'IDLE', serverId: serverId || null });
  if (!S.pages || !S.pages.length) S.pages = [{ id: 'index', name: 'Home', els: S.els }];
  if (!S.activePageId) S.activePageId = 'index';
  ws.style.backgroundColor = S.bg;
  ws.querySelectorAll('.we, g').forEach(e => e.remove());
  S.els = getActivePage().els || [];
  S.els.forEach(rEl);
  desel();
  document.getElementById('projLabel').textContent = S.projectName || name || 'Untitled';
  renderPagesList();
  uSync(S.serverId ? 'saved' : 'local');
}

function makeThumb() {
  return new Promise(resolve => {
    if (typeof html2canvas === 'undefined') return resolve('');
    so.style.display = 'none';
    html2canvas(ws, { backgroundColor: S.bg, scale: 0.3, logging: false, useCORS: true })
      .then(canvas => { so.style.display = 'block'; resolve(canvas.toDataURL('image/jpeg', 0.4)); })
      .catch(() => { so.style.display = 'block'; resolve(''); });
  });
}

async function saveProject(saveAs = false) {
  getActivePage().els = S.els;
  const doSave = async () => {
    if (V2H.isAuthed()) {
      uSync('saving');
      try {
        const payload = { name: S.projectName, state: serializeState(), thumb: await makeThumb() };
        if (!S.serverId) {
          const res = await V2H.api('POST', '/api/projects', payload);
          S.serverId = res.project.id;
          history.replaceState(null, '', '/studio.html?project=' + S.serverId);
        } else {
          await V2H.api('PUT', '/api/projects/' + S.serverId, payload);
        }
        S.dirty = false;
        document.getElementById('projLabel').textContent = S.projectName;
        uSync('saved');
        V2H.toast('Saved to your account', 'ok');
      } catch (e) { uSync('dirty'); V2H.toast(e.message, 'er'); }
    } else {
      if (!S.projectId) S.projectId = Date.now();
      saveLocalProject();
      V2H.toast('Saved locally (sign in to sync)', 'ok');
    }
  };
  if (saveAs || !S.projectName || S.projectName === 'Untitled') {
    showPrompt('Save Project As', S.projectName === 'Untitled' ? '' : S.projectName, async newName => { S.projectName = newName; await doSave(); });
  } else doSave();
}
function saveLocalProject() {
  const p = getLocalProjects();
  const thumb = '';
  const projData = { id: S.projectId, name: S.projectName, date: Date.now(), thumb, state: serializeState() };
  const existing = p.find(x => x.id === S.projectId);
  if (existing) { existing.name = S.projectName; existing.date = Date.now(); existing.state = projData.state; }
  else p.push(projData);
  setLocalProjects(p);
  S.dirty = false;
  uSync('local');
}

function showOpenMenu() {
  document.getElementById('menuPop').classList.remove('active');
  const list = document.getElementById('openList'), projects = getLocalProjects();
  list.innerHTML = projects.length === 0
    ? '<div class="text-[10px] text-gray-500 px-2 py-4 text-center">No local projects found.</div>'
    : projects.map(p => '<div class="menu-item" onclick="openLocalProject(' + p.id + ')"><i class="fas fa-file w-4"></i> ' + escHtml(p.name) + '</div>').join('');
  document.getElementById('openPop').style.display = 'block';
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('#openPop') && !e.target.closest('.menu-item')) document.getElementById('openPop').style.display = 'none'; });

function openLocalProject(id) {
  const p = getLocalProjects().find(x => x.id === id); if (!p) return;
  S.projectId = p.id; S.projectName = p.name; S.serverId = null;
  applyState(p.state, p.name, null);
  document.getElementById('openPop').style.display = 'none';
}

function importProject() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        S.projectName = data.name + ' (Imported)'; S.projectId = Date.now(); S.serverId = null;
        applyState(data.state, data.name, null);
        V2H.toast('Imported', 'ok');
      } catch (err) { V2H.toast('Invalid file', 'er'); }
    };
    reader.readAsText(file);
  };
  input.click();
}
function importZip() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.zip';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    JSZip.loadAsync(file).then(zip => {
      const stateFile = Object.keys(zip.files).find(f => f.endsWith('v2h_state.json'));
      if (!stateFile) { V2H.toast('Invalid V2H Zip', 'er'); return; }
      zip.file(stateFile).async('string').then(content => {
        const data = JSON.parse(content);
        S.projectName = data.name + ' (Imported ZIP)'; S.projectId = Date.now(); S.serverId = null;
        applyState(data.state, data.name, null);
        V2H.toast('ZIP Imported', 'ok');
      });
    }).catch(() => V2H.toast('Error reading ZIP', 'er'));
  };
  input.click();
}
function exportProject() {
  getActivePage().els = S.els;
  const data = JSON.stringify({ name: S.projectName, state: serializeState() });
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = S.projectName.replace(/\s/g, '_') + '.json'; a.click();
  V2H.toast('Project Exported', 'ok');
}

/* ---------------- popover plumbing ---------------- */

function togglePop(id, btn) {
  document.getElementById('openPop').style.display = 'none';
  document.querySelectorAll('.popover').forEach(p => { if (p.id !== id) p.classList.remove('active'); });
  document.getElementById(id).classList.toggle('active');
  if (id === 'animPop') uAP();
  if (id === 'layersPop') uLay();
  if (id === 'pagesPop') renderPagesList();
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.popover') && !e.target.closest('#layersBtn') && !e.target.closest('#animBtn') && !e.target.closest('#menuPop') && !e.target.closest('#pagesBtn'))
    document.querySelectorAll('.popover').forEach(p => p.classList.remove('active'));
});

/* ---------------- core editor ---------------- */

function gid() { return S.nid++; }
function gel(id) { return S.els.find(e => e.id === id); }
function gpos(cx, cy) { const r = ws.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; }
function snap(v) { return S.snap ? Math.round(v / 20) * 20 : v; }
function ptSeg(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy; if (l2 === 0) return Math.hypot(px - x1, py - y1); let t = ((px - x1) * dx + (py - y1) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
function fhBB(pts) { if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 }; let a = 1e9, b = 1e9, c = -1e9, d = -1e9; pts.forEach(p => { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }); return { x: a, y: b, w: c - a, h: d - b }; }
function pts2d(pts) { if (pts.length < 2) return ''; let d = 'M ' + pts[0].x + ' ' + pts[0].y; for (let i = 1; i < pts.length - 1; i++) { const cx = (pts[i].x + pts[i + 1].x) / 2, cy = (pts[i].y + pts[i + 1].y) / 2; d += ' Q ' + pts[i].x + ' ' + pts[i].y + ' ' + cx + ' ' + cy; } d += ' L ' + pts[pts.length - 1].x + ' ' + pts[pts.length - 1].y; return d; }
function toast(m, t) { V2H.toast(m, t); }
function saveU() { S.undo.push(JSON.parse(JSON.stringify(S.els))); if (S.undo.length > 40) S.undo.shift(); S.redo = []; S.dirty = true; }
function measureText(t, fs) { tm.textContent = t; tm.style.fontSize = fs + 'px'; return { w: Math.ceil(tm.offsetWidth) + 4, h: Math.ceil(tm.offsetHeight) + 2 }; }
function getContrastYIQ(hexcolor) { hexcolor = hexcolor.replace('#', ''); if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join(''); const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16), yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#000000' : '#ffffff'; }

function hitEl(x, y) { for (let i = S.els.length - 1; i >= 0; i--) { if (hitT(S.els[i], x, y)) return S.els[i]; } return null; }
function hitT(el, x, y) {
  if (el.type === 'rect' || el.type === 'text' || el.type === 'image' || el.type === 'datalist') return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
  if (el.type === 'circle') { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, rx = el.width / 2 || 1, ry = el.height / 2 || 1; return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
  if (el.type === 'line') return ptSeg(x, y, el.x, el.y, el.x2, el.y2) < Math.max(20, el.strokeWidth / 2 + 10);
  if (el.type === 'freehand') { for (let i = 0; i < el.points.length - 1; i++) { if (ptSeg(x, y, el.points[i].x, el.points[i].y, el.points[i + 1].x, el.points[i + 1].y) < Math.max(20, el.strokeWidth / 2 + 10)) return true; } return false; }
  return false;
}
function hitHandle(x, y) {
  if (!S.sel) return null; const el = gel(S.sel); if (!el) return null;
  if (el.type === 'line') { if (Math.hypot(x - el.x, y - el.y) < 24) return 'ep1'; if (Math.hypot(x - el.x2, y - el.y2) < 24) return 'ep2'; return null; }
  if (el.type === 'freehand') return null;
  const bx = el.x, by = el.y, bw = el.width, bh = el.height, HS = 22;
  const hs = { tl: { x: bx, y: by }, tc: { x: bx + bw / 2, y: by }, tr: { x: bx + bw, y: by }, ml: { x: bx, y: by + bh / 2 }, mr: { x: bx + bw, y: by + bh / 2 }, bl: { x: bx, y: by + bh }, bc: { x: bx + bw / 2, y: by + bh }, br: { x: bx + bw, y: by + bh } };
  for (const [n, p] of Object.entries(hs)) { if (Math.abs(x - p.x) < HS && Math.abs(y - p.y) < HS) return n; }
  return null;
}

ws.addEventListener('pointerdown', onDown); document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);

function onDown(e) {
  if (e.button && e.button !== 0) return;
  if (e.target.isContentEditable) return;
  const pos = gpos(e.clientX, e.clientY);
  IX.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (IX.pts.size === 2 && S.sel) { startPinch(); return; }
  if (IX.pts.size > 1) return;
  if (S.gesture !== 'IDLE') return;
  const h = hitHandle(pos.x, pos.y);
  if (h) {
    const el = gel(S.sel);
    if (h.startsWith('ep')) { S.gesture = 'ENDPOINT'; IX.ep = h; IX.pid = e.pointerId; IX.rs = { x: el.x, y: el.y, x2: el.x2, y2: el.y2 }; saveU(); }
    else { S.gesture = 'RESIZE'; IX.rh = h; IX.pid = e.pointerId; IX.rs = { mx: pos.x, my: pos.y, x: el.x, y: el.y, w: el.width, h: el.height }; saveU(); }
    return;
  }
  const hit = hitEl(pos.x, pos.y);
  if (hit) {
    selEl(hit.id); const el = gel(S.sel);
    S.gesture = 'DRAG'; IX.pid = e.pointerId;
    if (el.type === 'freehand') { const bb = fhBB(el.points); IX.dx = pos.x - bb.x; IX.dy = pos.y - bb.y; }
    else { IX.dx = pos.x - el.x; IX.dy = pos.y - el.y; }
    saveU(); return;
  }
  if (S.mode === 'freehand') { S.gesture = 'FREEHAND'; IX.pid = e.pointerId; IX.fhPts = [{ x: pos.x, y: pos.y }]; return; }
  desel();
}

function onMove(e) {
  IX.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (S.gesture === 'PINCH') { doPinch(); return; }
  if (e.pointerId !== IX.pid) return;
  const pos = gpos(e.clientX, e.clientY);
  if (S.gesture === 'DRAG' && S.sel) {
    const el = gel(S.sel); if (!el) return;
    let nx = snap(pos.x - IX.dx), ny = snap(pos.y - IX.dy);
    if (el.type === 'freehand') { const bb = fhBB(el.points); const ddx = nx - bb.x, ddy = ny - bb.y; el.points.forEach(p => { p.x += ddx; p.y += ddy; }); }
    else if (el.type === 'line') { const ddx = nx - el.x, ddy = ny - el.y; el.x += ddx; el.y += ddy; el.x2 += ddx; el.y2 += ddy; }
    else { el.x = nx; el.y = ny; }
    uEl(el); uCtxValues(); return;
  }
  if (S.gesture === 'RESIZE' && S.sel) {
    const el = gel(S.sel); if (!el) return;
    const dx = pos.x - IX.rs.mx, dy = pos.y - IX.rs.my, h = IX.rh, r = IX.rs, MN = 20;
    let nx = r.x, ny = r.y, nw = r.w, nh = r.h;
    if (h.includes('r')) nw = Math.max(MN, r.w + dx);
    if (h.includes('l')) { nx = r.x + dx; nw = Math.max(MN, r.w - dx); if (nw === MN) nx = r.x + r.w - MN; }
    if (h.includes('b')) nh = Math.max(MN, r.h + dy);
    if (h.includes('t')) { ny = r.y + dy; nh = Math.max(MN, r.h - dy); if (nh === MN) ny = r.y + r.h - MN; }
    if (el.type === 'circle') { nh = nw; if (h.includes('t')) ny = r.y + r.h - nh; if (h.includes('l')) nx = r.x + r.w - nw; }
    el.x = snap(nx); el.y = snap(ny); el.width = snap(nw); el.height = snap(nh);
    uEl(el); uCtxValues(); return;
  }
  if (S.gesture === 'ENDPOINT' && S.sel) {
    const el = gel(S.sel); if (!el) return;
    if (IX.ep === 'ep1') { el.x = snap(pos.x); el.y = snap(pos.y); } else { el.x2 = snap(pos.x); el.y2 = snap(pos.y); }
    uEl(el); uCtxValues(); return;
  }
  if (S.gesture === 'FREEHAND') {
    IX.fhPts.push({ x: pos.x, y: pos.y });
    let tg = svgO.querySelector('#tmpD');
    if (!tg) {
      const ns = 'http://www.w3.org/2000/svg';
      tg = document.createElementNS(ns, 'g'); tg.id = 'tmpD';
      const p = document.createElementNS(ns, 'path'); p.id = 'tmpP';
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', S.sc); p.setAttribute('stroke-width', S.sw);
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      tg.appendChild(p); svgO.appendChild(tg);
    }
    svgO.querySelector('#tmpP').setAttribute('d', pts2d(IX.fhPts));
  }
}

function onUp(e) {
  IX.pts.delete(e.pointerId);
  if (S.gesture === 'PINCH' && IX.pts.size < 2) { S.gesture = 'IDLE'; return; }
  if (e.pointerId !== IX.pid) return;
  if (S.gesture === 'FREEHAND') {
    const tg = svgO.querySelector('#tmpD'); if (tg) tg.remove();
    if (IX.fhPts.length >= 3) { const el = mkEl('freehand', { points: IX.fhPts, stroke: S.sc, strokeWidth: S.sw }); selEl(el.id); toast('Drawn', 'ok'); }
    IX.fhPts = [];
  }
  S.gesture = 'IDLE';
}

function startPinch() {
  const el = gel(S.sel); if (!el) return;
  S.gesture = 'PINCH';
  const pts = Array.from(IX.pts.values());
  IX.pinchD = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  IX.pinchW = el.width; IX.pinchH = el.height;
  IX.pinchCX = el.x + el.width / 2; IX.pinchCY = el.y + el.height / 2;
  if (el.type === 'line') { IX.pinchIL = { x: el.x, y: el.y, x2: el.x2, y2: el.y2 }; IX.pinchCX = (el.x + el.x2) / 2; IX.pinchCY = (el.y + el.y2) / 2; }
  if (el.type === 'freehand') { IX.pinchIP = el.points.map(p => ({ ...p })); const bb = fhBB(el.points); IX.pinchCX = bb.x + bb.w / 2; IX.pinchCY = bb.y + bb.h / 2; }
}
function doPinch() {
  const el = gel(S.sel); if (!el) return;
  const pts = Array.from(IX.pts.values());
  const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const sc = Math.max(.2, d / IX.pinchD);
  if (el.type === 'line' && IX.pinchIL) { const il = IX.pinchIL; el.x = IX.pinchCX + (il.x - IX.pinchCX) * sc; el.y = IX.pinchCY + (il.y - IX.pinchCY) * sc; el.x2 = IX.pinchCX + (il.x2 - IX.pinchCX) * sc; el.y2 = IX.pinchCY + (il.y2 - IX.pinchCY) * sc; }
  else if (el.type === 'freehand' && IX.pinchIP) { el.points = IX.pinchIP.map(p => ({ x: IX.pinchCX + (p.x - IX.pinchCX) * sc, y: IX.pinchCY + (p.y - IX.pinchCY) * sc })); }
  else { const nw = IX.pinchW * sc, nh = IX.pinchH * sc; el.width = nw; el.height = nh; el.x = IX.pinchCX - nw / 2; el.y = IX.pinchCY - nh / 2; }
  uEl(el); uCtxValues();
}

function setM(m) { S.mode = m; document.querySelectorAll('.sh-btn').forEach(b => { if (b.dataset.m) b.classList.toggle('on', b.dataset.m === m); }); if (m !== 'select') desel(); }
function togGrid() { S.grid = !S.grid; ws.classList.toggle('no-grid', !S.grid); document.getElementById('gBtn').classList.toggle('on', S.grid); }
function togSnap() { S.snap = !S.snap; document.getElementById('sBtn').classList.toggle('on', S.snap); toast(S.snap ? 'Snap ON' : 'Snap OFF', 'ok'); }

function mkEl(type, p) {
  saveU();
  const el = {
    id: gid(), type, x: p.x || 0, y: p.y || 0, width: p.width || 120, height: p.height || 100,
    x2: p.x2 || 0, y2: p.y2 || 0, fill: p.fill || S.fc, stroke: p.stroke || S.sc, strokeWidth: p.strokeWidth != null ? p.strokeWidth : S.sw,
    fontSize: p.fontSize || S.fs, text: p.text || '', opacity: 1, src: p.src || '', isLocal: p.isLocal || false,
    points: p.points ? p.points.map(pt => ({ ...pt })) : [],
    animation: { type: 'none', duration: '1s', delay: '0s', iteration: '1', easing: 'ease' },
    href: p.href || '', anchorId: p.anchorId || '',
    collection: p.collection || '', collName: p.collName || '', titleField: p.titleField || '', subField: p.subField || '',
    imgField: p.imgField || '', cols: p.cols || 3, limit: p.limit || 12, cardBg: p.cardBg || '#ffffff', cardColor: p.cardColor || '#111111'
  };
  if (type === 'text' && el.text) { const m = measureText(el.text, el.fontSize); el.width = m.w; el.height = m.h; }
  S.els.push(el); rEl(el); uLay();
  return el;
}
function rmEl(id) { const d = ws.querySelector('div[data-id="' + id + '"]'); if (d) d.remove(); const g = svgO.querySelector('g[data-id="' + id + '"]'); if (g) g.remove(); }
function uEl(el) { rmEl(el.id); rEl(el); uSO(); uCtxValues(); S.dirty = true; }

function rEl(el) { if (el.type === 'freehand' || el.type === 'line') rSVG(el); else rDiv(el); }
function rDiv(el) {
  const d = document.createElement(el.href ? 'a' : 'div');
  d.className = 'we'; d.dataset.id = el.id;
  if (el.href) d.href = el.href;
  if (el.anchorId) d.id = el.anchorId;
  const s = d.style;
  s.left = el.x + 'px'; s.top = el.y + 'px'; s.width = el.width + 'px'; s.height = el.height + 'px'; s.opacity = el.opacity; s.textDecoration = 'none';
  if (el.type === 'rect') { s.background = el.fill; s.border = el.strokeWidth > 0 ? el.strokeWidth + 'px solid ' + el.stroke : 'none'; s.borderRadius = '4px'; }
  else if (el.type === 'circle') { s.background = el.fill; s.border = el.strokeWidth > 0 ? el.strokeWidth + 'px solid ' + el.stroke : 'none'; s.borderRadius = '50%'; }
  else if (el.type === 'text') { s.color = el.fill; s.fontSize = el.fontSize + 'px'; s.fontWeight = '600'; s.lineHeight = '1.2'; s.whiteSpace = 'pre-wrap'; s.wordWrap = 'break-word'; s.overflow = 'hidden'; s.background = 'none'; s.border = 'none'; d.textContent = el.text; }
  else if (el.type === 'image') { s.overflow = 'hidden'; s.border = 'none'; s.background = 'none'; const img = document.createElement('img'); img.src = el.src; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; img.draggable = false; d.appendChild(img); }
  else if (el.type === 'datalist') {
    s.border = '2px dashed #9ca3af'; s.borderRadius = '8px'; s.background = 'rgba(0,0,0,.02)'; s.overflow = 'hidden';
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#6b7280;font-size:11px;font-family:sans-serif';
    label.innerHTML = '<i class="fas fa-database" style="font-size:16px"></i><span>' + escHtml(el.collName || 'Data list') + '</span><span style="font-size:9px;opacity:.7">live data · publishes with the site</span>';
    d.appendChild(label);
  }
  if (el.animation && el.animation.type !== 'none' && S.gesture === 'IDLE') s.animation = el.animation.type + ' ' + el.animation.duration + ' ' + el.animation.easing + ' ' + el.animation.delay + ' ' + el.animation.iteration + ' both';
  ws.appendChild(d);
}
function rSVG(el) {
  const ns = 'http://www.w3.org/2000/svg', g = document.createElementNS(ns, 'g'); g.dataset.id = el.id;
  if (el.anchorId) g.id = el.anchorId;
  if (el.type === 'line') {
    const h = document.createElementNS(ns, 'line');
    h.setAttribute('x1', el.x); h.setAttribute('y1', el.y); h.setAttribute('x2', el.x2); h.setAttribute('y2', el.y2);
    h.setAttribute('stroke', 'transparent'); h.setAttribute('stroke-width', 24); h.setAttribute('fill', 'none');
    h.classList.add('se'); h.dataset.id = el.id;
    const v = document.createElementNS(ns, 'line');
    v.setAttribute('x1', el.x); v.setAttribute('y1', el.y); v.setAttribute('x2', el.x2); v.setAttribute('y2', el.y2);
    v.setAttribute('stroke', el.stroke); v.setAttribute('stroke-width', el.strokeWidth); v.setAttribute('stroke-linecap', 'round'); v.setAttribute('fill', 'none');
    v.style.pointerEvents = 'none';
    g.appendChild(h); g.appendChild(v);
  } else if (el.type === 'freehand') {
    const pd = pts2d(el.points); if (!pd) return;
    const h = document.createElementNS(ns, 'path');
    h.setAttribute('d', pd); h.setAttribute('stroke', 'transparent'); h.setAttribute('stroke-width', 24); h.setAttribute('fill', 'none');
    h.classList.add('se'); h.dataset.id = el.id;
    const v = document.createElementNS(ns, 'path');
    v.setAttribute('d', pd); v.setAttribute('stroke', el.stroke); v.setAttribute('stroke-width', el.strokeWidth); v.setAttribute('fill', 'none');
    v.setAttribute('stroke-linecap', 'round'); v.setAttribute('stroke-linejoin', 'round');
    v.style.pointerEvents = 'none';
    g.appendChild(h); g.appendChild(v);
  }
  if (el.animation && el.animation.type !== 'none' && S.gesture === 'IDLE') g.style.animation = el.animation.type + ' ' + el.animation.duration + ' ' + el.animation.easing + ' ' + el.animation.delay + ' ' + el.animation.iteration + ' both';
  svgO.appendChild(g);
}

function selEl(id) { S.sel = id; uSO(); uCtxBar(); uLay(); }
function desel() { S.sel = null; so.style.display = 'none'; so.innerHTML = ''; ctxBar.classList.remove('active'); uLay(); }
function uSO() {
  so.innerHTML = '';
  if (!S.sel) { so.style.display = 'none'; return; }
  const el = gel(S.sel);
  if (!el) { so.style.display = 'none'; return; }
  so.style.display = 'block'; so.style.border = '1px dashed var(--ac)'; so.style.position = 'absolute'; so.style.pointerEvents = 'none'; so.style.zIndex = '900'; so.style.touchAction = 'none';
  const p = 7;
  if (el.type === 'line') {
    const bx = Math.min(el.x, el.x2), by = Math.min(el.y, el.y2), bw = Math.abs(el.x2 - el.x), bh = Math.abs(el.y2 - el.y);
    so.style.left = (bx - p) + 'px'; so.style.top = (by - p) + 'px'; so.style.width = (bw + p * 2) + 'px'; so.style.height = (bh + p * 2) + 'px'; so.style.borderRadius = '0';
    const h1 = document.createElement('div'); h1.className = 'ep'; h1.style.left = (el.x - bx + p) + 'px'; h1.style.top = (el.y - by + p) + 'px'; so.appendChild(h1);
    const h2 = document.createElement('div'); h2.className = 'ep'; h2.style.left = (el.x2 - bx + p) + 'px'; h2.style.top = (el.y2 - by + p) + 'px'; so.appendChild(h2);
  } else if (el.type === 'freehand') {
    const bb = fhBB(el.points);
    so.style.left = (bb.x - p) + 'px'; so.style.top = (bb.y - p) + 'px'; so.style.width = (bb.w + p * 2) + 'px'; so.style.height = (bb.h + p * 2) + 'px'; so.style.borderRadius = '0';
  } else {
    so.style.left = (el.x - p) + 'px'; so.style.top = (el.y - p) + 'px'; so.style.width = (el.width + p * 2) + 'px'; so.style.height = (el.height + p * 2) + 'px';
    so.style.borderRadius = el.type === 'circle' ? '50%' : '0';
    ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'].forEach(h => { const d = document.createElement('div'); d.className = 'rh h-' + h; so.appendChild(d); });
  }
}

function uCtxBar() {
  if (!S.sel) { ctxBar.classList.remove('active'); return; }
  const el = gel(S.sel); if (!el) return;
  ctxBar.classList.add('active');
  document.getElementById('ctxType').textContent = el.type === 'datalist' ? 'data' : el.type;
  document.getElementById('ctxX').value = Math.round(el.x);
  document.getElementById('ctxY').value = Math.round(el.y);
  document.getElementById('ctxW').value = Math.round(el.width);
  document.getElementById('ctxH').value = Math.round(el.height);
  document.getElementById('ctxOpacity').value = Math.round((el.opacity == null ? 1 : el.opacity) * 100);
  const fillWrap = document.getElementById('ctxFillWrap'), strokeWrap = document.getElementById('ctxStrokeWrap'), strokeW = document.getElementById('ctxStrokeW'), styleDiv = document.getElementById('ctxStyleDiv'), editBtn = document.getElementById('ctxEditBtn'), dataBtn = document.getElementById('ctxDataBtn');
  if (el.type === 'image' || el.type === 'line' || el.type === 'freehand' || el.type === 'datalist') { fillWrap.style.display = 'none'; styleDiv.style.display = el.type === 'image' || el.type === 'datalist' ? 'none' : 'flex'; }
  else { fillWrap.style.display = 'flex'; document.getElementById('ctxFillSw').style.background = el.fill; }
  if (el.type === 'image' || el.type === 'datalist') { strokeWrap.style.display = 'none'; strokeW.style.display = 'none'; }
  else { strokeWrap.style.display = 'flex'; document.getElementById('ctxStrokeSw').style.background = el.stroke; strokeW.value = el.strokeWidth; }
  editBtn.style.display = el.type === 'text' ? 'flex' : 'none';
  dataBtn.style.display = el.type === 'datalist' ? 'flex' : 'none';
}

function editTextOnCanvas() {
  const el = gel(S.sel); if (!el) return;
  const dom = ws.querySelector('div[data-id="' + el.id + '"]'); if (!dom) return;
  dom.contentEditable = true; dom.focus();
  dom.style.outline = '2px solid var(--ac)'; dom.style.cursor = 'text';
  document.execCommand('selectAll', false, null);
  const onBlur = () => {
    el.text = dom.textContent;
    const m = measureText(el.text, el.fontSize);
    el.width = m.w; el.height = m.h;
    dom.contentEditable = false; dom.style.outline = 'none'; dom.style.cursor = 'default';
    uEl(el);
    dom.removeEventListener('blur', onBlur);
  };
  dom.addEventListener('blur', onBlur);
}

function uCtxValues() {
  if (!S.sel) return;
  const el = gel(S.sel);
  document.getElementById('ctxX').value = Math.round(el.x);
  document.getElementById('ctxY').value = Math.round(el.y);
  document.getElementById('ctxW').value = Math.round(el.width);
  document.getElementById('ctxH').value = Math.round(el.height);
}
function uProp(id, p, v) {
  const el = gel(id); if (!el) return;
  saveU();
  if ((p === 'x' || p === 'y') && el.type === 'freehand') { const bb = fhBB(el.points); const dx = p === 'x' ? v - bb.x : 0, dy = p === 'y' ? v - bb.y : 0; el.points.forEach(pt => { pt.x += dx; pt.y += dy; }); }
  else el[p] = v;
  uEl(el); uLay();
}
function chgBg(c) { S.bg = c; S.dirty = true; ws.style.backgroundColor = c; uCtxBar(); }

function doDupe() {
  if (!S.sel) return;
  const el = gel(S.sel);
  const cl = JSON.parse(JSON.stringify(el));
  cl.id = gid(); cl.x += 20; cl.y += 20;
  if (cl.type === 'line') { cl.x2 += 20; cl.y2 += 20; }
  if (cl.type === 'freehand') cl.points = cl.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
  saveU(); S.els.push(cl); rEl(cl); selEl(cl.id); toast('Duplicated', 'ok');
}
function doDel(id) { saveU(); rmEl(id); S.els = S.els.filter(e => e.id !== id); if (S.sel === id) desel(); uLay(); toast('Deleted'); }
function doClear() { if (!S.els.length) return; saveU(); S.els.forEach(e => rmEl(e.id)); S.els = []; desel(); uLay(); toast('Cleared'); }
function doUndo() { if (!S.undo.length) { toast('Nothing to undo', 'er'); return; } S.redo.push(JSON.parse(JSON.stringify(S.els))); S.els.forEach(e => rmEl(e.id)); S.els = S.undo.pop(); S.els.forEach(rEl); desel(); toast('Undo'); }
function doRedo() { if (!S.redo.length) { toast('Nothing to redo', 'er'); return; } S.undo.push(JSON.parse(JSON.stringify(S.els))); S.els.forEach(e => rmEl(e.id)); S.els = S.redo.pop(); S.els.forEach(rEl); desel(); toast('Redo'); }
function doUp() { if (!S.sel) return; const i = S.els.findIndex(e => e.id === S.sel); if (i < S.els.length - 1) { saveU(); [S.els[i], S.els[i + 1]] = [S.els[i + 1], S.els[i]]; S.els.forEach(e => rmEl(e.id)); S.els.forEach(rEl); selEl(S.sel); uLay(); } }
function doDown() { if (!S.sel) return; const i = S.els.findIndex(e => e.id === S.sel); if (i > 0) { saveU(); [S.els[i], S.els[i - 1]] = [S.els[i - 1], S.els[i]]; S.els.forEach(e => rmEl(e.id)); S.els.forEach(rEl); selEl(S.sel); uLay(); } }

/* ---------------- sidebar drag-in ---------------- */

document.querySelectorAll('.sh-btn[data-sh]').forEach(c => {
  c.addEventListener('pointerdown', e => {
    e.preventDefault();
    const sh = e.currentTarget.dataset.sh;
    S.gesture = 'SIDEBAR'; IX.sbShape = sh;
    ghost.style.display = 'flex'; ghost.innerHTML = e.currentTarget.innerHTML;
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    const move = ev => {
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      const wr = ws.getBoundingClientRect();
      ws.classList.toggle('drop-active', ev.clientX >= wr.left && ev.clientX <= wr.right && ev.clientY >= wr.top && ev.clientY <= wr.bottom);
    };
    const up = ev => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      ghost.style.display = 'none'; ws.classList.remove('drop-active'); S.gesture = 'IDLE';
      const wr = ws.getBoundingClientRect();
      if (ev.clientX >= wr.left && ev.clientX <= wr.right && ev.clientY >= wr.top && ev.clientY <= wr.bottom) {
        const p = gpos(ev.clientX, ev.clientY);
        if (sh === 'text') { const txtColor = getContrastYIQ(S.bg); const el = mkEl('text', { x: snap(p.x - 40), y: snap(p.y - 18), text: 'Double-click to edit', fill: txtColor, fontSize: S.fs }); selEl(el.id); toast('Text placed', 'ok'); }
        else { const el = mkEl(sh, sh === 'rect' ? { x: snap(p.x - 60), y: snap(p.y - 50), width: 120, height: 100 } : sh === 'circle' ? { x: snap(p.x - 50), y: snap(p.y - 50), width: 100, height: 100 } : { x: snap(p.x - 60), y: snap(p.y), x2: snap(p.x + 60), y2: snap(p.y), stroke: S.sc, strokeWidth: Math.max(S.sw, 2) }); selEl(el.id); toast(sh.charAt(0).toUpperCase() + sh.slice(1) + ' placed', 'ok'); }
      }
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
});

/* ---------------- clipboard images ---------------- */

document.addEventListener('paste', e => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      const reader = new FileReader();
      reader.onload = ev => {
        const wr = ws.getBoundingClientRect();
        const el = mkEl('image', { x: wr.width / 2 - 100, y: wr.height / 2 - 100, width: 200, height: 200, src: ev.target.result, isLocal: true });
        selEl(el.id); toast('Image pasted from clipboard', 'ok');
      };
      reader.readAsDataURL(file); e.preventDefault(); break;
    }
  }
});

/* ---------------- images ---------------- */

function showImgMenu() { document.getElementById('imgM').style.display = 'flex'; document.getElementById('imgUrlI').value = ''; setTimeout(() => document.getElementById('imgUrlI').focus(), 50); }
function imgCancel() { document.getElementById('imgM').style.display = 'none'; }
function imgUrlOk() {
  const url = document.getElementById('imgUrlI').value.trim();
  if (!url) { toast('URL is empty', 'er'); return; }
  const wr = ws.getBoundingClientRect();
  const el = mkEl('image', { x: wr.width / 2 - 100, y: wr.height / 2 - 100, width: 200, height: 200, src: url, isLocal: false });
  selEl(el.id); toast('Image added', 'ok'); imgCancel();
}
document.getElementById('imgInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const wr = ws.getBoundingClientRect();
    const el = mkEl('image', { x: wr.width / 2 - 100, y: wr.height / 2 - 100, width: 200, height: 200, src: ev.target.result, isLocal: true });
    selEl(el.id); toast('Image added', 'ok');
  };
  reader.readAsDataURL(file); e.target.value = ''; imgCancel();
});

/* ---------------- live data lists ---------------- */

async function fetchCollections() {
  if (!V2H.isAuthed()) throw new Error('Sign in to use live data');
  const res = await V2H.api('GET', '/api/collections');
  collCache = res.collections || [];
  return collCache;
}
async function showDataMenu() {
  try {
    const colls = await fetchCollections();
    if (!colls.length) { toast('Create an app first (from the dashboard)', 'er'); return; }
    const c = colls[0];
    const wr = ws.getBoundingClientRect();
    const el = mkEl('datalist', { x: snap(wr.width / 2 - 220), y: snap(wr.height / 2 - 160), width: 440, height: 320, collection: c.id, collName: c.name });
    applyDefaultsFromSchema(el, c);
    selEl(el.id);
    openDataConfig();
  } catch (e) { toast(e.message, 'er'); }
}
function applyDefaultsFromSchema(el, c) {
  const fields = c.fields || [];
  const v = c.views || {};
  el.titleField = v.primaryField || (fields.find(f => f.type === 'text') || {}).key || '';
  el.subField = (fields.filter(f => f.type === 'text' || f.type === 'longtext')[1] || {}).key || '';
  el.imgField = v.imageField || (fields.find(f => f.type === 'image') || {}).key || '';
  el.collName = c.name; S.dirty = true;
}
async function openDataConfig() {
  const el = gel(S.sel); if (!el || el.type !== 'datalist') return;
  try {
    if (!collCache.length) await fetchCollections();
  } catch (e) { toast(e.message, 'er'); return; }
  const sel = document.getElementById('dataColl');
  sel.innerHTML = collCache.map(c => '<option value="' + c.id + '"' + (c.id === el.collection ? ' selected' : '') + '>' + escHtml(c.name) + '</option>').join('') || '<option value="">No apps found</option>';
  fillFieldSelects(el);
  document.getElementById('dataCols').value = el.cols || 3;
  document.getElementById('dataLimit').value = el.limit || 12;
  document.getElementById('dataCardBg').value = el.cardBg || '#ffffff';
  document.getElementById('dataCardColor').value = el.cardColor || '#111111';
  document.getElementById('dataM').style.display = 'flex';
  sel.onchange = () => {
    const c = collCache.find(x => x.id === sel.value);
    if (c) { el.collection = c.id; applyDefaultsFromSchema(el, c); fillFieldSelects(el); }
  };
}
function fillFieldSelects(el) {
  const c = collCache.find(x => x.id === el.collection) || collCache[0];
  const fields = (c && c.fields) || [];
  const mk = (id, val, types) => {
    const opts = ['<option value="">—</option>'].concat(fields.filter(f => !types || types.includes(f.type)).map(f => '<option value="' + f.key + '"' + (f.key === val ? ' selected' : '') + '>' + escHtml(f.name) + '</option>')).join('');
    document.getElementById(id).innerHTML = opts;
  };
  mk('dataTitle', el.titleField, ['text', 'select', 'number', 'date']);
  mk('dataSub', el.subField, ['text', 'longtext', 'select', 'number', 'date', 'url']);
  mk('dataImg', el.imgField, ['image']);
}
function hideDataConfig() { document.getElementById('dataM').style.display = 'none'; }
function applyDataConfig() {
  const el = gel(S.sel); if (!el || el.type !== 'datalist') return hideDataConfig();
  const c = collCache.find(x => x.id === document.getElementById('dataColl').value);
  el.collection = c ? c.id : '';
  el.collName = c ? c.name : '';
  el.titleField = document.getElementById('dataTitle').value;
  el.subField = document.getElementById('dataSub').value;
  el.imgField = document.getElementById('dataImg').value;
  el.cols = Math.max(1, Math.min(4, +document.getElementById('dataCols').value || 3));
  el.limit = Math.max(1, Math.min(100, +document.getElementById('dataLimit').value || 12));
  el.cardBg = document.getElementById('dataCardBg').value;
  el.cardColor = document.getElementById('dataCardColor').value;
  saveU(); uEl(el);
  hideDataConfig();
  toast('Data list configured', 'ok');
}

/* ---------------- text modal ---------------- */

function txOk() {
  const t = document.getElementById('txI').value.trim();
  if (t) { const m = measureText(t, S.fs); const el = mkEl('text', { x: (IX.txPos ? IX.txPos.x : 200) - 40, y: (IX.txPos ? IX.txPos.y : 200) - 18, text: t, fill: getContrastYIQ(S.bg), fontSize: S.fs, width: m.w, height: m.h }); selEl(el.id); toast('Text placed', 'ok'); }
  document.getElementById('txM').style.display = 'none';
}
function txCancel() { document.getElementById('txM').style.display = 'none'; }
document.getElementById('txI').addEventListener('keydown', e => { if (e.key === 'Enter') txOk(); if (e.key === 'Escape') txCancel(); });

/* ---------------- animations ---------------- */

function uAP() {
  if (!S.sel) { aP.innerHTML = '<p class="text-[10px] text-[#808080]">Select to animate</p>'; return; }
  const el = gel(S.sel); if (!el) return;
  const a = el.animation;
  let h = '<div class="mb-1.5"><div class="pl">Type</div><select class="pi" onchange="uAn(' + el.id + ',\'type\',this.value)">';
  Object.entries(AN).forEach(([k, v]) => { h += '<option value="' + k + '"' + (a.type === k ? ' selected' : '') + '>' + v.l + '</option>'; });
  h += '</select></div>';
  h += '<div class="grid grid-cols-2 gap-1.5 mb-1.5"><div><div class="pl">Duration</div><input class="pi" value="' + a.duration + '" onchange="uAn(' + el.id + ',\'duration\',this.value)"></div><div><div class="pl">Delay</div><input class="pi" value="' + a.delay + '" onchange="uAn(' + el.id + ',\'delay\',this.value)"></div></div>';
  h += '<div class="grid grid-cols-2 gap-1.5 mb-1.5"><div><div class="pl">Repeat</div><select class="pi" onchange="uAn(' + el.id + ',\'iteration\',this.value)">' + ['1', '2', '3', '5', 'infinite'].map(n => '<option value="' + n + '"' + (a.iteration === n ? ' selected' : '') + '>' + (n === 'infinite' ? 'Infinite' : n) + '</option>').join('') + '</select></div><div><div class="pl">Easing</div><select class="pi" onchange="uAn(' + el.id + ',\'easing\',this.value)">' + ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'].map(n => '<option value="' + n + '"' + (a.easing === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div></div>';
  h += '<button onclick="prevAn(' + el.id + ')" class="bg w-full text-[10px] mt-1"><i class="fas fa-play mr-1"></i>Preview</button>';
  aP.innerHTML = h;
}
function uAn(id, p, v) { const el = gel(id); if (!el) return; saveU(); el.animation[p] = v; uEl(el); }
function prevAn(id) {
  const el = gel(id); if (!el || el.animation.type === 'none') return;
  const dom = el.type === 'freehand' || el.type === 'line' ? svgO.querySelector('g[data-id="' + id + '"]') : ws.querySelector('div[data-id="' + id + '"]');
  if (!dom) return;
  dom.style.animation = 'none'; void dom.offsetHeight;
  dom.style.animation = el.animation.type + ' ' + el.animation.duration + ' ' + el.animation.easing + ' ' + el.animation.delay + ' ' + el.animation.iteration + ' both';
  toast('Previewing: ' + AN[el.animation.type].l, 'ok');
}

/* ---------------- layers ---------------- */

function uLay() {
  const ic = { rect: 'fa-square', circle: 'fa-circle', line: 'fa-minus', text: 'fa-font', freehand: 'fa-pen', image: 'fa-image', datalist: 'fa-database' };
  lL.innerHTML = S.els.slice().reverse().map(el => {
    const n = el.type === 'text' ? el.text.slice(0, 12) : el.type === 'datalist' ? (el.collName || 'Data list').slice(0, 12) : el.type.charAt(0).toUpperCase() + el.type.slice(1);
    const a = el.animation.type !== 'none' ? '<i class="fas fa-bolt text-[7px] ml-0.5" style="color:var(--tl)"></i>' : '';
    return '<div class="li' + (S.sel === el.id ? ' on' : '') + '" onclick="selEl(' + el.id + ')"><span class="ic"><i class="fas ' + ic[el.type] + '"></i></span><span class="nm">' + escHtml(n) + a + '</span><span class="dl" onclick="event.stopPropagation();doDel(' + el.id + ')"><i class="fas fa-xmark"></i></span></div>';
  }).join('');
}

/* ---------------- keyboard ---------------- */

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
  switch (e.key.toLowerCase()) {
    case 'v': setM('select'); break;
    case 'p': setM('freehand'); break;
    case 'delete': case 'backspace': if (S.sel) doDel(S.sel); break;
    case 'escape': desel(); break;
    case 'd': if (e.ctrlKey || e.metaKey) { e.preventDefault(); doDupe(); } break;
    case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); } break;
    case 'g': togGrid(); break;
  }
});

/* ---------------- export engine (static + publish) ---------------- */

const DATA_RUNTIME = '<script>\n' +
'(function(){function e(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}' +
'function r(h){var c=h.dataset.coll,t=h.dataset.title,b=h.dataset.sub,m=h.dataset.img,n=+h.dataset.cols||3,l=+h.dataset.limit||12,bg=h.dataset.cardbg||"#ffffff",co=h.dataset.cardcolor||"#111111";' +
'fetch("/api/public/collections/"+c+"/records?limit="+l).then(function(x){return x.json()}).then(function(d){var q=(d.records||[]).slice(0,l);' +
'h.innerHTML="<div style=\\"display:grid;grid-template-columns:repeat("+n+",minmax(0,1fr));gap:14px;width:100%;height:100%;align-content:start;overflow:auto\\">"+' +
'q.map(function(x){var i=(m&&x[m])?"<div style=\\"width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:8px;background:#eee;margin-bottom:10px\\"><img src=\\""+x[m]+"\\" style=\\"width:100%;height:100%;object-fit:cover\\"></div>":"";' +
'var tt=(t&&x[t])?"<div style=\\"font-weight:600;font-size:15px;margin-bottom:4px\\">"+e(x[t])+"</div>":"";' +
'var ss=(b&&x[b])?"<div style=\\"font-size:12px;opacity:.75;line-height:1.4\\">"+e(x[b])+"</div>":"";' +
'return "<div style=\\"background:"+bg+";color:"+co+";border-radius:10px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,.08);overflow:hidden\\">"+i+tt+ss+"</div>"}).join("")+"</div>"})' +
'.catch(function(){h.innerHTML="<div style=\\"padding:20px;color:#999;font-family:sans-serif;font-size:13px\\">Data unavailable</div>"})}' +
'document.querySelectorAll(".v2h-data").forEach(r)})();\n<' + '/script>';

function generatePageHTML(page, forPublish) {
  const originalEls = S.els;
  S.els = page.els || [];
  const W = ws.clientWidth || 1200, H = ws.clientHeight || 800;
  let kf = '', ec = '', eh = '', hasData = false;
  const used = new Set(); S.els.forEach(e => used.add(e.animation.type)); used.forEach(a => { if (AN[a] && AN[a].c) kf += AN[a].c + '\n'; });
  const assetsMap = {}; let assetIdx = 1;

  S.els.forEach(el => {
    const cls = 'sf-' + el.id;
    let an = '';
    if (el.animation.type !== 'none') an = 'animation:' + el.animation.type + ' ' + el.animation.duration + ' ' + el.animation.easing + ' ' + el.animation.delay + ' ' + el.animation.iteration + ' both;transform-origin:center;';
    let imgSrc = el.src;
    if (el.type === 'image' && el.isLocal && el.src && el.src.startsWith('data:')) {
      const ext = el.src.substring('data:image/'.length, el.src.indexOf(';base64'));
      const fname = 'img_' + assetIdx + '.' + ext;
      assetsMap[fname] = el.src; imgSrc = './' + fname; assetIdx++;
    }
    const tag = el.href ? 'a' : 'div';
    const hrefAttr = el.href ? ' href="' + escHtml(el.href) + '"' : '';
    const idAttr = el.anchorId ? ' id="' + escHtml(el.anchorId) + '"' : '';

    if (el.type === 'rect') { ec += '.' + cls + '{position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;background:' + el.fill + ';border:' + el.strokeWidth + 'px solid ' + el.stroke + ';border-radius:4px;opacity:' + el.opacity + ';text-decoration:none;' + an + '}\n'; eh += '    <' + tag + ' class="' + cls + '"' + hrefAttr + idAttr + '></' + tag + '>\n'; }
    else if (el.type === 'circle') { ec += '.' + cls + '{position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;background:' + el.fill + ';border:' + el.strokeWidth + 'px solid ' + el.stroke + ';border-radius:50%;opacity:' + el.opacity + ';text-decoration:none;' + an + '}\n'; eh += '    <' + tag + ' class="' + cls + '"' + hrefAttr + idAttr + '></' + tag + '>\n'; }
    else if (el.type === 'text') { ec += '.' + cls + '{position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;color:' + el.fill + ';font-size:' + el.fontSize + 'px;font-family:\'Space Grotesk\',system-ui,sans-serif;font-weight:600;line-height:1.2;white-space:pre-wrap;opacity:' + el.opacity + ';text-decoration:none;' + an + '}\n'; eh += '    <' + tag + ' class="' + cls + '"' + hrefAttr + idAttr + '>' + escHtml(el.text) + '</' + tag + '>\n'; }
    else if (el.type === 'image') { ec += '.' + cls + '{position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;opacity:' + el.opacity + ';text-decoration:none;' + an + '}\n'; eh += '    <' + tag + ' class="' + cls + '"' + hrefAttr + idAttr + '><img src="' + escHtml(imgSrc) + '" style="width:100%;height:100%;object-fit:cover"></' + tag + '>\n'; }
    else if (el.type === 'datalist') {
      hasData = true;
      ec += '.' + cls + '{position:absolute;left:' + el.x + 'px;top:' + el.y + 'px;width:' + el.width + 'px;height:' + el.height + 'px;opacity:' + el.opacity + ';overflow:auto;text-decoration:none;' + an + '}\n';
      if (forPublish) {
        eh += '    <div class="' + cls + ' v2h-data" data-coll="' + escHtml(el.collection) + '" data-title="' + escHtml(el.titleField) + '" data-sub="' + escHtml(el.subField) + '" data-img="' + escHtml(el.imgField) + '" data-cols="' + (el.cols || 3) + '" data-limit="' + (el.limit || 12) + '" data-cardbg="' + escHtml(el.cardBg) + '" data-cardcolor="' + escHtml(el.cardColor) + '"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-family:sans-serif;font-size:13px">Loading data…</div></div>\n';
      } else {
        eh += '    <div class="' + cls + '" style="display:flex;align-items:center;justify-content:center;color:#999;font-family:sans-serif;font-size:13px;border:2px dashed #bbb;border-radius:8px">Live data: ' + escHtml(el.collName || 'collection') + ' — renders when published with V2H</div>\n';
      }
    }
    else if (el.type === 'line' || el.type === 'freehand') {
      const d = el.type === 'line' ? 'M ' + el.x + ' ' + el.y + ' L ' + el.x2 + ' ' + el.y2 : pts2d(el.points);
      ec += '.' + cls + '{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;' + an + '}\n';
      eh += '    <svg class="' + cls + '"' + idAttr + ' xmlns="http://www.w3.org/2000/svg"><path d="' + d + '" stroke="' + el.stroke + '" stroke-width="' + el.strokeWidth + '" fill="none" stroke-linecap="round"/></svg>\n';
    }
  });

  const hasAnchors = S.els.some(e => e.anchorId);
  const smoothScroll = hasAnchors ? 'html{scroll-behavior:smooth;}' : '';
  const runtime = (forPublish && hasData) ? '  ' + DATA_RUNTIME + '\n' : '';

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + escHtml(page.name) + '</title>\n  <style>\n    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}\n    body{background:' + S.bg + ';overflow-x:hidden}\n    .canvas{position:relative;width:' + W + 'px;height:' + H + 'px;background:' + S.bg + ';overflow:hidden;margin:0 auto}\n    @media(max-width:' + W + 'px){.canvas{transform:scale(calc(100vw/' + W + '));transform-origin:top left}}\n    ' + smoothScroll + '\n' + kf + ec + '  </style>\n</head>\n<body>\n  <div class="canvas">\n' + eh + '  </div>\n' + runtime + '</body>\n</html>';

  S.els = originalEls;
  return { html, assetsMap };
}

function showExport() {
  getActivePage().els = S.els;
  const isMultiPage = S.pages.length > 1;
  const allAssets = {}; const htmlFiles = {};
  S.pages.forEach(page => {
    const res = generatePageHTML(page, false);
    const filename = (page.id === 'index' ? 'index' : page.id) + '.html';
    htmlFiles[filename] = res.html;
    Object.assign(allAssets, res.assetsMap);
  });
  if (!isMultiPage && Object.keys(allAssets).length === 0) {
    S.exCode = htmlFiles['index.html'];
    const b = new Blob([S.exCode], { type: 'text/html;charset=utf-8' }); const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'index.html'; a.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(a);
    setTimeout(() => { a.click(); setTimeout(() => { if (a.parentNode) document.body.removeChild(a); URL.revokeObjectURL(u); }, 3000); }, 100);
    toast('Downloading HTML...', 'ok'); exClose();
  } else {
    const zip = new JSZip();
    for (const fname in htmlFiles) zip.file(fname, htmlFiles[fname]);
    zip.file('v2h_state.json', JSON.stringify({ name: S.projectName, state: serializeState() }));
    for (const fname in allAssets) {
      const base64 = allAssets[fname].split(',')[1];
      zip.file(fname, base64, { base64: true });
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
      const u = URL.createObjectURL(content);
      const a = document.createElement('a'); a.href = u;
      a.download = (S.projectName.replace(/\s+/g, '_') || 'project') + '.zip';
      a.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(a);
      setTimeout(() => { a.click(); setTimeout(() => { if (a.parentNode) document.body.removeChild(a); URL.revokeObjectURL(u); }, 3000); }, 100);
      toast('Downloading ZIP...', 'ok'); exClose();
    });
  }
}
function exClose() { document.getElementById('exM').style.display = 'none'; }
function exCopy() {
  if (!S.exCode) return;
  try { navigator.clipboard.writeText(S.exCode).then(() => toast('Copied!', 'ok')).catch(() => fbCopy()); } catch (e) { fbCopy(); }
}
function exDown() {
  if (!S.exCode) return;
  const b = new Blob([S.exCode], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'index.html'; a.click();
}
function fbCopy() {
  const ta = document.createElement('textarea'); ta.value = S.exCode;
  ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01';
  document.body.appendChild(ta); ta.focus(); ta.setSelectionRange(0, ta.value.length);
  try { document.execCommand('copy'); toast('Copied!', 'ok'); } catch (e) { toast('Copy failed', 'er'); }
  document.body.removeChild(ta);
}

/* ---------------- publish ---------------- */

function showPublish() {
  if (!V2H.isAuthed()) { toast('Sign in from the dashboard to publish live', 'er'); return; }
  getActivePage().els = S.els;
  document.getElementById('pubSlug').value = V2H.slugify(S.projectName === 'Untitled' ? '' : S.projectName);
  document.getElementById('pubTitle').value = S.projectName === 'Untitled' ? '' : S.projectName;
  document.getElementById('pubDesc').value = '';
  document.getElementById('pubFavicon').value = '';
  document.getElementById('pubCss').value = '';
  document.getElementById('pubError').style.display = 'none';
  document.getElementById('pubM').style.display = 'flex';
}
function hidePublish() { document.getElementById('pubM').style.display = 'none'; }

function injectSettings(html, page, st) {
  let out = html;
  if (st.title) out = out.replace('<title>' + escHtml(page.name) + '</title>', '<title>' + escHtml(st.title) + '</title>');
  const extras = [];
  if (st.desc) extras.push('  <meta name="description" content="' + escHtml(st.desc) + '">');
  if (st.favicon) extras.push('  <link rel="icon" href="' + escHtml(st.favicon) + '">');
  if (st.css) extras.push('  <style>\n' + st.css + '\n  </style>');
  if (extras.length) out = out.replace('</head>', extras.join('\n') + '\n</head>');
  return out;
}

async function doPublish() {
  const errEl = document.getElementById('pubError');
  const btn = document.getElementById('pubBtn');
  const st = {
    slug: V2H.slugify(document.getElementById('pubSlug').value) || 'site',
    title: document.getElementById('pubTitle').value.trim(),
    desc: document.getElementById('pubDesc').value.trim(),
    favicon: document.getElementById('pubFavicon').value.trim(),
    css: document.getElementById('pubCss').value.trim()
  };
  try {
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';
    getActivePage().els = S.els;
    const pages = {}, assets = {};
    S.pages.forEach(page => {
      const res = generatePageHTML(page, true);
      const filename = (page.id === 'index' ? 'index' : page.id) + '.html';
      pages[filename] = injectSettings(res.html, page, st);
      Object.assign(assets, res.assetsMap);
    });
    if (!S.serverId) {
      const res = await V2H.api('POST', '/api/projects', { name: S.projectName, state: serializeState() });
      S.serverId = res.project.id;
      history.replaceState(null, '', '/studio.html?project=' + S.serverId);
    } else {
      await V2H.api('PUT', '/api/projects/' + S.serverId, { state: serializeState() });
    }
    const res = await V2H.api('POST', '/api/publish', { projectId: S.serverId, slug: st.slug, name: S.projectName, pages, assets, settings: st });
    S.dirty = false; uSync('saved');
    hidePublish();
    showPublishBar(res.url || '/s/' + st.slug + '/');
    toast('Published live!', 'ok');
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> Publish';
  }
}
function showPublishBar(url) {
  const bar = document.getElementById('publishBar');
  const a = document.getElementById('publishUrl');
  a.href = url; a.textContent = location.origin + url;
  bar.classList.add('active');
  setTimeout(hidePublishBar, 15000);
}
function hidePublishBar() { document.getElementById('publishBar').classList.remove('active'); }

/* ---------------- boot ---------------- */

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable) e.preventDefault(); });

if (localStorage.getItem('stack_projects') && !localStorage.getItem('v2h_projects')) { localStorage.setItem('v2h_projects', localStorage.getItem('stack_projects')); localStorage.removeItem('stack_projects'); }

(function boot() {
  const pid = new URLSearchParams(location.search).get('project');
  if (pid && V2H.isAuthed()) {
    V2H.api('GET', '/api/projects/' + pid).then(res => {
      S.projectName = res.project.name;
      applyState(res.project.state, res.project.name, res.project.id);
    }).catch(e => { toast('Could not load project: ' + e.message, 'er'); newProject(); });
  } else {
    newProject();
  }
})();
