@echo off
setlocal
cd /d "%~dp0"
echo ==============================
echo   GIT ADD / COMMIT / PUSH
echo ==============================
echo.

rem --- versao: le a ultima de versao.txt e soma 1 (0.17 -> 0.18) ---
if not exist versao.txt echo 0.17> versao.txt
set "ultima="
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -Path 'versao.txt' -Raw).Trim()"`) do set "ultima=%%v"
set "versao="
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "$p=('%ultima%').Split('.'); '{0}.{1:00}' -f [int]$p[0],([int]$p[1]+1)"`) do set "versao=%%v"
if "%versao%"=="" set "versao=%ultima%"

echo Ultima versao publicada: v%ultima%
set "escolha="
set /p "escolha=Nova versao [v%versao%] (Enter para aceitar ou digite outra, ex: 1.00): "
if not "%escolha%"=="" set "versao=%escolha%"
set "versao=%versao:v=%"
set "versao=%versao:V=%"

echo.
set "mensagem="
set /p "mensagem=Digite a mensagem do commit: "
if "%mensagem%"=="" (set "msgfinal=v%versao%") else (set "msgfinal=v%versao% - %mensagem%")

rem grava a nova versao antes do commit (vai junto no commit)
> versao.txt echo %versao%

git add .

echo.
echo Fazendo commit: %msgfinal%
git commit -m "%msgfinal%"

echo.
echo Enviando para o GitHub...
git push

echo.
echo ==============================
echo   PROCESSO CONCLUIDO - v%versao%
echo ==============================
pause
