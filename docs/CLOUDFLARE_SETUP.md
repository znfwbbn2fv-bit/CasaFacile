# CasaFacile 1.4 Cloudflare beta — Configurazione e collaudo

**Attenzione:** questo ramo è una beta separata. **Non** sostituisce CasaFacile 1.3.2 su GitHub Pages. I test GitHub verificano codice e simulazioni; senza un account Cloudflare configurato non è stata verificata la sincronizzazione reale tra dispositivi.

## Architettura

- Frontend PWA e API: **un unico Worker Cloudflare con Static Assets**, servito da un sottodominio dedicato HTTPS (per esempio \`casafacile-beta.example.it\`).
- **Cloudflare Access**: autenticazione tramite One-Time PIN email e politica di accesso per indirizzi autorizzati.
- **Worker**: verifica *anche* la firma RSA del JWT Access (JWKS del team), \`iss\`, \`aud\`, \`exp\` ed email prima di chiamare D1/R2. Non si fida delle intestazioni email fornite dal browser.
- **D1**: famiglie, membri e ruoli, inviti monouso con SHA-256, revisioni condivise con compare-and-swap (CAS), audit e indice dei backup.
- **R2 privato**: un backup JSON con SHA-256 per ogni revisione confermata. I download richiedono una sessione Access valida e membership; il ripristino è riservato al proprietario.
- **Offline**: app shell nella cache PWA e dati condivisi nel localStorage dello stesso dispositivo; le risposte \`/api/\` non vengono mai memorizzate dal service worker.
- **Sincronizzazione**: al salvataggio, al ritorno online, all'apertura e ogni 30 secondi mentre CasaFacile è attiva. Nessuna sincronizzazione a PWA chiusa; niente push realtime.

## Prerequisiti

1. Un account Cloudflare e un dominio DNS gestito da Cloudflare (o una configurazione equivalente supportata per il Worker custom domain).
2. Un sottodominio **di test** dedicato e protetto via Cloudflare Access; non riutilizzare il sito 1.3.2 pubblico.
3. Autorizzazione a creare un database D1, un bucket R2 e un'applicazione Access nello stesso account.
4. Node.js 22 o superiore e Wrangler 4.x per pubblicare il backend.
5. Almeno due indirizzi email reali di test (senza condividere in chat password o codici OTP).

## Passo 1 — Creare D1 e R2

Dalla cartella principale del repository:
\`\`\`bash
npx wrangler@4 login
npx wrangler@4 d1 create casafacile-family-beta
npx wrangler@4 r2 bucket create casafacile-family-backups-beta
\`\`\`

Annotare **solo** il database ID restituito dal comando e inserirlo in \`cloudflare/wrangler.jsonc\` al posto di \`REPLACE_WITH_D1_DATABASE_ID\`. Il bucket deve chiamarsi esattamente come nel file di configurazione. **Non abilitare l'accesso pubblico R2**.

## Passo 2 — Proteggere il sito con Cloudflare Access

1. In Cloudflare Zero Trust, configurare l'invio di codici email OTP (One-Time PIN).
2. Creare una applicazione Access **Self-hosted** per l'intero hostname beta, senza restringerla al solo percorso \`/api\`.
3. In modalità test, inserire nella policy **Allow** esclusivamente le email degli utenti di prova.
4. Annotare:
   - **Team domain**: qualcosa come \`mio-team.cloudflareaccess.com\`.
   - **Application AUD / Audience Tag** della app Access (stringa emessa da Cloudflare).
5. Inserire i valori \`ACCESS_TEAM_DOMAIN\` e \`ACCESS_AUD\` nel file \`cloudflare/wrangler.jsonc\`.
6. Impostare \`routes[0].pattern\` sul vero hostname beta del Worker.

\`workers_dev\` è intenzionalmente impostato a \`false\`. **Non** riattivare \`workers.dev\` su questa app: un secondo dominio pubblico potrebbe aggirare le policy Access poste sull'hostname protetto.

**Limite operativo importante degli inviti:** le persone devono essere ammesse anche dalla policy Cloudflare Access. Creare un invito in CasaFacile non aggiunge automaticamente l'email alla policy Access. Per ogni nuovo familiare, un amministratore deve prima autorizzare l'email in Access, oppure bisogna progettare in seguito una policy più ampia ma controllata. In tutti i casi, il Worker richiede la membership in CasaFacile per accedere ai dati.

## Passo 3 — Migrazione database e asset

Applicare lo schema D1 **prima del deploy**:
\`\`\`bash
npx wrangler@4 d1 migrations apply DB --remote --config cloudflare/wrangler.jsonc
\`\`\`

Generare **solo** gli asset pubblici (le migrazioni, il codice Worker e i file interni del repository non vengono copiati nel sito):
\`\`\`bash
node cloudflare/scripts/prepare-assets.mjs
\`\`\`

Pubblicare il Worker sul sottodominio beta:
\`\`\`bash
npx wrangler@4 deploy --config cloudflare/wrangler.jsonc
\`\`\`

La prima visita deve mostrare **la schermata Access di Cloudflare**, non direttamente i dati dell'app. Il login di CasaFacile avviene fuori dalla PWA, sulla pagina Access. Il codice email non va inserito in CasaFacile.

## Passo 4 — Creare una copia familiare condivisa

1. Entrare nel sito beta dall'iPhone principale e autenticarsi tramite Access.
2. Aprire **Condivisi → Aggiorna** per verificare la sessione.
3. In modalità personale, selezionare **Crea una copia condivisa dalla casa personale**.
4. Verificare che venga creata una nuova famiglia con ruolo **Proprietario**.
5. Verificare che la copia personale non sia stata eliminata né modificata.
6. Creare o completare un'attività, attendere la sincronizzazione e verificare che la revisione aumenti.
7. In **Backup automatici cloud**, controllare che la revisione sia disponibile per esportazione.

La creazione di una copia condivisa non converte o sovrascrive l'archivio personale \`casafacile.v1.database\`. Gli archivi familiari hanno chiavi di cache separate.

## Passo 5 — Invitare una persona

1. L'amministratore del sito abilita l'email del familiare nella policy Access.
2. Il proprietario della famiglia, dentro CasaFacile, genera l'invito con la **stessa email** e seleziona **Può modificare** oppure **Sola lettura**.
3. Condivide privatamente il link. Il token è casuale, monouso e scade dopo sette giorni; in D1 è conservato solo il suo hash.
4. Il familiare apre il link, si autentica tramite Access con quell'email e preme **Accetta invito ricevuto**.
5. L'invito è incorporato in un *fragment* \`#sharing?invite=...\`: non viene inviato in query HTTP al server all'apertura della pagina e viene rimosso dall'indirizzo dopo la lettura dal client.
6. Il familiare apre la famiglia condivisa dall'elenco.

Il contatore **Condivisi** conta gli account autorizzati diversi dal proprio, non il numero delle persone configurate localmente e non i dispositivi online.

## Passo 6 — Verificare backup e ripristino

- Ogni nuova revisione confermata deve scrivere prima la copia R2 e poi aggiornare D1 attraverso un batch atomico con condizione \`WHERE revision = ?\`.
- Se un altro telefono ha già aggiornato la revisione, D1 rifiuta la seconda modifica e il Worker elimina la copia R2 non pubblicata.
- I primi 100 backup per famiglia restano disponibili (retention *best effort* delle versioni più vecchie). Il controllo integrità SHA-256 viene effettuato al download e prima del ripristino.
- Solo il proprietario può richiamare **Ripristina**. Il ripristino crea una **nuova revisione**, senza cancellare silenziosamente le altre.
- L'archivio R2 deve restare **privato**, senza domini pubblici, URL di download indovinabili o token esposti.

## Test obbligatori su due dispositivi

| Test | Risultato atteso |
|---|---|
| Senza sessione Access | Nessuna API privata disponibile |
| JWT non firmato, scaduto o con audience errata | Rifiuto HTTP 401 |
| Email autenticata senza membership | Nessun accesso agli archivi altrui |
| Editor | Può creare e aggiornare attività |
| Viewer | Può leggere ma non scrivere |
| Invitato con email diversa | Invito rifiutato |
| Invito scaduto/revocato/usato | Invito rifiutato |
| Due iPhone modificano una stessa revisione | Secondo salvataggio respinto; dati locali conservati |
| Modalità aereo | La copia già scaricata resta consultabile |
| Ritorno online | Upload solo se la revisione è ancora valida |
| Backup R2 e ripristino | SHA-256 corretto e nuova revisione |
| Revoca utente | Nuove letture e modifiche cloud bloccate |
| Switch a modalità personale | Il database 1.3.2 originale resta invariato |

**Limite da correggere prima della produzione:** in beta il conflitto impedisce la sovrascrittura, ma non esiste ancora un'interfaccia per la risoluzione assistita delle differenze tra due telefoni. Gli utenti non devono perdere la propria copia offline; esportare prima un backup dei dati locali.

**Limite di sicurezza offline:** un membro revocato può conservare sul proprio dispositivo dati già sincronizzati prima della revoca. Nessuna revoca cloud può cancellare retroattivamente le copie offline da un telefono non controllato.

## Stato di pubblicazione

Questo ramo GitHub **non** è distribuito su Cloudflare finché non vengono creati D1, R2, Access e il sottodominio protetto dall'account Cloudflare. La 1.3.2 su GitHub Pages resta la versione pubblica stabile e deve continuare a funzionare.

Non condividere in chat password, token di accesso, OTP, service token o dati di connessione privati.
