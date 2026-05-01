/* ── main.js – Video Chat Application ─────────────────────────────────────── */
'use strict';

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('tk_token');
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('tk_user')); } catch {}
if (!token || !currentUser) { window.location.href = '/login.html'; }

// ── Toast helper ──────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Country list (ISO 3166-1 alpha-2 codes) ──────────────────────────────────
const COUNTRIES = [
  ['AF','Afghanistan'],['AL','Albania'],['DZ','Algeria'],['AR','Argentina'],
  ['AU','Australia'],['AT','Austria'],['BD','Bangladesh'],['BE','Belgium'],
  ['BR','Brazil'],['CA','Canada'],['CL','Chile'],['CN','China'],
  ['CO','Colombia'],['HR','Croatia'],['CZ','Czechia'],['DK','Denmark'],
  ['EG','Egypt'],['FI','Finland'],['FR','France'],['DE','Germany'],
  ['GH','Ghana'],['GR','Greece'],['HK','Hong Kong'],['HU','Hungary'],
  ['IN','India'],['ID','Indonesia'],['IR','Iran'],['IQ','Iraq'],
  ['IE','Ireland'],['IL','Israel'],['IT','Italy'],['JP','Japan'],
  ['JO','Jordan'],['KZ','Kazakhstan'],['KE','Kenya'],['KR','South Korea'],
  ['KW','Kuwait'],['LB','Lebanon'],['MY','Malaysia'],['MX','Mexico'],
  ['MA','Morocco'],['NL','Netherlands'],['NZ','New Zealand'],['NG','Nigeria'],
  ['NO','Norway'],['PK','Pakistan'],['PE','Peru'],['PH','Philippines'],
  ['PL','Poland'],['PT','Portugal'],['QA','Qatar'],['RO','Romania'],
  ['RU','Russia'],['SA','Saudi Arabia'],['RS','Serbia'],['SG','Singapore'],
  ['ZA','South Africa'],['ES','Spain'],['SE','Sweden'],['CH','Switzerland'],
  ['TW','Taiwan'],['TH','Thailand'],['TN','Tunisia'],['TR','Turkey'],
  ['UA','Ukraine'],['AE','UAE'],['GB','United Kingdom'],['US','United States'],
  ['VN','Vietnam'],['YE','Yemen'],['ZW','Zimbabwe'],
];

// ── Populate country dropdowns ────────────────────────────────────────────────
const filterCountryEl = document.getElementById('filter-country');
COUNTRIES.forEach(([code, name]) => {
  const opt = document.createElement('option');
  opt.value = code; opt.textContent = name;
  filterCountryEl.appendChild(opt);
});

// ── Hydrate user info ──────────────────────────────────────────────────────────
async function loadMe() {
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { logout(); return; }
    const { user } = await res.json();
    currentUser = user;
    localStorage.setItem('tk_user', JSON.stringify(user));
  } catch {}
  renderUserInfo();
}

function renderUserInfo() {
  const u = currentUser;
  if (!u) return;
  document.getElementById('nav-username').textContent = u.username;
  const av = document.getElementById('nav-avatar');
  av.textContent = u.username[0].toUpperCase();
  document.getElementById('my-gender').textContent = u.gender;
  document.getElementById('my-country').textContent = u.country || 'Unknown';
  const flag = countryFlag(u.country);
  document.getElementById('nav-country').textContent = flag;

  // Admin link
  if (u.role === 'admin') document.getElementById('admin-link').classList.remove('hidden');

  // Gender filter access
  if (!u.can_filter_gender) {
    document.getElementById('gender-filter-section').classList.add('filter-locked');
  }

  // Explicit content filter toggle
  document.getElementById('explicit-filter-toggle').checked = !!u.filter_explicit;
}

function countryFlag(code) {
  if (!code || code === 'ANY') return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

loadMe();

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('tk_token');
  localStorage.removeItem('tk_user');
  if (socket) socket.disconnect();
  window.location.href = '/login.html';
}
document.getElementById('btn-logout').addEventListener('click', logout);

// ── Socket.io + WebRTC setup ──────────────────────────────────────────────────
const socket = io({ auth: { token } });
socket.on('connect_error', (err) => {
  toast(err.message, 'error');
  if (err.message === 'Authentication required' || err.message === 'Invalid token') logout();
});

let localStream = null;
let peerConnection = null;
let partnerId = null;
let camEnabled = true;
let micEnabled = true;
let isSearching = false;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

// Stats
let matchedCount = 0, skippedCount = 0;

// ── Get local media ────────────────────────────────────────────────────────────
async function startLocalStream() {
  if (localStream) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('local-video').srcObject = localStream;
  } catch (err) {
    toast('Camera/microphone access denied. Please allow permissions.', 'error');
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
document.getElementById('btn-cam').addEventListener('click', () => {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
  document.getElementById('btn-cam').classList.toggle('active', !camEnabled);
  document.getElementById('btn-cam').textContent = camEnabled ? '📷' : '🚫';
});

document.getElementById('btn-mic').addEventListener('click', () => {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  document.getElementById('btn-mic').classList.toggle('active', !micEnabled);
  document.getElementById('btn-mic').textContent = micEnabled ? '🎙️' : '🔇';
});

// ── Filter toggles ────────────────────────────────────────────────────────────
document.getElementById('gender-filter-toggle').addEventListener('change', (e) => {
  document.getElementById('filter-gender').disabled = !e.target.checked;
});
document.getElementById('country-filter-toggle').addEventListener('change', (e) => {
  document.getElementById('filter-country').disabled = !e.target.checked;
});
document.getElementById('explicit-filter-toggle').addEventListener('change', async (e) => {
  await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filter_explicit: e.target.checked }),
  });
});

// ── Find partner ──────────────────────────────────────────────────────────────
function getFilters() {
  const genderOn  = document.getElementById('gender-filter-toggle').checked;
  const countryOn = document.getElementById('country-filter-toggle').checked;
  return {
    gender:  genderOn  ? document.getElementById('filter-gender').value  : 'any',
    country: countryOn ? document.getElementById('filter-country').value : 'any',
  };
}

function showWaiting(title, subtitle) {
  document.getElementById('waiting-overlay').classList.remove('hidden');
  document.getElementById('waiting-title').textContent = title;
  document.getElementById('waiting-subtitle').textContent = subtitle;
}

function hideWaiting() {
  document.getElementById('waiting-overlay').classList.add('hidden');
}

function startSearch() {
  if (!localStream) { toast('Please allow camera access first.', 'error'); return; }
  isSearching = true;
  cleanupPeer();
  clearChat();
  showWaiting('Looking for someone…', 'Applying your filters…');
  document.getElementById('btn-start').classList.add('hidden');
  document.getElementById('btn-next').classList.remove('hidden');
  document.getElementById('btn-stop').classList.remove('hidden');
  document.getElementById('btn-report').classList.add('hidden');
  document.getElementById('partner-info').style.display = 'none';
  socket.emit('find-partner', getFilters());
}

document.getElementById('btn-start').addEventListener('click', async () => {
  await startLocalStream();
  startSearch();
});

document.getElementById('btn-next').addEventListener('click', () => {
  skippedCount++;
  document.getElementById('stat-skipped').textContent = skippedCount;
  socket.emit('skip');
});

document.getElementById('btn-stop').addEventListener('click', () => {
  socket.emit('skip');
  isSearching = false;
  cleanupPeer();
  document.getElementById('btn-start').classList.remove('hidden');
  document.getElementById('btn-next').classList.add('hidden');
  document.getElementById('btn-stop').classList.add('hidden');
  showWaiting('Ready to chat?', 'Press Start to find someone to talk to.');
});

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('waiting', () => {
  showWaiting('Looking for someone…', 'Hang tight, finding the best match for you…');
});

socket.on('matched', async ({ roomId, initiator, partner }) => {
  const explicitOn = document.getElementById('explicit-filter-toggle').checked;

  if (explicitOn) {
    // Show explicit warning first
    document.getElementById('explicit-warning').classList.remove('hidden');
    document.getElementById('btn-accept-explicit').onclick = () => {
      document.getElementById('explicit-warning').classList.add('hidden');
      connectToPartner(initiator, partner);
    };
    document.getElementById('btn-skip-explicit').onclick = () => {
      document.getElementById('explicit-warning').classList.add('hidden');
      socket.emit('skip');
      setTimeout(startSearch, 200);
    };
  } else {
    connectToPartner(initiator, partner);
  }
});

async function connectToPartner(initiator, partner) {
  matchedCount++;
  document.getElementById('stat-matched').textContent = matchedCount;
  hideWaiting();

  // Show partner info
  document.getElementById('partner-info').style.display = 'flex';
  document.getElementById('partner-gender').textContent = `${genderEmoji(partner.gender)} ${partner.gender}`;
  document.getElementById('partner-country').textContent = `${countryFlag(partner.country)} ${partner.country}`;
  document.getElementById('btn-report').classList.remove('hidden');

  clearChat();
  document.getElementById('chat-input').disabled = false;

  createPeerConnection();

  if (initiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer });
  }
}

function genderEmoji(g) {
  return g === 'male' ? '👨' : g === 'female' ? '👩' : '🏳️‍🌈';
}

socket.on('offer', async ({ offer }) => {
  createPeerConnection();
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer });
});

socket.on('answer', async ({ answer }) => {
  if (peerConnection) await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', async ({ candidate }) => {
  if (peerConnection && candidate) {
    try { await peerConnection.addIceCandidate(candidate); } catch {}
  }
});

socket.on('partner-left', () => {
  toast('Your partner disconnected.', 'info');
  cleanupPeer();
  if (isSearching) {
    setTimeout(startSearch, 1000);
  } else {
    showWaiting('Partner left', 'Press Start to find a new partner.');
  }
});

socket.on('skipped', () => {
  cleanupPeer();
  showWaiting('Looking for someone…', 'Finding the next match…');
  setTimeout(() => { if (isSearching) socket.emit('find-partner', getFilters()); }, 500);
});

socket.on('chat-message', ({ text, from }) => {
  appendChat(text, from, false);
});

// ── PeerConnection ────────────────────────────────────────────────────────────
function createPeerConnection() {
  if (peerConnection) peerConnection.close();
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (e) => {
    document.getElementById('remote-video').srcObject = e.streams[0];
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) socket.emit('ice-candidate', { candidate: e.candidate });
  };

  peerConnection.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
      cleanupPeer();
    }
  };
}

function cleanupPeer() {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('chat-input').disabled = true;
  document.getElementById('btn-report').classList.add('hidden');
  document.getElementById('partner-info').style.display = 'none';
  document.getElementById('explicit-warning').classList.add('hidden');
}

// ── Report ────────────────────────────────────────────────────────────────────
document.getElementById('btn-report').addEventListener('click', async () => {
  const reason = prompt('Reason for report (spam / explicit / harassment / other):');
  if (!reason) return;
  // We don't have the partner's user ID in the client; server should track it.
  // For now, emit a socket event which the server can handle.
  socket.emit('report-partner', { reason });
  toast('Report submitted. Thank you!', 'success');
});

// ── Chat ──────────────────────────────────────────────────────────────────────
function appendChat(text, from, isMe) {
  const messages = document.getElementById('chat-messages');
  const empty = messages.querySelector('div[style]');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  msg.className = `chat-msg ${isMe ? 'me' : 'them'}`;
  msg.innerHTML = `<div class="sender">${isMe ? 'You' : from}</div>${escapeHtml(text)}`;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearChat() {
  document.getElementById('chat-messages').innerHTML = `
    <div style="text-align:center;color:var(--muted);font-size:0.8rem;margin:auto;">
      Connected! Say hello 👋
    </div>`;
}

const chatInput = document.getElementById('chat-input');
const btnSend   = document.getElementById('btn-send');

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { text });
  appendChat(text, 'You', true);
  chatInput.value = '';
}

btnSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ── Init local stream on load ─────────────────────────────────────────────────
startLocalStream();
