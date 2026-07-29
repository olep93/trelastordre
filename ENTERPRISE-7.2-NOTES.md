# Enterprise 7.2 – Moelven ordrebekreftelser

## Implementert
- Nye arkiverte ordre lagrer strukturerte `originalLines` i tillegg til eksisterende e-posttekst.
- Arkiverte ordre har et eget panel for opplasting av Moelven-PDF.
- PDF-en lagres i Firebase Storage under `sentOrders/{sentOrderId}/confirmations/`.
- Uthentede data lagres i Firestore-underkolleksjonen `sentOrders/{sentOrderId}/confirmations`.
- Parseren leser blant annet Moelven-ordrenummer, dato, NOBB/artikkelnummer, dimensjon, lengde, pakker, stykk/meter, pris, rabatt og netto.
- Nyeste bekreftelse vises i en ryddig tabell.
- Nye ordre får automatisk sammenligning mellom opprinnelig bestilling og bekreftet dimensjon/lengde/pakkeantall.
- Flere bekreftelsesversjoner støttes.

## Må publiseres i Firebase
Prosjektet inneholder oppdaterte `firestore.rules` og en ny `storage.rules`. Begge må publiseres i Firebase Console eller via Firebase CLI før PDF-opplasting fungerer.

## Viktig om eldre arkivordrer
Eldre arkivordrer har bare feltet `body`, ikke `originalLines`. PDF-opplasting og visning fungerer på disse, men automatisk avvikssammenligning blir tilgjengelig for nye arkiverte ordre. En senere migrering kan konvertere eldre `body`-tekst til strukturerte linjer.

## NOBB
NOBB-nummer lagres på hver bekreftelseslinje. Automatisk nett-oppslag mot NOBB/GTIN er ikke koblet inn i denne versjonen fordi det krever en stabil og tillatt datakilde/API. PDF-beskrivelsen brukes nå til dimensjon, lengde og produkttype.
