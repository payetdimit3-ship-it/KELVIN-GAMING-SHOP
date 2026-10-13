# LIFEISGAMETZ - Anza hapa

Zip hii ina kila kitu: kurasa 51 (`site/`), marekebisho ya server (`patches/`) na orodha ya keys za Render (`ENV-RENDER.md`). Maelezo ya kurasa zote yako ndani ya `site/` kwenye faili `PAGES.md`.

**Njia rahisi (bila terminal):** tumia `server-kamili/server.js` (server yako ikiwa na marekebisho yote tayari). Soma `server-kamili/SOMA-HII.md` kwanza.

## Hatua za kuweka (kwa mpangilio, njia ya patches)
1. **Hifadhi nakala** ya project yako: `git add -A && git commit -m "kabla ya LIFEISGAMETZ"`. Faili zenye majina yaleyale (hasa `index.html`) zitafunikwa.
2. **Nakili** yaliyomo ndani ya folda `site/` (faili zote za `.html` na folda `assets/`) kwenye root ya project, folda moja na `server.js`.
3. **Nakili folda `patches/`** kwenye root ileile.
4. Kwenye terminal, ukiwa kwenye root: `node patches/apply-all.js`
   - Inaweka marekebisho 5 kwa mpangilio, ikitengeneza nakala `server.js.bak*` kabla ya kila moja.
   - Server yako ikiwa tofauti na toleo nililoliona, inasimama na kukuambia sehemu ipi haikupatikana, bila kuharibu `server.js`.
5. **Supabase:** endesha SQL ya `kv_store` iliyo kwenye `ENV-RENDER.md` (SQL Editor).
6. **Render:** weka environment variables zote za `ENV-RENDER.md`. Usiweke keys kwenye HTML, GitHub wala kwenye chat.
7. `git add -A && git commit -m "LIFEISGAMETZ" && git push` - Render itadeploy.

## Jaribio la kwanza (fanya kwa mpangilio)
1. Fungua `/api/admin/storage-status` ukiwa umeingia kama admin: inatakiwa kuonyesha `persistent: true`.
2. Fungua `/api/ai/test`: angalia AI ipi inasema `OK`.
3. Jisajili kwa email ya `ADMIN_EMAIL` -> Profile -> Open Dashboard.
4. Admin -> Settings: weka WhatsApp, simu na **maelezo ya malipo ya Manual**.
5. Manage Games: ongeza game moja ya **Free** na moja ya **Paid** (weka link ya download na picha).
6. Jisajili tena kwa akaunti ya pili (mteja wa kawaida) kwenye browser nyingine.
7. Nunua game ya Paid kwa **Manual**, kisha kama admin: Orders -> Confirm. Mteja aangalie Library.
8. Jaribu Community: andika `@ai habari` na uone AI ikijibu.
9. Jaribu Game Advisor kwenye ukurasa wa game.
10. Squad Market: wasilisha kikosi cha majaribio kama mteja, kikague kama admin (Squads), kinunue na akaunti ya tatu.
11. Upload ya faili la game: inahitaji Supabase Pro kwa faili kubwa kuliko 50 MB.
12. Malipo ya ClickPesa: jaribu kwa kiasi kidogo kabla ya kuwafungulia wateja.
13. Malipo kwa wauzaji: Admin -> Settings weka kamisheni, siku za ulinzi (weka 0 kwa jaribio) na kiwango cha chini; mteja akishanunua kikosi cha muuzaji, muuzaji afungue **Mapato ya Squad**, aombe kutolewa, na wewe Admin -> Withdraw uweke "Nimelipa" baada ya kumtumia pesa mwenyewe.

## Vitu vya kuzingatia
- **Squad Market:** Konami na Google wanaweza kukataza kuhamisha akaunti; hakuna dhamana ya 100%. Admin ndiye anayechukua umiliki kwa mkono; mfumo hauingii kwenye Gmail kiotomatiki.
- **Supabase Free:** faili hadi 50 MB tu, na bandwidth ya downloads ina kikomo.
- **AI:** kila swali linagharimu kikomo cha API yako; kikomo cha maswali 8 kwa dakika kwa kila IP kimewekwa.
- **Malipo kwa wauzaji:** mfumo unahesabu mapato, kamisheni na salio, lakini **hautumi pesa kiotomatiki**; wewe unalipa kwa mobile money na kuweka namba ya muamala.
- **Betting na TV channels za hakimiliki:** hazijajengwa kwa makusudi (leseni na hakimiliki).
- **Ukikwama:** angalia Render -> Logs, na uniletee ujumbe wa kosa. Kurudisha nyuma: nakili `server.js.bak*` juu ya `server.js`.
