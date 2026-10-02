@echo off
echo ==============================
echo   ENVIAR PARA O SITE DE TESTE
echo ==============================
echo.
git add .
echo.
set /p "mensagem=Digite a mensagem do commit: "
echo.
git commit -m "%mensagem%"
echo.
echo Enviando para o site de TESTE (branch teste)...
git push origin HEAD:teste --force
echo.
echo ==============================
echo   Pronto. Em 1-2 minutos o site de teste
echo   estara atualizado (endereco teste--...netlify.app).
echo   Quando estiver tudo certo, rode o up.bat
echo   para publicar no site de verdade.
echo ==============================
pause
