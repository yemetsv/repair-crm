
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ITERATIONS = 310000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

if (process.platform !== 'win32') {
  console.error('Цей генератор призначений для Windows.');
  process.exit(1);
}

const psScript = `
$ErrorActionPreference = 'Stop'
$secure = Read-Host 'Введіть пароль' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
`;

const result = spawnSync(
  'powershell.exe',
  [
  '-NoProfile',
  '-Command',
  psScript
],
  {
    encoding: 'utf8',
    windowsHide: false
  }
);

if (result.status !== 0) {
  console.error('Помилка прихованого введення пароля.');
  process.exit(1);
}

let password = result.stdout.replace(/\r?\n$/, '');

if (password.length < 16) {
  console.error('Пароль повинен містити щонайменше 16 символів.');
  process.exit(1);
}

const salt = randomBytes(SALT_BYTES);

const hash = pbkdf2Sync(
  password,
  salt,
  ITERATIONS,
  HASH_BYTES,
  'sha256'
);

password = '';

console.log('\nPBKDF2-хеш:');
console.log(
  `pbkdf2-sha256:${ITERATIONS}:${salt.toString('hex')}:${hash.toString('hex')}`
);
