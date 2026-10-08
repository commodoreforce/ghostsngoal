# GHOSTS 'N GOALS 🎃⚽

L'arcade di Halloween del **Cesena FC**: un platform anni '80 nel browser, dentro un cabinato, con classifica pubblica. Hanno rapito Petrosino: tocca a te.

Il documento di game design completo è su claude.ai (link condiviso in chat).

## Stato: v0.1, prototipo giocabile

| Fatto | Note |
| --- | --- |
| Accensione del cabinato, titolo, modalità attesa con classifica | |
| Selezione con barre stile NBA JAM, 5 personaggi, abilità e boost | grafica provvisoria disegnata in codice |
| Hubner sbloccabile con la parola magica (controllo sul server) | |
| Intro del rapimento | |
| Livello 1 completo: sezione A, checkpoint, sezione B al buio, boss Arbitro Non-Morto con VAR | |
| Maglia come armatura, combo, bonus, casse, zucche, cavalluccio d'oro | |
| Inserimento nome da sala giochi, classifica, pannello admin | |
| Comandi touch sul cabinato, tastiera, joypad | |
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
- **Statistiche**: partite, personaggi, livello raggiunto, cause di morte. Dati anonimi: gli IP non sono mai salvati in chiaro.

## Sostituire la grafica provvisoria

Gli sprite provvisori sono generati in `game/src/systems/textures.js`. Gli sprite veri useranno **le stesse chiavi e gli stessi nomi dei fotogrammi** (es. `pl_shpendi_base`, fotogrammi `idle0`, `run0`…): il resto del gioco non cambia. Le varianti (oro, senza maglia) si ottengono in codice dalla palette.
