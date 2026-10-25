@echo off
setlocal DisableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "SKILL_DIR=%%~fI"

where node >nul 2>nul
if errorlevel 1 (
  echo {"ok":false,"code":"NODE_MISSING","error":"Node.js 22 or newer was not found on PATH."}
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo {"ok":false,"code":"NODE_VERSION_UNSUPPORTED","error":"Node.js 22 or newer is required."}
  exit /b 1
)

set "CORE_BIN=%AIT_CORE_BIN%"
if not defined CORE_BIN set "CORE_BIN=%SKILL_DIR%\node_modules\ait-core\dist\src\bin.js"
if not exist "%CORE_BIN%" (
  echo {"ok":false,"code":"AIT_CORE_BIN_MISSING","error":"ait-core CLI bin was not found. Set AIT_CORE_BIN or install ait-core in the Skill directory."}
  exit /b 1
)

node "%CORE_BIN%" %*
exit /b %errorlevel%
