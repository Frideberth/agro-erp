DIAPP — VERSÃO PWA

Esta pasta contém a versão preparada para instalação como aplicativo no iPhone.

IMPORTANTE: PWA precisa ser servido por HTTPS para o Safari permitir a instalação e o Service Worker funcionar. Abrir index.html diretamente pelo app Arquivos não instala a PWA.

Arquivos:
- index.html: sistema Diapp original
- manifest.webmanifest: configuração do aplicativo
- sw.js: cache/offline da PWA
- icon.svg: ícone

Instalação no iPhone:
1. Publique esta pasta em um endereço HTTPS.
2. Abra esse endereço no Safari.
3. Toque em Compartilhar.
4. Toque em “Adicionar à Tela de Início”.
5. Confirme “Adicionar”.

Depois, o Diapp abrirá em modo de aplicativo.
