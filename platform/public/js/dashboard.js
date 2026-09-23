/* V2H dashboard — auth, sites (projects), apps (collections), published list */
'use strict';

const TEMPLATES = [
  { id: 'blank', name: 'Blank', icon: 'fa-table', desc: 'Start from scratch', fields: [] },
  { id: 'blog', name: 'Blog', icon: 'fa-feather', desc: 'Posts with cover images', fields: [
    { key: 'title', name: 'Title', type: 'text', required: true },
    { key: 'body', name: 'Body', type: 'longtext' },
    { key: 'cover', name: 'Cover', type: 'image' },
    { key: 'published_at', name: 'Published', type: 'date' },
    { key: 'category', name: 'Category', type: 'select', options: ['News', 'Tutorial', 'Release', 'Opinion'] }
  ] },
  { id: 'products', name: 'Products', icon: 'fa-box-open', desc: 'Catalog with prices', fields: [
    { key: 'name', name: 'Name', type: 'text', required: true },
    { key: 'price', name: 'Price', type: 'number' },
    { key: 'description', name: 'Description', type: 'longtext' },
    { key: 'photo', name: 'Photo', type: 'image' },
    { key: 'category', name: 'Category', type: 'select', options: ['General', 'Featured', 'Sale'] },
    { key: 'in_stock', name: 'In stock', type: 'boolean' }
  ] },
  { id: 'crm', name: 'Contacts', icon: 'fa-address-book', desc: 'Simple CRM', fields: [
    { key: 'name', name: 'Name', type: 'text', required: true },
    { key: 'email', name: 'Email', type: 'text' },
    { key: 'phone', name: 'Phone', type: 'text' },
    { key: 'company', name: 'Company', type: 'text' },
    { key: 'status', name: 'Status', type: 'select', options: ['Lead', 'Customer', 'VIP', 'Lost'] }
  ] },
  { id: 'tasks', name: 'Tasks', icon: 'fa-list-check', desc: 'Team to-dos', fields: [
    { key: 'title', name: 'Task', type: 'text', required: true },
    { key: 'notes', name: 'Notes', type: 'longtext' },
    { key: 'due', name: 'Due date', type: 'date' },
    { key: 'priority', name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
    { key: 'done', name: 'Done', type: 'boolean' }
  ] }
];

let selectedTemplate = 'blank';
let projects = [];
let collections = [];
let sites = [];

/* ---------------- auth ---------------- */

let authMode = 'login';
function showAuth(mode) {
  authMode = mode || 'login';
  syncAuthMode();
  document.getElementById('authModal').style.display = 'flex';
  setTimeout(() => document.getElementById('authEmail').focus(), 50);
}
function hideAuth() { document.getElementById('authModal').style.display = 'none'; }
function switchAuthMode() { authMode = authMode === 'login' ? 'register' : 'login'; syncAuthMode(); }
function syncAuthMode() {
  const reg = authMode === 'register';
  document.getElementById('authTitle').textContent = reg ? 'Create your account' : 'Welcome back';
  document.getElementById('registerFields').style.display = reg ? 'block' : 'none';
  document.getElementById('authSubmit').textContent = reg ? 'Create account' : 'Sign in';
  document.getElementById('authSwitch').textContent = reg ? 'Sign in instead' : 'Create account';
  document.getElementById('authError').style.display = 'none';
}
async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPass').value;
  const name = document.getElementById('authName').value.trim();
  const errEl = document.getElementById('authError');
  try {
    document.getElementById('authSubmit').disabled = true;
    const res = await V2H.api('POST', '/api/auth/' + (authMode === 'register' ? 'register' : 'login'),
      authMode === 'register' ? { name, email, password: pass } : { email, password: pass });
    V2H.signIn(res.token, res.user);
    V2H.toast('Welcome, ' + res.user.name, 'ok');
    hideAuth();
    loadAll();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    document.getElementById('authSubmit').disabled = false;
  }
}
document.getElementById('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });

function renderUserArea() {
  const area = document.getElementById('userArea');
  if (V2H.isAuthed()) {
    area.innerHTML =
      '<span class="badge"><i class="fas fa-user"></i> ' + V2H.esc(V2H.state.user.name) + '</span>' +
      '<button onclick="V2H.signOut()" class="bg text-[11px]"><i class="fas fa-arrow-right-from-bracket"></i></button>';
  } else {
    area.innerHTML = '<button onclick="showAuth(\'login\')" class="ba text-[11px]">Sign in</button>';
  }
  document.getElementById('guestNote').classList.toggle('hidden', V2H.isAuthed());
}

/* ---------------- data ---------------- */

async function loadAll() {
  renderUserArea();
  if (!V2H.isAuthed()) {
    projects = []; collections = []; sites = [];
    renderSites(); renderApps(); renderLive();
    return;
  }
  try {
    const [p, c, s] = await Promise.all([
      V2H.api('GET', '/api/projects'),
      V2H.api('GET', '/api/collections'),
      V2H.api('GET', '/api/sites')
    ]);
    projects = p.projects || [];
    collections = c.collections || [];
    sites = s.sites || [];
  } catch (e) { V2H.toast(e.message, 'er'); }
  renderSites(); renderApps(); renderLive();
}

/* ---------------- sites (design projects) ---------------- */

function renderSites() {
  const grid = document.getElementById('sitesGrid');
  if (!projects.length) {
    grid.innerHTML = '<div class="empty md:col-span-3"><i class="fas fa-pen-ruler"></i>No design projects yet.<br>Create a site and design it visually in the Studio.</div>';
    return;
  }
  grid.innerHTML = projects.map(p => {
    const live = sites.find(s => s.projectId === p.id);
    return '<div class="gallery-card cursor-pointer" onclick="location.href=\'/studio.html?project=' + p.id + '\'">' +
      '<div class="card-thumb flex items-center justify-center overflow-hidden">' +
      (p.thumb ? '<img src="' + p.thumb + '" class="w-full h-full object-cover">' : '<i class="fas fa-pen-ruler text-2xl text-[#333]"></i>') +
      '</div><div class="card-body">' +
      '<div class="flex-1 min-w-0 pr-2"><h4 class="text-sm font-semibold truncate">' + V2H.esc(p.name) + '</h4>' +
      '<p class="text-[10px] text-[#808080]">' + V2H.fmtDate(p.updatedAt) + '</p></div>' +
      (live ? '<a href="/s/' + live.slug + '/" target="_blank" title="View live" onclick="event.stopPropagation()" class="badge live"><i class="fas fa-bolt"></i> Live</a>' : '') +
      '</div></div>';
  }).join('');
}

async function newSite() {
  if (!V2H.isAuthed()) { location.href = '/studio.html'; return; }
  V2H.prompt('New site name', 'My Site', async name => {
    try {
      const res = await V2H.api('POST', '/api/projects', { name });
      location.href = '/studio.html?project=' + res.project.id;
    } catch (e) { V2H.toast(e.message, 'er'); }
  });
}

/* ---------------- apps (collections) ---------------- */

function renderApps() {
  const grid = document.getElementById('appsGrid');
  if (!V2H.isAuthed()) {
    grid.innerHTML = '<div class="empty md:col-span-3"><i class="fas fa-database"></i>Sign in to build data apps.<br>Define a schema, add records, share a live app URL.</div>';
    return;
  }
  if (!collections.length) {
    grid.innerHTML = '<div class="empty md:col-span-3"><i class="fas fa-database"></i>No apps yet.<br>Create one — Blog, Products, Contacts, Tasks or blank.</div>';
    return;
  }
  grid.innerHTML = collections.map(c =>
    '<div class="gallery-card cursor-pointer" onclick="location.href=\'/apps.html?id=' + c.id + '\'">' +
    '<div class="p-5 flex items-center gap-4">' +
    '<div style="width:42px;height:42px;border-radius:10px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:' + V2H.esc(c.color || '#fff') + '"><i class="fas ' + V2H.esc(c.icon || 'fa-database') + ' text-base"></i></div>' +
    '<div class="flex-1 min-w-0"><h4 class="text-sm font-semibold truncate">' + V2H.esc(c.name) + '</h4>' +
    '<p class="text-[10px] text-[#808080]">' + c.recordCount + ' record' + (c.recordCount === 1 ? '' : 's') + ' · ' + c.fields.length + ' fields</p></div>' +
    '</div><div class="px-5 pb-4 flex items-center justify-between">' +
    (c.public ? '<a href="/app/' + c.slug + '" target="_blank" onclick="event.stopPropagation()" class="badge live"><i class="fas fa-bolt"></i> /app/' + c.slug + '</a>'
              : '<span class="badge"><i class="fas fa-lock"></i> Private</span>') +
    '<span class="text-[10px] text-[#808080]">' + V2H.fmtDate(c.updatedAt) + '</span>' +
    '</div></div>'
  ).join('');
}

function openNewApp() {
  if (!V2H.isAuthed()) { showAuth('register'); return; }
  selectedTemplate = 'blank';
  document.getElementById('newAppName').value = '';
  document.getElementById('templateGrid').innerHTML = TEMPLATES.map(t =>
    '<div class="li' + (t.id === 'blank' ? ' on' : '') + '" onclick="pickTemplate(\'' + t.id + '\')" style="border:1px solid var(--bd)">' +
    '<span class="ic"><i class="fas ' + t.icon + '"></i></span>' +
    '<span class="nm"><span class="block">' + t.name + '</span><span class="text-[9px] text-[#808080]">' + t.desc + '</span></span></div>'
  ).join('');
  document.getElementById('newAppModal').style.display = 'flex';
  setTimeout(() => document.getElementById('newAppName').focus(), 50);
}
function pickTemplate(id) {
  selectedTemplate = id;
  document.querySelectorAll('#templateGrid .li').forEach(el => el.classList.remove('on'));
  event.currentTarget.classList.add('on');
}
function hideNewApp() { document.getElementById('newAppModal').style.display = 'none'; }
async function createApp() {
  const name = document.getElementById('newAppName').value.trim() || 'Untitled App';
  const tpl = TEMPLATES.find(t => t.id === selectedTemplate) || TEMPLATES[0];
  const primary = tpl.fields.find(f => f.type === 'text');
  try {
    const res = await V2H.api('POST', '/api/collections', {
      name, icon: tpl.icon, color: '#ffffff',
      fields: tpl.fields,
      views: { primaryField: primary ? primary.key : null, listFields: tpl.fields.slice(0, 4).map(f => f.key), imageField: (tpl.fields.find(f => f.type === 'image') || {}).key || null, layout: 'cards' }
    });
    hideNewApp();
    location.href = '/apps.html?id=' + res.collection.id;
  } catch (e) { V2H.toast(e.message, 'er'); }
}

/* ---------------- published ---------------- */

function renderLive() {
  const list = document.getElementById('liveList');
  const entries = [
    ...sites.map(s => ({ kind: 'site', name: s.name, url: '/s/' + s.slug + '/', slug: s.slug, at: s.updatedAt })),
    ...collections.filter(c => c.public).map(c => ({ kind: 'app', name: c.name, url: '/app/' + c.slug, slug: c.slug, at: c.updatedAt }))
  ].sort((a, b) => b.at - a.at);

  if (!entries.length) {
    list.innerHTML = '<div class="empty"><i class="fas fa-rocket"></i>Nothing published yet.<br>Publish a site from the Studio, or share an app from the App Maker.</div>';
    return;
  }
  list.innerHTML = entries.map(e =>
    '<div class="panel px-4 py-3 flex items-center gap-3">' +
    '<i class="fas ' + (e.kind === 'site' ? 'fa-globe' : 'fa-mobile-screen') + ' text-[#808080] w-5 text-center"></i>' +
    '<div class="flex-1 min-w-0"><div class="text-sm font-semibold truncate">' + V2H.esc(e.name) + '</div>' +
    '<a href="' + e.url + '" target="_blank" class="text-[11px] text-[#808080] hover:text-white truncate block">' + e.url + '</a></div>' +
    '<span class="badge ' + (e.kind === 'site' ? 'live' : 'amber') + '">' + e.kind + '</span>' +
    '<a href="' + e.url + '" target="_blank" class="bg text-[10px]"><i class="fas fa-arrow-up-right-from-square"></i></a>' +
    '</div>'
  ).join('');
}

document.getElementById('newAppName').addEventListener('keydown', e => { if (e.key === 'Enter') createApp(); });

/* boot */
loadAll();
