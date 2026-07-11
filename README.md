# Trelastordre Enterprise 6.1 – Performance Rewrite

Komplett repository for GitHub Desktop/Vercel.

## Viktigste endring

Lengdevelgeren ligger nå i en egen, memoized React-komponent (`src/components/FastProductSheet.tsx`). Pluss/minus oppdaterer kun lokal state i panelet umiddelbart. Hele hovedsiden, dashboardet, produktlisten og Firebase oppdateres først samlet etter trykkserien eller når panelet lukkes.

## Inkludert

- Alt fra tidligere Enterprise-utgaver: live felles ordre, biler, modulregler, halvpallregel, Outlook Web, e-postapp, arkivering, statistikk, CSV/Excel-eksport, navn/presence og mobilmeny.
- Modulregler: 20 gran + 10 imp, 10 gran + 15 imp, 16 imp, og 22 imp kun 28x120 terrassebord.
- Egen arkivside og statistikkside.
- Separat knapp for å arkivere ordre som bestilt.
- Fire knapper nederst på mobil: Ordre, Arkiv, Statistikk og E-post.
- Aktivitet/logg er fjernet fra UI for mindre arbeid og mindre DOM.
- Feilen `mostOrderedFromArchive` er rettet.

## Installering

1. Slett innholdet i den lokale repo-mappen via GitHub Desktop/Filutforsker, men behold `.git` (GitHub Desktop håndterer dette).
2. Pakk ut alt fra ZIP-en direkte i repo-mappen.
3. Åpne GitHub Desktop, kontroller endringene, skriv commit-melding og trykk **Commit to main**.
4. Trykk **Push origin**. Vercel bygger automatisk.

## Firebase Rules

Bruk innholdet i `firestore.rules`.


## 6.1.1 Build fix
- Fikset Map-iterasjon i statistikkfunksjonen.
- Satte TypeScript target til ES2017.
- Verifisert med lokal `npm run build`.
