# Galope no Gelo · Galope en el Hielo

Jogo de ritmo para celular: unicórnios de pantufa patinam no gelo numa praça de Buenos Aires, com visual de PlayStation 1.

**Jogar:** https://rodrigofcb.github.io/galope/

## Como jogar
- Toque o casco **rosa** (esquerda) e o **azul** (direita) quando cada estrela chegar ao anel. Na estrela longa, segure os dois.
- São 3 blocos (Básico, Avançado, Mágico) de 8 compassos. Cada compasso certo encadeia uma manobra mais impressionante: quatro sem nome, duas com nome e, nos compassos 7 e 8, a pose final.
- Errou, a corrente recomeça e aquele bloco não chega mais à pontuação máxima.
- Os nomes descobertos ficam no **Álbum** (só valem partidas jogadas, não a demonstração).
- Teclado: F e J (jogador 1); Q e P (jogador 2); Esc pausa.

## Dois jogadores
Celular deitado na mesa. A tela se divide ao meio e cada um usa os dois cascos da sua borda. Por padrão os dois ficam frente a frente (a metade de cima vem girada para quem está do outro lado); para jogar lado a lado, com o celular deitado de lado, cada um gira a imagem da sua metade com ↺ ↻ na tela de "Pronto!". Os cascos e as pistas não mudam de lugar, e a escolha fica salva. Quando os dois fecham o mesmo compasso só com PERFEITO, ganham o bônus de **Sincronia**.

## Instalar no Android
Abra o link no Chrome (não no navegador interno de outro app), menu ⋮ > Instalar app. Depois de cada atualização, feche o app e abra de novo.

## Técnica
- `index.html` único (HTML, CSS e JS), sem build; Three.js r128 em `vendor/`; fontes em `fonts/` (SIL OFL, ver `fonts/LICENSE.txt`).
- Áudio sintetizado com Web Audio; o relógio da música é o do áudio, com calibração de atraso nas Opções.
- PWA com `sw.js` (funciona offline) e publicação pelo GitHub Actions (`.github/workflows/pages.yml`).
- Progresso salvo no aparelho, em `localStorage` com prefixo `galope.`.
