# Mabadiliko V15

## Vipengele vipya
- Links nyingi kwa game moja (admin: "Ongeza Link") — `products.links = [{label,url}]`
- Free Games: `free-games.html`, tiki ya FREE kwenye admin, chip ya "Free" dukani
- AI kwenye Community Chat: kitufe "Uliza AI" au `@AI` — `POST /api/public-chat/ai`
- Game Advisor (AI) kwa kila category + ukurasa wa bidhaa: `game-advisor.html`, `game-advisor.js`, `POST /api/ai/game-advisor`
- Winlator & GameHub: `winlator-gamehub.html`
- Admin: platform + specs za game (AI inazitumia)

## Kuunganisha pages (V16: pages zote 100 ni kamili, hakuna redirects)
- Pages 54 za zamani (placeholder bila CSS) sasa ni pages KAMILI zenye anwani zao wenyewe, zinatengenezwa na `python3 tools/build-pages.py`
  - user pages (30) = nakala ya ukurasa halisi (mf. `psp-gaming.html` = shop ya PSP, `store.html` = shop)
  - admin pages (24) = admin.html inayofungua tab yake pekee (mf. `users-management.html` = Customers)
  - Ukibadilisha `shop.html`, `admin.html` n.k., endesha script tena ili nakala zisasishwe
- `betting.html` na `sports-news.html` kwa sasa zinaonyesha Live Matches (hakuna mfumo wa kubet wala habari bado)
- Pages zote halisi zipo kwenye sidebar/MORE ya `zoneplay-shell.js`
- `admin.html` sasa inafungua tab kutoka kwenye URL hash

## Usalama
- `/api/products` haitoi tena password za akaunti wala links za games za kulipia kwa wateja; hutolewa kupitia `/api/my-orders` baada ya malipo

## V17 — marekebisho ya server.js (usalama na malipo)
- Bei/total ya checkout inahesabiwa na SERVER kutoka kwenye products + kuponi + shipping (mteja hawezi kubadilisha bei). Rentals zina bei ya server.
- Webhook ya ClickPesa haiaminiki tena: server inauliza ClickPesa moja kwa moja (`GET /payments/{orderReference}`) kabla ya kuthibitisha. Kama ukaguzi ukishindikana order inabaki pending (admin athibitishe kwa mkono).
- orderReference ni ya nasibu (si timestamp tu); tx ref ya manual haitumiki mara mbili; kikomo cha ripoti 5 za manual zinazosubiri.
- Kuponi: inahitaji login, haihesabiwi wakati wa kukagua bali order inapotengenezwa.
- `ADMIN_EMAIL` haina default tena. Admin wa password-register anapewa mara ya kwanza tu; `ADMIN_SETUP_KEY` inalinganishwa kwa timing-safe.
- Files za siri (server.js, package.json, *.json za root, *.md, tools/, dotfiles) hazitolewi tena na static server.
- `getIP` inatumia `trust proxy` (IP haiwezi kughushiwa kwa x-forwarded-for).
- Ukaguzi wa input: hakuna tena kufungwa kwa maandishi marefu; SQL/XSS patterns zimeboreshwa; IP inafungwa baada ya majaribio 3 ndani ya dakika 10; `javascript:` URL zinakataliwa.
- Login lock ni kwa IP+email (mtu hawezi kumfungia mwingine); sessions zinaisha baada ya siku 30; `?token=` inakubaliwa kwa GET tu.
- Uploads: admin anathibitishwa kabla ya file kupokelewa; files za muda zinafutwa; upload ya Supabase kwa stream.
- AI: kikomo cha maombi (10/dakika, 150/siku kwa IP) kwenye /api/ai/chat, /health, /recommendations.
- Tournaments: wateja wanaona idadi tu (majina/simu ni kwa admin); session token haihifadhiwi tena.
- Malipo ya mechi: mshindi lazima awe mchezaji wa mechi; hakuna commission bila mshindi.
- /api/admin/users haitoi password hashes. writeJson ni atomic na upserts za Supabase zinaenda kwa mpangilio.
- `checkout.html` sasa inatuma `coupon` na `shipping`; kuponi inahitaji login.
- Kosa lililorekebishwa: `admin.html#tab-...` ilirudishwa kwenye Dashboard na msimbo wa mwanzo; sasa tab ya link inafunguka (pages 24 za admin zinaonyesha tab yake pekee).
