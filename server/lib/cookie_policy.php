<?php
// Cookie policy di GHOSTS 'N GOALS, scritta su misura per quello che il gioco fa davvero:
// nessun cookie sul gioco, solo memoria locale del browser per le preferenze, nessuno strumento di
// terze parti, statistiche anonime fatte in casa, un cookie tecnico di sessione per l'area admin.
// Dal pannello admin si attiva o si spegne, e si compilano solo i dati del titolare.
declare(strict_types=1);

const CP_FIELDS = [
    'cp_holder' => 'Titolare del trattamento (ragione sociale)',
    'cp_address' => 'Sede legale (indirizzo completo)',
    'cp_vat' => 'Partita IVA / Codice fiscale',
    'cp_email' => 'Email per la privacy',
    'cp_pec' => 'PEC',
    'cp_dpo' => 'Responsabile della protezione dei dati (DPO), se nominato',
    'cp_privacy_url' => 'Link alla privacy policy del titolare',
    'cp_updated' => 'Data dell\'ultimo aggiornamento (gg/mm/aaaa)',
];

function cp_settings(): array {
    $s = ['enabled' => meta_get('cp_enabled', '0') === '1'];
    foreach (array_keys(CP_FIELDS) as $k) $s[$k] = meta_get($k);
    if ($s['cp_updated'] === '') $s['cp_updated'] = date('d/m/Y');
    return $s;
}

// il testo della policy, in italiano o in inglese; i dati del titolare sono già "puliti" qui dentro
function cp_html(array $s, string $lang = 'it'): string {
    $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
    $holder = $e($s['cp_holder'] ?: 'Cesena FC');
    $lines = [];
    if ($s['cp_address']) $lines[] = $e($s['cp_address']);
    if ($s['cp_vat']) $lines[] = ($lang === 'it' ? 'P.IVA / C.F. ' : 'VAT / Tax code ') . $e($s['cp_vat']);
    if ($s['cp_email']) $lines[] = 'Email: <a href="mailto:' . $e($s['cp_email']) . '">' . $e($s['cp_email']) . '</a>';
    if ($s['cp_pec']) $lines[] = 'PEC: <a href="mailto:' . $e($s['cp_pec']) . '">' . $e($s['cp_pec']) . '</a>';
    if ($s['cp_dpo']) $lines[] = ($lang === 'it' ? 'Responsabile della protezione dei dati: ' : 'Data Protection Officer: ') . $e($s['cp_dpo']);
    $who = '<p><b>' . $holder . '</b>' . ($lines ? '<br>' . implode('<br>', $lines) : '') . '</p>';
    $contact = $s['cp_email'] ? '<a href="mailto:' . $e($s['cp_email']) . '">' . $e($s['cp_email']) . '</a>' : $holder;
    $privacy = '';
    if ($s['cp_privacy_url'] && preg_match('~^https?://~i', $s['cp_privacy_url'])) {
        $privacy = $lang === 'it'
            ? '<p>Per tutte le altre informazioni sul trattamento dei dati personali vedi la <a href="' . $e($s['cp_privacy_url']) . '" target="_blank" rel="noopener">privacy policy di ' . $holder . '</a>.</p>'
            : '<p>For any other information about personal data processing see the <a href="' . $e($s['cp_privacy_url']) . '" target="_blank" rel="noopener">privacy policy of ' . $holder . '</a>.</p>';
    }
    $upd = $e($s['cp_updated']);

    $rows = [
        ['gng_lang', ['lingua scelta (italiano o inglese)', 'chosen language (Italian or English)']],
        ['gng_mute', ['audio attivo o disattivato', 'sound on or off']],
        ['gng_best', ['il tuo record personale', 'your personal best score']],
        ['gng_name', ['l\'ultimo nome inserito in classifica, per non riscriverlo', 'the last name you entered in the leaderboard, so you don\'t retype it']],
        ['gng_tatanka', ['lo sblocco del personaggio segreto', 'the secret character unlock']],
    ];
    $t = function ($it, $en) use ($lang) { return $lang === 'it' ? $it : $en; };
    $table = '<table><tr><th>' . $t('Nome', 'Name') . '</th><th>' . $t('A cosa serve', 'Purpose') . '</th><th>' . $t('Durata', 'Duration') . '</th></tr>';
    foreach ($rows as [$k, $d]) $table .= '<tr><td><code>' . $k . '</code></td><td>' . $d[$lang === 'it' ? 0 : 1] . '</td><td>' . $t('finché non la cancelli', 'until you delete it') . '</td></tr>';
    $table .= '</table>';

    if ($lang === 'it') {
        return <<<HTML
<h1>Cookie policy</h1>
<p class="upd">Ultimo aggiornamento: {$upd}</p>
<h2>Chi è il titolare</h2>
{$who}
<h2>In breve</h2>
<p><b>GHOSTS 'N GOALS non usa cookie</b> per chi gioca: niente cookie di profilazione, niente pubblicità, niente strumenti di terze parti (né statistiche esterne, né social, né caratteri tipografici scaricati da altri siti). Per questo non ti chiediamo alcun consenso e non vedi nessun banner.</p>
<h2>Cosa salva il gioco sul tuo dispositivo</h2>
<p>Per ricordare le tue preferenze il gioco usa la memoria locale del browser (<i>localStorage</i>). Sono informazioni tecniche e funzionali: restano solo sul tuo dispositivo, non vengono inviate a noi né a nessun altro e non servono a riconoscerti.</p>
{$table}
<h2>Statistiche</h2>
<p>Contiamo gli accessi e le partite in modo anonimo e senza cookie: il nostro server registra il tipo di dispositivo, la lingua e il sito di provenienza (per esempio instagram.com). Per non contare due volte la stessa persona si usa un'impronta non reversibile dell'indirizzo IP (un codice calcolato con una chiave segreta): l'indirizzo IP non viene mai salvato in chiaro.</p>
<h2>Classifica</h2>
<p>Se entri in classifica salviamo il nome che scegli (al massimo 10 caratteri: non usare il tuo nome e cognome se non vuoi), il punteggio, il personaggio e il livello raggiunto. La classifica è pubblica.</p>
<h2>Area riservata</h2>
<p>Solo per chi amministra il gioco l'area riservata usa un cookie tecnico di sessione (<code>gng_admin</code>), necessario per restare collegati; scade alla chiusura del browser. Chi gioca non lo riceve.</p>
<h2>Perché non serve il consenso</h2>
<p>Gli strumenti descritti sono soltanto tecnici e necessari a fornire il servizio che hai chiesto: in base all'art. 122 del Codice privacy (D.Lgs. 196/2003) e alle Linee guida del Garante per la protezione dei dati personali del 10 giugno 2021 non richiedono il consenso. Se in futuro aggiungeremo altri strumenti te lo chiederemo prima, aggiornando questa pagina.</p>
<h2>Come cancellare i dati salvati</h2>
<p>Puoi cancellare la memoria locale in qualsiasi momento dalle impostazioni del browser (voce "Dati dei siti" o "Cookie e dati dei siti"). Il gioco continuerà a funzionare: ripartirà con le impostazioni iniziali e senza il record personale.</p>
<h2>I tuoi diritti</h2>
<p>Puoi esercitare i diritti previsti dagli articoli 15-22 del Regolamento UE 2016/679 (accesso, rettifica, cancellazione, limitazione, opposizione) scrivendo a {$contact}. Hai anche il diritto di presentare un reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>).</p>
{$privacy}
HTML;
    }
    return <<<HTML
<h1>Cookie policy</h1>
<p class="upd">Last updated: {$upd}</p>
<h2>Data controller</h2>
{$who}
<h2>In short</h2>
<p><b>GHOSTS 'N GOALS does not use cookies</b> for players: no profiling cookies, no advertising, no third-party tools (no external analytics, no social plugins, no fonts loaded from other sites). That is why we don't ask for consent and you see no banner.</p>
<h2>What the game stores on your device</h2>
<p>To remember your preferences the game uses the browser's local storage (<i>localStorage</i>). This is technical, functional information: it stays on your device only, is never sent to us or anyone else and is not used to identify you.</p>
{$table}
<h2>Statistics</h2>
<p>We count visits and games anonymously and without cookies: our server records the device type, the language and the referring site (for example instagram.com). To avoid counting the same person twice we use a non-reversible fingerprint of the IP address (a code computed with a secret key): the IP address is never stored in clear.</p>
<h2>Leaderboard</h2>
<p>If you make the leaderboard we store the name you choose (up to 10 characters: don't use your full name if you don't want to), the score, the character and the level reached. The leaderboard is public.</p>
<h2>Reserved area</h2>
<p>Only for the game administrators, the reserved area uses a technical session cookie (<code>gng_admin</code>) needed to stay logged in; it expires when the browser is closed. Players never receive it.</p>
<h2>Why no consent is needed</h2>
<p>These tools are strictly technical and necessary to provide the service you asked for: under art. 122 of the Italian Privacy Code (Legislative Decree 196/2003) and the Italian Data Protection Authority guidelines of 10 June 2021 they do not require consent. If we ever add other tools we will ask you first and update this page.</p>
<h2>How to delete stored data</h2>
<p>You can clear local storage at any time from your browser settings ("Site data" or "Cookies and site data"). The game keeps working: it starts again with the default settings and without your personal best.</p>
<h2>Your rights</h2>
<p>You can exercise the rights under articles 15-22 of EU Regulation 2016/679 (access, rectification, erasure, restriction, objection) by writing to {$contact}. You also have the right to lodge a complaint with the Italian Data Protection Authority (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>).</p>
{$privacy}
HTML;
}
