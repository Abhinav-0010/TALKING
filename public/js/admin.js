/* ── admin.js – Admin Dashboard ──────────────────────────────────────────── */
'use strict';

const token = localStorage.getItem('tk_token');
const user  = (() => { try { return JSON.parse(localStorage.getItem('tk_user')); } catch { return null; } })();

// ── Auth guard ────────────────────────────────────────────────────────────────
if (!token || !user) { window.location.href = '/login.html'; }
if (user && user.role !== 'admin') { window.location.href = '/index.html'; }

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Tab navigation ────────────────────────────────────────────────────────────
const tabs = ['overview', 'users', 'reports', 'settings'];
function showTab(name) {
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  if (name === 'overview') loadOverview();
  if (name === 'users')    loadUsers();
  if (name === 'reports')  loadReports();
  if (name === 'settings') loadSettings();
}

document.querySelectorAll('.admin-nav-item[data-tab]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); showTab(el.dataset.tab); });
});

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('admin-logout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('tk_token');
  localStorage.removeItem('tk_user');
  window.location.href = '/login.html';
});

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  const { users } = await api('GET', '/api/admin/users');
  document.getElementById('stat-total-users').textContent  = users.length;
  document.getElementById('stat-active-users').textContent = users.filter(u => u.is_active).length;
  document.getElementById('stat-admins').textContent       = users.filter(u => u.role === 'admin').length;

  const { reports } = await api('GET', '/api/admin/reports');
  document.getElementById('stat-total-reports').textContent = reports.length;

  // Gender chart
  const genders = {};
  users.forEach(u => { genders[u.gender] = (genders[u.gender] || 0) + 1; });
  const chart = document.getElementById('gender-chart');
  chart.innerHTML = '';
  const COLORS = { male: 'var(--cyan)', female: 'var(--pink)', other: 'var(--purple)', unspecified: 'var(--muted)' };
  Object.entries(genders).forEach(([g, count]) => {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';
    el.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:${COLORS[g]||'#888'};display:flex;align-items:center;justify-content:center;font-size:1.8rem;">
        ${g === 'male' ? '👨' : g === 'female' ? '👩' : '🏳️‍🌈'}
      </div>
      <div style="font-weight:700;font-size:1.2rem;">${count}</div>
      <div style="font-size:0.75rem;color:var(--muted);text-transform:capitalize;">${g}</div>`;
    chart.appendChild(el);
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const { users } = await api('GET', '/api/admin/users');
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${esc(u.username)}</div>
        <div style="font-size:0.75rem;color:var(--muted);">${esc(u.email)}</div>
      </td>
      <td><span class="pill pill-purple">${esc(u.gender)}</span></td>
      <td>${esc(u.country)}</td>
      <td><span class="pill ${u.role === 'admin' ? 'pill-yellow' : 'pill-cyan'}">${esc(u.role)}</span></td>
      <td>
        <label class="switch" title="Gender filter access">
          <input type="checkbox" data-uid="${u.id}" data-field="can_filter_gender" ${u.can_filter_gender ? 'checked' : ''} />
          <span class="slider-track"></span>
        </label>
      </td>
      <td>
        <span class="pill ${u.is_active ? 'pill-green' : 'pill-red'}">
          ${u.is_active ? 'Active' : 'Suspended'}
        </span>
      </td>
      <td>
        <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-ghost'}"
          data-uid="${u.id}" data-action="${u.is_active ? 'suspend' : 'activate'}">
          ${u.is_active ? '🚫 Suspend' : '✅ Activate'}
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Toggle gender filter
  tbody.querySelectorAll('input[data-field="can_filter_gender"]').forEach(el => {
    el.addEventListener('change', async () => {
      await api('PATCH', `/api/admin/users/${el.dataset.uid}`, { can_filter_gender: el.checked });
      toast(`Gender filter ${el.checked ? 'enabled' : 'disabled'} for user.`, 'success');
    });
  });

  // Suspend / activate
  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const activate = btn.dataset.action === 'activate';
      await api('PATCH', `/api/admin/users/${btn.dataset.uid}`, { is_active: activate });
      toast(`User ${activate ? 'activated' : 'suspended'}.`, 'success');
      loadUsers();
    });
  });
}

// ── Reports ───────────────────────────────────────────────────────────────────
async function loadReports() {
  const { reports } = await api('GET', '/api/admin/reports');
  const tbody = document.getElementById('reports-tbody');
  tbody.innerHTML = '';
  if (!reports.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">No reports yet.</td></tr>';
    return;
  }
  reports.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pill pill-cyan">${esc(r.reporter)}</span></td>
      <td><span class="pill pill-red">${esc(r.reported)}</span></td>
      <td>${esc(r.reason)}</td>
      <td style="color:var(--muted);font-size:0.8rem;">${new Date(r.created_at).toLocaleDateString()}</td>
      <td><button class="btn btn-sm btn-ghost" data-rid="${r.id}" data-reported="${esc(r.reported)}">Review</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-rid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reportId = btn.dataset.rid;
      if (!reportId) return;
      await api('DELETE', `/api/admin/reports/${reportId}`);
      toast('Report marked as reviewed.', 'success');
      loadReports();
      loadOverview();
    });
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const { settings } = await api('GET', '/api/admin/settings');
  document.getElementById('s-explicit').checked = !!settings.explicit_filter_on;
  document.getElementById('s-gender').checked   = !!settings.gender_filter_on;
  document.getElementById('s-country').checked  = !!settings.country_filter_on;
}

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  await api('PATCH', '/api/admin/settings', {
    explicit_filter_on: document.getElementById('s-explicit').checked,
    gender_filter_on:   document.getElementById('s-gender').checked,
    country_filter_on:  document.getElementById('s-country').checked,
  });
  toast('Settings saved!', 'success');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
showTab('overview');
