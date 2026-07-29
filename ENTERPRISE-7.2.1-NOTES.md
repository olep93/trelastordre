# Enterprise 7.2.1 – rettelse for PDF-opplasting

- Flytter PDF.js-lesing fra Vercel/Node til nettleseren. Dette løser `DOMMatrix is not defined`.
- API-ruten mottar ferdig ekstrahert PDF-tekst, parser Moelven-linjene og lagrer original-PDF i privat Vercel Blob.
- API-feil vises nå mer konkret i brukergrensesnittet.
- Brukergrensesnittet omtaler siden som **Arkiv**, mens Firestore-samlingen fortsatt heter `sentOrders` for bakoverkompatibilitet.
