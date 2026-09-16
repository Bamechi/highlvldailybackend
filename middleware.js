// Vercel Edge Middleware: protects the Desk, the write API, and the Stage URL.
export const config = { matcher: ['/desk', '/desk.html', '/api/desk', '/stage', '/stage.html'] };

async function token() {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('hld-desk-v1'));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)hld_desk=([^;]+)/);
  const signedIn = !!m && m[1] === await token();
  const isStage = url.pathname.startsWith('/stage');

  if (isStage) {
    const k = url.searchParams.get('k');
    const stageKey = process.env.STAGE_KEY || '';
    if (signedIn || (stageKey && k === stageKey)) return;
    return new Response('Stage locked. Open /stage?k=<STAGE_KEY> or sign in at /.', { status: 401, headers: { 'content-type': 'text/plain' } });
  }
  if (signedIn) return;
  if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'content-type': 'application/json' } });
  return Response.redirect(new URL('/?next=' + encodeURIComponent(url.pathname), req.url), 302);
}
