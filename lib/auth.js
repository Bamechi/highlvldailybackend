import crypto from 'node:crypto';

export const COOKIE = 'hld_desk';

export function sessionToken() {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  return crypto.createHmac('sha256', secret).update('hld-desk-v1').digest('hex');
}

export function passwordOk(input) {
  const want = (process.env.DESK_PASSWORD || 'vanta').trim().toLowerCase();
  return typeof input === 'string' && input.trim().toLowerCase() === want;
}

export function hasDeskCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return !!m && m[1] === sessionToken();
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}
