# Galope no Gelo · Galope en el Hielo

Jogo de ritmo para celular: unicórnios de pantufa patinam no gelo, numa praça de Buenos Aires ou numa discoteca neon dos anos 70, com visual de PlayStation 1.

**Jogar:** https://rodrigofcb.github.io/galope/

## Como jogar
- Toque o casco **rosa** (esquerda) e o **azul** (direita) quando cada estrela chegar ao anel. Na estrela longa, segure os dois.
- São 3 blocos (Básico, Avançado, Mágico) de 8 compassos. Cada compasso certo encadeia uma manobra mais impressionante: quatro sem nome, duas com nome e, nos compassos 7 e 8, a pose final.
- Errou, a corrente recomeça e aquele bloco não chega mais à pontuação máxima.
- Os nomes descobertos ficam no **Álbum**, separados por fase (só valem partidas jogadas, não a demonstração).
- Teclado: F e J (metade de baixo); Q e P (metade de cima); Esc pausa.

## Fases
Depois de escolher o modo, vem a escolha da fase (a última escolhida fica salva e é a da demonstração):
- **Fase 1 · Pista de Buenos Aires**: gelo ao ar livre, ao pé do Obelisco, com música pop.
- **Fase 2 · Discoteca Neon**: boate fechada dos anos 70, com pista de gelo iluminada por baixo, palco com DJ, neon e globo de espelhos. Música de discoteca (bumbo em todas as batidas, baixo pulando oitavas, cordas e guitarra abafada), notas novas e todas as manobras novas: hustle, pato com o dedo para o alto, robô de costas, mortal grupado, pião globo de espelhos, moinho deitado de costas, salto até o globo e espacate deslizando, entre outras.

Cada fase tem o seu recorde e os seus 18 nomes no Álbum (9 solo e 9 a dois).

## Personagens e transformação
Depois de escolher a fase, cada jogador escolhe o seu personagem numa roda de quatro: arraste para girar a roda, toque no personagem ou no nome para escolher e toque de novo para desfazer. Na dupla, um celular desenhado ao lado de cada jogador mostra a metade da tela que vai ser dele, e Inverter troca os lados. Antes da partida vem a transformação em unicórnio, no estilo das garotas mágicas dos anos 90: **2×** acelera e **Pular** vai direto para a pista. Na dupla, cada lado tem os seus botões e a sua orientação de imagem. "Jogar de novo" e "Recomeçar" vão direto para a pista, com os mesmos personagens.

## Dois jogadores
Celular deitado na mesa. A tela se divide ao meio e cada um usa os dois cascos da sua borda. Por padrão os dois ficam frente a frente (a metade de cima vem girada para quem está do outro lado); para jogar lado a lado, com o celular deitado de lado, cada um gira a imagem da sua metade com ↺ ↻ na tela de "Pronto!". Os cascos e as pistas não mudam de lugar, e a escolha fica salva. Quando os dois fecham o mesmo compasso só com PERFEITO, ganham o bônus de **Sincronia**.

## Manobras a dois
Na dupla, se os dois chegam juntos e sem erro às manobras com nome, eles se encontram no meio da pista e cada uma vira uma manobra nova a dois, com nome próprio (na fase 1: levantamentos, roda-gigante, tango, torre no chifre e mais; na fase 2: lançamento com mortal, rodopio de mãos dadas, trenzinho, hélice, sentada nos ombros e mais). Se um erra, o outro termina sozinho e a dupla se desfaz até o próximo bloco. Se os dois estão sentados lado a lado vendo a tela do mesmo lado, a tela dividida vira uma imagem panorâmica única desde a primeira manobra a dois e continua assim pelas estrelas e pela coroa; as pistas, os cascos e o placar de cada um seguem por cima, e a tela volta a se dividir se alguém errar. Na discoteca, quando a dupla faz junta a sequência final do último bloco, o globo de espelhos desce sobre os dois e, na pose final, gira jogando feixes de luz para todos os lados. Os nomes a dois ficam numa seção própria do **Álbum**.

## Instalar no Android
Abra o link no Chrome (não no navegador interno de outro app), menu ⋮ > Instalar app. Depois de cada atualização, feche o app e abra de novo.

## Técnica
- `index.html` único (HTML, CSS e JS), sem build; Three.js r128 em `vendor/`; fontes em `fonts/` (SIL OFL, ver `fonts/LICENSE.txt`).
- Áudio sintetizado com Web Audio; o relógio da música é o do áudio, com calibração de atraso nas Opções.
- PWA com `sw.js` (funciona offline) e publicação pelo GitHub Actions (`.github/workflows/pages.yml`).
- Progresso salvo no aparelho, em `localStorage` com prefixo `galope.`.
