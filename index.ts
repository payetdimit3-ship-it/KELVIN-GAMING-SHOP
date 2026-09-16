// supabase/functions/ai-chat/index.ts
//
// AI Chat halisi — inatumia Claude API (Anthropic) kujibu chochote
// mteja anachouliza, ikiwa na taarifa za msingi za LifeIsGameTZ.
//
// DEPLOY:
//   supabase functions deploy ai-chat --no-verify-jwt
//
// WEKA SECRET (pata API key kutoka console.anthropic.com):
//   supabase secrets set ANTHROPIC_API_KEY="sk-ant-xxxx"
//
// ITAITWA KUTOKA FRONTEND HIVI:
//   const { data } = await supabase.functions.invoke('ai-chat', {
//     body: { message: "swali la mteja", history: [...] }
//   });
//   // data.reply ndiyo jibu la AI

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Wewe ni "AI Msaidizi" wa LifeIsGameTZ — platform ya gaming, e-commerce, tournaments za eFootball, Youth Marketplace, na Digital Skills Academy nchini Tanzania.

Jukumu lako: kusaidia wateja kwa maswali yoyote — kuhusu bidhaa (games, gift cards, eFootball coins), tournaments, Academy, Youth Marketplace, au maswali ya jumla ya gaming/teknolojia. Jibu kwa Kiswahili cha kawaida (au Kiingereza kama mteja anaandika Kiingereza), kwa ukarimu na ufupi unaofaa simu.

Kanuni muhimu:
- Usitoe ushauri wa kimatibabu wa uhakika (diagnosis/dawa) — kama swali ni la afya, mwelekeze kwenye "Msaada wa Jamii" (community-health.html) na umshauri aone daktari.
- Usitoe taarifa za siri za akaunti za wateja wengine.
- Kama hujui jibu maalum la order/akaunti mahususi, mwambie mteja awasiliane na msaada wa moja kwa moja au aangalie "Akaunti" yake.
- Unaweza kujibu maswali ya jumla ya maisha/teknolojia pia — usikatae kujibu kwa sababu tu si gaming.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { message, history } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: 'message inahitajika' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'ANTHROPIC_API_KEY haijawekwa. Endesha: supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."'
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Jumlisha historia fupi ya mazungumzo (kama ipo) + ujumbe mpya
    const messages = [
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'AI haipatikani kwa sasa, jaribu tena baadaye.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const reply = data?.content?.[0]?.text || 'Samahani, sikuweza kuelewa vizuri. Jaribu tena.';

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ai-chat error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
