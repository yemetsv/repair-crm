
$ErrorActionPreference = "Stop"

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "node.exe"
$startInfo.Arguments = "-e `"process.stdin.resume();process.stdin.on('data',()=>{});process.stdin.on('end',()=>console.log('STDIN PASS'))`""
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo

try {
    if (-not $process.Start()) {
        throw "Cannot start Node.js"
    }

    $testData = @{
        test = "TEST_ONLY"
    } | ConvertTo-Json -Compress

    $process.StandardInput.WriteLine($testData)
    $process.StandardInput.Close()

    $output = $process.StandardOutput.ReadToEnd()
    $errors = $process.StandardError.ReadToEnd()

    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "Child process failed: $errors"
    }

    if ($output.Trim() -ne "STDIN PASS") {
        throw "Unexpected result"
    }

    Write-Host "STDIN PASS"
    Write-Host "No Cloudflare calls."
}
finally {
    $process.Dispose()
}
