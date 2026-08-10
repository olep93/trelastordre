# Enterprise 8.1 - fler-varehusgrunnlag

Denne etappen legger til Firebase Authentication, varehuskontekst og isolerte
Firestore-stier uten å flytte eller sperre dagens Tønsberg-data.

## Roller

- `platform_admin`: kan administrere alle varehus.
- `store_admin`: kan administrere medlemmer i eget varehus.
- `user`: kan arbeide med ordre og arkiv i eget varehus.

## Datastruktur

- `users/{uid}` inneholder profil, systemrolle og tilgjengelige varehus.
- `stores/{storeId}` inneholder navn, SAP-nummer og aktiv status.
- `stores/{storeId}/members/{uid}` er autoritativt medlemskap og varehusrolle.
- Ordre, arkiv, bekreftelser, logger og tilstedeværelse ligger under varehuset.

Tønsberg bruker fortsatt legacy-samlingene inntil kontrollert migrering er
gjennomført. Nye varehus bruker den isolerte `stores/{storeId}`-strukturen.

## Aktivering

1. Aktiver Email/Password i Firebase Authentication.
2. Opprett første bruker i Firebase Authentication.
3. Opprett brukerprofil med `platform_admin` og et aktivt medlemskap.
4. Verifiser innlogging og varehustilgang i en testdeploy.
5. Sett `NEXT_PUBLIC_ENTERPRISE_AUTH=true` i Vercel.
6. Migrer Tønsberg-data og fjern legacy-reglene først etter godkjent kontroll.

