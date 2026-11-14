# Marktplaats Poster

Windows-app die Marktplaats-advertenties invult voor telefoonwinkels: toestellen (telefoon/smartwatch) en schermreparaties.
Specs en officiële foto's komen automatisch van GSMArena. Jij klikt zelf op **Plaats je advertentie**.

## Gebruik

1. Installeer `Marktplaats Poster Setup x.y.z.exe`.
2. **Instellingen**: kies je browser (Edge, Chrome of Firefox, wordt onthouden als standaard), vul je winkelgegevens in (komen onder elke advertentie) en pas eventueel de sjablonen aan.
3. **Nieuwe advertentie**: kies type → zoek model → vul opslag, kleur, staat, batterij, garantie en prijs in.
4. Klik **Invullen op Marktplaats**. De eerste keer opent een browservenster: log daar 1x in (per browser). Daarna onthoudt de app dat.
   Firefox: de app downloadt eenmalig een eigen Firefox (±90 MB, ±20 sec), omdat de besturing alleen met die versie werkt. Een eigen geïnstalleerde Firefox is niet nodig.
5. Controleer het formulier en klik zelf op **Plaats je advertentie** (de knop is oranje omrand).

**Advertenties**: overzicht van je online advertenties met verloopdatum. Bij opstarten meldt de app wat binnen 3 dagen verloopt.
"Opnieuw plaatsen" werkt voor advertenties die via de app zijn ingevuld (herkend op titel).

**Betaalde categorie**: is de gewone categorie betaald, dan wijkt de app uit naar *Telefoon-accessoires > Toebehoren en Onderdelen*
(instelbaar per type bij Instellingen). Let op: Marktplaats kan advertenties in een verkeerde categorie verwijderen.

Data staat lokaal in `%APPDATA%\Marktplaats Poster\` (`data.json`, foto's, een browserprofiel per browser).

## Ontwikkelen

```bash
npm install
npm start        # app starten
npm test         # unit tests
npm run dist     # installer bouwen in dist/
node build/render-icon.js   # logo.svg opnieuw naar icon.png renderen
```

Build faalt met "Cannot create symbolic link"? Pak de winCodeSign-cache eenmalig uit zonder macOS-bestanden:
`7za x <cache>\winCodeSign\<nummer>.7z -o<cache>\winCodeSign\winCodeSign-2.6.0 -xr!darwin`
(`<cache>` = `%LOCALAPPDATA%\electron-builder\Cache`, `7za` staat in `node_modules\7zip-bin\win\x64`).

## Nieuwe versie uitbrengen (auto-update)

1. Verhoog `version` in `package.json`.
2. `set GH_TOKEN=<github token met repo-rechten>` en `npm run release`. Dit maakt een concept-release op GitHub.
3. Publiceer de release op GitHub. Geïnstalleerde apps updaten zichzelf bij de volgende start.

Auto-update werkt alleen als de repository (of in elk geval de releases) **publiek** is.

Zie `docs/ontwerp.md` voor alle ontwerpkeuzes en gemeten Marktplaats-feiten.
