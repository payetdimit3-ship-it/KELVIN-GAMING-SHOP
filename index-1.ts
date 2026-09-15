// supabase/functions/azampay-callback/index.ts
//
// AzamPay inapiga URL hii moja kwa moja (server-to-server) mara malipo
// yanapokamilika (au kushindwa). Deploy kwenye:
//   POST https://<project>.supabase.co/functions/v1/azampay-callback
// na uliweke AzamPay Dashboard kama Callback URL ya app yako
// (Sandbox: wakati wa kusajili app; Production: baada ya KYC approval).
//
// ⚠️ USALAMA: Endpoint hii ni ya umma (public) — mtu yeyote angeweza
// kutuma POST request ya uongo akidai malipo yamefanikiwa. Kwa hiyo
// TUNATHIBITISHA RSA SIGNATURE ya kila callback kabla ya kuamini payload
// yake, kwa mujibu wa AzamPay Callback Signature Verification spec.
//
// DEPLOY:
//   supabase functions deploy azampay-callback --no-verify-jwt
//   (--no-verify-jwt inahitajika kwa sababu AzamPay haitumi Supabase auth token)
//
// SECRETS ZINAZOHITAJIKA (zile zile za azampay-checkout):
//   AZAMPAY_ENV, AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, AZAMPAY_CLIENT_SECRET,
//   AZAMPAY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AZAMPAY_ENV = Deno.env.get('AZAMPAY_ENV') ?? 'sandbox';
const TOKEN_URL = AZAMPAY_ENV === 'production'
  ? 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken'
  : 'https://authenticator-sandbox.azampay.co.tz/AppRegistration/GenerateToken';
const PUBLIC_KEY_URL = AZAMPAY_ENV === 'production'
  ? 'https://checkout.azampay.co.tz/azampay/v1/public-key?format=Pem'
  : 'https://sandbox.azampay.co.tz/azampay/v1/public-key?format=Pem';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------- Token (inahitajika kupata public key, kama checkout) ----------
let cachedToken: { value: string; expiresAt: number } | null = null;
async function getAzamPayToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: Deno.env.get('AZAMPAY_APP_NAME'),
      clientId: Deno.env.get('AZAMPAY_CLIENT_ID'),
      clientSecret: Deno.env.get('AZAMPAY_CLIENT_SECRET'),
    }),
  });
  const json = await res.json();
  const accessToken = json?.data?.accessToken;
  if (!accessToken) throw new Error('Imeshindwa kupata AzamPay token kwa ajili ya public key');
  cachedToken = { value: accessToken, expiresAt: Date.now() + 50 * 60 * 1000 };
  return accessToken;
}

// ---------- Public key (cache masaa 24, kama AzamPay wanavyoshauri) ----------
let cachedPublicKey: { pem: string; expiresAt: number } | null = null;
async function getAzamPayPublicKeyPem(): Promise<string> {
  if (cachedPublicKey && cachedPublicKey.expiresAt > Date.now()) return cachedPublicKey.pem;
  const token = await getAzamPayToken();
  const res = await fetch(PUBLIC_KEY_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-API-Key': Deno.env.get('AZAMPAY_API_KEY')!,
    },
  });
  const json = await res.json();
  if (!json?.publicKey) throw new Error('Imeshindwa kupata AzamPay public key');
  cachedPublicKey = { pem: json.publicKey, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return json.publicKey;
}

// ---------- PEM -> CryptoKey (Web Crypto API, inayofanya kazi kwenye Deno) ----------
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function importAzamPayPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

// ---------- Kuu: thibitisha signature ya callback ----------
// Data iliyosainiwa: {utilityref}{externalreference}{transactionstatus}{operator}
async function verifyCallbackSignature(payload: Record<string, string>): Promise<boolean> {
  if (!payload.signature) return false;

  const dataToVerify = `${payload.utilityref ?? ''}${payload.externalreference ?? ''}${payload.transactionstatus ?? ''}${payload.operator ?? ''}`;
  const publicKeyPem = await getAzamPayPublicKeyPem();
  const key = await importAzamPayPublicKey(publicKeyPem);

  const signatureBytes = Uint8Array.from(atob(payload.signature), (c) => c.charCodeAt(0));
  const dataBytes = new TextEncoder().encode(dataToVerify);

  return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signatureBytes, dataBytes);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const payload = await req.json();
    console.log('AzamPay callback payload:', JSON.stringify(payload));

    // ---------- MUHIMU: thibitisha signature kabla ya kuamini chochote ----------
    let signatureValid = false;
    try {
      signatureValid = await verifyCallbackSignature(payload);
    } catch (sigErr) {
      console.error('Signature verification error:', sigErr);
    }
    if (!signatureValid) {
      console.error('AzamPay callback signature SI SAHIHI — imekataliwa. Payload:', JSON.stringify(payload));
      // Turudishe 200 ili AzamPay wasiendelee ku-retry, lakini HATUBADILISHI order yoyote.
      return new Response('OK', { headers: CORS_HEADERS });
    }

    // ---------- utilityref = order ID yetu (ile tuliyotuma kama externalId kwenye checkout) ----------
    const orderId = payload.utilityref;
    const transactionStatus = (payload.transactionstatus || '').toLowerCase();
    const isSuccess = transactionStatus === 'success';

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'utilityref haipo kwenye payload' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, total')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      console.error('Order haijapatikana kwa callback:', orderId);
      return new Response('OK', { headers: CORS_HEADERS });
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: isSuccess ? 'paid' : 'cancelled',
        escrow_status: isSuccess ? 'held' : 'refunded',
      })
      .eq('id', orderId);

    if (order.user_id) {
      await supabaseAdmin.from('wallet_transactions').insert({
        user_id: order.user_id,
        type: 'purchase',
        amount: order.total,
        status: isSuccess ? 'completed' : 'failed',
        reference_type: 'order',
        reference_id: order.id,
        note: `AzamPay callback — operator: ${payload.operator ?? 'N/A'}, mnoreference: ${payload.mnoreference ?? 'N/A'}`,
      });

      await supabaseAdmin.from('notifications').insert({
        user_id: order.user_id,
        title: isSuccess ? 'Malipo Yamefanikiwa ✅' : 'Malipo Yameshindwa ❌',
        body: isSuccess
          ? `Order yako #${order.id.slice(0, 8)} imelipwa na inashughulikiwa.`
          : `Order yako #${order.id.slice(0, 8)} haikukamilika. Jaribu tena au wasiliana na msaada.`,
      });
    }

    return new Response('OK', { headers: CORS_HEADERS });
  } catch (err) {
    console.error('azampay-callback error:', err);
    return new Response('OK', { headers: CORS_HEADERS });
  }
});
