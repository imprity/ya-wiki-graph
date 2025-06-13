@echo off

rmdir /s /q .\scripts
mkdir scripts

call npm run tsc

if %ERRORLEVEL% NEQ 0 (
	rmdir /s /q .\scripts
	GOTO :EOF
)

rmdir /s /q .\out
mkdir .\out

xcopy .\scripts .\out\scripts /E /I
xcopy .\assets .\out\assets /E /I
copy .\*.css .\out\*.css
copy .\*.html .\out\*.html

if "%1"=="debug" (
	copy debug_on.js .\out\scripts\debug.js
) else (
	copy debug_off.js .\out\scripts\debug.js
)

copy debug_off.js .\scripts\debug.js

