import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('./data/jenni.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS shops (
  domain TEXT PRIMARY KEY,
  token TEXT NOT NULL
)`);

export default db;
