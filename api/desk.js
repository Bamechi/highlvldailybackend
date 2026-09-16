// All Producer Desk writes. Cookie-guarded by middleware.js and re-checked here.
import { hasDeskCookie, json, readBody } from '../lib/auth.js';
import * as A from '../lib/actions.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  if (!hasDeskCookie(req)) return json(res, 401, { error: 'Not signed in' });
  const { action, ...p } = await readBody(req);
  try {
    switch (action) {
      case 'add': return json(res, 200, await A.addItem({ ...p, added_by: 'desk' }));
      case 'update': return json(res, 200, await A.updateItem(p.id, p.fields || {}));
      case 'status': return json(res, 200, await A.setStatus(p.id, p.status));
      case 'reorder': return json(res, 200, { ok: await A.reorder(p.ids || []) });
      case 'publish': return json(res, 200, await A.publish());
      case 'live': return json(res, 200, await A.patchState(p.patch || {}));
      case 'next': return json(res, 200, await A.go(1));
      case 'prev': return json(res, 200, await A.go(-1));
      case 'goto': return json(res, 200, await A.goto(p.idx | 0));
      case 'dirty': return json(res, 200, { dirty: await A.unpublishedChanges() });
      default: return json(res, 400, { error: `Unknown action: ${action}` });
    }
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
}
