# Trelastordre Enterprise 7.2

## Nytt
- Nye arkivordre lagrer strukturerte original-linjer i tillegg til e-postteksten.
- Arkivordre kan få én eller flere Moelven-ordrebekreftelser i PDF.
- PDF lagres privat i Vercel Blob.
- Varelinjer leses automatisk fra Moelvens tekstbaserte PDF-format.
- Viser NOBB/artikkelnummer, kategori, dimensjon, lengde, pakker, PCS/m og nettobeløp.
- Automatisk sammenligning mot opprinnelig bestilling for nye arkivordre.
- Eldre arkivordre støtter PDF-opplasting, men mangler strukturert sammenligning.

## Vercel
Blob Store må være koblet til prosjektet med standard variabelprefiks `BLOB` og `BLOB_READ_WRITE_TOKEN` tilgjengelig for Production og Preview.

## Firestore
Publiser `firestore.rules` fra prosjektet. Underkolleksjonen som brukes er:

`sentOrders/{sentOrderId}/confirmations/{confirmationId}`

## Begrensning i første versjon
Serveropplasting er satt til maks 4 MB. Moelven-ordrebekreftelser er normalt langt mindre. Parseren er laget mot PDF-formatet i ordrebekreftelse W63408.
