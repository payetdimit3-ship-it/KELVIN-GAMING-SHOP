// supabase/functions/azampay-checkout/index.ts
//
// Hii Edge Function inapokea ombi la malipo kutoka frontend (cart.html /
// tournament.html), inapata token kutoka AzamPay, kisha inaomba MNO
// Checkout (STK Push) itumwe kwenye simu ya mteja.
//
// Imesahihishwa kwa mujibu wa AzamPay OpenAPI spec halisi (v1).
//
// DEPLOY:
//   supabase functions deploy azampay-checkout
//
// WEKA SECRETS (mara moja tu, kabla ya deploy):
//   supabase secrets set AZAMPAY_APP_NAME="LifeIsGameTZ"
//   supabase secrets set AZAMPAY_CLIENT_ID="xxxx"
//   supabase secrets set AZAMPAY_CLIENT_SECRET="xxxx"
//   supabase secrets set AZAMPAY_API_KEY="xxxx"
//   supabase secrets set AZAMPAY_ENV="sandbox"   # au "production"
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="xxxx"  (kutoka Settings->API)
//
// ITAITWA KUTOKA FRONTEND HIVI:
//   const { data, error } = await supabase.functions.invoke('azampay-checkout', {
//     body: { orderId, amount, phone, provider }
//   });
//   // provider LAZIMA iwe mojawapo ya: "Airtel" | "Tigo" | "Halopesa" | "Azampesa" | "Mpesa"
//   // (hizi ndizo enum values halisi za AzamPay Provider schema)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AZAMPAY_ENV = Deno.env.get('AZAMPAY_ENV') ?? 'sandbox';
const TOKEN_URL = AZAMPAY_ENV === 'production'
  ? 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken'
  : 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken';
const CHECKOUT_URL = AZAMPAY_ENV === 'production'
  ? 'https://checkout.azampay.co.tz/azampay/mno/checkout'
  : 'https://sandbox.azampay.co.tz/azampay/mno/checkout';

const VALID_PROVIDERS = ['Airtel', 'Tigo', 'Halopesa', 'Azampesa', 'Mpesa'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAzamPayToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: Deno.env.get('AZAMPAY_APP_NAME'),
      clientId: Deno.env.get('AZAMPAY_CLIENT_ID'),
      clientSecret: Deno.env.get('AZAMPAY_CLIENT_SECRET'),
    }),
  });
  if (!res.ok) throw new Error('AzamPay token request failed: ' + res.status);
  const json = await res.json();
  // Response schema: { data: { accessToken, expire }, message, success, statusCode }
  const accessToken = json?.data?.accessToken;
  if (!accessToken) throw new Error('AzamPay token response haina data.accessToken');

  cachedToken = { value: accessToken, expiresAt: Date.now() + 50 * 60 * 1000 };
  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { orderId, amount, phone, provider } = await req.json();

    if (!orderId || !amount || !phone || !provider) {
      return new Response(JSON.stringify({ error: 'orderId, amount, phone, na provider vyote vinahitajika' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ error: `provider lazima iwe mojawapo ya: ${VALID_PROVIDERS.join(', ')}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ---------- Thibitisha bei kutoka database, SIYO kutoka client ----------
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, total, status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order haijapatikana' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (Number(order.total) !== Number(amount)) {
      return new Response(JSON.stringify({ error: 'Kiasi hakilingani na order — imekataliwa kwa usalama' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (order.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Order hii tayari imeshughulikiwa' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    // AzamPay CheckoutRequest.amount: value range 0 - 5,000,000 TZS
    if (Number(order.total) > 5_000_000) {
      return new Response(JSON.stringify({ error: 'Kiasi kinazidi ukomo wa AzamPay MNO Checkout (5,000,000 TZS). Tumia Bank Checkout kwa kiasi kikubwa zaidi.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getAzamPayToken();

    // ---------- CheckoutRequest schema halisi: accountNumber, amount (number), currency, externalId, provider ----------
    const checkoutRes = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': Deno.env.get('AZAMPAY_API_KEY')!,
      },
      body: JSON.stringify({
        accountNumber: phone,
        amount: Number(order.total),   // schema inasema "number", siyo string
        currency: 'TZS',
        externalId: orderId,           // hii ndiyo itarudi kama "utilityref" kwenye callback
        provider,
      }),
    });

    const checkoutData = await checkoutRes.json();
    // CheckoutResponse schema: { transactionId, message, success }

    if (!checkoutRes.ok || checkoutData.success === false) {
      return new Response(JSON.stringify({ error: checkoutData.message || 'Checkout imeshindwa', raw: checkoutData }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    await supabaseAdmin.from('orders').update({ status: 'processing' }).eq('id', orderId);

    return new Response(JSON.stringify({ success: true, checkout: checkoutData }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('azampay-checkout error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
