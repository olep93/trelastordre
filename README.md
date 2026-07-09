# Trelastordre Enterprise 2.0

Dette er en samlet Enterprise-versjon bygget fra bunnen av, med alle hovedfunksjonene samlet i én deploybar Next.js/Firebase-app.

## Inneholder

- Navneprompt første gang appen åpnes
- Navn lagres lokalt på enheten
- Live felles ukeordre i Firebase
- Flere brukere kan legge på samme bil over tid
- Endringer lagres som transaksjoner, ikke lokal overskriving
- Presence / online-brukere
- Endringslogg
- Sendte bestillinger / ordrearkiv
- Outlook Web
- E-postapp
- Kopier bestilling
- Mobilvennlig produktflyt med bunnpanel
- Dashboard med bilkort
- PWA manifest
- Modulregler:
  - 20 gran + 10 imp
  - 10 gran + 15 imp
  - 16 imp + 0 gran
  - 22 imp + 0 gran, kun 28x120 terrassebord
- Halvpall-regel:
  - 48x68 2,4 m og 48x98 2,4 m må totalt gå opp i partall
  - ugyldig halvplass markeres rødt
  - sending blokkeres hvis halvpall-regelen ikke er oppfylt

## Firebase Rules

Gå til Firebase → Firestore Database → Rules og lim inn innholdet fra `firestore.rules`.

## Deploy

1. Pakk ut ZIP.
2. Erstatt hele innholdet i GitHub-repoet med innholdet fra ZIP-en.
3. Commit til `main`.
4. Vercel deployer automatisk.

Framework preset: Next.js.


## 2.1 fix
- Reintroduced `MODULE_TARGETS` export for compatibility with older files that may still be present in the GitHub repo.


## Enterprise 2.2

- Egen fane for aktiv ordre, sendte bestillinger og statistikk.
- CSV/Excel-eksport av enkeltbestilling.
- CSV/Excel-eksport av hele arkivet.
- Stopper videre påfyll på bil som allerede er modulvogn-klar og spør om varen skal legges på ny bil.
- Forklaring: E-postapp-knappen bruker enhetens standard mailto-håndtering. Outlook kan ikke tvinges via mailto, derfor er Outlook Web hovedknappen.


## Enterprise 2.3

- Alt fra 2.2 er inkludert.
- Modultekst bruker fulle ord i stedet for `G/I`.
- Aktiv ordre merkes som Lagerordre 1, Lagerordre 2 osv.
- Lagerordrenummer resettes naturlig per uke og øker når ordre arkiveres/sendes.
- Etter sendt/arkivert ordre starter appen en ny tom lagerordre.
- Egen knapp for "Kun merk sendt".


## Enterprise 4.4

- Alt fra 2.3 er inkludert.
- Ytelsesfiks: `+` og `−` skriver ikke lenger logglinje for hvert trykk.
- Ordren oppdateres fortsatt live og felles i Firebase.
- Logg beholdes for viktige hendelser: ny bil, nullstilling og sendt/arkivert ordre.
- Aktivitetspanelet laster færre logglinjer.
- Dette reduserer Firebase-trafikk og gjør appen raskere på mobil.
