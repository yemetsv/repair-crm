
let input = '';

for await (const chunk of process.stdin) {
  input += chunk.toString('utf8');
}

try {
  const data = JSON.parse(input);

  const required = [
    'AUTH_MANAGER_PASSWORD_HASH',
    'AUTH_TECHNOSMART_PASSWORD_HASH',
    'AUTH_VODAFONE_PASSWORD_HASH'
  ];

  const valid = required.every(key =>
    typeof data[key] === 'string' &&
    /^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$/
      .test(data[key])
  );

  if (!valid || Object.keys(data).length !== 3) {
    console.error('MOCK FAIL');
    process.exitCode = 1;
  } else {
    console.log('MOCK STDIN PASS');
    console.log('3 password hashes validated.');
    console.log('No Cloudflare calls.');
  }
} catch {
  console.error('Invalid JSON');
  process.exitCode = 1;
}
