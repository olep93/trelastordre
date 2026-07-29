# Enterprise 7.2.2

## Rettelse

Build-feilen fra `pdfjs-dist` er fjernet. Next.js/Webpack forsøkte tidligere å pakke `pdf.worker.mjs`, som inneholder `import.meta` og ESM-eksport i en kontekst som ble behandlet som vanlig script.

PDF-leseren lastes nå kun i nettleseren fra cdnjs (PDF.js 3.11.174). Dermed blir verken PDF.js eller worker-filen bundlet inn i Vercel-builden. Server-API-et mottar fortsatt den ferdig ekstraherte teksten og lagrer PDF-en i privat Vercel Blob.

Ingen endring er nødvendig i Firestore-regler eller Blob-oppsett.
