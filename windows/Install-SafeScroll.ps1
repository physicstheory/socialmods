# Downloads the newest SafeScroll.ipa and opens Sideloadly ready to install it.
# Run by double-clicking Install-SafeScroll.cmd.
$ErrorActionPreference = "Stop"
$ipaUrl = "https://github.com/physicstheory/socialmods/releases/download/latest/SafeScroll.ipa"
$folder = Join-Path ([Environment]::GetFolderPath("Desktop")) "SafeScroll"
$ipa = Join-Path $folder "SafeScroll.ipa"

function Say($text, $color = "White") { Write-Host $text -ForegroundColor $color }

Say "`n  SafeScroll installer`n" Cyan

# 1. Apple's iTunes (not the Microsoft Store version) lets Sideloadly talk to the iPhone.
$itunes = @("$env:ProgramFiles\iTunes\iTunes.exe", "${env:ProgramFiles(x86)}\iTunes\iTunes.exe") | Where-Object { Test-Path $_ }
$storeItunes = Get-AppxPackage -Name "AppleInc.iTunes" -ErrorAction SilentlyContinue
if (-not $itunes) {
    if ($storeItunes) { Say "  You have the Microsoft Store version of iTunes. Uninstall it, then install the apple.com version." Yellow }
    else { Say "  iTunes isn't installed. Install the apple.com version, then run this again." Yellow }
    Start-Process "https://www.apple.com/itunes/download/win64"
    Read-Host "`n  Press Enter to close"; exit 1
}
Say "  [ok] iTunes" Green

# 2. Sideloadly.
$sideloadly = @("$env:ProgramFiles\Sideloadly\sideloadly.exe", "${env:ProgramFiles(x86)}\Sideloadly\sideloadly.exe",
                "$env:LOCALAPPDATA\Sideloadly\sideloadly.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sideloadly) {
    Say "  Sideloadly isn't installed. Install it from sideloadly.io, then run this again." Yellow
    Start-Process "https://sideloadly.io/"
    Read-Host "`n  Press Enter to close"; exit 1
}
Say "  [ok] Sideloadly" Green

# 3. Newest app file.
New-Item -ItemType Directory -Force -Path $folder | Out-Null
Say "  Downloading the newest SafeScroll app..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ipaUrl -OutFile $ipa -UseBasicParsing
Say "  [ok] Saved to $ipa" Green

# 4. Open Sideloadly and the folder, so the file can be dragged straight in.
Start-Process $sideloadly
Start-Process explorer.exe "/select,`"$ipa`""

Say "`n  Almost done. In Sideloadly:" Cyan
Say "   1. Plug in and unlock your iPhone (tap Trust if asked)."
Say "   2. Drag SafeScroll.ipa from the window that just opened onto Sideloadly."
Say "   3. Type your Apple ID email and click Start. Enter the code that appears on your phone."
Say "`n  First time only, on the iPhone:" Cyan
Say "   - Settings > Privacy & Security > Developer Mode > On (then restart)"
Say "   - Settings > General > VPN & Device Management > your Apple ID > Trust"
Read-Host "`n  Press Enter to close"
