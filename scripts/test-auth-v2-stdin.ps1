
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$receiver = Join-Path $PSScriptRoot "mock-secret-receiver.mjs"

$users = @{
    AUTH_MANAGER_PASSWORD_HASH = "manager"
    AUTH_TECHNOSMART_PASSWORD_HASH = "technosmart"
    AUTH_VODAFONE_PASSWORD_HASH = "vodafone"
}

$payload = @{}

foreach ($entry in $users.GetEnumerator()) {
    $salt = New-Object byte[] 16
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $rng.GetBytes($salt)
    }
    finally {
        $rng.Dispose()
    }

    $derive = [Security.Cryptography.Rfc2898DeriveBytes]::new(
        "TestPassword2026!",
        $salt,
        310000,
        [Security.Cryptography.HashAlgorithmName]::SHA256
    )

    try {
        $hash = $derive.GetBytes(32)

        $saltHex = [BitConverter]::ToString(
            $salt
        ).Replace("-", "").ToLowerInvariant()

        $hashHex = [BitConverter]::ToString(
            $hash
        ).Replace("-", "").ToLowerInvariant()

        $payload[$entry.Key] = "pbkdf2-sha256:310000:$($saltHex):$($hashHex)"
    }
    finally {
        $derive.Dispose()
    }
}

$json = ConvertTo-Json -InputObject $payload -Compress

$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command node.exe).Source
$info.Arguments = ('"{0}"' -f $receiver)
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
        throw "Cannot start local test receiver."
    }

    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()

    $child.StandardInput.WriteLine($json)
    $child.StandardInput.Close()

    $child.WaitForExit()

    $output = $stdoutTask.GetAwaiter().GetResult()
    $errors = $stderrTask.GetAwaiter().GetResult()

    if ($child.ExitCode -ne 0) {
        throw "Local receiver failed. Exit code: $($child.ExitCode)"
    }

    if ($output -notmatch "MOCK STDIN PASS") {
        throw "Unexpected receiver response."
    }

    Write-Host $output.Trim()
}
finally {
    $child.Dispose()
    $payload.Clear()
    $json = $null
}
