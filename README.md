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

## Programma-adressen (Solana devnet)

| Darkpool | Adres |
|---|---|
| Trading | `h6zsnHt28NpeS94Ek3fQP1YEiu1WrpGT2pKynWZzKVX` |
| Medical | `CZQBaJFJnGA2pyEnrfxCmsUewcHJLDGHgzrcVjomzDD4` |
| Supply chain | `3HQHpSBSgYkx81E25bSJZVz4mGoW6nQFJWDtZL9fmMR4` |
| Chip marketplace | `6xLjbo4yfc5j2CMu69DkycTJrGZttHzeqieXf2NPvu8o` |

## Zie ook
- [solana_darkpool](https://github.com/anoadder-ship-it/darkpool-circuits) -- broncode van alle vier darkpools
- [arcium-darkpool-sdk](https://www.npmjs.com/package/arcium-darkpool-sdk) -- TypeScript SDK

## License
MIT
