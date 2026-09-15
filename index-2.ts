// supabase/functions/daily-report/index.ts
//
// Hii Edge Function inaitwa na pg_cron kila siku (angalia
// supabase_migration_automation.sql). Inakusanya takwimu za siku
// iliyopita, inaziandika kwenye jedwali la `daily_reports`, na kumtumia
// Boss/Admin notification yenye muhtasari — hii ndiyo "AI Automation
// Engine" (ripoti za kila siku bila mtu kubofya chochote).
//
// DEPLOY:
//   supabase functions deploy daily-report --no-verify-jwt
//   (--no-verify-jwt inahitajika kwa sababu pg_cron inaita kwa service role,
//    siyo kwa auth token ya kawaida ya mtumiaji)
//
// Baada ya deploy, angalia supabase_migration_automation.sql kuweka
// pg_cron schedule (ukibadilisha PROJECT_REF na SERVICE_ROLE_KEY).
//
// Pia inaweza kuitwa moja kwa moja na Boss AI Assistant akiuliza
// "nipe ripoti ya leo" (angalia admin-dashboard.html).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ---------- Tarehe: "jana" (siku kamili iliyopita) ----------
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    const dayStart = new Date(reportDate + 'T00:00:00.000Z');
    const dayEnd = new Date(reportDate + 'T23:59:59.999Z');

    // ---------- Kusanya takwimu (zote sambamba) ----------
    const [ordersRes, revenueRes, usersRes, tourneyRes, withdrawalsRes] = await Promise.all([
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true })
        .gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()),
      supabaseAdmin.from('orders').select('total').eq('status', 'paid')
        .gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
        .gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()),
      supabaseAdmin.from('tournament_registrations').select('*', { count: 'exact', head: true })
        .gte('registered_at', dayStart.toISOString()).lte('registered_at', dayEnd.toISOString()),
      supabaseAdmin.from('wallet_transactions').select('*', { count: 'exact', head: true })
        .eq('type', 'withdrawal').eq('status', 'pending'),
    ]);

    const totalOrders = ordersRes.count || 0;
    const totalRevenue = (revenueRes.data || []).reduce((sum, o) => sum + Number(o.total || 0), 0);
    const newUsers = usersRes.count || 0;
    const newTourneyRegs = tourneyRes.count || 0;
    const pendingWithdrawals = withdrawalsRes.count || 0;

    const summary =
      `Ripoti ya ${reportDate}: Orders ${totalOrders}, Mapato TZS ${totalRevenue.toLocaleString('en-US')}, ` +
      `Watumiaji wapya ${newUsers}, Usajili mpya wa tournaments ${newTourneyRegs}, ` +
      `Withdrawals zinazosubiri ${pendingWithdrawals}.`;

    // ---------- Andika kwenye daily_reports (upsert kwa report_date) ----------
    await supabaseAdmin.from('daily_reports').upsert({
      report_date: reportDate,
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      new_users: newUsers,
      new_tournament_registrations: newTourneyRegs,
      pending_withdrawals: pendingWithdrawals,
      summary_text: summary,
    }, { onConflict: 'report_date' });

    // ---------- Tuma notification kwa Owner/Admin/Staff wote ----------
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('role', ['owner', 'admin', 'staff']);

    if (admins && admins.length) {
      const notifs = admins.map((a) => ({
        user_id: a.id,
        title: '📊 Ripoti ya Kila Siku',
        body: summary,
      }));
      await supabaseAdmin.from('notifications').insert(notifs);
    }

    return new Response(JSON.stringify({ success: true, reportDate, summary }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('daily-report error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
