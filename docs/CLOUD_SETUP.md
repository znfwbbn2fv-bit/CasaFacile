# CasaFacile 1.4.0-beta — Attivazione sicura della condivisione familiare

**Stato:** prototipo di sviluppo. **Non** pubblicare sulla versione 1.3.2 fino a quando non sono stati configurati il backend e il collaudo su due account e due dispositivi.

## 1. Componenti

- GitHub Pages: frontend statico CasaFacile.
- Supabase Auth: accesso OTP via email.
- Supabase PostgreSQL: household, membri, inviti e snapshot JSON.
- SQL RLS: autorizzazioni di lettura per membri e modifiche soltanto tramite RPC controllate.
- Modalità personale: \`casafacile.v1.database\` (non modificata).
- Modalità famiglia: cache distinta \`casafacile.v1.cloud.snapshot.<id>\`, con stato revision/dirtiness in \`casafacile.v1.cloud.mode\`.
- Dipendenza client: \`@supabase/supabase-js@2.119.0\`, importata solo se il cloud è configurato. Offline si continua a utilizzare la cache della PWA.

## 2. Creare un progetto Supabase per i test

1. Creare un progetto Supabase **dedicato a CasaFacile staging**. La registrazione e le eventuali tariffe sono gestite direttamente da Supabase.
2. In **Authentication → Providers**, abilitare Email (OTP/passwordless).
3. Configurare il template email OTP in modo che contenga \`{{ .Token }}\` e non soltanto \`{{ .ConfirmationURL }}\`. Il modulo CasaFacile chiede un codice numerico.
4. Impostare gli URL consentiti per il frontend di test (HTTPS). Non usare redirect a origini non attendibili.
5. Configurare un provider SMTP adeguato prima dell'uso reale con più persone; verificare limiti, recapito e controlli antiabuso.
6. Eseguire **una sola volta** in SQL Editor la migrazione \`supabase/migrations/20261109000000_casafacile_sharing.sql\`, possibilmente su un database vuoto di staging.
7. Verificare nella dashboard Supabase che le tre tabelle abbiano RLS abilitata e che l'accesso diretto non permetta INSERT/UPDATE/DELETE con credenziali \`authenticated\` (le modifiche passano dalle RPC).

## 3. Configurare l'app senza esporre segreti

Nel ramo di sviluppo, compilare \`cloud-config.js\` con **soltanto**:
\`\`\`js
window.CasaFacileCloudConfig={
  url:'https://<project-ref>.supabase.co',
  publishableKey:'sb_publishable_<valore-pubblico>'
};
\`\`\`
L'URL e la **publishable key** sono progettati per l'uso dal browser. Non aggiungere MAI la service_role, \`sb_secret_\`, password del database, token amministrativi o OTP degli utenti.

La configurazione pubblica deve essere inclusa solo nell'ambiente di test scelto e non deve sostituire la versione stabile prima dell'approvazione.

## 4. Primo accesso e copia condivisa

1. Accedere alla pagina **Condivisioni** nell'app beta.
2. Inserire la propria email e richiedere il codice; verificarlo.
3. Tornare, se necessario, alla **casa personale**.
4. Premere **Crea una copia condivisa dalla casa personale**.
5. Aprire la casa appena creata. Il cloud riceve una copia iniziale: la versione personale resta intatta.
6. Verificare la presenza dello stato **Sincronizzato** e della revisione.
7. Modificare una faccenda e controllare che l'incremento di revisione venga confermato dal server.

**Nota:** una *persona locale* (assegnataria di un compito) non coincide necessariamente con un *account remoto* abilitato. Sono dati separati: il collegamento automatico tra account e profili locali sarà una funzionalità successiva.

## 5. Invitare una seconda persona

1. Dalla casa condivisa, il proprietario inserisce l'indirizzo email esatto del familiare e il ruolo **Può modificare** o **Sola lettura**.
2. La RPC genera un token casuale monouso associato a quell'email, con scadenza 7 giorni.
3. Copiare e inviare il link al destinatario con un canale privato. **Non pubblicare link di invito** su siti o social.
4. Il destinatario apre il link e accede tramite OTP usando la stessa email.
5. Dopo aver premuto **Accetta invito**, può aprire la casa condivisa.
6. Il proprietario può revocare l'accesso, oppure annullare inviti ancora pendenti.

Per sicurezza il token di invito viene eliminato subito dalla barra degli indirizzi, ma resta temporaneamente in memoria fino all'accettazione. Il database archivia solo l'hash del token.

## 6. Test di sicurezza obbligatori prima del rilascio

| Prova | Risultato atteso |
|---|---|
| Utente non autenticato | Nessuna lettura di famiglie/membri; nessuna RPC mutante |
| Utente di altra famiglia | Nessuna lettura di snapshot e membri |
| Owner | Può invitare, revocare e modificare |
| Editor | Può modificare ma non invitare/rimuovere membri |
| Viewer | Può leggere, ma non creare/salvare/modificare dati |
| Invito scaduto, usato o revocato | Sempre rifiutato |
| Invito aperto da email diversa | Rifiutato |
| Due dispositivi modificano stessa revisione | Il secondo salvataggio va in **conflitto**, senza sovrascrivere |
| Modalità aereo e riapertura PWA | Lettura cache locale e accodamento modifiche autorizzate |
| Ritorno online | Push delle modifiche se la revisione è ancora valida |
| Revoca di membro online | Accesso remoto bloccato |
| Dati della 1.3.2 | Archivio personale invariato, backup esportabile/ripristinabile |

**Limiti:** la gestione dei conflitti in beta blocca l'upload e conserva i dati locali. Non c'è ancora interfaccia guidata per confrontare/unire due revisioni, perciò non usare dati importanti in test multi-dispositivo concorrenti. La revoca di accesso sul server non può eliminare una copia già conservata su un telefono che rimane offline; in un'app offline-first questa limitazione va esplicitata.

## 7. Criteri prima della pubblicazione in produzione

- Migrazione SQL eseguita e verificata in staging.
- Test RLS e RPC effettivi eseguiti con due account Supabase distinti.
- Test su almeno due iPhone (o iPhone + iPad), inclusi invito, editor, viewer, revoca, sincronizzazione e conflitto.
- Backup locale verificato prima di passare da casa personale a condivisa.
- Piano privacy: informativa per le email degli account familiari, titolarità del trattamento e conservazione dati.
- Affidabilità: gestione dei conflitti tra snapshot e recupero dopo errori di rete.
- Valutazione del rischio di cache offline sui dispositivi condivisi.
- Solo allora promuovere la beta sul ramo principale.

**Non fornire qui in chat segreti, password o credenziali amministrative.**
