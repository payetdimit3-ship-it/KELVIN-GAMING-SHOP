LIFEISGAMETZ WEBSITE — ROUTE-LINKED PACKAGE

This package is based on the uploaded website ZIP. It keeps the original HTML, JavaScript,
configuration, SQL/schema and existing project files, and adds compatibility route pages
for common hyphenated URLs and admin navigation paths.

HOW TO RUN
1. Extract this ZIP.
2. Open the project using your normal hosting/deployment setup (Render/static hosting or
   your existing server). Many original pages use root-relative URLs and expect the site
   to be served from the domain root, not opened as isolated file:// pages.
3. Check config.js / Supabase settings and set your real environment/configuration values
   before using login, database, payment, AI, or admin features.

IMPORTANT
- Route aliases make many existing navigation URLs resolve to their corresponding pages.
- They do not create backend services or credentials that were not present in the original ZIP.
- Verify Supabase tables/RLS, OAuth redirect URLs, payment provider settings, AI API keys,
  and server-side secrets in the deployment environment before production use.
