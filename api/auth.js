import { COOKIE, sessionToken, passwordOk, json, readBody } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const { password } = await readBody(req);
  await new Promise(r => setTimeout(r, 700)); // slows down guessing
  if (!passwordOk(password)) return json(res, 401, { ok: false, error: 'Wrong password' });
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('set-cookie', `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`);
  return json(res, 200, { ok: true });
}
