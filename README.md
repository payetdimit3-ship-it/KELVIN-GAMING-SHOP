# LIFEISGAMETZ — kurasa tofauti (kila ukurasa una file lake)

Kila ukurasa ni faili la HTML lake lenye msimbo wake. Sehemu zinazoshirikiwa kwa kurasa zote ziko kwenye `assets/`:

- `assets/lgz.css` — muundo (rangi, kadi, fomu, sidebar)
- `assets/lgz-core.js` — mawasiliano na API ya server yako, cart, login, vitendo vya pamoja (sidebar, header)

## Jinsi ya kuweka
1. Nakili **faili zote na folda `assets/`** kwenye root ya project yako (folda moja na `server.js`). `express.static('.')` yako inazihudumia.
2. **Hifadhi nakala kwanza** ya faili zako za zamani zenye majina yaleyale (hasa `index.html`, `store.html`, `profile.html`, `login.html`, `dashboard.html`...), kwa sababu zitafunikwa.
3. Server yako ishatumia `apply-patches.js` na `apply-patches-v2.js` (zimetolewa awali), na Render ina env vars zake.

## Kurasa za wateja
| Ukurasa | File |
|---|---|
| Home | `index.html` |
| Store / Games | `store.html`, `games.html` |
| Game moja | `product-details.html?p=ID` |
| Free Games | `free-games.html` |
| PSP, PS2, PS3, Switch, Android, PC | `psp-gaming.html`, `ps2-gaming.html`, `ps3-gaming.html`, `nintendo-switch.html`, `android-gaming.html`, `pc-gaming.html` |
| Squad Market / Uza kikosi | `squad-market.html`, `sell-squad.html` |
| Gift Cards / Top Up | `gift-cards.html`, `efootball-topup.html` |
| Movies | `movies.html` |
| Biashara & Washirika | `marketplace.html` |
| Tournaments / Live Scores / Game Requests | `tournament.html`, `live-scores.html`, `game-requests.html` |
| Academy (na AI Mwalimu) | `academy.html` |
| Community (na AI) | `community-chat.html` |
| AI Assistant / Health Assistant | `ai-assistant.html`, `health-assistant.html` |
| Cart / Checkout / Wishlist / Library | `cart.html`, `checkout.html`, `wishlist.html`, `my-games-library.html` |
| Login / Register / Profile | `login.html`, `register.html`, `profile.html` |
| Oda zangu | `my-orders.html` |
| FAQ & Help / Support | `faq-help.html`, `contact-support.html` |

## Kurasa za admin (zinaonekana kwa Super Admin pekee, kupitia Profile → Open Dashboard)
`dashboard.html`, `games-management.html`, `orders-sales.html`, `users-management.html`, `coupons-discounts.html`, `squads-management.html`, `partners-management.html`, `analytics.html`, `support-tickets.html`

## Kurasa za ramani yako ambazo bado hazijajengwa
`winlator-gamehub`, `live-tv-esports`, `betting`, `courses`, `cloud-gaming`, `my-orders`, `requests-transactions`, `contact-support`, `faq-help`, `live-football-watch`, `live-movies-player`, `game-trailer`, `sports-tv`, `sports-news` na admin: `products-management`, `movies-management`, `trailers-management`, `hero-homepage-management`, `live-matches-management`, `efootball-topup-management`, `cloud-gaming-management`, `gift-cards-management`, `marketplace-management`, `withdraw-requests`, `courses-management`, `lessons-videos-management`, `students-management`, `sports-tv-management`, `sports-news-management`, `reports`, `storage-server`, `settings`.

## Server
Kurasa za Support zinahitaji `apply-patches-v3.js` (baada ya v1 na v2).

## Kuongeza ukurasa mpya
Nakili faili lolote (mfano `free-games.html`), ubadilishe jina, `file:` na `pg:` ndani ya `LGZ.page({...})`, kisha ubadilishe msimbo wa ukurasa ndani ya `function(a,q,A,pg){ ... }`. Ongeza kiungo kwenye `NAVF` ndani ya `assets/lgz-core.js` ukitaka kionekane kwenye sidebar.
