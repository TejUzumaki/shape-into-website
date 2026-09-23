/* V2H Platform — shared API client & utilities */
'use strict';

const V2H = (() => {
  const TOKEN_KEY = 'v2h_token';
  const USER_KEY = 'v2h_user';

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  };

  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Server unreachable — is the V2H server running?');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && path.startsWith('/api/') && !path.startsWith('/api/public/')) signOut(false);
      throw new Error(data.error || ('Request failed (' + res.status + ')'));
    }
    return data;
  }

  function signIn(token, user) {
    state.token = token; state.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function signOut(refresh) {
    if (state.token) api('POST', '/api/auth/logout').catch(() => {});
    state.token = null; state.user = null;
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
    if (refresh !== false) location.href = '/';
  }
  function isAuthed() { return !!state.token; }

  function slugify(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toast(msg, type) {
    let root = document.querySelector('.toast-root');
    if (!root) { root = document.createElement('div'); root.className = 'toast-root'; document.body.appendChild(root); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'er' ? 'er' : '');
    const icon = type === 'ok' ? 'fa-check-circle' : type === 'er' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = '<i class="fas ' + icon + '"></i> ' + esc(msg);
    root.appendChild(t);
    setTimeout(() => { t.style.animation = 'to .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 2200);
  }

  /* prompt modal helper (shared across pages) */
  let promptCb = null;
  function ensurePromptModal() {
    if (document.getElementById('v2hPrompt')) return;
    const wrap = document.createElement('div');
    wrap.id = 'v2hPrompt';
    wrap.className = 'mb';
    wrap.style.display = 'none';
    wrap.innerHTML = '<div class="mx" style="min-width:320px">' +
      '<h3 id="v2hPromptTitle" style="font-size:14px;margin-bottom:12px"></h3>' +
      '<input type="text" id="v2hPromptInput" class="pi" style="margin-bottom:14px">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="bg" id="v2hPromptCancel">Cancel</button>' +
      '<button class="ba" id="v2hPromptOk">OK</button></div></div>';
    document.body.appendChild(wrap);
    document.getElementById('v2hPromptCancel').onclick = () => { wrap.style.display = 'none'; promptCb = null; };
    document.getElementById('v2hPromptOk').onclick = () => {
      const v = document.getElementById('v2hPromptInput').value.trim();
      wrap.style.display = 'none';
      if (v && promptCb) { const cb = promptCb; promptCb = null; cb(v); }
    };
    document.getElementById('v2hPromptInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('v2hPromptOk').click();
      if (e.key === 'Escape') document.getElementById('v2hPromptCancel').click();
    });
  }
  function prompt(title, value, cb) {
    ensurePromptModal();
    promptCb = cb;
    document.getElementById('v2hPromptTitle').textContent = title;
    const input = document.getElementById('v2hPromptInput');
    input.value = value || '';
    document.getElementById('v2hPrompt').style.display = 'flex';
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }
  function confirmDialog(title, cb) {
    prompt(title, '', v => { if (v.toUpperCase() === 'YES' || v.toUpperCase() === 'DELETE' || v === '') cb(); });
  }

  return { api, signIn, signOut, isAuthed, state, slugify, esc, fmtDate, toast, prompt, confirmDialog };
})();
