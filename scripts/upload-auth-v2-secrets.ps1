
# TechnoSmart Repair CRM
# Auth V2 - SecureString PBKDF2 dry run
# No Cloudflare calls. No real credentials.

$ErrorActionPreference = "Stop"

$iterations = 310000

$users = @(
    "manager",
    "technosmart",
    "vodafone"
)

function New-PasswordHash {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]$Password
    )

    $salt = New-Object byte[] 16
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($salt)
    }
    finally {
        $rng.Dispose()
    }

    $ptr = [IntPtr]::Zero
    $plainPassword = $null
    $derive = $null

    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            $Password
        )

        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $ptr
        )

        $derive = [Security.Cryptography.Rfc2898DeriveBytes]::new(
            $plainPassword,
            $salt,
            $iterations,
            [Security.Cryptography.HashAlgorithmName]::SHA256
        )

        $hash = $derive.GetBytes(32)

        $saltHex = [BitConverter]::ToString(
            $salt
        ).Replace("-", "").ToLowerInvariant()

        $hashHex = [BitConverter]::ToString(
            $hash
        ).Replace("-", "").ToLowerInvariant()

        return "pbkdf2-sha256:$($iterations):$($saltHex):$($hashHex)"
    }
    finally {
        if ($null -ne $derive) {
            $derive.Dispose()
        }

        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }

        $plainPassword = $null
    }
}

Write-Host ""
Write-Host "TechnoSmart Auth V2 - DRY RUN"
Write-Host "Cloudflare: disabled"
Write-Host ""

$allPassed = $true

foreach ($username in $users) {

    # Test password only
    $securePassword = Read-Host `
    "Введіть ТЕСТОВИЙ пароль для $username" `
    -AsSecureString

    try {
        $generatedHash = New-PasswordHash `
            -Password $securePassword

        $valid = $generatedHash -match `
            "^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$"


if ($valid) {
    $parts = $generatedHash.Split(":")

    $saltBytes = New-Object byte[] 16

    for ($i = 0; $i -lt 16; $i++) {
        $saltBytes[$i] = [Convert]::ToByte(
            $parts[2].Substring($i * 2, 2), 16
        )
    }

    $expected = [Security.Cryptography.Rfc2898DeriveBytes]::new(
        "TestPassword2026!",
        $saltBytes,
        310000,
        [Security.Cryptography.HashAlgorithmName]::SHA256
    )

    try {
        $expectedHex = [BitConverter]::ToString(
            $expected.GetBytes(32)
        ).Replace("-", "").ToLowerInvariant()

        $valid = $expectedHex -ceq $parts[3]
    }
    finally {
        $expected.Dispose()
    }
}


        if ($valid) {
            Write-Host "${username}: PASS"
        }
        else {
            Write-Host "${username}: FAIL"
            $allPassed = $false
        }
    }
    finally {
        $securePassword.Dispose()
        $generatedHash = $null
    }
}

Write-Host ""

if ($allPassed) {
    Write-Host "DRY RUN PASS"
    Write-Host "No secrets uploaded."
}
else {
    Write-Host "DRY RUN FAIL"
    exit 1
}
