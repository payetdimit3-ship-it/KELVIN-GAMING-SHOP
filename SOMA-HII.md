# server.js kamili (marekebisho yote tayari ndani)

- `server.js` - server yako kamili, **ikiwa na marekebisho yote 5 tayari ndani** (mistari 2,199). Hakuna haja ya kuendesha script.
- `server.asili-yako.js` - nakala ya server uliyonitumia (kabla ya marekebisho), kwa kulinganisha.

## Jinsi ya kutumia (njia rahisi, hata kwa simu)
1. Hifadhi nakala ya `server.js` yako ya sasa (mfano ibadilishe jina kuwa `server.old.js`).
2. Weka `server.js` hii mahali pake kwenye root ya project.
3. Nakili faili za `site/` (HTML na `assets/`) kwenye root ileile.
4. Weka env vars za Render (angalia `ENV-RENDER.md`) na SQL ya `kv_store`.
5. Push; Render itadeploy. `package.json` yako haihitaji dependencies mpya.

## Angalia kwanza
`server.asili-yako.js` niliiandika upya kutoka kwenye faili uliyonitumia kwenye chat. Kabla ya kuweka `server.js` hii, linganisha `server.asili-yako.js` na server yako halisi (mistari, au zana ya "diff"). Ukiona tofauti yoyote, **usitumie `server.js` hii**; tumia njia ya `patches/apply-all.js` kwenye faili lako halisi, kwa sababu itafanya kazi kwenye msimbo wako wenyewe.
Ukiwa umeshabadilisha server yako baada ya kunitumia, pia tumia njia ya patches.

## Nilichokijaribu
Nimeendesha server hii yote kwenye mazingira ya mfano (bila Supabase na bila ClickPesa halisi) na majaribio 60 yalipita: usajili na login, bidhaa za bure na za kulipia, ficha links na codes, jumla ya malipo kuhesabiwa na server, kodi za punguzo, codes za gift cards kwa kila mnunuzi, Squad Market (kuwasilisha, kukagua, kusimba, kuhifadhi kikosi, kutoa Gmail na password baada ya malipo), mapato na withdraw za wauzaji, support tickets, habari, settings, AI kwenye Community, faragha ya tournaments, na vikomo vya AI.
Sijajaribu: malipo halisi ya ClickPesa, Supabase halisi (upload ya faili na hifadhi ya kudumu), na majibu halisi ya AI.
