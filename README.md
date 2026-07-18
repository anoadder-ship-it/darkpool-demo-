# Arcium Darkpool SDK — Live Demo

Interactieve browser-demo van vier confidential darkpools op Solana, gebouwd met
[Arcium](https://arcium.com) MPC. Onderdeel van de
[solana_darkpool mono-repo](https://github.com/anoadder-ship-it/darkpool-circuits).

## Tabs

| Tab | Status |
|---|---|
| Trading | Illustratieve client-side weergave van het matchingsproces |
| Medical | Illustratieve client-side weergave van het matchingsproces |
| Supply chain | Illustratieve client-side weergave van het matchingsproces |
| **Chip marketplace** | **Echte on-chain transacties** via Phantom-wallet -- versleuteling, MPC-berekening en callback gebeuren live op Solana devnet |
| **Escrow** | **Echte on-chain transacties** via Phantom-wallet -- create/release/dispute escrow, live op Solana devnet |

## Chip marketplace: hoe het werkt

1. Verbind je Phantom-wallet (zet Phantom op **Devnet**)
2. Vul aanbod- en vraagvelden in
3. Klik "Encrypt & match chips" -- dit bouwt een echte `match_chip`-transactie,
   versleutelt de invoer client-side met de MXE-publieke sleutel, en laat Phantom
   de transactie ondertekenen
4. De pagina pollt op de Arcium MPC-callback-transactie en toont het (client-side
   ontsleutelde) resultaat

Geen backend-server nodig -- alles draait in de browser via een gebundelde
`@arcium-hq/client` + `@anchor-lang/core` SDK (`darkpool-sdk.bundle.js`).

## Escrow: koper/verkoper-bescherming met multisig-arbitrage
Alle vier darkpools hebben standaard een escrow-mechanisme: de koper stort SOL
in een programma-account (PDA), en de verkoper claimt dat na levering. Disput
de koper binnen 7 dagen, dan bevriest de escrow totdat het Dark Matter
Labs-team via een Squads 2-van-3-multisig een uitspraak doet.
1. Verbind je Phantom-wallet (zet Phantom op **Devnet**)
2. Kies een darkpool, vul een bedrag en verkoper-adres in (of gebruik het
   voorbeeldadres)
3. Klik "1. Create escrow" -- dit stort je devnet-SOL in een verse escrow-PDA
4. Klik "2a. Release" om direct aan de verkoper uit te keren (normale,
   geslaagde deal), of "2b. Dispute" om de escrow te bevriezen
`resolve_dispute` (de arbitrage-stap na een dispute) zit bewust niet in deze
publieke demo: die vereist de 2-van-3-multisig-sleutels van het Dark Matter
Labs-team en is dus alleen intern uit te voeren.

## Programma-adressen (Solana devnet)

| Darkpool | Adres |
|---|---|
| Trading | `h6zsnHt28NpeS94Ek3fQP1YEiu1WrpGT2pKynWZzKVX` |
| Medical | `CZQBaJFJnGA2pyEnrfxCmsUewcHJLDGHgzrcVjomzDD4` |
| Supply chain | `3HQHpSBSgYkx81E25bSJZVz4mGoW6nQFJWDtZL9fmMR4` |
| Chip marketplace | `6xLjbo4yfc5j2CMu69DkycTJrGZttHzeqieXf2NPvu8o` |

## Bekende beperking: Arcium devnet MPC-betrouwbaarheid
De "echt, on-chain"-knoppen (Trading/Medical/Supply/Chip) sturen altijd een
echte, geslaagde Solana-transactie die de MPC-berekening in de wachtrij zet --
dat deel werkt gegarandeerd. Het MPC-resultaat zelf komt via een callback
terug van Arcium's devnet-testcluster (offset 456), en die cluster is op
devnet niet altijd stabiel: on-chain staat de cluster en de nodes als actief
geregistreerd, maar de fysieke node-servers zijn soms niet bereikbaar
(geverifieerd via directe netwerktest). Dit is een bekende eigenschap van
publieke test-netwerken (nodes kunnen zonder aankondiging offline gaan) en
geen bug in deze demo. Krijg je "Nog geen MPC-resultaat"? Probeer het later
gerust opnieuw -- je devnet-SOL en de transactie zelf zijn niet verloren.
De Escrow-tab is hier niet door geraakt: die gebruikt geen MPC en werkt
volledig betrouwbaar.

## Zie ook
- [solana_darkpool](https://github.com/anoadder-ship-it/darkpool-circuits) -- broncode van alle vier darkpools
- [arcium-darkpool-sdk](https://www.npmjs.com/package/arcium-darkpool-sdk) -- TypeScript SDK

## License
MIT
