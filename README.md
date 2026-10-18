# GHOSTS 'N GOALS 🎃⚽

L'arcade di Halloween del **Cesena FC**: un platform anni '80 nel browser, dentro un cabinato, con classifica pubblica. Hanno rapito Petrosino: tocca a te.

Il documento di game design completo è su claude.ai (link condiviso in chat).

## Stato: v0.5

| Fatto | Note |
| --- | --- |
| Accensione del cabinato, titolo, modalità attesa con classifica | |
| Selezione con barre stile NBA JAM, 5 personaggi, abilità e boost | grafica provvisoria disegnata in codice |
| Hubner sbloccabile con la parola magica (controllo sul server) | |
| Intro del rapimento | |
| Livello 1 completo: sezione A, checkpoint, sezione B al buio, boss il Mazapegùl (il folletto romagnolo: si vince rubandogli il berretto rosso) | |
| Maglia come armatura, combo, bonus, casse, zucche, cavalluccio d'oro | |
| Inserimento nome da sala giochi, classifica, pannello admin | |
| Comandi touch sul cabinato, tastiera, joypad | |
| Sfondi dipinti del livello 1 con parallasse senza ripetizioni | `tools/build_backgrounds.py` |
| Temporale: pioggia su due piani, schizzi, lampi, tuoni in ritardo | si attenua con "riduci movimento" del sistema |
| Modalità prova (invincibile) | vedi sotto |
| Statistiche: accessi, partite, ore di gioco, nemici, provenienza | pannello admin |
| Livelli 2 e 3, secondo giro NOTTE FONDA, card social, landing con conto alla rovescia | prossime versioni |

## Struttura

```
game/            il gioco (Phaser 3 + Vite)
  src/scenes/    accensione, titolo, selezione, intro, livello, inserimento nome
  src/entities/  giocatore, nemici, boss
  src/levels/    mappa dei livelli (modificabile senza toccare il codice di gioco)
  src/systems/   comandi, audio, grafica provvisoria, API
server/          backend PHP: api/ (classifica, partite, parola magica), admin/, lib/
scripts/         build e test in locale
```

## Comandi

| Tasto | Azione |
| --- | --- |
| ← → (o A D) | corsa |
| ↓ | accovacciarsi |
| Z | salto (tenuto = più alto) |
| X | tiro · ↑+X colpo di testa · in salto ↓+X rovesciata · X tenuto e rilasciato = tiro caricato |
| Invio | START / pausa |
| M | audio sì/no · F schermo intero |

Su telefono si usano joystick e pulsanti disegnati sul cabinato.

## Modalità prova (trucco)

Nella schermata del titolo scrivi **DAIBURDEL** sulla tastiera, oppure fai **↑ ↑ ↓ ↓ ← → ← → B A** con joystick, joypad o pulsanti touch. Si sente un jingle e appare "ORA SEI INVINCIBILE".

- Il personaggio non perde la maglia e non muore; se cade in una buca torna sull'ultimo punto sicuro, il tempo non scade.
- Sull'HUD lampeggia **TEST**. Le partite di prova non entrano mai in classifica (controllo anche sul server) e sono escluse dalle statistiche.
- Dura finché non si ricarica la pagina.

## Sviluppo in locale

```bash
npm install
npm run dev                         # gioco su http://localhost:5173
# in un secondo terminale, per classifica e parola magica:
GNG_CONFIG=$PWD/scripts/test/config.php php -S localhost:8000 -t server
```

`npm run build` produce `dist/`: è la cartella completa da pubblicare (gioco + PHP).

## Messa online su Serverplan

1. **Database**: crea un database MySQL dal pannello Serverplan.
2. **Configurazione**: sul server, nella cartella del sito, copia `config.sample.php` come `config.php` e compila i dati. Il file non è mai nel repository.
3. **Installazione**: apri `https://TUO-SITO/admin/setup.php`, inserisci la `setup_key` e crea l'account admin. Le tabelle si creano da sole.
4. **Pubblicazione automatica**: in GitHub → Settings → Secrets and variables → Actions aggiungi:
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
   - `FTP_STAGING_DIR` (es. `/staging.tuosito.it/`) e `FTP_PROD_DIR` (es. `/public_html/halloween/`)

   Ogni modifica su `main` va sullo staging; per andare in produzione si crea un tag di versione (es. `v1.0.0`).
5. **Staging protetto**: proteggi la cartella dello staging con password dal pannello Serverplan.

## Pannello admin (`/admin/`)

- **Classifica**: nascondi un punteggio, sostituisci un nome con BURDEL, banna un nome.
- **Parola magica**: parola attiva, calendario delle prossime (si attivano da sole), numero di sblocchi.
- **Filtro nomi**: parole vietate, con riconoscimento di varianti tipo D10 o C4ZZ0. Con `=` davanti si blocca solo la parola intera.
- **Statistiche**: accessi totali e unici, partite (totali, per personaggio e per maglia), ore di gioco, nemici sconfitti per tipo, palloni calciati e precisione, livello raggiunto, cause di morte, andamento giorno per giorno, fasce orarie, dispositivi, lingua, provenienza (aggiungi `?utm_source=instagram` ai link per distinguere i canali). Dati anonimi: gli IP non sono mai salvati in chiaro, nessun cookie. Il database si aggiorna da solo alla nuova struttura.

## Sprite veri e musica

1. Metti le pose generate in `assets/sprites/<personaggio>/` con i nomi `<personaggio>_idle.png`, `_run01..04`, `_jump`, `_kick`, `_crouch`, `_ko`, `_cheer` (Ciofi anche `_slide`). Sfondo verde pieno.
2. Lancia `python3 tools/build_sprites.py <personaggio> assets/sprites/<personaggio>`.
3. Lo strumento toglie il verde e i pezzi staccati, porta tutte le pose alla stessa scala (posa ferma alta 46 px), crea le varianti senza maglia, oro (Shpendi), maglia trasferta e terza, e il ritratto. I fogli finiscono in `game/public/sprites/` e il gioco li usa da soli al posto di quelli provvisori.

La musica registrata va in `game/public/audio/` ed è elencata in `FILE_TRACKS` dentro `game/src/systems/sfx.js` (oggi: `intro.mp3` su titolo e selezione). I brani senza file usano ancora la musica sintetizzata.

## Nemici e boss

`python3 tools/build_enemies.py` genera i fogli in `game/public/sprites/en_*.png` più `enemies.json`.

- **Zombie**: dalle due pose di riferimento in `assets/sprites/enemies/` (laterale e frontale). Lo strumento scompone la figura (busto, braccio, gambe, scarpe), la rimonta in ogni posa ad alta risoluzione e solo alla fine la riduce a 44 px con una palette scelta a mano: esce dal terreno (3), cammina (4), scivolata, si sbriciola (2).
- **Pipistrello e zucca**: disegnati direttamente in pixel di gioco seguendo il design dei riferimenti (a quella misura il riferimento ridotto diventerebbe una macchia). Pipistrello: volo (3), picchiata, caduta. Zucca: ferma (2), si carica, in volo di tre quarti, le stesse quattro pose crepate dopo il primo colpo, esplosione (2).
- **Mazapegùl**: dai riferimenti (cilindro rosso, bastone, stracci): 12 pose (fermo, camminata, lancio dei ferri di cavallo, risata di fronte, salto, colpito, senza cappello) più ferri di cavallo, risata e cilindro che vola.

`python3 tools/build_story.py` fa fantasma (volo, attacco di profilo, dissolvenza), cavalluccio d'oro, vampiro (intro e boss finale), Petrosino e lo stemma del Cesena in pixel art.

`python3 tools/build_klinsmann.py` fa Klinsmann da una posa laterale e una frontale: gli stessi 18 fotogrammi di Shpendi, ma da portiere (lancia con le mani; la parata è un tuffo), con maglia gialla e verde acqua per trasferta e terza, senza maglia, e il costume di Capitan Romagna (tuta bianconera, mantello rosso, scudo con il cavalluccio).

## Sfondi

Le illustrazioni originali (3168x1344) stanno in `assets/backgrounds/level1/`. Lo strumento le riduce di 6 volte sulla stessa griglia di pixel, toglie cieli e fondi verdi, scurisce i piani lontani e sfuma a retino il bordo dello stadio:

```bash
python3 tools/build_backgrounds.py assets/backgrounds/level1/{sfondo,stadio1,stadio2,cesena}.png
```

Dentro lo stadio (sezione B) c'è una tavola disegnata pixel per pixel con `tools/build_inside.py`: tribuna con la scritta CESENA fatta di seggiolini, distinti senza tetto con la Rocca che spunta dietro, tabellone (CESENA - VAMPIRI, ogni tanto AIUTO!), Curva Mare con bandieroni e fumogeni.

Ogni piano è largo 528 px e scorre una sola volta in tutto il tratto in cui si vede: niente ripetizioni e niente giunture. Velocità e posizione dell'insegna sono in cima a `LevelScene.js` (`CITY_F`, `STADIUM_F`, `SIGN_X`).

## Effetto CRT

Shader WebGL in `game/src/systems/crt.js`, basato su [CRTFilter](https://github.com/Ichiaka/CRTFilter) di Aka (licenza MIT). Se il browser non supporta WebGL resta un effetto leggero in CSS. Si spegne con il pulsante CRT.

## Sostituire la grafica provvisoria

Risoluzione nativa **256x224**, la stessa di Ghosts'n Goblins, mostrata in 4:3 come su un monitor da cabinato. Il gioco disegna **20 fotogrammi al secondo** (`ARCADE_FPS` in `game/src/main.js`) per il movimento a scatti dei cabinati; la fisica resta calcolata a 60 passi al secondo.

Il personaggio è alto **46 pixel** in un fotogramma di **36x48** (sprite veri: si riducono con `tools/sprite_pipeline.py --height 46`). Gli sprite provvisori sono generati in `game/src/systems/textures.js`. Gli sprite veri useranno **le stesse chiavi e gli stessi nomi dei fotogrammi** (es. `pl_shpendi_base`, fotogrammi `idle0`, `run0`…): il resto del gioco non cambia. Le varianti (oro, senza maglia) si ottengono in codice dalla palette.
