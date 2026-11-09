# CasaFacile 1.3.1 — SEGNOTA Studio

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
- Non esiste sincronizzazione tra telefoni in CasaFacile 1.2.0. Anche se assegni faccende a più persone, ognuna non le vede sul proprio telefono.
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

© 2026 SEGNOTA Studio — CasaFacile 1.2.0.


## Aggiornamento 1.2.0 (iPhone)
- Risolto zoom automatico dei campi: dimensione testo minima 16 px sui dispositivi mobili.
- Corretto modulo attività: scorrimento dei campi indipendente dai pulsanti di azione.
- Pulsanti «Annulla» e «Crea attività / Salva modifiche» sempre visibili.
- Rimossa messa a fuoco automatica sui campi quando si apre una finestra.
- Adattamento della finestra anche con tastiera virtuale iOS.
- Chiavi e struttura del database locale invariati: i dati precedenti restano sul dispositivo.

## Nuovo in CasaFacile 1.2.0: routine preimpostate

Dal menu **Attività → Routine pronte** (o da **Impostazioni → Routine preimpostate**) si accede a un catalogo di 24 attività organizzate per frequenza: quotidiane, settimanali, mensili e trimestrali. Le attività sono visibili in anteprima e si aggiungono soltanto dopo selezione esplicita. Le voci già presenti, riconosciute per presetId o nome e ambiente, non vengono duplicate. Le scadenze sono distribuite su giorni adeguati alla frequenza. Le attività importate restano modificabili; non vengono effettuate connessioni cloud.

La struttura dei dati resta **schemaVersion 1** e la chiave localStorage resta **casafacile.v1.database**: la versione 1.2.0 non cancella dati e mantiene la compatibilità dei backup precedenti.

## Nuovo in CasaFacile 1.2.0: dashboard avanzata e promemoria locali

- **Panoramica:** grafico ad anello dello stato operativo corrente (completamenti odierni, attività odierne, arretrate, future), mini-trend settimanale e sintesi delle scadenze. Le categorie del grafico combinano lo storico di oggi e lo stato corrente delle faccende; una routine completata può avere anche una scadenza futura.
- **Statistiche:** intervalli degli ultimi 7 o 30 giorni, gruppi giornalieri o di 5 giorni, barre interattive selezionabili che mostrano conteggi e minuti, ambienti, giornate con almeno un completamento. I minuti sono *stime*, non un cronometraggio.
- **Promemoria:** nuova pagina con attività in ritardo, in scadenza oggi ed entro 3 giorni, accessibile dalla dashboard, da Impostazioni e dalla navigazione desktop. Gli avvisi sono **soltanto interni all'app**; non vengono inviate notifiche push quando CasaFacile è chiusa.
- **Privacy e compatibilità:** nessuna chiamata remota, la chiave `casafacile.v1.database` e `schemaVersion:1` restano invariati; sono leggibili i backup precedenti. Backup consigliato prima dell'aggiornamento.

## Nuovo nella 1.2.1: navigazione dashboard

I quattro riquadri della Dashboard sono selezionabili: **Da fare oggi** (attività dovute oggi o scadute), **Completate oggi** (storico effettivo dei completamenti, incluse le routine già riprogrammate), **Programmate** (attività con scadenza futura), **In ritardo** (attività scadute). Ogni sezione diversa dalla Panoramica espone un pulsante **Indietro** per tornare alla sezione precedente; dagli ambienti dettagliati si torna prima all'elenco ambienti. Nessuna migrazione né modifica dei dati.

## CasaFacile 1.3.0 — Famiglia (gestione locale)
- Nuova **Famiglia**, raggiungibile dalla Panoramica, dal menu desktop e dalle Impostazioni: schede di ogni persona, carichi di lavoro, attività aperte, quelle in ritardo e completamenti degli ultimi 7 giorni.
- **Distribuzione delle attività aperte** per persona. Le percentuali misurano il numero di faccende correntemente aperte, non il numero di occorrenze future di ciascuna routine.
- Dalle schede puoi **riassegnare una faccenda** con una tendina, **creare un compito assegnato** alla persona scelta e **visualizzare tutte le sue attività**.
- In Attività è disponibile un **filtro per persona**, combinabile con i filtri di stato, la ricerca e lo storico di oggi.
- La modifica rapida dell'assegnazione conserva gli eventi storici dei completamenti precedenti; quelli successivi vengono attribuiti al nuovo incaricato.
- Il totale di attività entro sette giorni include anche quelle già arretrate. I tempi sono stime derivate dalla durata registrata, non cronometraggi.
- Persone e assegnazioni restano **locali** e non sincronizzate. Non esistono account o inviti e non è attivo alcun accesso remoto.
- **Retrocompatibilità:** invariati schemaVersion 1, chiave `casafacile.v1.database` e struttura dell'esportazione JSON. Si consiglia sempre un backup prima dell'aggiornamento. 

## CasaFacile 1.3.1 — Condivisioni e navigazione su iPhone

- Barra inferiore iPhone: accesso diretto a **Famiglia** (6 destinazioni: Panoramica, Attività, Calendario, Ambienti, Famiglia, Impostazioni).
- Nuovo riquadro **Accessi e condivisioni** in Panoramica, selezionabile, con conteggi distinti: **accessi condivisi (0)** e **persone configurate localmente (db.members.length)**.
- La nuova pagina **Condivisioni** elenca i nomi inseriti su questo dispositivo e segnala **Solo locale** per ciascuno. Non si affermano connessioni attive: senza account e sincronizzazione gli accessi remoti non sono supportati e il conteggio resta zero.
- Il tasto **Gestisci Famiglia** porta alla pagina di assegnazione delle attività. Nessuna nuova struttura dati o modifica alla chiave locale; backup JSON precedenti compatibili.

## CasaFacile 1.3.1 — riquadro Accessi e condivisioni

- La barra inferiore su iPhone include ora **Famiglia**, senza bisogno di cercarla nella Dashboard.
- La Dashboard include il pulsante **Accessi e condivisioni**, con due conteggi distinti: **accessi condivisi effettivi (0)** e **persone configurate localmente**.
- Toccare il riquadro apre **Condivisioni**, con elenco dei nominativi e indicazione individuale «Solo locale». È presente un accesso diretto a **Famiglia** per gestire le persone.
- Nessuno dei profili locali aggiunti crea account, accessi da altri dispositivi, inviti, o un canale di sincronizzazione. Non vengono inventati utenti connessi.
- Database, backup JSON, schemaVersion 1 e chiave `casafacile.v1.database` invariati.
