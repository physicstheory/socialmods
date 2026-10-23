@echo off
rem Double-click to download the newest SafeScroll iPhone app and open Sideloadly.
if exist "%~dp0Install-SafeScroll.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-SafeScroll.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/physicstheory/socialmods/HEAD/windows/Install-SafeScroll.ps1 | iex"
)
