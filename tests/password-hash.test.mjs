
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

const PASSWORD = 'TestPassword2026!';
const ITERATIONS = 310000;

function generateHash(password) {
  const salt = randomBytes(16);

  const hash = pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    32,
    'sha256'
  );

  return [
    'pbkdf2-sha256',
    ITERATIONS,
    salt.toString('hex'),
    hash.toString('hex')
  ].join(':');
}

async function verifyHash(password, storedHash) {
  const parts = storedHash.split(':');

  if (parts.length !== 4) return false;
  if (parts[0] !== 'pbkdf2-sha256') return false;
  if (parts[1] !== String(ITERATIONS)) return false;
  if (!/^[0-9a-f]{32}$/.test(parts[2])) return false;
  if (!/^[0-9a-f]{64}$/.test(parts[3])) return false;

  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');

  const actual = pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    32,
    'sha256'
  );

  return timingSafeEqual(actual, expected);
}

test('Generated hash has correct format', () => {
  const hash = generateHash(PASSWORD);

  assert.match(
    hash,
    /^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$/
  );
});

test('Correct password matches generated hash', async () => {
  const hash = generateHash(PASSWORD);

  assert.equal(
    await verifyHash(PASSWORD, hash),
    true
  );
});

test('Wrong password does not match', async () => {
  const hash = generateHash(PASSWORD);

  assert.equal(
    await verifyHash('WrongPassword2026!', hash),
    false
  );
});

test('Different salts produce different hashes', () => {
  const first = generateHash(PASSWORD);
  const second = generateHash(PASSWORD);

  assert.notEqual(first, second);
});
