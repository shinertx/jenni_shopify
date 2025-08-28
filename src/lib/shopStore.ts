import db from './db.js';

export function saveShopToken(domain: string, token: string): void {
  db.prepare(
    'INSERT INTO shops(domain, token) VALUES (?, ?) ON CONFLICT(domain) DO UPDATE SET token = excluded.token'
  ).run(domain, token);
}

export function getShopToken(domain: string): string | undefined {
  const row = db.prepare('SELECT token FROM shops WHERE domain = ?').get(domain) as { token?: string } | undefined;
  return row?.token;
}

export function deleteShop(domain: string): void {
  db.prepare('DELETE FROM shops WHERE domain = ?').run(domain);
}
