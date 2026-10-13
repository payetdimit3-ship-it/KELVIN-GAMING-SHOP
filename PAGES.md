# LIFEISGAMETZ - kurasa tofauti (kila ukurasa una faili lake)

Kila ukurasa ni faili la HTML lake lenye msimbo wake. Sehemu zinazoshirikiwa kwa kurasa zote ziko kwenye `assets/`:

- `assets/lgz.css` - muundo (rangi, kadi, fomu, sidebar)
- `assets/lgz-core.js` - mawasiliano na API ya server yako, cart, login, vitendo vya pamoja (sidebar, header)

Msimbo umepangwa vizuri: mistari mifupi, indentation, na vichwa vya sehemu ndani ya `assets/lgz-core.js`.

## Jinsi ya kuweka
1. Nakili **faili zote na folda `assets/`** kwenye root ya project yako (folda moja na `server.js`). `express.static('.')` yako inazihudumia.
2. **Hifadhi nakala kwanza** ya faili zako za zamani zenye majina yaleyale (hasa `index.html`, `store.html`, `profile.html`, `login.html`, `dashboard.html`...), kwa sababu zitafunikwa.
3. Weka marekebisho ya server kwa mpangilio: `apply-patches.js`, kisha `apply-patches-v2.js`, kisha `apply-patches-v3.js`, `apply-patches-v4.js` na `apply-patches-v5.js` (zimetolewa kando).
4. Weka keys zote kwenye Render Environment. Orodha kamili iko kwenye **`ENV-RENDER.md`**.

## Kurasa za wateja
| Ukurasa | File |
|---|---|
| Home | `index.html` |
| Store / Games | `store.html`, `games.html` |
| Game moja | `product-details.html?p=ID` |
| Free Games | `free-games.html` |
| PSP, PS2, PS3, Switch, Android, PC | `psp-gaming.html`, `ps2-gaming.html`, `ps3-gaming.html`, `nintendo-switch.html`, `android-gaming.html`, `pc-gaming.html` |
| Squad Market / Uza kikosi | `squad-market.html`, `sell-squad.html` |
| Mapato ya muuzaji wa Squad | `my-earnings.html` |
| Gift Cards / Top Up | `gift-cards.html`, `efootball-topup.html` |
| Movies / Movie player | `movies.html`, `live-movies-player.html?p=ID` |
| Game Trailers | `game-trailer.html` |
| Biashara & Washirika | `marketplace.html` |
| Tournaments | `tournament.html` |
| Live Scores / Mechi ya live | `live-scores.html`, `live-football-watch.html?p=ID` |
| Game Requests | `game-requests.html` |
| Habari za Michezo | `sports-news.html` |
| Academy (na AI Mwalimu) | `academy.html` |
| Community (na AI) | `community-chat.html` |
| AI Assistant / Health Assistant | `ai-assistant.html`, `health-assistant.html` |
| Cart / Checkout / Wishlist / Library | `cart.html`, `checkout.html`, `wishlist.html`, `my-games-library.html` |
| Oda zangu | `my-orders.html` |
| FAQ & Help / Support | `faq-help.html`, `contact-support.html` |
| Login / Register / Profile | `login.html`, `register.html`, `profile.html` |

## Kurasa za admin
Zinaonekana kwa Super Admin pekee, kupitia Profile -> Open Dashboard.

`dashboard.html`, `games-management.html`, `orders-sales.html`, `users-management.html`, `coupons-discounts.html`, `squads-management.html`, `partners-management.html`, `support-tickets.html`, `withdraw-requests.html`, `settings.html`, `reports.html`, `analytics.html`

## Kurasa za ramani yako ambazo bado hazijajengwa
`winlator-gamehub`, `live-tv-esports`, `betting`, `courses`, `cloud-gaming`, `requests-transactions`, `sports-tv` na admin: `products-management`, `movies-management`, `trailers-management`, `hero-homepage-management`, `live-matches-management`, `efootball-topup-management`, `cloud-gaming-management`, `gift-cards-management`, `marketplace-management`, `courses-management`, `lessons-videos-management`, `students-management`, `sports-tv-management`, `sports-news-management`, `storage-server`.

(Usimamizi wa movies, live matches, gift cards, marketplace na kozi kwa sasa uko ndani ya kurasa zenyewe kwa admin, kwa hiyo kurasa hizo za `*-management` bado hazihitajiki.)

## Kuongeza ukurasa mpya
Nakili faili lolote (mfano `free-games.html`), ubadilishe jina, `file:` na `pg:` ndani ya `LGZ.page({...})`, kisha ubadilishe msimbo wa ukurasa ndani ya `function(a,q,A,pg){ ... }`. Ongeza kiungo kwenye `NAVF` ndani ya `assets/lgz-core.js` ukitaka kionekane kwenye sidebar.
