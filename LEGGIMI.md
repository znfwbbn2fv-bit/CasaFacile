# CasaFacile 1.0.0 — SEGNOTA Studio

App PWA *personal-first* per gestire le faccende domestiche. Funziona sullo smartphone, tablet e computer. Non richiede un server applicativo né un database cloud.

## Funzioni presenti

- **Dashboard**: da fare oggi, completate, future e in ritardo, avanzamento della giornata, ambienti.
- **Attività**: creazione, modifica, ricerca, filtri, priorità, durata stimata, note, assegnazione persona/ambiente.
- **Ricorrenze**: una volta, ogni N giorni, ogni N settimane, ogni N mesi. Quando completi un'attività ricorrente, crea una registrazione nello storico e sposta la prossima scadenza. Le ricorrenze mensili mantengono, ove possibile, il giorno originale (es. 31 gennaio → 28 febbraio → 31 marzo).
- **Calendario**: vista mensile con faccende programmate e completamenti effettivi, dettagli giorno.
- **Ambienti**: sei preconfigurati, modificabili, e nuovi ambienti personalizzati.
- **Persone**: assegnazione locale a più persone. Non è ancora una funzione multi-dispositivo.
- **Statistiche**: completamenti degli ultimi 7 giorni, minuti stimati e risultati per stanza.
- **Backup**: esportazione JSON, verifica d'integrità SHA-256 (quando supportata), importazione con conferma e ripristino dell'archivio precedente all'ultima importazione.
- **Offline/PWA**: service worker per rendere utilizzabile l'app dopo il primo caricamento online.
- **Brand**: SEGNOTA Studio indicato nella dashboard laterale e nel footer.

## Installazione su GitHub Pages

1. Accedi su GitHub con l'account che utilizzi per CasaChiara.
2. Crea un **nuovo repository pubblico**, ad esempio `CasaFacile` (non modificare il repository CasaChiara).
3. Carica nella **radice** del nuovo repository tutti i file e la cartella `assets` di questo pacchetto. Non caricare soltanto l'archivio `.zip`.
4. Vai su **Settings → Pages → Build and deployment**, scegli `Deploy from a branch`, `main`, `/(root)` e salva.
5. Apri `https://TUO-ACCOUNT.github.io/CasaFacile/`, attendi la pubblicazione, poi da Safari su iPhone scegli **Condividi → Aggiungi alla schermata Home**.
6. Dopo un primo avvio online, prova a riaprire l'app in modalità aereo per verificare il funzionamento offline.

> Il percorso e il nome del repository possono variare: la PWA usa URL relativi e non presuppone un dominio specifico.

## Dati, privacy e limiti

- I dati sono salvati tramite `localStorage` nel browser **sul singolo dispositivo**, non in GitHub e non nei file del sito.
- Non esiste sincronizzazione tra telefoni in CasaFacile 1.0.0. Anche se assegni faccende a più persone, ognuna non le vede sul proprio telefono.
- Il browser o il sistema operativo possono cancellare dati locali. Esporta un backup dopo configurazioni importanti e periodicamente.
- La PWA mostra scadenze **nell'app**. Non invia notifiche push automatiche quando è chiusa.
- L'archivio per la condivisione futura usa ID di casa, ambiente, persona e faccenda. Per la versione cloud serviranno autenticazione, autorizzazioni, sincronizzazione, gestione conflitti e migrazione esplicita. Non implementate in 1.0.
- Le attività ripetute non creano copie in anticipo: il calendario visualizza proiezioni e il completamento crea uno storico reale.
- Non sono necessarie librerie esterne né abbonamenti per la versione personale.

## Test manuale prima della pubblicazione

1. Aggiungi una faccenda una tantum per oggi, completala, verifica il riepilogo e lo storico.
2. Aggiungi una faccenda giornaliera: completala e controlla che la scadenza passi a domani e lo storico si aggiorni.
3. Prova una ricorrenza mensile il giorno 31 e verifica che non perda il giorno in marzo.
4. Crea un ambiente e una persona e assegnagli una faccenda.
5. Verifica ricerca, filtri e calendario.
6. Esporta un backup, crea una faccenda di prova, importa il backup precedente e verifica i dati.
7. Vai offline e prova a completare un'attività; torna online e verifica che rimanga completata.
8. Installa da Safari su iPhone e verifica le dimensioni dei pulsanti e la barra di navigazione.

## Struttura tecnica

- `index.html`: shell e navigazione.
- `styles.css`: interfaccia responsive e palette pastello.
- `app.js`: store locale, modello dati versione 1, UI e logica.
- `sw.js`: cache delle risorse statiche per modalità offline.
- `manifest.webmanifest`: installazione PWA.
- `assets/`: icone.

Archivio: `casafacile.v1.database`; importazioni con recupero: `casafacile.v1.prima-importazione`.

© 2026 SEGNOTA Studio — CasaFacile 1.0.0.
