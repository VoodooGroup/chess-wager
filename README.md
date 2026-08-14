# Chess Wager (PulseChain)

Play chess for MAGIC or POISON. Connect a wallet, start a game, send the link, play, collect.

- ChessLib `0xfFDc6Fb47DA0A0C28db802Fa07568d5862314d18`
- ChessWager `0xD328573B46F6a8D3a5920aC85654e945639A645E`

Pieces: [JohnPablok Cburnett chess set](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett) (CC BY-SA).

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints. Use MetaMask or Rabby on **PulseChain (369)**.

## Vercel

Import this repo. Build command `npm run build`, output `dist`.

To keep games after a refresh or dropped connection, install the WordPress plugin in `wp-plugin/chess-wager` and set this Vercel env var, then redeploy:

`VITE_RELAY_URL` = `https://YOUR-WORDPRESS-SITE.com/wp-json/chess-wager/v1`

## Play

1. Connect wallet (the app switches to PulseChain).
2. Pick MAGIC or POISON, amount, and time.
3. Start a game and send the `?game=` link.
4. Opponent opens the link, connects, and joins.
5. When the game ends both tap Confirm, then Collect. If they refuse, use Claim win.

## Notes

- Winner fee is **5%**. Draws refund both sides, no fee.
- POISON is a 1% tax token. Exclude `ChessWager` from fees or the pot can fail.
- A File Manager upload of `dist/` is hosting only. The WordPress plugin is what remembers who is playing.
