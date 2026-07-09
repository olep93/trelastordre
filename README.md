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
