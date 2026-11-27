[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')][string]$Variant = 'Debug',
    [switch]$Offline,
    [string]$OutputDirectory,
    [string]$SigningDirectory
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\javac.exe")) { throw 'Set JAVA_HOME to a JDK 17 or 21 installation.' }
if (-not $env:ANDROID_HOME -or -not (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe")) { throw 'Set ANDROID_HOME to your Android SDK.' }
$arguments = @('--console=plain')
if ($Offline) { $arguments += '--offline' }
if ($OutputDirectory) {
    $buildRoot = [IO.Path]::GetFullPath($OutputDirectory)
    $env:INKWORDS_BUILD_DIR = Join-Path $buildRoot 'app-build'
    $arguments += @('--project-cache-dir', (Join-Path $buildRoot 'gradle-project'))
}
if ($Variant -eq 'Release' -and $SigningDirectory) {
    $env:INKWORDS_KEYSTORE = Join-Path $SigningDirectory 'inkwords.p12'
    $protected = Get-Content (Join-Path $SigningDirectory 'key.dpapi') -Raw
    $secure = ConvertTo-SecureString $protected.Trim()
    $credential = New-Object System.Management.Automation.PSCredential('inkwords', $secure)
    $env:INKWORDS_KEY_PASSWORD = $credential.GetNetworkCredential().Password
}
if ($Variant -eq 'Release' -and (-not $env:INKWORDS_KEYSTORE -or -not $env:INKWORDS_KEY_PASSWORD)) {
    throw 'Provide INKWORDS_KEYSTORE and INKWORDS_KEY_PASSWORD (alias inkwords), or use -SigningDirectory.'
}
Push-Location -LiteralPath $project
try {
    & .\gradlew.bat @arguments ":app:assemble$Variant"
    if ($LASTEXITCODE -ne 0) { throw "Gradle exited with $LASTEXITCODE" }
    $base = if ($env:INKWORDS_BUILD_DIR) { $env:INKWORDS_BUILD_DIR } else { Join-Path $project 'app\build' }
    Get-ChildItem (Join-Path $base ("outputs\apk\" + $Variant.ToLowerInvariant())) -Filter '*.apk' | Select-Object FullName,Length
} finally {
    Pop-Location
    if ($SigningDirectory) { Remove-Item Env:INKWORDS_KEY_PASSWORD -ErrorAction SilentlyContinue }
}
