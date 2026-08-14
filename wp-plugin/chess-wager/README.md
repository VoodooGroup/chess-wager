# Chess Wager

WordPress plugin that embeds the PulseChain chess dApp and keeps a live game relay.

## What it does

- Shortcode `[chess_wager]` shows the board
- Stores game id, both wallet addresses, and every signed move
- Tracks who is online in each game
- If a player loses internet or refreshes, they reopen the same `?game=` link

This is not a File Manager upload of the dApp folder. Without this plugin, two strangers cannot resume after a drop.

## Install

Upload `chess-wager.zip` in **Plugins → Add New → Upload**. Activate. Put `[chess_wager]` on an HTTPS page.
