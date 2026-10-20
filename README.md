# Shishki Online

Russian draughts on 8×8 and 12×12 boards, Chapaev, chess, long nardy, 8-ball pool, dominoes, Battleship, and Durak. Play against a bot, find an online opponent, invite a friend, or share one device. The interface supports English, Russian, and Ukrainian on phones and computers. Play as a guest or sign in to an account.

**Play:** https://shishki.pp.ua

**Repository:** https://github.com/skweye/shishki-online

## Features

- Every game has a widescreen view, opened with the expand button above the board. The board fills the available viewport while the turn, players, clocks and match menu stay visible. Controls, move history and human online chat float over the field and start hidden; the Panels button shows or hides them. Unread chat appears on that button. Escape dismisses the current panel, then the dock, then returns to the standard view. Live shots, drafts, selected pieces and room state survive layout changes. Mobile safe areas, on-screen keyboards, reduced motion and shared sound settings are supported.
- Durak actions appear on the table only when legal: selecting a card offers attack, throw-in or transfer; taking and finishing appear at the appropriate stage. Drag targets and click actions share the same validation. The widescreen card table uses the full available width and height, with a compact hand and contextual controls; the board games retain their original proportions.
- The home screen starts with Local, Online matchmaking, With a friend, or Against a bot. Local, matchmaking and bot play reveal the game selector as the next step. Friend play creates a shared lobby immediately: both players can select any game, then confirm readiness. Changing the selection clears both confirmations. The invitation, seats, identities, cosmetics and chat remain in the same room across games.
- Bot play supports all 11 variants and requires an internet connection. The human occupies white; the server controls black and validates each action with the same rules as human play. Chess and draughts use bounded lookahead, pool and Chapaev evaluate physical shots, nardy uses legal dice moves, and card, domino and fleet strategies only receive their seat's public information. Hidden hands, draw piles and unsunk enemy ships never reach the decision engine. There is one default difficulty.
- Bot rooms restore from their URL and seat token (or signed-in account), accept draw offers and rematches, and record eligible human results through the existing statistics, coin and XP flow. Chapaev rounds wait for the human's confirmation; domino rounds use the existing readiness flow. Durable alarms space actions after animations and recover on reconnection; bot actions stop when the human disconnects and never extend the one-hour room expiry. Existing game clocks continue during a disconnection. Chat and invitation controls are hidden for bot games. Launch and action sounds use shared settings and do not replay on restoration.
- Bots announce their next action before executing it: pool cue direction and power, Chapaev aiming, board move highlights, card backs, and firing targets. The server persists that exact action and exposes only a safe preview, never hidden cards, tiles or fleets. Ordinary moves use a short pause; longer pauses cover dice, card, shot and explosion animations. Preview sounds follow shared audio settings; effects stop on hidden pages and respect reduced motion. A visible bot game automatically requests a snapshot after two seconds without updates while waiting (twelve seconds on the human turn), reconnects if that request goes unanswered, and synchronizes on returning to the tab. Sync also repairs overdue bot alarms without reloading or extending room expiry.
- The match menu offers a return to the room's game selector. During an unfinished match the other player must agree; an agreed change ends that match without a result or reward. After a result, either player can return to selection. New games have separate match IDs for statistics, while stale readiness and game commands cannot cross match boundaries. Existing direct-room clients and matchmaking remain compatible.
- Home shows signed-in account level and XP, reward availability, coins, games and wins. The online counter counts distinct signed-in accounts or guest browsers active during the last 60 seconds; the waiting counter comes from the real matchmaking queue. Presence pauses in hidden tabs, expires automatically and uses a cookie separate from matchmaking. Unavailable values are shown as unavailable, not fabricated totals. Room entry, invitations, selection and readiness use the shared sound preferences.

- Durak is available under “Games off the board” in three variants: simple (one attacking card per bout), throw-in, and transfer. Each uses a 36-card deck, six cards per hand, and no clock. Transfers are allowed before the first defense and are limited by the new defender's hand size. Attackers can add cards after the defender chooses to take, draw first when replenishing hands, and draw the trump card last. The winner is determined after the bout ends; if both hands are empty, the game is a draw. The server never reveals the opponent's hand or the draw pile, including in synchronization and error responses. All variants support local device handoff, online play, chat, rematches, statistics, and themed backgrounds.
- Cards fly from the hand (or the drag release point) onto the table for attacks, covers, and transfers. Cards move individually into the defender's hand or the discard pile before replacements are dealt from the stock, attacker first. New games and rematches deal cards one by one; reveals flip the hand, and remaining cards slide into place. Opponents' draws and local handoffs stay face down. The result waits for the final cards to finish moving. Sounds follow the action and use the shared settings. Reconnection does not replay animations; hiding the page, enabling reduced motion, or enabling low-performance mode cancels them and cleans up temporary cards and scheduled sounds.
- Drag cards with a mouse, touch, or pen: drop onto open table space to attack or transfer, or onto an opponent's attacking card to cover it. Legal destinations are highlighted; invalid drops leave the hand unchanged. Click and keyboard controls remain available. The larger table keeps the trump card exposed beside the draw pile and displays its rank and suit separately.
- Three premium decks are available only from cases: Star Atlas (value: 500 coins), Golden Court (550), and Koi Garden (600). The classic deck is available to everyone.
- Inventory items can be sold for 50% of their value after confirming the amount. Crediting coins and removing the item happen atomically; retrying a request never pays twice. Equipped cosmetics revert to their defaults. Free items and items obtained through full catalog access cannot be sold.

- Drag domino tiles with a mouse or finger onto highlighted placements. The chain can turn horizontally and vertically; placements are validated by the server and preserved when reconnecting. Keyboard users can select a tile and a placement on the table.
- Dominoes appears below pool: a double-six set, seven tiles per player, a boneyard, and a match to 100 points without a clock. The highest double starts each round; if neither player has a double, the highest tile starts. Draw one tile at a time until a move is available; passing is allowed only when the boneyard is empty. Going out scores the opponent's remaining pips. In a blocked round, the player with fewer remaining pips scores the difference. Online, both players must confirm the next round; a rematch resets the score.
- The domino server stores the complete deal but sends only the player's own hand and the opponent's tile count through HTTP, WebSocket, error, and reconnection responses. Hands are revealed after a round; the boneyard stays hidden. Shared-device games show a handoff screen between turns. Chat, resignation, draw offers, completed-match statistics, and dedicated home and game backgrounds are supported. Backgrounds respect reduced motion and pause in hidden tabs.

- Low-performance mode is available in settings: static backgrounds, no blur or expensive effects, and simpler pool balls. Shot animations in pool and Chapaev remain enabled. The preference is stored in the browser and applies to every page; physics and rules are unchanged.

- The separate lower “Games off the board” section starts with Battleship, followed by American 8-ball pool, dominoes, and Durak. Pool supports local and online games, mouse/touch aiming, pulling back the cue ball, and keyboard controls for direction and power. Shots do not require calling a ball or pocket. On desktop, the aim follows the mouse, scrolling over the table changes power by 5%, and a short left click shoots. Dragging only adjusts the aim; touch and keyboard users retain a “Shoot” button. The server calculates physics, fouls, groups, and results. Chat, reconnection, and rematches work as in the other modes.
- In pool, the first ball legally pocketed after the break determines the player's group. Pocketing a ball from your group keeps your turn. After clearing your group, the eight ball can be pocketed in any pocket; pocketing it early or committing a foul while pocketing it loses the game. The aim guide shows the first collision, and ball strips beside player names track remaining and pocketed balls. Texture rotation follows the distance traveled, and frames are smoothly interpolated. Cue, ball, cushion, and pocket sounds follow simulation events and the shared volume setting. Reconnecting does not replay effects.
- Pool uses casual club rules without clocks, jump shots, or spin. An eight ball pocketed on the break is respotted. If nothing is pocketed on the break, all balls stay where they stopped. An illegal break gives the opponent ball in hand behind the head string. Other fouls give ball in hand anywhere on the table; break fouls restrict placement to behind the head string. Pocketing the eight ball early or with a foul loses the game. Detailed rules are available in the game.
- Nardy and pool have dedicated backgrounds that follow the selected theme. Backgrounds appear on the home screen and during play, respect reduced motion, and pause in hidden tabs. The requirement to include a background for every future mode is recorded in AGENTS.md and covered by a test.

- Long nardy: 24 points, 15 checkers per player, no hitting, clocks, or doubling cube. Both sides move forward; opening dice determine who starts. Tied opening rolls are rerolled automatically. Shared rules in the server and browser enforce maximum dice use, priority for the higher die, doubles, moving off the head (with first-turn exceptions for 3–3, 4–4, and 6–6), restrictions against blocking all opposing checkers, bearing off, and a mars win.
- In online nardy, the server generates dice using uniformly sampled `crypto.getRandomValues`. Rerolling with unused dice is prohibited. Remaining dice and whether a checker has already moved off the head are preserved. Chat, resignation, draw offers, rematches, statistics, and game rewards are supported. Local positions are saved separately from other games.
- Two skins feature original vector engravings: Moon Fox (value: 100 coins) and Wind Rose (120). Their artwork appears in the shop, draughts, Chapaev, and nardy; kings retain a crown marker.

- The account dropdown includes a profile link, nested appearance and language menus, sound settings, and sign-out at the bottom. It supports mouse, keyboard, and touch.
- Change your nickname and avatar in your profile. PNG/JPEG/WebP images up to 5 MB are cropped to a 256×256 square. Names and photos are stored in D1 and available across devices.
- Chess supports local and online play, check and checkmate, castling, en passant, and promotion choices. Automatic draws cover stalemate, insufficient material, threefold repetition, and 50 moves without a capture or pawn move. Local saves are separated by mode, and rematches preserve the mode.

- Registration requires a name, email, password, and password confirmation. Email/password sign-in, profiles, sign-out, and Google sign-in are supported once OAuth is configured.
- A signed-in player's seat is linked to their account and can be restored from the room link on another device. The opponent sees the player's name, never their email.
- The home screen offers online play with a friend or play on one device, with 8×8 draughts (12 pieces per side) or 12×12 draughts (30 per side). Both use Russian rules: any mandatory capture sequence may be chosen, kings can move across multiple squares, and promotion can happen during a capture sequence. Rematches preserve the board size, and local saves are separate for each mode.
- Themes include Matcha (default), PULSE, Alduin, 80s After Dark, 8008, and the original light theme. Board and interface styling changes immediately, and the selection is saved in the browser.
- Chapaev is played in rounds with eight pieces per side. Pull one of your pieces backward and release, or set direction and power in the panel below the board. The server calculates collision physics; a piece is eliminated when its center leaves the board. Turns alternate after every shot, regardless of how many pieces were knocked out. The round winner advances their starting row one square. If the rows are adjacent, the loser's row retreats; being unable to retreat beyond the edge ends the match. Each side receives eight pieces in the next round. Drawn rounds keep the same rows. Round number, score, and row positions are saved, and shot order is not reset. Online, both players must be ready to advance. Local games have their own save, and online rematches preserve the mode.
- Appearance, language, and sound settings are available through the avatar menu, including for guests. Theme and language changes apply immediately and are stored in the browser.
- Four sound packs are available: Wood, Felt, Glass, and Retro. The selection is saved in the browser, and packs can be previewed before playing. Chapaev has sounds for shots, collisions, and pieces being knocked off the board.
- Moves use a soft wooden tap, captures use a double tap, and promotions, results, and rematches use quiet notes. A gentle attack and muted high frequencies avoid sharp clicks. The default volume is 35%; existing preferences are preserved. Volume, mute, and previews are available in settings. Sounds are generated with Web Audio without external files and unlock after the first interaction with the page.
- Resume a saved local game from the home screen; invitation links open the room directly.
- Move pieces by clicking or dragging with a mouse, finger, or pen. Legal destinations are highlighted, and invalid moves leave the position unchanged.
- Animated victory, defeat, and draw dialogs offer rematches. Animations are disabled when the device requests reduced motion.
- Resign with confirmation or offer a draw from the match menu. Online opponents can accept or decline; on a shared device, the second player confirms the decision. Online rematches require both players' agreement.
- Private invitation rooms assign white to the creator and black to the second player.
- WebSocket synchronization, server validation of every move, and protection against stale commands.
- Mandatory forward and backward captures, multiple captures, flying kings, and promotion during capture sequences. Captured pieces remain obstacles until the move is complete.
- Move highlighting, history, board rotation, resignation, draw offers, and mutually agreed rematches.
- Threefold repetition is a draw. Special tournament limits for draughts endgames are not implemented.
- Clocks give each player five minutes in 8×8 draughts and chess, or ten minutes in 12×12 draughts, with a five-second increment after a complete move. A capture sequence counts as one move. Chapaev has no clock. Friend-room clocks start only after both players confirm readiness; legacy direct rooms start on the second player's arrival, and matchmaking starts with the match. Clocks are maintained by the server; disconnecting or reloading does not pause them. Running out of time loses the game. A rematch starts fresh clocks.
- Two-player chat appears below move history. A room keeps the latest 50 messages, each up to 400 characters, with at most one message per second. Reconnecting restores the conversation. Messages neither extend the room's lifetime nor affect the clocks.
- Connections and positions recover after a reload. Local games are stored in the browser; online games are stored in a Durable Object.

## Getting started

Requires Node.js 22+ and npm.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:8787. The `predev` command creates the local account database automatically. To test two-player games, use two browsers or a regular and a private window. Reopening a room restores your seat and disconnects your previous tab. Google sign-in is optional locally; see `.dev.vars.example` for configuration examples.

## Checks

```bash
npm run check
npm test
npm run build
```

For integration tests, start `npm run dev` in a separate terminal, then run:

```bash
npm run test:integration
```

Tests cover rules, two WebSocket clients, synchronization, out-of-turn moves, revisions, reconnection, draws, rematches, and resignation. Authentication tests cover registration, sign-in errors, CSRF, sessions, account-based seat recovery, rejection of stolen game tokens, and WebSocket disconnection after sign-out. Google ID tokens have cryptographic tests; real OAuth requires Google Cloud configuration. Integration tests create test accounts in local D1. Set `TEST_BASE_URL` to change the server address; avoid running the full suite against production unless necessary.

## Cloudflare

The application uses **Cloudflare Workers + Static Assets + SQLite Durable Objects + D1**. Standard GitHub Pages cannot host online play: a Worker with WebSocket rooms is required.

```bash
npx wrangler login
npx wrangler d1 migrations apply AUTH_DB --remote
npm run deploy
```

The main Worker is `shishki-online`. The `shishki-online-auth` D1 database stores accounts and sessions using the `AUTH_DB` binding. Durable Object migrations create `GameRoom` (v1) and the `PasswordService` hashing service (v2). When deploying to another account, create your own D1 database and replace its ID in `wrangler.jsonc`. Apply new D1 migrations before deploying code that depends on them.

### Google OAuth

1. Create an OAuth application in Google Cloud with a **Web application** client. Only the basic `openid email profile` scopes are requested.
2. Add this exact Authorized redirect URI: `https://shishki.pp.ua/api/auth/google/callback`. If the domain changes, also update `AUTH_ORIGIN` in Wrangler.
3. Store the values as server secrets by entering them at the interactive prompts:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

4. Check Google's Audience settings: Testing mode limits sign-in to test users; public access requires In production mode. Basic Google Sign-In does not require billing.

Without both secrets, the Google button is disabled with an explanation; email registration works independently. The client secret is never sent to the browser or stored in the repository. For an existing password account, sign in with the password first and choose “Link Google” in the profile. Accounts are not automatically merged based on an unverified email address.

Documentation: [WebSockets and Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [Worker static assets](https://developers.cloudflare.com/workers/static-assets/binding/).

## GitHub and automatic deployment

Automatic deployment is configured directly through **Cloudflare Workers Builds**. Every push to the `main` branch of `skweye/shishki-online` runs checks and deploys the `shishki-online` Worker.

Use these settings in Cloudflare → Workers & Pages → shishki-online → Settings → Builds:

| Setting | Value |
| --- | --- |
| Git repository | `skweye/shishki-online` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run check && npm test && npm run build` |
| Deploy command | `npm run deploy` |

If the existing deploy command is `npx wrangler deploy`, change it to `npm run deploy` in Cloudflare. The npm `predeploy` hook applies pending remote D1 migrations before publishing the Worker and stops deployment if migration fails. Direct Wrangler deployment bypasses this hook. Local builds, tests, and dry runs do not modify the remote database.

The existing Cloudflare build token is used. No additional GitHub secrets are needed. The Worker name in `wrangler.jsonc` matches the name in Cloudflare.

GitHub Actions (`ci.yml`) independently checks syntax, rules, builds, and real online rooms on pushes and pull requests. The separate deployment workflow was removed to avoid running two deployment mechanisms. Deployment results and logs are available in Cloudflare → Deployments.

The project's primary and only target Worker is `shishki-online`. Manual deployment with `npm run deploy` updates the same Worker. The primary game URL is https://shishki.pp.ua.

For a new repository without an `origin` remote:

```bash
git remote add origin https://github.com/YOUR_NAME/shishki-online.git
git push -u origin main
```

## Project structure

```text
public/
  index.html        User interface
  style.css         Responsive styling
  app.js            Games, rooms, and reconnection
  game.js           Shared pure rules functions for browser and server
  _headers          Security headers
src/worker.js       HTTP API and one Durable Object per room
tests/              Rules and online integration tests
wrangler.jsonc      Cloudflare configuration
.github/workflows/  CI checks
```

## Storage and limitations

- Rooms are accessible to anyone who knows their code. Each room has exactly two seats and no spectator mode. Matchmaking is described below.
- Guest seats are protected by a random secret in localStorage and become inaccessible after clearing browser data. A signed-in player's seat also requires an active account session and can be restored from the room link.
- Passwords are hashed with scrypt (N=32768, r=8, p=3) and a random salt. Sessions last 30 days and use an HttpOnly/Secure/SameSite cookie; D1 stores only the token hash. Signing out revokes the current session. Sign-in requests are rate-limited by IP and email address.
- Google sign-in uses an authorization code, PKCE, state, nonce, and ID-token signature verification. Google access and refresh tokens are not stored. Password registration does not verify email through a confirmation message; forgotten-password recovery is not yet implemented.
- The server does not trust the client's board. It checks the player's role, turn, revision, and legality of every move.
- Rooms are deleted after one hour without game actions. Creation, the second player joining, and accepted game commands restart the timer. Rejoining, sync, and ping/pong do not extend it. An open tab does not prevent deletion. Leaving the page does not count as resignation. Older rooms adopt the new expiry period when their Durable Object next wakes; until then, their previously scheduled cleanup remains queued.
- For a large public launch, configure room-creation rate limits in Cloudflare. Request size, game-command frequency, and connections per player are already limited; there is no global room limit.
- Each page's styles are embedded in its HTML during the build and allowed by an exact SHA-256 CSP hash. Separate CSS requests are not required for styling. Golos Text is self-hosted in `public/fonts` with its SIL OFL license; the browser falls back to a system font if it is unavailable.
- The development dependency `sharp` is pinned through an override to a patched version, 0.35.5 or later.

The chess engine is chess.js (BSD-2-Clause). `scripts/sync-vendor.mjs` copies its ESM build and license into `public/vendor` before development and builds. The server and browser use the same rules version. Game interface translations live in `public/locales.js`; nicknames, email addresses, and move notation are not translated.

## Profile and statistics

`/profile` is a dedicated account page with an avatar, nickname, email, registration date, sign-in methods, statistics by game mode, and the latest 20 games. Open it through “Profile” in the avatar menu. Statistics are collected from the profile update onward; local games and individual Chapaev rounds do not count. Results are recorded by the server, and a unique `user_id`/`match_id` pair prevents duplicates on reconnect. If D1 is unavailable, the Durable Object queues results and retries after one minute.

Before deploying the profile feature, apply migrations to the existing database:

```bash
npx wrangler d1 migrations apply AUTH_DB --remote
```

`0003_account_stats.sql` adds results and links between accounts and rooms. The database is already bound to the Worker through `wrangler.jsonc`; no new database is needed.

Deleting an account from the profile requires the email address, the word DELETE, and the current password if one is set. The server checks the session, Origin, and attempt limit. The profile, sessions, pending OAuth links, and personal results are deleted through cascades; active rooms receive an anonymization request. Older rooms without a link in the new table expire after the normal one-hour period. Opponents' statistics do not contain the deleted user's name or ID. Signing in with Google after deletion creates a new account with empty statistics.

## Coins and shop

`/shop` provides the account's shop and collection, accessible through the avatar menu and profile. Each account starts with 100 coins. Completed online games with at least four moves or shots award 30 coins for a win, 15 for a draw, and 10 for a loss. Local games and individual Chapaev rounds do not award coins.

Items are now obtained only from cases: Traveler (100 coins), Master (250), and Royal (500). Direct purchases through the UI and `/api/auth/shop/buy` are disabled. Existing collections are preserved, and administrator full access still works. Draughts skins, ship models, cues, and effects have common, rare, epic, or legendary rarity. Drop probabilities and duplicate compensation are defined in `public/cases.js` and displayed before opening. Items within each rarity have equal chances. Only in-game coins are used; there are no real-money payments.

Completed online matches with at least four moves award experience: 100 XP for a win, 60 XP for a draw, and 40 XP for a loss. Level = 1 + floor(XP / 200). Every tenth level awards a case: Royal at multiples of 50, otherwise Master at multiples of 20, otherwise Traveler. Unopened reward cases accumulate. Migration `0011_cases_levels.sql` credits past results and adds an experience trigger for new ones; duplicate results do not award experience again.

Before deploying, run `npx wrangler d1 migrations apply AUTH_DB --remote`. The `/api/auth/shop/open` endpoint accepts `caseId`, `source` (`coins`/`reward`/`access`), and `requestId`. The server selects the result using `crypto.getRandomValues`; the idempotent `requestId` is saved in the browser until a successful response. D1 triggers atomically deduct coins or a reward case and record the item and compensation. Switching tabs and retrying requests cannot cause duplicate charges. Opening history is available in the shop. Deleting an account removes its progress, cases, and collection.

Normal victories and resignations have independent effect selections in the shop. One owned effect can be assigned to both events. Migration `0005_victory_effect.sql` adds the normal-victory selection. It applies to checkmate, wins on time, capturing or blocking all opposing draughts pieces, and completing an entire Chapaev match. Draws and intermediate rounds do not play a final effect. The last Chapaev shot finishes before the effect begins. Case effects include Triumph, Fireworks, Portal, Blizzard, Sakura, and Eclipse.

Final effects interact with pieces through shock waves, movement along a comet's path, portal suction, frost, wind, and celebratory jumps. Game coordinates do not change: DOM boards use temporary visual copies, while Chapaev uses canvas transformations during rendering. Completing or canceling an effect restores the exact final position. Pieces stay still with reduced motion enabled.

Migration `0006_shop_access.sql` grants full catalog access to the owner's existing Google-verified account. The server-side `users.shop_access` flag allows selecting any current or future item without spending coins; clients cannot set it. Deleting the account also deletes the flag.

## Admin panel

`/admin` uses these levels: 0 — player; 1 — observer (read-only); 2 — manager (shop access and coin grants to lower-level accounts); 3 — head administrator (also assigns levels 0–3 and manages their own account). Administrators cannot change other accounts at equal or higher levels. The head administrator can demote themselves, including to player; permissions change immediately. Removing privileges revokes full access but preserves owned items and the coin balance.

Migration `0012_admin_levels.sql` moves existing administrators to level 2 and assigns level 3 to the existing verified account `kkoallqq@gmail.com`. A new account with the same email does not automatically receive privileges. `is_admin` remains a compatibility flag synchronized from `admin_level`. Before deploying, run `npx wrangler d1 migrations apply AUTH_DB --remote`.

To grant coins, find an account, choose “Grant coins,” enter an integer from 1 to 1,000,000, and confirm. The amount is added to the current balance, including the usual starting 100 coins if no wallet exists yet. Requests to `/api/auth/admin/coins` are idempotent per administrator `requestId`; a D1 trigger atomically checks the hierarchy, writes an audit entry, and increases the balance. Pending requests are saved in the browser for safe retries. Level updates through `/api/auth/admin/level` use `expected` to guard against stale panel data. All changes validate the session and Origin. Audit logs record level changes and coin grants; account deletion clears their account references.

## Matchmaking

On the home screen, choose “Find an opponent,” select a game mode, and press the main button. Matchmaking is available to guests and signed-in accounts in all supported modes. Players in the same mode are paired by waiting time, with sides assigned randomly. One account, or one guest in the same browser, cannot occupy both seats. A match opens a normal online room with chat, reconnection, rematches, and account statistics.

The queue is stored in the `Matchmaker` Durable Object (`MATCHMAKER` binding, Workers migration `v3`). Deploy the update with `npm run deploy`; matchmaking needs no additional D1 tables. The browser refreshes its search every three seconds, and entries expire after 45 seconds without an update. Reloading restores the search; if it has expired, the interface offers to start again. Players can cancel while waiting. If the server has already paired them, both enter the created game. Confirmed pairings and private seat tokens are retained for ten minutes to recover from a lost response. The opponent's token is never sent to the client.

Sounds for starting, canceling, and completing a search use the shared sound settings. Search animation respects reduced motion and page visibility. Tests: `tests/matchmaking.test.js`, `tests/matchmaking-ui.test.js`, and `tests/matchmaking-online.test.js`. Online tests run only against a local test server to avoid entering real players' queues.

## Owner-only pranks

The game menu's “⋯ → Owner prank” entry offers mode-specific actions: a king in standard and large draughts, an extra minute in chess, double sixes in nardy, reinforcements in Chapaev, an automatic cue-ball run through the owner's group in pool, a tile exchange with the boneyard in dominoes, and an accurate hit in Battleship. Actions can be used without a count limit on the owner's turn. Their preconditions still apply: crowning requires an ordinary piece, for example, and reinforcements require an eliminated piece. A rematch starts a normal new game.

Actions run immediately from the menu without a confirmation, banner, or toast. Action sounds are preserved. In pool, both players see the same sequence: the cue ball approaches the owner's balls, sends them into pockets, breaks up tight clusters through actual collisions, and pockets the eight ball last. Opposing balls remain on the table throughout the animation, including during cluster collisions. On an open table, the sequence chooses one group before moving and assigns it to the owner. Rotation, collision sounds, and pocket sounds follow the frames; victory appears after the sequence ends. Games using pranks do not count toward statistics or award experience or coins. Mute, volume, and sound-pack preferences are respected. Reduced motion disables effect movement, and leaving the page stops the effect and its sound.

Migration `0014_owner_pranks.sql` grants this separate permission only to the existing Google-verified account `kkoallqq@gmail.com`. It is not an administrator level: the admin panel cannot transfer it, and a new account with the same email does not inherit it. On every use, the server checks the active session, database permission, email, turn, revision, and game-specific conditions. Client data cannot grant access. Before deploying, run `npx wrangler d1 migrations apply AUTH_DB --remote`.

In pool, player groups, remaining-ball counts, pocketed-ball markers, and shot history update after the shot animation ends. With reduced motion enabled, or when the tab becomes hidden, the final state appears immediately.

## Building styles and assets

The home screen uses an illustrated shelf for board games, a separate lower group for off-board games, and three direct launch actions: matchmaking, an invite room, or a local match. There is no duplicate quick-start list. The selected game, artwork and background stay synchronized across both groups. Selection uses shared sound preferences. The shelf scrolls horizontally on phones. Sources: `public/lobby.css` and `public/art`.

Before development, dry runs, and deployment, Wrangler runs `scripts/prepare-assets.mjs`. Source files remain in `public`; deployment uses the automatically regenerated `.site-assets` directory. The script preserves each page's CSS order, normalizes line endings, and adds exact style hashes to `_headers` without allowing arbitrary inline styles or scripts. `safari.css` provides fallback colors and blur for older Safari versions. Do not edit `.site-assets` manually.

Style delivery and local font tests: `tests/assets.test.js`. To check a deployed build over HTTP, run `node scripts/check-assets.mjs https://shishki.pp.ua`.

### Card checks and schema updates

`npm run test:browser` checks actual background rendering and card animations in a separate headless Chromium instance. Keep `npm run dev` running; set `BROWSER_BIN` and `TEST_BASE_URL` if needed. `npm run test:integration` includes online games for every Durak variant and item sales through the API.

Before deploying this version, apply migrations `0015_card_skin.sql` and `0016_item_sales.sql` to the target D1 database with `npx wrangler d1 migrations apply AUTH_DB --remote`, then deploy the Worker. Locally, `npm run dev` applies migrations automatically.

If `/api/auth/shop` returns HTTP 503 after updating the application, check for pending database migrations with `npx wrangler d1 migrations list AUTH_DB --remote`. In particular, the inventory sale query requires the `non_resalable_items` table from migration `0016`. Apply pending migrations to the existing database; do not recreate it or clear account data. If Wrangler is not authenticated, run `npx wrangler login` first. Reload the shop after the migrations complete. A database-only repair does not require redeploying the existing Worker.
