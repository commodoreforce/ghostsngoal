# GHOSTS 'N GOALS 🎃⚽

L'arcade di Halloween del **Cesena FC**: un platform anni '80 nel browser, dentro un cabinato, con classifica pubblica. Hanno rapito Petrosino: tocca a te.

Il documento di game design completo è su claude.ai (link condiviso in chat).

## Stato: v1.0

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
| Livello 2 completo: LA NEBBIA DEL SAVIO (Ponte Vecchio, Piazza del Popolo e Comune, Biblioteca Malatestiana, Via delle Scalette, boss l'Azdora indemoniata) | vedi sotto |
| Livello 3, secondo giro NOTTE FONDA, card social, landing con conto alla rovescia | prossime versioni |

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
- Nella selezione, in modalità prova, premendo **2** sulla tastiera si parte direttamente dal livello 2 (e Hubner è giocabile).

## Sviluppo in locale

```bash
npm install
npm run dev                         # gioco su http://localhost:5173
# in un secondo terminale, per classifica e parola magica:
GNG_CONFIG=$PWD/scripts/test/config.php php -S localhost:8000 -t server
```

`npm run build` produce `dist/`: è la cartella completa da pubblicare (gioco + PHP).

## Messa online su Serverplan

Il gioco vive sul suo dominio, **ghostsngoals.com** (hosting PHP/MySQL Serverplan), nella radice del sito: il gioco su `https://ghostsngoals.com/`, l'admin su `/admin/`, le cartoline condivise su `/share.php?id=…`. Attiva il certificato SSL (Let's Encrypt, gratuito dal pannello) e il redirect da `www.` e da `http` alla versione `https://ghostsngoals.com`, così le anteprime dei link sui social usano sempre lo stesso indirizzo.

1. **Database**: crea un database MySQL vuoto dal pannello Serverplan (annota nome, utente e password).
2. **Caricamento**: carica via FTP tutto il contenuto della cartella `dist/` (o dello zip pronto) nella radice del sito.
3. **Installazione guidata**: apri `https://ghostsngoals.com/` — la prima volta si apre da sola `install.php`, come WordPress:
   controllo del server → dati del database (li prova subito e ti dice cosa non va) → utente e password dell'admin → fatto.
   Scrive `config.php` (con chiavi segrete casuali), crea le tabelle e l'account, ti lascia già collegato e si cancella da sola.
   Se il server non permette di scrivere `config.php`, ti mostra il testo da caricare a mano. Puoi già scegliere di tenere il sito in manutenzione (volantino MISSING).
   Con `config.php` presente l'installazione è bloccata: nessuno può reinstallare sopra il sito.
4. **Pubblicazione automatica**: in GitHub → Settings → Secrets and variables → Actions aggiungi:
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
   - `FTP_STAGING_DIR` (es. `/staging.ghostsngoals.com/`) e `FTP_PROD_DIR` (es. `/public_html/`)

   Ogni modifica su `main` va sullo staging; per andare in produzione si crea un tag di versione (es. `v1.0.0`).
5. **Staging protetto**: proteggi la cartella dello staging con password dal pannello Serverplan.

## Pannello admin (`/admin/`)

- **Manutenzione**: un interruttore. Quando è attiva chi apre il sito vede il volantino *MISSING · PETROSINO* (anche l'anteprima dei link sui social); tu, collegato all'admin con lo stesso browser, vedi il gioco e puoi provarlo online. Anteprima del volantino: `/?missing=1`. Ai motori di ricerca arriva un "torna presto" (503), non un errore.
- **Da verificare**: la classifica a prova di furbi. Ogni partita riceve dal server un gettone e una chiave segreta; a ogni livello e alla fine il gioco manda punteggio e uccisioni firmati, e il server ci annota la sua ora. Le partite impossibili (punti che crescono più in fretta di quanto il gioco permetta, livelli finiti in tempi impossibili, dati manomessi) vengono scartate da sole; quelle dubbie e, se vuoi, i primi N posti o i punteggi sopra una soglia restano fuori dalla classifica finché non li approvi. I limiti (tempi minimi per livello, punti al secondo) sono in `server/lib/anticheat.php`.
- **Azzera la classifica** (in fondo alla pagina Classifica): cancella tutti i punteggi dopo il periodo di prova, e se vuoi anche le statistiche. Chiede conferma due volte e bisogna scrivere RESET.
- **Classifica**: cancella un singolo punteggio, nascondi un punteggio, sostituisci un nome con BURDEL, banna un nome.
- **Parola magica**: parola attiva, calendario delle prossime (si attivano da sole), numero di sblocchi.
- **Filtro nomi**: parole vietate, con riconoscimento di varianti tipo D10 o C4ZZ0. Con `=` davanti si blocca solo la parola intera.
- **Statistiche**: accessi totali e unici, partite (totali, per personaggio e per maglia), ore di gioco, nemici sconfitti per tipo, palloni calciati e precisione, livello raggiunto, cause di morte, andamento giorno per giorno, fasce orarie, dispositivi, lingua, provenienza (aggiungi `?utm_source=instagram` ai link per distinguere i canali). Dati anonimi: gli IP non sono mai salvati in chiaro, nessun cookie. Il database si aggiorna da solo alla nuova struttura.

## Sprite veri e musica

1. Metti le pose generate in `assets/sprites/<personaggio>/` con i nomi `<personaggio>_idle.png`, `_run.png` (le 4 fasi in un solo PNG), `_jump`, `_fall`, `_kick`, `_crouch`, `_crouchkick`, `_up`, `_slide`, `_hurt`, `_ko`, `_cheer`. Sfondo verde pieno.
2. Dividi la corsa: `python3 tools/split_run.py assets/sprites/<personaggio>/<personaggio>_run.png` (crea `_run01..04`).
3. Lancia `python3 tools/build_sprites.py <personaggio> assets/sprites/<personaggio>`.
4. Lo strumento toglie il verde e i pezzi staccati, porta tutte le pose alla stessa scala (posa ferma alta 46 px) e crea le varianti:
   - senza maglia (il Mister resta in maglietta bianca), oro (Shpendi), le tre maglie;
   - Ciofi: fascia da capitano e chioma Super Saiyan (da `ciofi_super_idle.png`, appoggiata sulla testa in ogni posa);
   - Diamanti: tuta col filo bianco e cappellino all'indietro (da `diamanti_goodvibes_idle.png`);
   - Klinsmann: maglie rossa, gialla e viola, Capitan Romagna;
   - Hubner: maglia classica, con le stelle e con le stelle blu; il bisonte da `hubner_bison_idle`, `_run`, `_slide` (le altre pose del bisonte le ricava lo strumento).
5. Ritratti della selezione: le facce in `assets/portraits/<personaggio>.png`, poi `python3 tools/build_portraits.py`.

I fogli finiscono in `game/public/sprites/` e il gioco li usa da soli al posto di quelli provvisori.

La musica registrata va in `game/public/audio/` ed è elencata in `FILE_TRACKS` dentro `game/src/systems/sfx.js` (oggi: `intro.mp3` su titolo e selezione). I brani senza file usano ancora la musica sintetizzata.

## Prestazioni e lancio

- Prima visita: ~2,7 MB (codice compresso, immagini PNG ottimizzate senza perdita con `tools/optimize_png.py`: rilanciarlo dopo aver rigenerato sprite o sfondi). Le visite successive scaricano quasi niente (cache lunga).
- Sprite, sfondi e musica si caricano con `?v=<build>`: ogni pubblicazione fa riscaricare le immagini nuove.
- Una partita fa 12-15 richieste PHP in circa 8 minuti, ognuna da pochi millisecondi.
- Consigliato per il lancio: Cloudflare (piano gratuito) davanti al sito. Il server riconosce l'indirizzo vero dei giocatori (`CF-Connecting-IP`, solo se la richiesta arriva davvero da Cloudflare).

## Motori di ricerca (SEO)

- `index.html`: titolo, descrizione, canonical, hreflang (it / `?lang=en` / x-default), Open Graph, Twitter, dati strutturati `VideoGame` (JSON-LD), testo nascosto per motori e lettori di schermo.
- `?lang=en`: `index.php` serve la stessa pagina con titolo e descrizioni in inglese e `lang="en"`; il gioco parte in inglese.
- `robots.txt` e `sitemap.xml` nella cartella principale; admin e API escluse.
- Staging (o qualsiasi indirizzo diverso da `ghostsngoals.com/`): `noindex` automatico. `www.` e `ghostngoals.com` reindirizzano a `ghostsngoals.com`.
- Le pagine dei record condivisi (`share.php`) sono `noindex, follow`.

## Campionati e CONTINUE

Il gioco si gioca tre volte di fila, come i "loop" dei coin-op: **stessi nemici, stesso numero**, cambia quanto picchiano.

| Campionato | Punti | Nemici | Boss | Invulnerabilità | Tempo | Buche |
|---|---|---|---|---|---|---|
| **Serie BKT** | x1 | proiettili -30%, camminata -20%, zombie che rinascono il 40% più piano | +50% danno dei palloni | 3 s | +30% | costano la maglia, non la vita |
| **Serie A** | x2 | come la taratura originale | normale | 2,2 s | normale | vita |
| **Champions League** | x3 | proiettili +18%, camminata +12%, +1 colpo per i nemici normali | -20% danno | 1,6 s | -15% | vita |

- In Serie BKT persa una vita **si riparte da dove si è caduti**, con la maglia (il boss resta ferito); in Serie A e Champions si torna al checkpoint.
- Sullo schermo il campionato si vede solo dal secondo giro: "x2"/"x3" accanto a 1UP e il nome all'inizio del livello.
- Fine Serie BKT: Petrosino nella gabbia è un'illusione del Conte → PROMOSSI IN SERIE A.
- Fine Serie A: il finale vero (Petrosino libero, Azdora, Marco il giardiniere, COMING SOON) → QUALIFICATI IN CHAMPIONS LEAGUE.
- Fine Champions: Petrosino liberato di nuovo → CAMPIONI D'EUROPA → classifica.
- Tutte le regole stanno in `LEAGUES` dentro `game/src/systems/state.js`.

**CONTINUE**: a vite finite, 10 secondi per ripartire dal checkpoint con 3 vite; il punteggio torna a zero. Chi lascia scadere il conto manda in classifica i punti fatti. Il server sa dei continue (in admin si vedono nella cronologia della partita) e non manda in verifica una partita solo perché ha continuato.

**Anti-furbi**: il server ragiona per *tappe* da 1 a 9 (campionato e livello); i limiti di punti crescono con il moltiplicatore del campionato. "Petrosino salvato" vale solo dalla fine della Serie A in poi.

## Nemici e boss

`python3 tools/build_enemies.py` genera i fogli in `game/public/sprites/en_*.png` più `enemies.json`.

- **Zombie**: dalle due pose di riferimento in `assets/sprites/enemies/` (laterale e frontale). Lo strumento scompone la figura (busto, braccio, gambe, scarpe), la rimonta in ogni posa ad alta risoluzione e solo alla fine la riduce a 44 px con una palette scelta a mano: esce dal terreno (3), cammina (4), scivolata, si sbriciola (2).
- **Pipistrello e zucca**: disegnati direttamente in pixel di gioco seguendo il design dei riferimenti (a quella misura il riferimento ridotto diventerebbe una macchia). Pipistrello: volo (3), picchiata, caduta. Zucca: ferma (2), si carica, in volo di tre quarti, le stesse quattro pose crepate dopo il primo colpo, esplosione (2).
- **Mazapegùl**: dai riferimenti (cilindro rosso, bastone, stracci): 12 pose (fermo, camminata, lancio dei ferri di cavallo, risata di fronte, salto, colpito, senza cappello) più ferri di cavallo, risata e cilindro che vola.

`python3 tools/build_story.py` fa fantasma (volo, attacco di profilo, dissolvenza), cavalluccio d'oro, vampiro (intro e boss finale), Petrosino e lo stemma del Cesena in pixel art.

`python3 tools/build_klinsmann.py` fa Klinsmann da una posa laterale e una frontale: gli stessi 18 fotogrammi di Shpendi, ma da portiere (lancia con le mani; la parata è un tuffo), con maglia gialla e verde acqua per trasferta e terza, senza maglia, e il costume di Capitan Romagna (tuta bianconera, mantello rosso, scudo con il cavalluccio).

## Livello 2 · LA NEBBIA DEL SAVIO

Dati in `game/src/levels/level2.js`, scena in `game/src/scenes/Level2Scene.js` (estende quella del livello 1), nemici in `game/src/entities/Level2Enemies.js`, boss in `game/src/entities/Azdora.js`. Il mondo è alto 26 righe: si parte in basso lungo il Savio e si finisce in cima alla Via delle Scalette.

- **Ponte Vecchio**: argine con buchi d'acqua e botti che affondano se ci resti sopra; pescatori scheletro (l'amo ti tira verso il fiume), civette sui lampioni (se ti vedono chiamano i pipistrelli), anguille che saltano dal Savio.
- **Piazza del Popolo**: la fontana Masini vera, su cui si sale (gradini, vasca, coppa con il cavalluccio d'oro); anguille dalla vasca, lavandaie spettro (il lenzuolo ti avvolge: lento e senza tiri, saltando ti liberi). Davanti al Comune le lancette corrono a mezzanotte: 12 rintocchi e 20 secondi di MEZZANOTTE, piazza piena di spettri e punti doppi.
- **Biblioteca Malatestiana**: cartolina d'ingresso con la vista iconica, poi la sala al lume di candela con i libri volanti incatenati. Checkpoint.
- **Via delle Scalette**: salita a gradoni, la telecamera sale con te, lupi mannari che scendono di corsa.
- **Belvedere del Monte**: l'Azdora indemoniata (piadina stregata a boomerang, mattarellata con onda di farina, pioggia di cappelletti). Sconfiggerla vuol dire liberarla: ti ringrazia e ti regala la piadina buona.

Sfondi: `python3 tools/build_l2_backgrounds.py` (separa cielo e scenario con GrabCut, toglie la fontana dipinta dalla piazza, prepara terreni, fontana e cartolina). Sprite: `python3 tools/build_l2_sprites.py`. Musica: un liscio romagnolo in re minore (traccia `level2` in `sfx.js`).

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
