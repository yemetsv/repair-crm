
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/auth-v2-dev.js';

const TEST_PASSWORD = 'TestPassword2026!';

// Тестовий хеш, раніше створений локальним генератором.
// Не використовувати для реальних облікових записів.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const GENERATED_HASH = (() => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(
    TEST_PASSWORD,
    salt,
    310000,
    32,
    'sha256'
  );

  return `pbkdf2-sha256:310000:${salt.toString('hex')}:${hash.toString('hex')}`;
})();

function createKV() {
  const data = new Map();

  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value) {
      data.set(key, String(value));
    },
    async delete(key) {
      data.delete(key);
    }
  };
}

async function requestLogin(password) {
  const env = {
    SESSIONS: createKV(),
    AUTH_MANAGER_PASSWORD_HASH: GENERATED_HASH,
    AUTH_TECHNOSMART_PASSWORD_HASH: GENERATED_HASH,
    AUTH_VODAFONE_PASSWORD_HASH: GENERATED_HASH
  };

  const request = new Request(
    'https://auth-v2.example.test/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'CF-Connecting-IP': '192.0.2.20'
      },
      body: JSON.stringify({
        username: 'manager',
        password
      })
    }
  );

  const response = await worker.fetch(request, env);

  return {
    status: response.status,
    body: await response.json()
  };
}

test('Generated PBKDF2 hash works with Auth V2', async () => {
  const result = await requestLogin(TEST_PASSWORD);

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.user.username, 'manager');
  assert.ok(result.body.token);
});

test('Generated hash rejects incorrect password', async () => {
  const result = await requestLogin('WrongPassword2026!');

  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Invalid credentials');
});
