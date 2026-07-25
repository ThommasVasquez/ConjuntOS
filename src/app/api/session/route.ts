import { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie bridge: mirrors the backend-issued session JWT into an httpOnly
 * `ec_session` cookie on the frontend origin.
 *
 * The Rust backend sets its cookie with `Domain=conjuntos.app`, which
 * browsers reject on any other origin (localhost dev, pages.dev previews).
 * Without a cookie on the frontend origin the middleware never sees a
 * session and bounces every protected page back to /login. The token is
 * only ever accepted here — validity is enforced by the backend (JWT
 * signature) on every API call.
 */

export const runtime = 'edge';

// Matches the backend session lifetime (30 days).
const MAX_AGE = 60 * 60 * 24 * 30;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export async function POST(req: NextRequest) {
  let token: unknown;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('ec_session', token, { ...COOKIE_OPTIONS, maxAge: MAX_AGE });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  // Clear on frontend origin
  res.cookies.set('ec_session', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  // Also clear on parent domain — the backend may have set ec_session with
  // Domain=.conjuntos.app, which lives in the same cookie jar for app.conjuntos.app
  res.cookies.set('ec_session', '', { ...COOKIE_OPTIONS, maxAge: 0, domain: '.conjuntos.app' });
  return res;
}
