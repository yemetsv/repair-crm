
/**
 * TechnoSmart Repair CRM — isolated Auth V2 DEV.
 *
 * Password Secrets:
 * AUTH_MANAGER_PASSWORD_HASH
 * AUTH_TECHNOSMART_PASSWORD_HASH
 * AUTH_VODAFONE_PASSWORD_HASH
 *
 * Hash format:
 * pbkdf2-sha256:310000:<32 hex salt>:<64 hex derived key>
 *
 * Do not deploy to the existing Auth DEV worker.
 */

import { USERS } from './auth-users.js';

const ITERATIONS = 310000;
const SESSION_TTL = 3600;
const LOGIN_WINDOW = 900;
const MAX_ATTEMPTS = 5;
const MAX_BODY_BYTES = 4096;

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://yemetsv.github.io',
]);

const encoder = new TextEncoder();

function hex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, '0')
  ).join('');
}

function fromHex(s) {
  if (!/^(?:[\da-f]{2})+$/i.test(s)) return null;

  return Uint8Array.from(
    s.match(/../g),
    part => Number.parseInt(part, 16)
  );
}

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(text)
  );

  return hex(new Uint8Array(digest));
}

async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    256
  );

  return new Uint8Array(bits);
}

async function verifyPassword(password, stored) {
  const match =
    /^pbkdf2-sha256:310000:([\da-f]{32}):([\da-f]{64})$/i
      .exec(stored || '');

  if (!match) return false;

  const expected = fromHex(match[2]);
  const actual = await derivePassword(
    password,
    fromHex(match[1])
  );

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= actual[i] ^ expected[i];
  }

  return difference === 0;
}

async function parseBody(request) {
  const contentType =
    request.headers.get('Content-Type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  const declared = request.headers.get('Content-Length');

  if (
    declared !== null &&
    Number(declared) > MAX_BODY_BYTES
  ) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return null;

  const parts = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      parts.push(value);
    }

    const buffer = new Uint8Array(size);
    let offset = 0;

    for (const part of parts) {
      buffer.set(part, offset);
      offset += part.byteLength;
    }

    const decoded = new TextDecoder(
      'utf-8',
      { fatal: true }
    ).decode(buffer);

    const body = JSON.parse(decoded);

    return (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) ? body : null;

  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function sessionFromRequest(request, env) {
  const header =
    request.headers.get('Authorization') || '';

  const match = /^Bearer ([\da-f]{64})$/.exec(header);

  if (!match) return null;

  const key = `session:${await sha256(match[1])}`;

  const session = await env.SESSIONS.get(
    key,
    { type: 'json' }
  );

  if (
    !session ||
    !Object.prototype.hasOwnProperty.call(
      USERS,
      session.username
    )
  ) {
    return null;
  }

  const expected = USERS[session.username];

  if (
    session.role !== expected.role ||
    session.point !== expected.point
  ) {
    return null;
  }

  return { key, session };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(
        JSON.stringify({ error: 'Origin not allowed' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    const cors = origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods':
        'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization',
      'Vary': 'Origin'
    } : {};

    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          'Content-Type':
            'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    if (!env.SESSIONS) {
      return reply(
        { error: 'KV not configured' },
        500
      );
    }

    const path = new URL(request.url).pathname;

    // Health check
    if (
      path === '/health' &&
      request.method === 'GET'
    ) {
      return reply({
        status: 'ok',
        service: 'technosmart-repair-auth-v2-dev'
      });
    }

    // Login
    if (
      path === '/login' &&
      request.method === 'POST'
    ) {
      const body = await parseBody(request);

      if (
        !body ||
        typeof body.username !== 'string' ||
        typeof body.password !== 'string' ||
        body.username.length > 64 ||
        body.password.length === 0 ||
        body.password.length > 256
      ) {
        return reply(
          { error: 'Invalid request' },
          400
        );
      }

      const username =
        body.username.trim().toLowerCase();

      const ip =
        request.headers.get('CF-Connecting-IP') ||
        'unknown';

      const ipKey =
        `login-ip:${await sha256(ip)}`;

      const userKey =
        `login-user:${await sha256(username)}`;

      const attemptsIp =
        Number(await env.SESSIONS.get(ipKey)) || 0;

      const attemptsUser =
        Number(await env.SESSIONS.get(userKey)) || 0;

      if (
        attemptsIp >= MAX_ATTEMPTS ||
        attemptsUser >= MAX_ATTEMPTS
      ) {
        return reply(
          { error: 'Too many login attempts' },
          429
        );
      }

      const user =
        Object.prototype.hasOwnProperty.call(
          USERS,
          username
        )
          ? USERS[username]
          : null;

      const stored = user
        ? env[`${user.passwordSecret}_HASH`]
        : null;

      // Dummy hash for unknown users.
      const dummy =
        'pbkdf2-sha256:310000:' +
        '00000000000000000000000000000000:' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const valid = await verifyPassword(
        body.password,
        stored || dummy
      );

      if (!user || !stored || !valid) {
        await Promise.all([
          env.SESSIONS.put(
            ipKey,
            String(attemptsIp + 1),
            { expirationTtl: LOGIN_WINDOW }
          ),
          env.SESSIONS.put(
            userKey,
            String(attemptsUser + 1),
            { expirationTtl: LOGIN_WINDOW }
          )
        ]);

        return reply(
          { error: 'Invalid credentials' },
          401
        );
      }

      await Promise.all([
        env.SESSIONS.delete(ipKey),
        env.SESSIONS.delete(userKey)
      ]);

      const token = hex(
        crypto.getRandomValues(
          new Uint8Array(32)
        )
      );

      const session = {
        username,
        role: user.role,
        point: user.point
      };

      await env.SESSIONS.put(
        `session:${await sha256(token)}`,
        JSON.stringify(session),
        { expirationTtl: SESSION_TTL }
      );

      return reply({
        success: true,
        token,
        expiresIn: SESSION_TTL,
        user: session
      });
    }

    // Check session
    if (
      path === '/me' &&
      request.method === 'GET'
    ) {
      const found =
        await sessionFromRequest(request, env);

      return found
        ? reply({ user: found.session })
        : reply(
            { error: 'Unauthorized' },
            401
          );
    }

    // Logout
    if (
      path === '/logout' &&
      request.method === 'POST'
    ) {
      const found =
        await sessionFromRequest(request, env);

      if (!found) {
        return reply(
          { error: 'Unauthorized' },
          401
        );
      }

      await env.SESSIONS.delete(found.key);

      return reply({ success: true });
    }

    return reply(
      { error: 'Not found' },
      404
    );
  }
};
