'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'talking.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      gender      TEXT    NOT NULL DEFAULT 'unspecified',
      country     TEXT    NOT NULL DEFAULT 'ANY',
      role        TEXT    NOT NULL DEFAULT 'user',
      can_filter_gender   INTEGER NOT NULL DEFAULT 0,
      can_filter_country  INTEGER NOT NULL DEFAULT 1,
      filter_explicit     INTEGER NOT NULL DEFAULT 1,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL REFERENCES users(id),
      reported_id INTEGER NOT NULL REFERENCES users(id),
      reason      TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS filter_settings (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      explicit_filter_on    INTEGER NOT NULL DEFAULT 1,
      gender_filter_on      INTEGER NOT NULL DEFAULT 1,
      country_filter_on     INTEGER NOT NULL DEFAULT 1,
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO filter_settings (id, explicit_filter_on, gender_filter_on, country_filter_on)
    VALUES (1, 1, 1, 1);
  `);

  // Seed default admin user (password: Admin@1234)
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Admin@1234', 10);
    db.prepare(`
      INSERT OR IGNORE INTO users (username, email, password, gender, country, role, can_filter_gender, can_filter_country)
      VALUES ('admin', 'admin@talking.live', ?, 'unspecified', 'ANY', 'admin', 1, 1)
    `).run(hash);
  }
}

module.exports = { getDb };
