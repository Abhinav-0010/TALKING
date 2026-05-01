# TALKING 🎥

A professional, industry-level **live video chat platform** — like Omegle, Chatroulette or Azar — with smart filters, real-time chat, and a beautiful dark glassmorphism UI.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎥 **Live P2P Video Chat** | WebRTC-powered peer-to-peer video calls, no plugins |
| 👥 **Gender Filter** | Admin can grant/revoke per-user access to gender matching |
| 🌍 **Country Filter** | Filter matches by country (auto-detected via IP) |
| 🔞 **Explicit Content Control** | Users can toggle an 18+ warning before connecting |
| 💬 **Real-time Chat** | In-session text chat alongside video |
| 🔐 **JWT Authentication** | Secure login/register with encrypted passwords |
| 🛡️ **Report System** | Report partners; admin reviews reports in dashboard |
| ⚙️ **Admin Dashboard** | Full user management, filter settings, reports overview |
| 🎨 **Eye-catching UI** | Dark glassmorphism, neon cyan/purple gradients, animated orbs |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
# or for development (auto-restart)
npm run dev
```

### 3. Open the app
Navigate to **http://localhost:3000**

---

## 🔑 Default Admin Account

| Field | Value |
|---|---|
| Email | `admin@talking.live` |
| Password | `Admin@1234` |

> **Change this password immediately in production!**

---

## 🗺️ Pages

| URL | Description |
|---|---|
| `/login.html` | Login / Register |
| `/index.html` | Main video chat app |
| `/admin.html` | Admin dashboard (admin only) |

---

## ⚙️ Admin Controls

The **Admin Dashboard** (`/admin.html`) lets you:

- **Overview** – User counts, gender distribution, total reports
- **Users** – View all users, enable/disable gender filter access, suspend accounts
- **Reports** – Review user-submitted reports
- **Settings** – Toggle global explicit content, gender, and country filters

### Gender Filter Access
By default new users **cannot** filter by gender. Admins can grant this privilege per-user in the Users tab.

---

## 🔧 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | (hardcoded) | Secret for signing JWTs — **change in production** |

Create a `.env` file and set these before deployment.

---

## 🏗️ Architecture

```
TALKING/
├── server.js          # Express + Socket.io + WebRTC signaling
├── db/
│   └── database.js    # SQLite schema & seed (better-sqlite3)
├── public/
│   ├── login.html     # Auth page
│   ├── index.html     # Video chat app
│   ├── admin.html     # Admin dashboard
│   ├── css/
│   │   └── style.css  # Global dark theme
│   └── js/
│       ├── auth.js    # Login/register logic
│       ├── main.js    # WebRTC + Socket.io client
│       └── admin.js   # Admin dashboard logic
└── package.json
```

### Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Database**: SQLite via `better-sqlite3`
- **Auth**: JWT (`jsonwebtoken`), bcrypt
- **Video**: WebRTC (browser-native), STUN servers
- **Frontend**: Vanilla JS, CSS glassmorphism

---

## 🛡️ Security Notes

- Passwords are hashed with bcrypt (10 rounds)
- JWTs expire after 7 days
- All socket connections are authenticated
- HTML output is escaped to prevent XSS
- SQL uses parameterised prepared statements
- Set `JWT_SECRET` via environment variable in production

---

## 📝 License

MIT
