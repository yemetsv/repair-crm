
import { randomBytes, pbkdf2Sync } from 'node:crypto';

const ITERATIONS = 310000;

const USERS = [
  'manager',
  'technosmart',
  'vodafone'
];

function hashPassword(password) {
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

console.log('TechnoSmart Auth V2 — DRY RUN');
console.log('Режим: локальна перевірка');
console.log('Cloudflare: не використовується');
console.log('');

for (const username of USERS) {
  const hash = hashPassword('TestPassword2026!');

  const validFormat =
    /^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$/.test(hash);

  console.log(
    `${username}: ${validFormat ? 'PASS' : 'FAIL'}`
  );

  if (!validFormat) {
    process.exitCode = 1;
  }
}

console.log('');
console.log('Жодні паролі або хеші не виводяться.');
console.log('Cloudflare Secrets не змінено.');
