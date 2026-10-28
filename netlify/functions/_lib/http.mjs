const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function body(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new Error('Expected a JSON request.');
  const text = await req.text();
  if (text.length > 20000) throw new Error('Request is too large.');
  try { return JSON.parse(text); } catch { throw new Error('Invalid request body.'); }
}

export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}

export function allowMethods(req, methods) {
  return methods.includes(req.method);
}
