
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../worker/auth-v2-dev.js';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const AUTH_URL = 'https://auth-v2.example.test';
const ORIGIN = 'http://localhost:5173';
const TEST_PASSWORD = 'TEST-only-password-123!';

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

async function createHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 310000,
      hash: 'SHA-256'
    },
    key,
    256
  );

  return `pbkdf2-sha256:310000:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

function createMockKV() {
  const storage = new Map();

  return {
    async get(key, options) {
      const value = storage.get(key);
      if (value === undefined) return null;
      if (options?.type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },

    async put(key, value) {
      storage.set(key, String(value));
    },

    async delete(key) {
      storage.delete(key);
    }
  };
}

let testHash;

async function createEnv() {
  testHash ??= await createHash(TEST_PASSWORD);

  return {
    SESSIONS: createMockKV(),
    AUTH_MANAGER_PASSWORD_HASH: testHash,
    AUTH_TECHNOSMART_PASSWORD_HASH: testHash,
    AUTH_VODAFONE_PASSWORD_HASH: testHash
  };
}

async function send(env, path, options = {}) {
  const {
    method = 'GET',
    token,
    body,
    ip = '192.0.2.10'
  } = options;

  const headers = {
    Origin: ORIGIN,
    'CF-Connecting-IP': ip
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const request = new Request(`${AUTH_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const response = await worker.fetch(request, env);

  return {
    status: response.status,
    data: await response.json()
  };
}

async function login(env, username, password = TEST_PASSWORD) {
  return send(env, '/login', {
    method: 'POST',
    body: { username, password }
  });
}

// TEST 1
test('Correct password allows login', async () => {
  const env = await createEnv();
  const result = await login(env, 'technosmart');

  assert.equal(result.status, 200);
  assert.equal(result.data.success, true);
  assert.equal(result.data.user.username, 'technosmart');
  assert.equal(result.data.user.point, 'Техносмарт');
  assert.match(result.data.token, /^[a-f0-9]{64}$/);
});

// TEST 2
test('Wrong password is rejected', async () => {
  const env = await createEnv();
  const result = await login(
    env,
    'technosmart',
    'incorrect-password'
  );

  assert.equal(result.status, 401);
  assert.equal(result.data.error, 'Invalid credentials');
});

// TEST 3
test('Valid session works with /me', async () => {
  const env = await createEnv();
  const auth = await login(env, 'technosmart');

  assert.equal(auth.status, 200);

  const result = await send(env, '/me', {
    token: auth.data.token
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.user.username, 'technosmart');
});

// TEST 4
test('Logout succeeds', async () => {
  const env = await createEnv();
  const auth = await login(env, 'technosmart');

  assert.equal(auth.status, 200);

  const result = await send(env, '/logout', {
    method: 'POST',
    token: auth.data.token
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.success, true);
});

// TEST 5
test('Token is rejected after logout', async () => {
  const env = await createEnv();
  const auth = await login(env, 'technosmart');

  assert.equal(auth.status, 200);

  const logout = await send(env, '/logout', {
    method: 'POST',
    token: auth.data.token
  });

  assert.equal(logout.status, 200);

  const after = await send(env, '/me', {
    token: auth.data.token
  });

  assert.equal(after.status, 401);
});

// TEST 6
test('Login attempts are limited', async () => {
  const env = await createEnv();

  for (let i = 0; i < 5; i++) {
    const result = await login(
      env,
      'technosmart',
      'wrong-password'
    );

    assert.equal(result.status, 401);
  }

  const blocked = await login(env, 'technosmart');

  assert.equal(blocked.status, 429);
  assert.equal(
    blocked.data.error,
    'Too many login attempts'
  );
});

// TEST 7
test('Manager and Vodafone have correct roles', async () => {
  const managerEnv = await createEnv();
  const manager = await login(managerEnv, 'manager');

  assert.equal(manager.status, 200);
  assert.equal(manager.data.user.role, 'manager');
  assert.equal(manager.data.user.point, null);

  const vodafoneEnv = await createEnv();
  const vodafone = await login(vodafoneEnv, 'vodafone');

  assert.equal(vodafone.status, 200);
  assert.equal(vodafone.data.user.role, 'staff');
  assert.equal(vodafone.data.user.point, 'Vodafone');
});
