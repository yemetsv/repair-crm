
# TechnoSmart Repair CRM - Auth V2 Secrets
# Default: DRY RUN
# Real upload requires -Upload and explicit confirmation

param(
    [switch]$Upload,
    [switch]$MockUpload
)

if ($Upload -and $MockUpload) {
    throw "Upload and MockUpload cannot be combined."
}

$ErrorActionPreference = "Stop"

$iterations = 310000

$users = @(
    "manager",
    "technosmart",
    "vodafone"
)

$secretNames = @{
    manager     = "AUTH_MANAGER_PASSWORD_HASH"
    technosmart = "AUTH_TECHNOSMART_PASSWORD_HASH"
    vodafone    = "AUTH_VODAFONE_PASSWORD_HASH"
}

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
    $plain = $null
    $derive = $null

    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            $Password
        )

        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $ptr
        )

        $derive = [Security.Cryptography.Rfc2898DeriveBytes]::new(
            $plain,
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

        $plain = $null
    }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Join-Path $root "wrangler.auth-v2-dev.jsonc"

$wrangler = Join-Path $root `
    "node_modules\wrangler\bin\wrangler.js"

# --------------------------------------------
# DRY RUN - DEFAULT
# --------------------------------------------

if (-not $Upload -and -not $MockUpload) {

    Write-Host ""
    Write-Host "TechnoSmart Auth V2 - DRY RUN"
    Write-Host "Cloudflare: disabled"
    Write-Host ""

    $allPassed = $true

    foreach ($username in $users) {

        $password = ConvertTo-SecureString `
            "TestPassword2026!" `
            -AsPlainText `
            -Force

        try {
            $hash = New-PasswordHash -Password $password

            $valid = $hash -match `
                "^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$"

            if ($valid) {
                Write-Host "${username}: PASS"
            }
            else {
                Write-Host "${username}: FAIL"
                $allPassed = $false
            }
        }
        finally {
            $password.Dispose()
            $hash = $null
        }
    }

    Write-Host ""

    if (-not $allPassed) {
        throw "DRY RUN FAIL"
    }

    Write-Host "DRY RUN PASS"
    Write-Host "No Cloudflare calls."

    exit 0
}


# --------------------------------------------
# SHARED PROCESS TRANSPORT - MOCK AND LIVE
# --------------------------------------------

function Invoke-SecretReceiver {
    param(
        [Parameter(Mandatory = $true)][string]$NodeScript,
        [Parameter(Mandatory = $true)][string]$PayloadJson,
        [Parameter(Mandatory = $true)][bool]$IsMock,
        [string]$ConfigPath = ""
    )

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $node

    if ($IsMock) {
        # Always invoke the fixed local receiver in MOCK mode.
        $info.Arguments = '"{0}"' -f $NodeScript
    }
    else {
        $info.Arguments = '"{0}" secret bulk --config "{1}"' -f $NodeScript, $ConfigPath
    }

    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true

    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = $info

    try {
        if (-not $child.Start()) {
            throw "Failed to start secret receiver."
        }

        # Drain both pipes before submitting JSON to prevent deadlocks.
        $stdoutTask = $child.StandardOutput.ReadToEndAsync()
        $stderrTask = $child.StandardError.ReadToEndAsync()
        $child.StandardInput.WriteLine($PayloadJson)
        $child.StandardInput.Close()

        if (-not $child.WaitForExit(120000)) {
            try {
                $child.Kill()
                $child.WaitForExit(5000) | Out-Null
            }
            catch {
                # The child may have already exited.
            }
            throw "Receiver timeout after 120 seconds. For LIVE, verify remote secrets before retrying."
        }

        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()

        if ($child.ExitCode -ne 0) {
            # Never print raw child output because LIVE diagnostics may contain secrets.
            $source = if ($stderr.Length -gt 0) { "stderr" } elseif ($stdout.Length -gt 0) { "stdout" } else { "no output" }
            throw "Secret receiver failed. Exit code: $($child.ExitCode). Diagnostic source: $source."
        }

        if ($IsMock) {
            if ($stdout -notmatch "MOCK STDIN PASS" -or
                $stdout -notmatch "3 password hashes validated\.") {
                throw "MOCK receiver did not confirm all three hashes."
            }
            Write-Host "MOCK STDIN PASS"
            Write-Host "3 password hashes validated."
            Write-Host "No Cloudflare calls."
        }
        else {
            Write-Host "Wrangler completed successfully."
            Write-Host "Check Auth V2 Secrets before login testing."
        }
    }
    finally {
        $child.Dispose()
    }
}

# --------------------------------------------
# MOCK UPLOAD - FIXED LOCAL RECEIVER
# --------------------------------------------

if ($MockUpload) {
    Write-Host ""
    Write-Host "TechnoSmart Auth V2 - MOCK UPLOAD"
    Write-Host "Cloudflare: disabled"

    $mockReceiver = Join-Path $PSScriptRoot "mock-secret-receiver.mjs"
    if (-not (Test-Path -LiteralPath $mockReceiver -PathType Leaf)) {
        throw "Local mock receiver not found."
    }

    $payload = @{}
    $json = $null
    try {
        foreach ($username in $users) {
            $password = ConvertTo-SecureString "TestPassword2026!" -AsPlainText -Force
            try {
                $payload[$secretNames[$username]] = New-PasswordHash -Password $password
            }
            finally {
                $password.Dispose()
            }
        }

        $json = ConvertTo-Json -InputObject $payload -Compress
        Invoke-SecretReceiver -NodeScript $mockReceiver -PayloadJson $json -IsMock $true
        Write-Host "MOCK UPLOAD PASS"
    }
    finally {
        $payload.Clear()
        $json = $null
    }
    exit 0
}

# --------------------------------------------
# LIVE MODE - REQUIRES -Upload
# --------------------------------------------

Write-Host ""
Write-Host "WARNING: LIVE CLOUDFLARE SECRET UPLOAD"
Write-Host "Target: technosmart-repair-auth-v2-dev"
Write-Host "Target Worker must already exist."
Write-Host "Auth V1 must remain untouched."
Write-Host ""

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Auth V2 config not found."
}
if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
    throw "Local Wrangler not found."
}

$configText = [IO.File]::ReadAllText($config)
if ($configText -notmatch '"name"\s*:\s*"technosmart-repair-auth-v2-dev"') {
    throw "Unexpected Worker name. Upload blocked."
}
if ($configText -notmatch '"main"\s*:\s*"worker/auth-v2-dev.js"') {
    throw "Unexpected Worker entrypoint. Upload blocked."
}
if ($configText -notmatch '"workers_dev"\s*:\s*false') {
    throw "Worker public-access setting is not disabled. Upload blocked."
}
if ($configText -notmatch '"preview_urls"\s*:\s*false') {
    throw "Worker preview URLs are not disabled. Upload blocked."
}

$confirmation = Read-Host "Type UPLOAD AUTH V2 to continue"
if ($confirmation -cne "UPLOAD AUTH V2") {
    Write-Host "Cancelled. No secrets uploaded."
    exit 0
}

$payload = @{}
$json = $null
try {
    foreach ($username in $users) {
        $password = Read-Host "Enter current password for $username" -AsSecureString
        try {
            if ($password.Length -eq 0) {
                throw "Password for $username cannot be empty."
            }
            if ($password.Length -lt 16) {
                Write-Warning "Password for $username is shorter than 16 characters. Rotation is recommended."
            }
            $payload[$secretNames[$username]] = New-PasswordHash -Password $password
        }
        finally {
            $password.Dispose()
        }
    }

    $json = ConvertTo-Json -InputObject $payload -Compress
    Invoke-SecretReceiver -NodeScript $wrangler -PayloadJson $json -IsMock $false -ConfigPath $config
}
finally {
    $payload.Clear()
    $json = $null
}
