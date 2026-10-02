@echo off
echo ==============================
echo   GIT ADD / COMMIT / PUSH
echo ==============================
echo.

git add .

echo.
set /p "mensagem=Digite a mensagem do commit: "

echo.
echo Fazendo commit...
git commit -m "%mensagem%"

echo.
echo Enviando para o GitHub...
git push

echo.
echo ==============================
echo   PROCESSO CONCLUIDO
echo ==============================
pause