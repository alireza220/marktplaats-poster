# Marktplaats Poster – ontwerp

Windows-desktop-app (Electron) die Marktplaats-advertenties voor een telefoonwinkel invult.
De gebruiker klikt zelf op "Plaats je advertentie". Geen officiële Marktplaats-API.

## Beslissingen (grill-sessie 2026-11-14)

| Onderwerp | Keuze |
|---|---|
| Vorm | Desktop-app (Electron), bestuurt een eigen Edge-venster (Playwright, vast profiel, 1x inloggen) |
| Laatste klik | Gebruiker klikt zelf op Plaatsen |
| Gebruikers | 1 pc per winkel, alle data lokaal (`%APPDATA%/marktplaats-poster/data.json`) |
| Delen | Gratis Windows-installer, auto-update via GitHub Releases, geen licentie |
| Specs | GSMArena (modellijst + specpagina), na eerste keer lokaal |
| Foto's | Alleen officiële foto's van GSMArena, lokaal bewaard |
| Toestellen | 1 advertentie per toestel; velden: model, opslag, kleur, staat, batterij %, garantie, opmerking, prijs (laatste prijs onthouden) |
| Reparatie | Alleen schermreparatie, 1 advertentie per model, 1 prijs |
| Tekst | Bewerkbaar sjabloon met `{velden}` + winkelgegevens (aanpasbaar) |
| Verlopen | Overzicht uit Mijn Marktplaats met verloopdatum, melding bij opstarten (≤3 dagen), opnieuw plaatsen met 1 klik |
| Betaald | Altijd automatisch uitwijken naar Telefoon-accessoires > Toebehoren en Onderdelen (instelbaar per type) |

## Feiten over Marktplaats (gemeten 2026-11-14)

- Formulier direct te openen: `/plaats/{l1}/{l3}?bucketId={l2}&title=...`
- Telefoons: 820 / 225 / merk (Apple 1953, Samsung 841, Huawei 2897, ... Overige 837)
- Smartwatches: 820 / 426 / 3041 · Reparaties: 820 / 365 / 1664 (**betaalde categorie**)
- Uitwijk: Toebehoren en Onderdelen 820 / 227 / 1959
- Gratis herkennen: tekst "Plaats je gratis advertentie"; betaald: "Dit is een betaalde categorie" / knop "Naar betalen"
- Kenmerken verschillen per merk (naam én opties) → invullen op label + fuzzy optie-match
- Beschrijving is een Lexical-editor (contenteditable), foto's via `#imageUploader-hiddenInput`
- Eigen advertenties + `closeDate`: `/my-account/sell/api/listings?batchNumber=1&batchSize=50`

## Opbouw

- `main.js` – venster, opslag, IPC
- `lib/gsmarena.js` – modellijst, specs, foto's
- `lib/mapping.js` – categorieën, kleuren, optie-matching, sjablonen (puur, getest)
- `lib/marktplaats.js` – Edge-venster, formulier invullen, advertenties ophalen
- `renderer/` – UI (vanilla HTML/JS)
