/* V2H App Maker — schema designer, record grid, view config */
'use strict';

const FIELD_TYPES = [
  ['text', 'Text'], ['longtext', 'Long text'], ['number', 'Number'], ['date', 'Date'],
  ['select', 'Select'], ['boolean', 'Checkbox'], ['image', 'Image URL'], ['url', 'Link']
];

let colls = [];
let coll = null;          // active collection
let records = [];
let editingRecord = null; // record object or null (new)
let schemaDraft = [];     // working copy of fields in schema tab

/* ---------------- boot & sidebar ---------------- */

async function boot() {
  if (!V2H.isAuthed()) { location.href = '/'; return; }
  try {
    const res = await V2H.api('GET', '/api/collections');
    colls = res.collections || [];
  } catch (e) { V2H.toast(e.message, 'er'); }
  renderSidebar();
  const want = new URLSearchParams(location.search).get('id');
  selectCollection(colls.find(c => c.id === want) || colls[0]);
}
boot();

function renderSidebar() {
  document.getElementById('collList').innerHTML = colls.map(c =>
    '<div class="li' + (coll && c.id === coll.id ? ' on' : '') + '" onclick="selectCollectionById(\'' + c.id + '\')">' +
    '<span class="ic"><i class="fas ' + V2H.esc(c.icon || 'fa-database') + '"></i></span>' +
    '<span class="nm">' + V2H.esc(c.name) + '</span>' +
    '<span class="text-[9px] text-[#808080]">' + c.recordCount + '</span></div>'
  ).join('') || '<div class="text-[10px] text-[#808080] px-2 py-4">No apps yet</div>';
}
function selectCollectionById(id) { selectCollection(colls.find(c => c.id === id)); }
async function selectCollection(c) {
  if (!c) { document.getElementById('mainWrap').style.opacity = .35; return; }
  document.getElementById('mainWrap').style.opacity = 1;
  coll = c;
  renderSidebar();
  await loadRecords();
  renderHeader(); renderGrid(); buildSchemaDraft(); renderViewsTab();
  setTab('data');
}
async function loadRecords() {
  try {
    const res = await V2H.api('GET', '/api/collections/' + coll.id + '/records');
    records = res.records || [];
  } catch (e) { records = []; V2H.toast(e.message, 'er'); }
}

async function quickNewApp() {
  V2H.prompt('New app name', '', async name => {
    try {
      const res = await V2H.api('POST', '/api/collections', {
        name,
        fields: [{ key: 'name', name: 'Name', type: 'text', required: true }, { key: 'notes', name: 'Notes', type: 'longtext' }],
        views: { primaryField: 'name', listFields: ['name', 'notes'], imageField: null, layout: 'cards' }
      });
      colls.push(res.collection);
      renderSidebar();
      selectCollection(res.collection);
      V2H.toast('App created — add fields in Schema', 'ok');
    } catch (e) { V2H.toast(e.message, 'er'); }
  });
}

/* ---------------- header ---------------- */

function renderHeader() {
  const app = coll;
  document.getElementById('appName').value = app.name;
  document.getElementById('appIcon').innerHTML = '<i class="fas ' + V2H.esc(app.icon || 'fa-database') + '"></i>';
  document.getElementById('appIcon').style.color = app.color || '#fff';
  document.getElementById('appMeta').textContent = app.recordCount + ' record' + (app.recordCount === 1 ? '' : 's') + ' · ' + app.fields.length + ' fields';
  document.getElementById('appSlug').textContent = '/app/' + app.slug;
  const pub = document.getElementById('pubToggle');
  pub.innerHTML = app.public ? '<i class="fas fa-bolt"></i> Public' : '<i class="fas fa-lock"></i> Private';
  pub.classList.toggle('on', !!app.public);
  const live = document.getElementById('openLive');
  live.href = '/app/' + app.slug;
  live.style.display = app.public ? 'inline-flex' : 'none';
  document.getElementById('shareBox').innerHTML = app.public
    ? '<a href="/app/' + app.slug + '" target="_blank" class="text-[var(--tl)] break-all">' + location.origin + '/app/' + app.slug + '</a>'
    : 'Flip to Public to share a live app URL.';
}
document.getElementById('appName').addEventListener('change', async () => {
  if (!coll) return;
  const name = document.getElementById('appName').value.trim() || coll.name;
  try {
    await V2H.api('PUT', '/api/collections/' + coll.id, { name });
    coll.name = name; renderSidebar();
    V2H.toast('Renamed', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
});

async function togglePublic() {
  if (!coll) return;
  try {
    const makingPublic = !coll.public;
    if (makingPublic && !coll.fields.length) { V2H.toast('Add at least one field first', 'er'); return; }
    await V2H.api('PUT', '/api/collections/' + coll.id, { public: makingPublic });
    coll.public = makingPublic;
    renderHeader(); renderSidebar();
    V2H.toast(makingPublic ? 'App is live at /app/' + coll.slug : 'App is private now', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
}

/* ---------------- tabs ---------------- */

function setTab(tab) {
  ['data', 'schema', 'views'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

/* ---------------- data grid ---------------- */

function fieldLabel(f) { return f ? f.name : ''; }
function cellHtml(f, v) {
  if (f.type === 'boolean') return '<td><i class="fas ' + (v ? 'fa-circle-check cell-bool on' : 'fa-circle cell-bool') + '"></i></td>';
  if (f.type === 'image') return '<td>' + (v ? '<img class="cell-img" src="' + V2H.esc(v) + '" onerror="this.style.visibility=\'hidden\'">' : '<span class="text-[#444]">—</span>') + '</td>';
  if (f.type === 'date') return '<td class="whitespace-nowrap">' + (v ? V2H.fmtDate(v) : '<span class="text-[#444]">—</span>') + '</td>';
  if (f.type === 'url') return '<td>' + (v ? '<a href="' + V2H.esc(v) + '" target="_blank" class="underline text-[#aaa]">' + V2H.esc(String(v).replace(/^https?:\/\//, '').slice(0, 30)) + '</a>' : '<span class="text-[#444]">—</span>') + '</td>';
  if (f.type === 'select') return '<td>' + (v ? '<span class="badge">' + V2H.esc(v) + '</span>' : '<span class="text-[#444]">—</span>') + '</td>';
  const s = v == null ? '' : String(v);
  return '<td title="' + V2H.esc(s) + '">' + (s ? V2H.esc(s.slice(0, 90)) : '<span class="text-[#444]">—</span>') + '</td>';
}

function renderGrid() {
  const table = document.getElementById('gridTable');
  if (!coll) { table.innerHTML = ''; return; }
  const q = (document.getElementById('searchBox').value || '').toLowerCase();
  const rows = q
    ? records.filter(r => coll.fields.some(f => String(r[f.key] || '').toLowerCase().includes(q)))
    : records;

  let h = '<thead><tr><th style="width:36px">#</th>' +
    coll.fields.map(f => '<th>' + V2H.esc(f.name) + '</th>').join('') +
    '<th style="width:90px"></th></tr></thead><tbody>';
  if (!rows.length) {
    h += '<tr><td colspan="' + (coll.fields.length + 2) + '" style="text-align:center;padding:34px;color:#666">No records' + (q ? ' matching “' + V2H.esc(q) + '”' : '') + ' — <a href="#" onclick="openRecord();return false" style="text-decoration:underline">add one</a>.</td></tr>';
  }
  rows.forEach(r => {
    h += '<tr>' +
      '<td class="text-[#444]">' + (records.indexOf(r) + 1) + '</td>' +
      coll.fields.map(f => cellHtml(f, r[f.key])).join('') +
      '<td style="white-space:nowrap">' +
      '<button onclick="openRecord(\'' + r.id + '\')" class="ab" style="height:24px;min-width:24px;font-size:9px" title="Edit"><i class="fas fa-pen"></i></button> ' +
      '<button onclick="deleteRecord(\'' + r.id + '\')" class="ab" style="height:24px;min-width:24px;font-size:9px;color:var(--dn)" title="Delete"><i class="fas fa-trash"></i></button>' +
      '</td></tr>';
  });
  table.innerHTML = h + '</tbody>';
}

/* ---------------- record modal ---------------- */

function openRecord(id) {
  if (!coll) return;
  editingRecord = id ? records.find(r => r.id === id) : null;
  document.getElementById('recMTitle').textContent = editingRecord ? 'Edit Record' : 'Add Record';
  const form = document.getElementById('recForm');
  form.innerHTML = coll.fields.map(f => {
    const val = editingRecord ? editingRecord[f.key] : '';
    const label = '<div class="pl">' + V2H.esc(f.name) + (f.required ? ' <span style="color:var(--dn)">*</span>' : '') + '</div>';
    if (f.type === 'longtext') return '<div>' + label + '<textarea class="pi" rows="3" data-fk="' + f.key + '">' + V2H.esc(val) + '</textarea></div>';
    if (f.type === 'number') return '<div>' + label + '<input type="number" class="pi" data-fk="' + f.key + '" value="' + V2H.esc(val) + '" step="any"></div>';
    if (f.type === 'date') return '<div>' + label + '<input type="date" class="pi" data-fk="' + f.key + '" value="' + V2H.esc(val) + '"></div>';
    if (f.type === 'boolean') return '<label class="flex items-center gap-2 text-xs cursor-pointer" style="margin-top:14px"><input type="checkbox" data-fk="' + f.key + '" ' + (val ? 'checked' : '') + ' style="accent-color:#fff;width:15px;height:15px"> ' + V2H.esc(f.name) + '</label>';
    if (f.type === 'select') return '<div>' + label + '<select class="pi" data-fk="' + f.key + '"><option value="">—</option>' + (f.options || []).map(o => '<option ' + (o === val ? 'selected' : '') + '>' + V2H.esc(o) + '</option>').join('') + '</select></div>';
    if (f.type === 'image') return '<div>' + label + '<div class="flex gap-2"><input type="text" class="pi" data-fk="' + f.key + '" placeholder="https://… or upload" value="' + V2H.esc(val) + '"><button class="bg shrink-0" onclick="pickImage(this)" title="Upload"><i class="fas fa-upload"></i></button></div></div>';
    return '<div>' + label + '<input type="text" class="pi" data-fk="' + f.key + '" value="' + V2H.esc(val) + '"></div>';
  }).join('');
  document.getElementById('recM').style.display = 'flex';
}
function hideRecord() { document.getElementById('recM').style.display = 'none'; }

function pickImage(btn) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 500 * 1024) { V2H.toast('Image too large — keep under 500KB or paste a URL', 'er'); return; }
    const reader = new FileReader();
    reader.onload = ev => { btn.parentElement.querySelector('input[data-fk]').value = ev.target.result; };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function saveRecord() {
  const body = {};
  document.querySelectorAll('#recForm [data-fk]').forEach(inp => {
    const f = coll.fields.find(x => x.key === inp.dataset.fk);
    if (!f) return;
    body[f.key] = f.type === 'boolean' ? inp.checked : inp.value;
  });
  const missing = coll.fields.filter(f => f.required && (body[f.key] === '' || body[f.key] == null));
  if (missing.length) { V2H.toast('Required: ' + missing.map(f => f.name).join(', '), 'er'); return; }
  try {
    if (editingRecord) {
      const res = await V2H.api('PUT', '/api/collections/' + coll.id + '/records/' + editingRecord.id, body);
      Object.assign(editingRecord, res.record);
    } else {
      const res = await V2H.api('POST', '/api/collections/' + coll.id + '/records', body);
      records.push(res.record);
      coll.recordCount++;
    }
    hideRecord(); renderGrid(); renderHeader();
    V2H.toast('Saved', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
}

async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;
  try {
    await V2H.api('DELETE', '/api/collections/' + coll.id + '/records/' + id);
    records = records.filter(r => r.id !== id);
    coll.recordCount--;
    renderGrid(); renderHeader();
    V2H.toast('Deleted', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
}

/* ---------------- schema tab ---------------- */

function buildSchemaDraft() { schemaDraft = JSON.parse(JSON.stringify(coll ? coll.fields : [])); }
function addFieldRow() {
  schemaDraft.push({ key: '', name: '', type: 'text', options: [], required: false });
  renderSchemaDraft();
}
function renderSchemaDraft() {
  const list = document.getElementById('fieldList');
  list.innerHTML = schemaDraft.map((f, i) =>
    '<div class="panel p-3 flex items-center gap-2 flex-wrap">' +
    '<div style="width:150px"><div class="pl">Label</div><input class="pi" value="' + V2H.esc(f.name) + '" onchange="schemaDraft[' + i + '].name=this.value"></div>' +
    '<div style="width:130px"><div class="pl">Type</div><select class="pi" onchange="schemaDraft[' + i + '].type=this.value;renderSchemaDraft()">' +
    FIELD_TYPES.map(([v, l]) => '<option value="' + v + '"' + (f.type === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    (f.type === 'select'
      ? '<div style="flex:1;min-width:160px"><div class="pl">Options (comma separated)</div><input class="pi" value="' + V2H.esc((f.options || []).join(', ')) + '" onchange="schemaDraft[' + i + '].options=this.value.split(\',\').map(function(s){return s.trim()}).filter(Boolean)"></div>'
      : '<div style="flex:1"></div>') +
    '<label class="flex items-center gap-1.5 text-[10px] cursor-pointer" style="margin-top:12px"><input type="checkbox" ' + (f.required ? 'checked' : '') + ' onchange="schemaDraft[' + i + '].required=this.checked" style="accent-color:#fff"> Req</label>' +
    '<div class="flex gap-1" style="margin-top:12px">' +
    '<button class="ab" onclick="moveField(' + i + ',-1)" title="Up"><i class="fas fa-arrow-up"></i></button>' +
    '<button class="ab" onclick="moveField(' + i + ',1)" title="Down"><i class="fas fa-arrow-down"></i></button>' +
    '<button class="ab" onclick="schemaDraft.splice(' + i + ',1);renderSchemaDraft()" style="color:var(--dn)" title="Remove"><i class="fas fa-trash"></i></button>' +
    '</div></div>'
  ).join('') || '<div class="text-[11px] text-[#808080]">No fields — add your first one.</div>';
}
function moveField(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= schemaDraft.length) return;
  [schemaDraft[i], schemaDraft[j]] = [schemaDraft[j], schemaDraft[i]];
  renderSchemaDraft();
}
async function saveSchema() {
  const fields = schemaDraft.filter(f => f.name.trim());
  if (!fields.length) { V2H.toast('Add at least one field with a label', 'er'); return; }
  try {
    const res = await V2H.api('PUT', '/api/collections/' + coll.id, { fields });
    coll.fields = res.collection.fields;
    coll.recordCount = res.collection.recordCount;
    buildSchemaDraft(); renderHeader(); renderGrid(); renderViewsTab();
    V2H.toast('Schema saved', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
}

/* ---------------- views tab ---------------- */

function renderViewsTab() {
  if (!coll) return;
  const v = coll.views || {};
  const fields = coll.fields;
  const mkOpts = (val, types) => '<option value="">—</option>' + fields.filter(f => !types || types.includes(f.type)).map(f =>
    '<option value="' + f.key + '"' + (f.key === val ? ' selected' : '') + '>' + V2H.esc(f.name) + '</option>').join('');
  document.getElementById('viewPrimary').innerHTML = mkOpts(v.primaryField, ['text', 'select', 'number', 'date', 'url']);
  document.getElementById('viewImage').innerHTML = mkOpts(v.imageField, ['image']);
  document.getElementById('viewLayout').value = v.layout || 'cards';
  const listSel = new Set(v.listFields || []);
  document.getElementById('viewListFields').innerHTML = fields.map(f =>
    '<label class="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" data-vf="' + f.key + '" ' + (listSel.has(f.key) ? 'checked' : '') + ' style="accent-color:#fff"> ' + V2H.esc(f.name) + '</label>'
  ).join('') || '<div class="text-[11px] text-[#808080]">No fields yet.</div>';
}
async function saveViews() {
  const views = {
    primaryField: document.getElementById('viewPrimary').value || null,
    imageField: document.getElementById('viewImage').value || null,
    layout: document.getElementById('viewLayout').value,
    listFields: [...document.querySelectorAll('#viewListFields [data-vf]')].filter(c => c.checked).map(c => c.dataset.vf)
  };
  try {
    const res = await V2H.api('PUT', '/api/collections/' + coll.id, { views });
    coll.views = res.collection.views;
    V2H.toast('Views saved', 'ok');
  } catch (e) { V2H.toast(e.message, 'er'); }
}
