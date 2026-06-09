'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const { getDb } = require('./db/database');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'talking_super_secret_jwt_key_2024';

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function getCountryFromIp(ip) {
  try {
    const clean = (ip || '').replace('::ffff:', '');
    const geo = geoip.lookup(clean);
    return geo ? geo.country : 'ANY';
  } catch {
    return 'ANY';
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, gender } = req.body;
  if (!username || !email || !password || !gender) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = getDb();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const country = getCountryFromIp(req.ip);
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password, gender, country)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(username.trim(), email.trim().toLowerCase(), hash, gender, country);
    const user = db.prepare('SELECT id, username, email, gender, country, role, can_filter_gender, can_filter_country, filter_explicit FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.json({ token: signToken({ id: user.id, role: user.role }), user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended' });

  const { password: _pw, ...safe } = user;
  res.json({ token: signToken({ id: user.id, role: user.role }), user: safe });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, gender, country, role, can_filter_gender, can_filter_country, filter_explicit, is_active FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ─── User Routes ─────────────────────────────────────────────────────────────
app.patch('/api/users/me', authMiddleware, (req, res) => {
  const { gender, country, filter_explicit } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newGender = gender || user.gender;
  const newCountry = country || user.country;
  const newExplicit = filter_explicit !== undefined ? (filter_explicit ? 1 : 0) : user.filter_explicit;

  db.prepare('UPDATE users SET gender = ?, country = ?, filter_explicit = ? WHERE id = ?')
    .run(newGender, newCountry, newExplicit, user.id);

  const updated = db.prepare('SELECT id, username, email, gender, country, role, can_filter_gender, can_filter_country, filter_explicit FROM users WHERE id = ?').get(user.id);
  res.json({ user: updated });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, email, gender, country, role, can_filter_gender, can_filter_country, filter_explicit, is_active, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

app.patch('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const { can_filter_gender, can_filter_country, is_active, role } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates = {
    can_filter_gender: can_filter_gender !== undefined ? (can_filter_gender ? 1 : 0) : user.can_filter_gender,
    can_filter_country: can_filter_country !== undefined ? (can_filter_country ? 1 : 0) : user.can_filter_country,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
    role: role || user.role,
  };

  db.prepare('UPDATE users SET can_filter_gender = ?, can_filter_country = ?, is_active = ?, role = ? WHERE id = ?')
    .run(updates.can_filter_gender, updates.can_filter_country, updates.is_active, updates.role, user.id);

  const updated = db.prepare('SELECT id, username, email, gender, country, role, can_filter_gender, can_filter_country, filter_explicit, is_active FROM users WHERE id = ?').get(user.id);
  res.json({ user: updated });
});

app.get('/api/admin/settings', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM filter_settings WHERE id = 1').get();
  res.json({ settings });
});

app.patch('/api/admin/settings', authMiddleware, adminOnly, (req, res) => {
  const { explicit_filter_on, gender_filter_on, country_filter_on } = req.body;
  const db = getDb();
  const s = db.prepare('SELECT * FROM filter_settings WHERE id = 1').get();
  db.prepare(`UPDATE filter_settings SET explicit_filter_on = ?, gender_filter_on = ?, country_filter_on = ?, updated_at = datetime('now') WHERE id = 1`)
    .run(
      explicit_filter_on !== undefined ? (explicit_filter_on ? 1 : 0) : s.explicit_filter_on,
      gender_filter_on !== undefined ? (gender_filter_on ? 1 : 0) : s.gender_filter_on,
      country_filter_on !== undefined ? (country_filter_on ? 1 : 0) : s.country_filter_on
    );
  res.json({ settings: db.prepare('SELECT * FROM filter_settings WHERE id = 1').get() });
});

app.get('/api/admin/reports', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const reports = db.prepare(`
    SELECT r.id, r.reason, r.created_at,
           u1.username AS reporter, u2.username AS reported
    FROM reports r
    JOIN users u1 ON r.reporter_id = u1.id
    JOIN users u2 ON r.reported_id = u2.id
    ORDER BY r.created_at DESC
  `).all();
  res.json({ reports });
});

app.delete('/api/admin/reports/:id', authMiddleware, adminOnly, (req, res) => {
  const db = getDb();
  const reportId = Number(req.params.id);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ error: 'Invalid report id' });
  }

  const result = db.prepare('DELETE FROM reports WHERE id = ?').run(reportId);
  if (!result.changes) return res.status(404).json({ error: 'Report not found' });
  res.json({ message: 'Report reviewed' });
});

// ─── Report Route ─────────────────────────────────────────────────────────────
app.post('/api/report', authMiddleware, (req, res) => {
  const { reported_id, reason } = req.body;
  if (!reported_id || !reason) return res.status(400).json({ error: 'reported_id and reason required' });
  const db = getDb();
  db.prepare('INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)').run(req.user.id, reported_id, reason);
  res.json({ message: 'Report submitted' });
});

// ─── WebRTC Signaling via Socket.io ──────────────────────────────────────────
// waiting pool: Map of socketId -> { user, filters }
const waitingPool = new Map();
// active sessions: Map of socketId -> partnerSocketId
const activeSessions = new Map();
// socket user map: Map of socketId -> userId (for reports)
const socketUserMap = new Map();

function verifySocketToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function getGlobalSettings() {
  const db = getDb();
  return db.prepare('SELECT * FROM filter_settings WHERE id = 1').get();
}

function findMatch(seekerSocket, seekerEntry) {
  const settings = getGlobalSettings();
  const db = getDb();
  const seekerUser = seekerEntry.user;
  const seekerFilters = seekerEntry.filters;

  for (const [candidateId, candidateEntry] of waitingPool) {
    if (candidateId === seekerSocket.id) continue;
    const candidateUser = candidateEntry.user;
    const candidateFilters = candidateEntry.filters;

    // Gender filter logic
    if (settings.gender_filter_on) {
      const seekerWantsGender = seekerUser.can_filter_gender && seekerFilters.gender && seekerFilters.gender !== 'any';
      const candidateWantsGender = candidateUser.can_filter_gender && candidateFilters.gender && candidateFilters.gender !== 'any';
      if (seekerWantsGender && candidateUser.gender !== seekerFilters.gender) continue;
      if (candidateWantsGender && seekerUser.gender !== candidateFilters.gender) continue;
    }

    // Country filter logic
    if (settings.country_filter_on) {
      const seekerWantsCountry = seekerUser.can_filter_country && seekerFilters.country && seekerFilters.country !== 'any';
      const candidateWantsCountry = candidateUser.can_filter_country && candidateFilters.country && candidateFilters.country !== 'any';
      if (seekerWantsCountry && candidateUser.country !== seekerFilters.country) continue;
      if (candidateWantsCountry && seekerUser.country !== candidateFilters.country) continue;
    }

    return { candidateId, candidateEntry };
  }
  return null;
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  const payload = verifySocketToken(token);
  if (!payload) return next(new Error('Invalid token'));
  socket.userId = payload.id;
  next();
});

io.on('connection', (socket) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, gender, country, role, can_filter_gender, can_filter_country, filter_explicit, is_active FROM users WHERE id = ?').get(socket.userId);
  if (!user || !user.is_active) { socket.disconnect(); return; }
  socketUserMap.set(socket.id, user.id);

  socket.on('find-partner', (filters = {}) => {
    // Remove from any existing session
    const oldPartner = activeSessions.get(socket.id);
    if (oldPartner) {
      io.to(oldPartner).emit('partner-left');
      activeSessions.delete(oldPartner);
      activeSessions.delete(socket.id);
    }

    const entry = { user, filters };
    waitingPool.set(socket.id, entry);

    const match = findMatch(socket, entry);
    if (match) {
      const { candidateId, candidateEntry } = match;
      waitingPool.delete(socket.id);
      waitingPool.delete(candidateId);

      const roomId = uuidv4();
      activeSessions.set(socket.id, candidateId);
      activeSessions.set(candidateId, socket.id);

      // Tell both sides who initiates the offer
      socket.emit('matched', { roomId, initiator: true, partner: { username: candidateEntry.user.username, gender: candidateEntry.user.gender, country: candidateEntry.user.country } });
      io.to(candidateId).emit('matched', { roomId, initiator: false, partner: { username: user.username, gender: user.gender, country: user.country } });
    } else {
      socket.emit('waiting');
    }
  });

  socket.on('offer', ({ offer }) => {
    const partnerId = activeSessions.get(socket.id);
    if (partnerId) io.to(partnerId).emit('offer', { offer });
  });

  socket.on('answer', ({ answer }) => {
    const partnerId = activeSessions.get(socket.id);
    if (partnerId) io.to(partnerId).emit('answer', { answer });
  });

  socket.on('ice-candidate', ({ candidate }) => {
    const partnerId = activeSessions.get(socket.id);
    if (partnerId) io.to(partnerId).emit('ice-candidate', { candidate });
  });

  socket.on('chat-message', ({ text }) => {
    const partnerId = activeSessions.get(socket.id);
    if (partnerId && text && text.trim()) {
      io.to(partnerId).emit('chat-message', { text: text.trim().slice(0, 500), from: user.username });
    }
  });

  socket.on('skip', () => {
    const partnerId = activeSessions.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      activeSessions.delete(partnerId);
    }
    activeSessions.delete(socket.id);
    waitingPool.delete(socket.id);
    socket.emit('skipped');
  });

  socket.on('report-partner', ({ reason }) => {
    if (!reason || !reason.trim()) return;
    const partnerSocketId = activeSessions.get(socket.id);
    if (!partnerSocketId) return;
    const reportedUserId = socketUserMap.get(partnerSocketId);
    if (!reportedUserId || reportedUserId === user.id) return;
    const db = getDb();
    db.prepare('INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)')
      .run(user.id, reportedUserId, reason.trim().slice(0, 255));
  });

  socket.on('disconnect', () => {
    socketUserMap.delete(socket.id);
    waitingPool.delete(socket.id);
    const partnerId = activeSessions.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      activeSessions.delete(partnerId);
    }
    activeSessions.delete(socket.id);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
getDb(); // init DB
httpServer.listen(PORT, () => {
  console.log(`🚀 TALKING server running at http://localhost:${PORT}`);
  console.log(`   Admin login: admin@talking.live / Admin@1234`);
});
