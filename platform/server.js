/*
 * V2H Platform — zero-dependency Node backend
 * Serves the studio/app-maker client, a JSON API (auth, projects, publishing,
 * collections & records) and published sites (/s/:slug) and apps (/app/:slug).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const SITES_DIR = path.join(DATA_DIR, 'sites');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BODY_LIMIT = 60 * 1024 * 1024; // published sites may carry base64 images

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.pdf': 'application/pdf', '.zip': 'application/zip'
};

/* ---------------- storage ---------------- */

let db = { users: [], tokens: [], projects: [], collections: [], records: {}, sites: [] };
let saveTimer = null;

function loadDb() {
  try {
    db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } catch (e) { /* first boot */ }
}
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) { console.error('db save failed:', e.message); }
  }, 50);
}
function uid(prefix) { return prefix + '_' + crypto.randomBytes(9).toString('hex'); }
function now() { return Date.now(); }
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';
}
function safeFileName(name) {
  const n = path.basename(String(name || ''));
  if (!/^[a-zA-Z0-9._-]+$/.test(n) || n.startsWith('.')) return null;
  return n;
}

fs.mkdirSync(SITES_DIR, { recursive: true });
loadDb();

/* ---------------- http helpers ---------------- */

function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {});
  res.writeHead(status, h);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function ok(res, data) { send(res, 200, data || { ok: true }); }
function fail(res, status, msg) { send(res, status, { error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch (e) { throw new Error('invalid JSON body'); }
}

/* ---------------- auth ---------------- */

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function makeToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens.push({ token, userId, expiresAt: now() + 30 * 24 * 3600 * 1000 });
  saveDb();
  return token;
}
function userFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const entry = db.tokens.find(t => t.token === token && t.expiresAt > now());
  if (!entry) return null;
  const user = db.users.find(u => u.id === entry.userId);
  return user ? { user, token } : null;
}
function requireAuth(req, res) {
  const ctx = userFromRequest(req);
  if (!ctx) { fail(res, 401, 'Sign in required'); return null; }
  return ctx;
}
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }; }

/* ---------------- domain helpers ---------------- */

const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'select', 'boolean', 'image', 'url'];
function sanitizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  const seen = new Set(); const out = [];
  for (const f of fields.slice(0, 40)) {
    if (!f || typeof f !== 'object') continue;
    const key = slugify(f.key || f.name).replace(/-/g, '_');
    if (!key || seen.has(key)) continue;
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
    seen.add(key);
    out.push({
      key, name: String(f.name || key).slice(0, 40), type,
      options: type === 'select' && Array.isArray(f.options) ? f.options.slice(0, 20).map(o => String(o).slice(0, 40)) : [],
      required: !!f.required
    });
  }
  return out;
}
function recordValueFor(type, v) {
  if (type === 'number') { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  if (type === 'boolean') return !!v;
  if (v === undefined || v === null) return '';
  return String(v).slice(0, 20000);
}
function sanitizeRecord(fields, body, prev) {
  const rec = prev ? Object.assign({}, prev) : {};
  for (const f of fields) {
    if (body[f.key] !== undefined) rec[f.key] = recordValueFor(f.type, body[f.key]);
    else if (!prev) rec[f.key] = recordValueFor(f.type, f.type === 'boolean' ? false : '');
  }
  return rec;
}
function findCollection(idOrSlug) {
  return db.collections.find(c => c.id === idOrSlug || (c.slug && c.slug === idOrSlug));
}
function collectionSummary(c) {
  return {
    id: c.id, name: c.name, slug: c.slug, icon: c.icon, color: c.color,
    fields: c.fields, views: c.views, public: !!c.public,
    recordCount: (db.records[c.id] || []).length,
    createdAt: c.createdAt, updatedAt: c.updatedAt
  };
}
function projectSummary(p) {
  return { id: p.id, name: p.name, thumb: p.thumb, createdAt: p.createdAt, updatedAt: p.updatedAt };
}

/* ---------------- publishers ---------------- */

function deleteSiteDir(slug) {
  const dir = path.join(SITES_DIR, slug);
  if (!dir.startsWith(SITES_DIR + path.sep)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- api router ---------------- */

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const route = parts.slice(1); // after /api

  /* ----- auth ----- */
  if (route[0] === 'auth') {
    if (method === 'POST' && route[1] === 'register') {
      const body = await readJson(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim().slice(0, 40) || email.split('@')[0];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Enter a valid email');
      if (password.length < 6) return fail(res, 400, 'Password needs at least 6 characters');
      if (db.users.some(u => u.email === email)) return fail(res, 409, 'That email is already registered');
      const salt = crypto.randomBytes(12).toString('hex');
      const user = { id: uid('usr'), name, email, salt, passHash: hashPassword(password, salt), createdAt: now() };
      db.users.push(user); saveDb();
      return ok(res, { token: makeToken(user.id), user: publicUser(user) });
    }
    if (method === 'POST' && route[1] === 'login') {
      const body = await readJson(req);
      const email = String(body.email || '').trim().toLowerCase();
      const user = db.users.find(u => u.email === email);
      if (!user || hashPassword(String(body.password || ''), user.salt) !== user.passHash) {
        return fail(res, 401, 'Wrong email or password');
      }
      return ok(res, { token: makeToken(user.id), user: publicUser(user) });
    }
    if (method === 'GET' && route[1] === 'me') {
      const ctx = requireAuth(req, res); if (!ctx) return;
      return ok(res, { user: publicUser(ctx.user) });
    }
    if (method === 'POST' && route[1] === 'logout') {
      const ctx = userFromRequest(req);
      if (ctx) db.tokens = db.tokens.filter(t => t.token !== ctx.token);
      saveDb();
      return ok(res);
    }
    return fail(res, 404, 'Unknown auth route');
  }

  /* ----- projects ----- */
  if (route[0] === 'projects') {
    const ctx = requireAuth(req, res); if (!ctx) return;
    const mine = () => db.projects.filter(p => p.ownerId === ctx.user.id);

    if (method === 'GET' && route.length === 1) return ok(res, { projects: mine().map(projectSummary) });

    if (method === 'POST' && route.length === 1) {
      const body = await readJson(req);
      const project = {
        id: uid('prj'), ownerId: ctx.user.id,
        name: String(body.name || 'Untitled').slice(0, 80),
        state: body.state || null, thumb: String(body.thumb || '').slice(0, 500000),
        createdAt: now(), updatedAt: now()
      };
      db.projects.push(project); saveDb();
      return ok(res, { project });
    }

    const id = route[1];
    const project = mine().find(p => p.id === id);
    if (!project) return fail(res, 404, 'Project not found');

    if (method === 'GET' && route.length === 2) return ok(res, { project });
    if (method === 'PUT' && route.length === 2) {
      const body = await readJson(req);
      if (body.name !== undefined) project.name = String(body.name).slice(0, 80);
      if (body.state !== undefined) project.state = body.state;
      if (body.thumb !== undefined) project.thumb = String(body.thumb || '').slice(0, 500000);
      project.updatedAt = now(); saveDb();
      return ok(res, { project: projectSummary(project) });
    }
    if (method === 'DELETE' && route.length === 2) {
      db.projects = db.projects.filter(p => p.id !== id); saveDb();
      return ok(res);
    }
    if (method === 'POST' && route[2] === 'duplicate') {
      const copy = JSON.parse(JSON.stringify(project));
      copy.id = uid('prj'); copy.name = project.name + ' (Copy)';
      copy.createdAt = copy.updatedAt = now();
      db.projects.push(copy); saveDb();
      return ok(res, { project: copy });
    }
    return fail(res, 404, 'Unknown project route');
  }

  /* ----- publishing sites ----- */
  if (route[0] === 'publish' && method === 'POST') {
    const ctx = requireAuth(req, res); if (!ctx) return;
    const body = await readJson(req);
    const slug = slugify(body.slug || body.name);
    const pages = body.pages || {};
    const assets = body.assets || {};
    if (!Object.keys(pages).length) return fail(res, 400, 'Nothing to publish');
    const existing = db.sites.find(s => s.slug === slug);
    if (existing && existing.ownerId !== ctx.user.id) return fail(res, 409, 'That address is taken, pick another');

    const dir = path.join(SITES_DIR, slug);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, html] of Object.entries(pages)) {
      const file = safeFileName(name);
      if (file && file.endsWith('.html')) fs.writeFileSync(path.join(dir, file), String(html));
    }
    for (const [name, b64] of Object.entries(assets)) {
      const file = safeFileName(name);
      if (!file) continue;
      const raw = String(b64).includes(',') ? String(b64).split(',')[1] : String(b64);
      try { fs.writeFileSync(path.join(dir, file), Buffer.from(raw, 'base64')); } catch (e) { /* skip bad asset */ }
    }
    const site = existing || { slug, ownerId: ctx.user.id, createdAt: now() };
    site.name = String(body.name || slug).slice(0, 80);
    site.projectId = body.projectId || site.projectId || null;
    site.settings = body.settings || {};
    site.files = [...Object.keys(pages), ...Object.keys(assets)];
    site.updatedAt = now();
    if (!existing) db.sites.push(site);
    saveDb();
    return ok(res, { site, url: '/s/' + slug + '/' });
  }

  if (route[0] === 'sites') {
    const ctx = requireAuth(req, res); if (!ctx) return;
    if (method === 'GET' && route.length === 1) {
      return ok(res, { sites: db.sites.filter(s => s.ownerId === ctx.user.id) });
    }
    const slug = route[1];
    const site = db.sites.find(s => s.slug === slug && s.ownerId === ctx.user.id);
    if (!site) return fail(res, 404, 'Site not found');
    if (method === 'DELETE' && route.length === 2) {
      deleteSiteDir(slug);
      db.sites = db.sites.filter(s => s.slug !== slug);
      saveDb();
      return ok(res);
    }
    return fail(res, 404, 'Unknown site route');
  }

  /* ----- collections (app maker) ----- */
  if (route[0] === 'collections') {
    const ctx = requireAuth(req, res); if (!ctx) return;
    const mine = () => db.collections.filter(c => c.ownerId === ctx.user.id);

    if (method === 'GET' && route.length === 1) return ok(res, { collections: mine().map(collectionSummary) });

    if (method === 'POST' && route.length === 1) {
      const body = await readJson(req);
      let slug = slugify(body.slug || body.name);
      if (db.collections.some(c => c.slug === slug)) slug = slug + '-' + crypto.randomBytes(2).toString('hex');
      const coll = {
        id: uid('col'), ownerId: ctx.user.id,
        name: String(body.name || 'Untitled App').slice(0, 60), slug,
        icon: String(body.icon || 'fa-database').slice(0, 30), color: String(body.color || '#ffffff').slice(0, 9),
        fields: sanitizeFields(body.fields), views: body.views || { primaryField: null, listFields: [], imageField: null, layout: 'cards' },
        public: !!body.public, createdAt: now(), updatedAt: now()
      };
      db.collections.push(coll);
      db.records[coll.id] = [];
      saveDb();
      return ok(res, { collection: collectionSummary(coll) });
    }

    const id = route[1];
    const coll = mine().find(c => c.id === id || c.slug === id);
    if (!coll) return fail(res, 404, 'Collection not found');

    if (method === 'GET' && route.length === 2) return ok(res, { collection: collectionSummary(coll) });

    if (method === 'PUT' && route.length === 2) {
      const body = await readJson(req);
      if (body.name !== undefined) coll.name = String(body.name).slice(0, 60);
      if (body.slug !== undefined) {
        const slug = slugify(body.slug);
        if (slug && !db.collections.some(c => c.slug === slug && c.id !== coll.id)) coll.slug = slug;
        else if (slug !== coll.slug) return fail(res, 409, 'That app address is taken');
      }
      if (body.icon !== undefined) coll.icon = String(body.icon).slice(0, 30);
      if (body.color !== undefined) coll.color = String(body.color).slice(0, 9);
      if (body.fields !== undefined) coll.fields = sanitizeFields(body.fields);
      if (body.views !== undefined) coll.views = body.views;
      if (body.public !== undefined) coll.public = !!body.public;
      coll.updatedAt = now(); saveDb();
      return ok(res, { collection: collectionSummary(coll) });
    }
    if (method === 'DELETE' && route.length === 2) {
      delete db.records[coll.id];
      db.collections = db.collections.filter(c => c.id !== coll.id);
      saveDb();
      return ok(res);
    }

    /* ----- records ----- */
    if (route[2] === 'records') {
      if (!db.records[coll.id]) db.records[coll.id] = [];
      const records = db.records[coll.id];

      if (method === 'GET' && route.length === 3) {
        let out = records.slice();
        const search = String(query.get('search') || '').toLowerCase();
        if (search) out = out.filter(r => coll.fields.some(f => String(r[f.key] || '').toLowerCase().includes(search)));
        const limit = Math.min(parseInt(query.get('limit') || '200', 10) || 200, 500);
        return ok(res, { records: out.slice(0, limit), total: records.length });
      }
      if (method === 'POST' && route.length === 3) {
        const body = await readJson(req);
        const rec = sanitizeRecord(coll.fields, body, null);
        rec.id = uid('rec'); rec.createdAt = now(); rec.updatedAt = now();
        records.push(rec); coll.updatedAt = now(); saveDb();
        return ok(res, { record: rec });
      }
      const rec = records.find(r => r.id === route[3]);
      if (!rec) return fail(res, 404, 'Record not found');
      if (method === 'PUT' && route.length === 4) {
        const body = await readJson(req);
        Object.assign(rec, sanitizeRecord(coll.fields, body, rec));
        rec.updatedAt = now(); coll.updatedAt = now(); saveDb();
        return ok(res, { record: rec });
      }
      if (method === 'DELETE' && route.length === 4) {
        db.records[coll.id] = records.filter(r => r.id !== rec.id);
        saveDb();
        return ok(res);
      }
      return fail(res, 404, 'Unknown record route');
    }
    return fail(res, 404, 'Unknown collection route');
  }

  /* ----- public data endpoints (published apps + data lists on sites) ----- */
  if (route[0] === 'public' && route[1] === 'collections') {
    const coll = findCollection(route[2]);
    if (!coll) return fail(res, 404, 'Collection not found');
    const ctx = userFromRequest(req);
    const isOwner = ctx && ctx.user.id === coll.ownerId;
    if (!coll.public && !isOwner) return fail(res, 403, 'This data is not public');

    if (method === 'GET' && route.length === 3) {
      return ok(res, { collection: { name: coll.name, slug: coll.slug, icon: coll.icon, color: coll.color, fields: coll.fields, views: coll.views } });
    }
    if (method === 'GET' && route[3] === 'records') {
      let out = (db.records[coll.id] || []).slice();
      const search = String(query.get('search') || '').toLowerCase();
      if (search) out = out.filter(r => coll.fields.some(f => String(r[f.key] || '').toLowerCase().includes(search)));
      const limit = Math.min(parseInt(query.get('limit') || '200', 10) || 200, 500);
      return ok(res, { records: out.slice(0, limit), total: out.length });
    }
    return fail(res, 404, 'Unknown public route');
  }

  return fail(res, 404, 'Unknown API route');
}

/* ---------------- static & published serving ---------------- */

function serveFile(res, filePath, fallback) {
  let file = filePath;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (!fallback) return fail(res, 404, 'Not found');
    file = fallback;
    if (!fs.existsSync(file)) return fail(res, 404, 'Not found');
  }
  const ext = path.extname(file).toLowerCase();
  const isHtml = ext === '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-store' : 'public, max-age=300'
  });
  fs.createReadStream(file).pipe(res);
}

function safeJoin(base, relPath) {
  const target = path.normalize(path.join(base, relPath));
  return target.startsWith(base + path.sep) || target === base ? target : null;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(u.pathname);
  const query = u.searchParams;

  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname.replace(/\/+$/, ''), query);

    /* published sites: /s/<slug>/... */
    if (pathname.startsWith('/s/')) {
      const rest = pathname.slice(3); // <slug>/rest
      const slug = safeFileName(rest.split('/')[0]);
      if (!slug) return fail(res, 404, 'Not found');
      const dir = safeJoin(SITES_DIR, slug);
      if (!dir) return fail(res, 404, 'Not found');
      const rel = rest.includes('/') ? rest.slice(rest.indexOf('/') + 1) : '';
      const fallback = path.join(dir, 'index.html');
      return serveFile(res, rel ? (safeJoin(dir, rel) || dir) : dir, fallback);
    }

    /* published apps: /app/<slug> -> app runner shell */
    if (pathname.startsWith('/app/')) {
      const slug = safeFileName(pathname.slice(5).split('/')[0]);
      if (!slug) return fail(res, 400, 'Bad app address');
      const shell = path.join(PUBLIC_DIR, 'appview.html');
      if (!fs.existsSync(shell)) return fail(res, 404, 'App runner missing');
      let html = fs.readFileSync(shell, 'utf8');
      html = html.replace(/__APP_SLUG__/g, slug);
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');

    /* static client */
    const rel = pathname === '/' ? '/index.html' : pathname;
    const target = safeJoin(PUBLIC_DIR, rel);
    if (!target) return fail(res, 403, 'Forbidden');
    return serveFile(res, target, path.join(PUBLIC_DIR, 'index.html'));
  } catch (e) {
    console.error(req.method, pathname, e);
    return fail(res, e.message === 'invalid JSON body' || e.message === 'payload too large' ? 400 : 500, e.message || 'Server error');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  V2H Platform');
  console.log('  Studio & dashboard : http://localhost:' + PORT);
  console.log('  Published sites    : http://localhost:' + PORT + '/s/<slug>/');
  console.log('  Published apps     : http://localhost:' + PORT + '/app/<slug>');
  console.log('');
});
