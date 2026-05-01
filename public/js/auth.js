/* ── auth.js – Login / Register page logic ─────────────────────────────── */
'use strict';

const API = '';

// ── Toast helper ─────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Redirect if already logged in ────────────────────────────────────────────
if (localStorage.getItem('tk_token')) {
  window.location.href = '/index.html';
}

// ── Panel switcher ────────────────────────────────────────────────────────────
document.getElementById('go-register').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('panel-login').classList.add('hidden');
  document.getElementById('panel-register').classList.remove('hidden');
});
document.getElementById('go-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('panel-register').classList.add('hidden');
  document.getElementById('panel-login').classList.remove('hidden');
});

// ── Gender card selection ─────────────────────────────────────────────────────
document.querySelectorAll('.gender-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.gender-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    card.querySelector('input[type=radio]').checked = true;
  });
});

// ── Password strength ─────────────────────────────────────────────────────────
const pwInput = document.getElementById('reg-password');
const fill = document.getElementById('strength-fill');
pwInput && pwInput.addEventListener('input', () => {
  const pw = pwInput.value;
  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const pct = (score / 5) * 100;
  fill.style.width = pct + '%';
  fill.style.background = pct <= 20 ? '#ef4444' : pct <= 60 ? '#f59e0b' : '#10b981';
});

// ── Login form ────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return toast('Please fill in all fields.', 'error');

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'Login failed', 'error');
    localStorage.setItem('tk_token', data.token);
    localStorage.setItem('tk_user', JSON.stringify(data.user));
    toast('Welcome back!', 'success');
    setTimeout(() => { window.location.href = '/index.html'; }, 600);
  } catch {
    toast('Network error, please try again.', 'error');
  }
});

// ── Register form ─────────────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const genderInput = document.querySelector('input[name="gender"]:checked');

  if (!username || !email || !password) return toast('Please fill in all fields.', 'error');
  if (!genderInput) return toast('Please select your gender.', 'error');
  if (password.length < 6) return toast('Password must be at least 6 characters.', 'error');

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, gender: genderInput.value }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'Registration failed', 'error');
    localStorage.setItem('tk_token', data.token);
    localStorage.setItem('tk_user', JSON.stringify(data.user));
    toast('Account created! 🎉', 'success');
    setTimeout(() => { window.location.href = '/index.html'; }, 800);
  } catch {
    toast('Network error, please try again.', 'error');
  }
});
