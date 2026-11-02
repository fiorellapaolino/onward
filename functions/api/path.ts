/*
 * La luz entre jugadores (Cloudflare Pages Functions).
 *   GET  /api/path → el camino de una persona que ya jugó (al azar), o { pts: null }
 *   POST /api/path → guarda el camino de quien acaba de terminar
 * Se guarda en Cloudflare KV. Para que funcione hay que crear un espacio KV y conectarlo
 * al proyecto con el nombre PATHS (ver README). Si no está conectado, el juego usa un camino de ejemplo.
 * Solo se guardan puntos del recorrido (x, z): ningún dato personal.
 */

type KV = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
  list(opts: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>
}
type Ctx = { request: Request; env: { PATHS?: KV } }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function onRequestGet({ env }: Ctx) {
  if (!env.PATHS) return json({ pts: null })
  const list = await env.PATHS.list({ prefix: 'p:', limit: 100 })
  if (!list.keys.length) return json({ pts: null })
  const key = list.keys[Math.floor(Math.random() * list.keys.length)].name
  const value = await env.PATHS.get(key)
  return value ? new Response(value, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : json({ pts: null })
}

export async function onRequestPost({ request, env }: Ctx) {
  if (!env.PATHS) return json({ ok: false }, 503)
  let body: { pts?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false }, 400)
  }
  const pts = body.pts
  const valid =
    Array.isArray(pts) &&
    pts.length >= 10 &&
    pts.length <= 1500 &&
    pts.every((p) => p && typeof p.x === 'number' && typeof p.z === 'number' && Math.abs(p.x) < 80 && p.z > -20 && p.z < 170)
  if (!valid) return json({ ok: false }, 400)
  const clean = (pts as { x: number; z: number }[]).map((p) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }))
  await env.PATHS.put(`p:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, JSON.stringify({ pts: clean }), { expirationTtl: 60 * 60 * 24 * 60 })
  return json({ ok: true })
}
