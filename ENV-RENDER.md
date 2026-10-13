# Environment variables za Render (API keys zote ziwekwe hapa)

Weka kwenye Render: **Dashboard -> huduma yako -> Environment -> Add Environment Variable**.
Usiweke keys kwenye HTML, GitHub wala kwenye chat. Ukiwahi kuziweka mahali pa wazi, zibadilishe (rotate) kwenye mtoa huduma husika.

## Za lazima
| Jina | Matumizi |
|---|---|
| `SUPABASE_URL` | Anwani ya project ya Supabase |
| `SUPABASE_SERVICE_KEY` (au `SUPABASE_SERVICE_ROLE_KEY`) | Siri: Render pekee. Hifadhi ya data na faili |
| `SUPABASE_ANON_KEY` | Inatumika na browser kupakia faili la game (ni ya umma kwa muundo) |
| `ADMIN_EMAIL` | Email ya admin. Aliyejisajili kwa email hii ndiye Super Admin |
| `SQUAD_KEY` | Maneno marefu ya siri ya kusimba credentials za Squad Market. **Ukiipoteza, credentials zilizohifadhiwa haziwezi kufunguliwa** |
| `CLICKPESA_CLIENT_ID`, `CLICKPESA_API_KEY` | Malipo ya ClickPesa (USSD) |

## AI (weka angalau moja)
`CEREBRAS_API_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (au `GEMINI_API_KEY`), `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`

## Hiari
| Jina | Matumizi |
|---|---|
| `NEXUS_AI_PRIMARY`, `NEXUS_AI_FALLBACK` | AI ipi itumike kwanza / akiba |
| `NEXUS_GAME_PROVIDER` | AI ya Game Advisor na Squad |
| `NEXUS_COMMUNITY_PROVIDER` | AI ya Community (`@ai`) |
| `NEXUS_TUTOR_PROVIDER` | AI Mwalimu wa Academy |
| `NEXUS_PARTNER_PROVIDER` | AI ya Partnership (admin) |
| `NEXUS_HEALTH_PROVIDER` | AI ya Health |
| `SUPABASE_STORAGE_BUCKET` | Bucket ya wazi ya movies/video (chaguo-msingi `gamehub-media`) |
| `SUPABASE_GAMES_BUCKET` | Bucket ya faragha ya faili za games (chaguo-msingi `gamehub-games`) |
| `SUPABASE_KV_TABLE` | Jina la table ya hifadhi (chaguo-msingi `kv_store`) |
| `ADMIN_SETUP_KEY` | Ufunguo wa `/api/auth/promote` |

`PORT` na `RENDER_EXTERNAL_URL` Render inaziweka yenyewe.

## Table ya hifadhi (lazima iwepo kwenye Supabase)
Render free tier inafuta diski kila deploy; server yako inahifadhi data kwenye Supabase table `kv_store`. Kama bado haipo, endesha hii kwenye **SQL Editor**:
```sql
create table if not exists kv_store (
  file_name text primary key,
  data jsonb,
  updated_at timestamptz default now()
);
```
Buckets (`gamehub-media`, `gamehub-games`) zinatengenezwa na server yenyewe inapoanza.

## Jinsi ya kuhakiki baada ya deploy
Ukiwa umeingia kama admin, fungua kwenye browser:
- `/api/admin/storage-status` -> `persistent: true` ina maana data inahifadhiwa Supabase.
- `/api/ai/test` -> inaonyesha ni AI zipi zinafanya kazi (`OK`, `NO_KEY` au `FAILED`).
