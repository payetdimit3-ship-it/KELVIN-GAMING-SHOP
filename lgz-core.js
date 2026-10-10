/*
 * LIFEISGAMETZ - msimbo wa pamoja kwa kurasa zote
 *
 * Faili hili linapakiwa na kila ukurasa (index.html, store.html, ...).
 * Lina: mawasiliano na server (api), akaunti, cart, wishlist,
 * malipo, admin, AI, sidebar na header.
 *
 * Kila ukurasa una msimbo wake mwenyewe ndani ya faili lake
 * (LGZ.page(...)). Hapa kuna vitu vinavyoshirikiwa tu.
 */

var K = 'lgz_cart_v2',
  db = {
    products: [],
    cart: [],
    wish: [],
    lib: [],
    orders: [],
    users: [],
    user: '',
    profile: null,
    libp: [],
    free: [],
    movies: [],
    market: [],
    tour: [],
    live: [],
    reqs: [],
    courses: [],
    an: null,
    cps: {},
    sq: [],
    asq: [],
    inq: [],
    tix: [],
    chat: [],
    bots: { ai: [], health: [] },
    delivered: [],
    adv: {},
    dev: { type: 'Simu', specs: '', ram: '', storage: '' }
  };
try {
  var s = localStorage.getItem(K);
  if (s) db = Object.assign(db, JSON.parse(s));
} catch (e) {}

// ============================================================
// AKAUNTI: me() na isAdm()
// ============================================================
function me() {
  return db.profile || null;
}

function isAdm() {
  var m = me();
  return !!(m && m.role === 'Super Admin');
}

var ed = '',
  mv = '',
  cs = '',
  cpn = null,
  cmT = 0,
  TOK = '';
try {
  TOK = localStorage.getItem('lgz_tok') || '';
} catch (e) {}

// ============================================================
// MAWASILIANO NA SERVER: api, boot, login, register
// ============================================================
function api(m, u, b) {
  var h = { 'Content-Type': 'application/json' };
  if (TOK) h.Authorization = TOK;
  return fetch(
    '/api' + u,
    {
      method: m,
      headers: h,
      body: b ? JSON.stringify(b) : undefined
    }
  ).then(function (r) {
    return r
      .json()
      .catch(function () { return {}; })
      .then(function (j) {
        if (!r.ok) {
          var e = new Error(
            j.error || j.message || 'Hitilafu'
          );
          e.code = r.status;
          throw e;
        }
        return j;
      });
  });
}

function out() {
  TOK = '';
  try {
    localStorage.removeItem('lgz_tok');
  } catch (e) {}
  db.profile = null;
  db.libp = [];
  db.delivered = [];
  db.orders = [];
}

function bad(e) {
  if (e.code === 401 && TOK) {
    out();
    route();
  }
  toast(e.message);
}

function ok(p, msg) {
  return p.then(function () {
    if (msg) toast(msg);
    return boot();
  }).catch(bad);
}

function mapU(u) {
  return {
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    role: u.isAdmin
      ? 'Super Admin'
      : (u.isStaff ? 'Staff' : 'Customer'),
    joined: u.created
      ? new Date(u.created).toLocaleDateString()
      : ''
  };
}

function mapO(o) {
  var st = o.status === 'successful'
    ? 'Completed'
    : (
      String(o.status || '').indexOf('pending') === 0
        ? 'Pending'
        : 'Failed'
    );
  return {
    id: o.tx_ref,
    ref: o.tx_ref,
    items: (o.items || []).map(function (i) {
      return i.name || 'Bidhaa';
    }),
    total: Number(o.amount) || 0,
    status: st,
    date: new Date(
      o.confirmedAt || o.date || Date.now()
    ).toLocaleDateString(),
    u: o.customer || ''
  };
}

function fromApi(p) {
  var L = Array.isArray(p.links) && p.links.length
    ? p.links
    : (
      p.downloadLink
        ? [{ l: 'Download', u: p.downloadLink }]
        : []
    );
  return {
    id: p.id,
    title: p.name,
    cat: p.category || 'Zote',
    platform: p.platform || p.type || '',
    price: Number(p.price) || 0,
    old: Number(p.oldPrice) || 0,
    free: !!p.free,
    status: p.status || 'Active',
    desc: p.desc || '',
    img: p.imageUrl || '',
    links: L,
    stock: Number(p.stock) || 0,
    uses: !!p.usesCodes,
    proofs: p.proofs || [],
    stats: p.stats || '',
    hasFile: !!p.hasFile,
    fileName: p.fileName || '',
    fileSize: Number(p.fileSize) || 0
  };
}

function libItems() {
  var m = {};
  db.free.forEach(function (i) {
    var p = P(i);
    if (p) m[i] = p;
  });
  db.libp.forEach(function (p) { m[p.id] = p; });
  return Object.keys(m).map(function (k) { return m[k]; });
}

function boot() {
  var a = TOK
    ? api('GET', '/auth/me')
      .then(function (r) { db.profile = mapU(r.user); })
      .catch(function () { out(); })
    : Promise.resolve();
  return a.then(function () {
    var ad = isAdm(),
      ps = [
        api('GET', '/products').then(function (r) {
          db.products = (r.products || []).map(fromApi);
        }),
        api('GET', '/movies')
          .then(function (r) {
            db.movies = r.movies || [];
          })
          .catch(function () {}),
        api('GET', '/marketplace')
          .then(function (r) {
            db.market = r.listings || [];
          })
          .catch(function () {}),
        api('GET', '/tournaments')
          .then(function (r) {
            db.tour = r.tournaments || [];
          })
          .catch(function () {}),
        api('GET', '/live-streams')
          .then(function (r) { db.live = r.streams || []; })
          .catch(function () {}),
        api('GET', '/requests')
          .then(function (r) {
            db.reqs = r.requests || [];
          })
          .catch(function () {}),
        api('GET', '/courses')
          .then(function (r) {
            db.courses = r.courses || [];
          })
          .catch(function () {})
      ];
    if (me()) {
      ps.push(
        api('GET', '/squads/mine')
          .then(function (r) { db.sq = r.squads || []; })
          .catch(function () {})
      );
      ps.push(
        api(
          'GET',
          ad ? '/admin/orders' : '/my-orders'
        ).then(function (r) {
          db.orders = (r.orders || []).map(mapO);
        })
      );
      ps.push(
        api('GET', '/my-library')
          .then(function (r) {
            db.libp = (r.products || []).map(fromApi);
            db.delivered = r.delivered || [];
          })
          .catch(function () {})
      );
    }
    if (ad) {
      ps.push(
        api('GET', '/admin/users')
          .then(function (r) { db.users = r.users || []; })
          .catch(function () {}),
        api('GET', '/admin/analytics')
          .then(function (r) { db.an = r; })
          .catch(function () {}),
        api('GET', '/admin/coupons')
          .then(function (r) { db.cps = r.coupons || {}; })
          .catch(function () {}),
        api('GET', '/admin/squads')
          .then(function (r) { db.asq = r.squads || []; })
          .catch(function () {}),
        api('GET', '/admin/inquiries')
          .then(function (r) {
            db.inq = r.inquiries || [];
          })
          .catch(function () {}),
        api('GET', '/admin/tickets')
          .then(function (r) { db.tix = r.tickets || []; })
          .catch(function () {})
      );
    }
    return Promise.all(ps);
  }).then(route).catch(bad);
}

function sess(r) {
  TOK = r.token;
  try {
    localStorage.setItem('lgz_tok', TOK);
  } catch (e) {}
  return boot().then(function () {
    flash('Karibu!');
    location.href = 'profile.html';
    route();
  });
}

function poll(ref, n) {
  if (n > 30) return;
  setTimeout(function () {
    api('GET', '/clickpesa-check/' + ref)
      .then(function (r) {
        if (r.status === 'pending') return poll(ref, n + 1);
        try {
          sessionStorage.removeItem('lgz_poll');
        } catch (e) {}
        toast(
          r.status === 'successful'
            ? 'Malipo yamethibitishwa!'
            : 'Malipo hayakukamilika'
        );
        boot();
      })
      .catch(function () {});
  }, 4000);
}

function reg(e) {
  e.preventDefault();
  var f = e.target;
  api(
    'POST',
    '/auth/register',
    {
      name: f.nm.value.trim(),
      email: f.em.value.trim(),
      phone: f.ph.value.trim(),
      password: f.pw.value
    }
  ).then(sess).catch(bad);
}

function login(e) {
  e.preventDefault();
  var f = e.target;
  api(
    'POST',
    '/auth/login',
    { email: f.em.value.trim(), password: f.pw.value }
  ).then(sess).catch(bad);
}

function logout() {
  api('POST', '/auth/logout').catch(function () {});
  out();
  location.href = 'index.html';
  route();
}

function upd(e) {
  e.preventDefault();
  var f = e.target;
  ok(
    api(
      'PUT',
      '/auth/profile',
      { name: f.nm.value.trim(), phone: f.ph.value.trim() }
    ),
    'Profile imehifadhiwa'
  );
}

// ============================================================
// HIFADHI YA BROWSER NA ZANA NDOGO: save, esc, toast
// ============================================================
function save() {
  try {
    localStorage.setItem(
      K,
      JSON.stringify(
        {
          cart: db.cart,
          wish: db.wish,
          free: db.free,
          dev: db.dev
        }
      )
    );
  } catch (e) {}
}

function esc(t) {
  return String(
    t == null ? '' : t
  ).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

function tsh(n) {
  return 'TSh ' + Number(n || 0).toLocaleString('en-US');
}

function toast(m) {
  var t = document.getElementById('toast');
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(t._t);
  t._t = setTimeout(function () {
    t.style.display = 'none';
  }, 2200);
}

function P(id) {
  return db.products.find(function (p) {
    return p.id === id;
  });
}

var CATS = [
  'Action',
  'Adventure',
  'Sports',
  'Racing',
  'RPG',
  'Shooter',
  'Strategy',
  'Simulation',
  'Gift Card',
  'Top Up',
  'eFootball Squad'
],
  PLATS = [
    'PC',
    'PS5',
    'PS4',
    'PS3',
    'PS2',
    'PSP',
    'Xbox',
    'Switch',
    'Android'
  ];
var PL = [
  ['PSP', 'PSP Gaming'],
  ['PS2', 'PS2 Gaming'],
  ['PS3', 'PS3 Gaming'],
  ['Switch', 'Nintendo Switch'],
  ['Android', 'Android Gaming'],
  ['PC', 'PC Gaming']
];

// ============================================================
// KADI ZA BIDHAA, CART NA WISHLIST
// ============================================================
function img(p) {
  return p.img
    ? '<img src="'
      + esc(p.img)
      + '" alt="'
      + esc(p.title)
      + '">'
    : '<div class="ph"></div>';
}

function card(p) {
  var dis = p.old > p.price
    ? '<span class="old">' + tsh(p.old) + '</span>'
    : '';
  return '<div class="card">'
    + '<a href="product-details.html?p='
    + p.id
    + '">'
    + img(p)
    + '</a><div class="b">'
    + '<a href="product-details.html?p='
    + p.id
    + '"><b>'
    + esc(p.title)
    + '</b></a><div>'
    + (
      p.platform
        ? '<span class="tag">' + esc(p.platform) + '</span>'
        : ''
    )
    + '<span class="tag">'
    + esc(p.cat)
    + '</span></div><div class="price">'
    + ptx(p)
    + dis
    + '</div><div class="row">'
    + '<button class="btn" style="flex:1"'
    + (p.uses && p.stock < 1 ? ' disabled' : '')
    + ' onclick="'
    + act(p)
    + '">'
    + (
      p.uses && p.stock < 1
        ? 'Sold out'
        : (p.free ? 'Get Free' : 'Add to Cart')
    )
    + '</button><button class="btn o" '
    + 'aria-label="Wishlist" onclick="wish(\''
    + p.id
    + '\')">'
    + (db.wish.indexOf(p.id) > -1 ? '♥' : '♡')
    + '</button></div></div></div>';
}

function emptyAdmin(t) {
  return '<div class="empty">'
    + t
    + '<br><br><a class="btn" '
    + 'href="games-management.html">'
    + 'Ongeza game kwenye Admin Dashboard</a>'
    + '</div>';
}

function add(id) {
  if (db.cart.indexOf(id) < 0) db.cart.push(id);
  save();
  nav(LGZ.cfg.file);
  toast('Imeongezwa kwenye Cart');
}

function wish(id) {
  var i = db.wish.indexOf(id);
  i < 0 ? db.wish.push(id) : db.wish.splice(i, 1);
  save();
  route();
}

function rm(id) {
  db.cart = db.cart.filter(function (x) {
    return x !== id;
  });
  save();
  route();
}

// ============================================================
// MALIPO NA ODA: checkout, confirm, reject
// ============================================================
function checkout(f) {
  var it = db.cart
    .map(P)
    .filter(function (p) { return p && !p.free; })
    .map(function (p) {
      return {
        id: p.id,
        name: p.title,
        price: p.price,
        quantity: 1
      };
    });
  if (!it.length) {
    toast('Cart ni tupu');
    return;
  }
  var tot = it.reduce(function (a, x) {
    return a + x.price;
  }, 0),
    man = /Manual/.test(f.pay.value),
    ph = f.ph.value.trim();
  if (man) {
    if (!f.tx.value.trim()) {
      toast('Weka namba ya muamala');
      return;
    }
    ok(
      api(
        'POST',
        '/manual-pay',
        {
          items: it,
          total: tot,
          txRef: f.tx.value.trim(),
          phone: ph,
          coupon: cpn ? cpn.code : ''
        }
      ).then(function () {
        db.cart = [];
        cpn = null;
        save();
        location.href = 'profile.html';
      }),
      'Ripoti imepokelewa — admin atathibitisha'
    );
    return;
  }
  api(
    'POST',
    '/clickpesa-pay',
    {
      items: it,
      total: tot,
      phone: ph,
      name: me().name,
      coupon: cpn ? cpn.code : ''
    }
  )
    .then(function (r) {
      db.cart = [];
      cpn = null;
      save();
      toast('Angalia simu yako na uthibitishe malipo');
      try {
        sessionStorage.setItem('lgz_poll', r.tx_ref);
      } catch (e) {}
      location.href = 'profile.html';
    })
    .catch(bad);
}

function conf(id) {
  ok(
    api('POST', '/admin/orders/confirm', { tx_ref: id }),
    'Oda imethibitishwa'
  );
}

function rej(id) {
  if (!confirm('Kataa na ufute oda hii?')) return;
  ok(
    api('POST', '/admin/orders/reject', { tx_ref: id }),
    'Oda imeondolewa'
  );
}

// ============================================================
// ADMIN: KUFUTA, KUBADILISHA NA KUHIFADHI GAMES
// ============================================================
function delP(id) {
  if (!confirm('Futa bidhaa hii?')) return;
  ok(api('DELETE', '/products/' + id), 'Imefutwa');
}

function tog(id) {
  var p = P(id);
  ok(
    api(
      'PUT',
      '/products/' + id,
      { status: p.status === 'Active' ? 'Draft' : 'Active' }
    )
  );
}

function shrink(file, cb) {
  var r = new FileReader();
  r.onload = function () {
    var i = new Image();
    i.onload = function () {
      var w = 420,
        h = Math.round(i.height * w / i.width),
        c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(i, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', .78));
    };
    i.src = r.result;
  };
  r.readAsDataURL(file);
}

function ptx(p) {
  return p.free ? 'FREE' : tsh(p.price);
}

function act(p) {
  return (p.free ? 'getFree' : 'add') + "('" + p.id + "')";
}

function getFree(id) {
  if (db.free.indexOf(id) < 0) db.free.push(id);
  save();
  toast('Imeongezwa kwenye Library');
  route();
}

// ============================================================
// LINKS NYINGI KWA GAME MOJA
// ============================================================
function lkRow() {
  return '<div class="row lk"><input name="lkl" '
    + 'placeholder="Jina la link (mf. Download)">'
    + '<input name="lku" type="url" '
    + 'placeholder="https://..." '
    + 'style="flex:2 1 200px"><button '
    + 'class="btn d" type="button" '
    + 'aria-label="Ondoa link" '
    + 'onclick="this.parentNode.remove()">✕'
    + '</button></div>';
}

function addLink() {
  document.getElementById('lks').insertAdjacentHTML(
    'beforeend',
    lkRow()
  );
}

function lks(fd) {
  var L = fd.getAll('lkl'),
    U = fd.getAll('lku'),
    o = [];
  U.forEach(function (u, i) {
    u = u.trim();
    if (/^https?:\/\//i.test(u))
      o.push(
        {
          l: (L[i] || '').trim()
            || 'Link ' + (o.length + 1),
          u: u
        }
      );
  });
  return o;
}

function linksHtml(p, h) {
  var k = p.links || [],
    d = dlHtml(p);
  if (!k.length && !d) return '';
  return (h ? '<h2>Links</h2>' : '')
    + '<div class="row" style="flex-wrap:wrap">'
    + d
    + k.map(function (x) {
      return '<a class="btn o" target="_blank" '
        + 'rel="noopener noreferrer" href="'
        + esc(x.u)
        + '">'
        + esc(x.l)
        + ' ↗</a>';
    }).join('')
    + '</div>';
}

function saveGame(e) {
  e.preventDefault();
  var f = e.target,
    fd = new FormData(f),
    fr = fd.get('type') === 'Free';
  if (!fr && !(+fd.get('price') > 0)) {
    toast('Weka bei, au chagua Free');
    return;
  }
  var L = lks(fd),
    im = (fd.get('img') || '').trim();
  if (im && !/^https?:\/\//i.test(im)) {
    toast('Image URL ianze na https://');
    return;
  }
  var fl = f.elements.gfile && f.elements.gfile.files[0],
    btn = f.querySelector('button[type=submit]'),
    id = ed,
    rm = !!fd.get('rmfile');
  function go(fo) {
    var B = {
      name: fd.get('title').trim(),
      type: fd.get('platform'),
      platform: fd.get('platform'),
      category: fd.get('cat'),
      price: fr ? 0 : +fd.get('price'),
      oldPrice: fr ? 0 : (+fd.get('old') || 0),
      free: fr,
      status: fd.get('status'),
      desc: fd.get('desc'),
      imageUrl: im,
      downloadLink: L[0] ? L[0].u : '',
      links: L,
      codes: (fd.get('codes') || '').split(
        '\n'
      ).map(function (x) { return x.trim(); }).filter(
        Boolean
      ),
      section: 'shop',
      emoji: '🎮'
    };
    if (fo) B.file = fo;
    if (rm && !fo) B.removeFile = true;
    ed = '';
    ok(
      id
        ? api('PUT', '/products/' + id, B)
        : api('POST', '/products', B),
      id ? 'Game imesasishwa' : 'Game imeongezwa'
    );
  }
  if (fl) {
    btn.disabled = true;
    toast(
      'Inapakia ' + fmtSz(fl.size) + '… usifunge ukurasa'
    );
    upGame(fl)
      .then(go)
      .catch(function (er) {
        btn.disabled = false;
        bad(er);
      });
  } else go(null);
}

function fillForm() {
  var p = P(ed);
  if (!p) return;
  var E = document.querySelector('#main form').elements;
  E.title.value = p.title;
  E.cat.value = p.cat;
  E.platform.value = p.platform;
  E.type.value = p.free ? 'Free' : 'Paid';
  E.price.value = p.price || '';
  E.old.value = p.old || '';
  E.status.value = p.status;
  E.img.value = p.img;
  E.desc.value = p.desc;
  var box = document.getElementById('lks');
  box.innerHTML = '';
  (
    p.links.length ? p.links : [{ l: '', u: '' }]
  ).forEach(function (k) {
    addLink();
    var q = box.lastElementChild;
    q.querySelector('[name=lkl]').value = k.l;
    q.querySelector('[name=lku]').value = k.u;
  });
}

// ============================================================
// ACADEMY NA ADMIN: kozi, video, staff
// ============================================================
function upl(u, fd) {
  var h = {};
  if (TOK) h.Authorization = TOK;
  return fetch(
    '/api' + u,
    { method: 'POST', headers: h, body: fd }
  ).then(function (r) {
    return r
      .json()
      .catch(function () { return {}; })
      .then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Hitilafu');
          e.code = r.status;
          throw e;
        }
        return j;
      });
  });
}

function addCourse(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/courses',
      {
        name: f.n.value.trim(),
        level: f.l.value,
        thumbnail: f.t.value.trim(),
        description: f.d.value.trim()
      }
    ),
    'Kozi imeongezwa'
  );
}

function upVid(e, id) {
  e.preventDefault();
  var f = e.target.elements,
    fd = new FormData();
  fd.append('title', f.t.value.trim());
  fd.append('video', f.f.files[0]);
  toast('Inapakia video… subiri');
  ok(
    upl('/admin/courses/' + id + '/videos/upload', fd),
    'Video imepakiwa'
  );
}

function delVid(c, v) {
  if (!confirm('Futa video hii?')) return;
  ok(
    api('DELETE', '/admin/courses/' + c + '/videos/' + v),
    'Imefutwa'
  );
}

function staff(i, on) {
  var u = db.users[i];
  if (u)
    ok(
      api(
        'POST',
        '/admin/users/staff',
        { email: u.email, makeStaff: on }
      ),
      on ? 'Sasa ni Staff' : 'Staff ameondolewa'
    );
}

// ============================================================
// COUPONS (kodi za punguzo)
// ============================================================
function baseTot() {
  return db.cart
    .map(P)
    .filter(function (p) { return p && !p.free; })
    .reduce(function (a, p) { return a + p.price; }, 0);
}

function applyCp() {
  var c = document.getElementById('cpi').value.trim();
  if (!c) return;
  api('POST', '/coupons/preview', { code: c })
    .then(function (r) {
      cpn = { code: r.code, pct: r.percentOff };
      document.getElementById(
        'ctot'
      ).textContent = 'Jumla: '
        + tsh(
          Math.max(
            1,
            Math.round(baseTot() * (100 - cpn.pct) / 100)
          )
        )
        + ' (−'
        + cpn.pct
        + '%)';
      toast('Punguzo la ' + r.percentOff + '% limewekwa');
    })
    .catch(bad);
}

function clrCp() {
  cpn = null;
  document.getElementById('cpi').value = '';
  document.getElementById('ctot').textContent = 'Jumla: '
    + tsh(baseTot());
}

function addCp(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/coupons',
      {
        code: f.c.value.trim(),
        percentOff: f.p.value,
        maxUses: f.m.value
      }
    ),
    'Kodi imeongezwa'
  );
}

function delCp(i) {
  var k = Object.keys(db.cps)[i];
  if (!k || !confirm('Futa kodi ' + k + '?')) return;
  ok(
    api(
      'DELETE',
      '/admin/coupons/' + encodeURIComponent(k)
    ),
    'Imefutwa'
  );
}

// ============================================================
// COMMUNITY CHAT (na AI kwa @ai)
// ============================================================
function chatHtml() {
  return db.chat.length
    ? db.chat.map(function (m) {
      return '<div '
        + 'style="background:#0a1136;border:1px solid '
        + (m.isAi ? 'var(--p)' : 'var(--line)')
        + ';border-radius:10px;padding:8px 10px">'
        + '<b>'
        + esc(m.name)
        + '</b> <small style="color:var(--m)">'
        + new Date(m.time).toLocaleTimeString(
          [],
          { hour: '2-digit', minute: '2-digit' }
        )
        + '</small>'
        + (
          isAdm()
            ? ' <a href="#" onclick="delChat(\''
              + m.id
              + '\');return false" '
              + 'style="color:#ff8d9b">futa</a>'
            : ''
        )
        + '<div>'
        + esc(m.message).replace(/\n/g, '<br>')
        + '</div></div>';
    }).join('')
    : '<div class="empty">'
      + 'Hakuna ujumbe bado. Anza mazungumzo!'
      + '</div>';
}

function loadChat() {
  api('GET', '/public-chat/messages')
    .then(function (r) {
      db.chat = r.messages || [];
      var c = document.getElementById('cm');
      if (c) {
        var b = !c._i
          || c.scrollTop + c.clientHeight >=
            c.scrollHeight - 30;
        c._i = 1;
        c.innerHTML = chatHtml();
        if (b) c.scrollTop = c.scrollHeight;
      }
    })
    .catch(function () {});
}

function sendChat(e) {
  e.preventDefault();
  var f = e.target.elements,
    nm = f.n ? f.n.value.trim() : me().name,
    t = f.m.value.trim();
  if (/^@ai\b/i.test(t)) toast('AI inafikiri…');
  api(
    'POST',
    '/public-chat/messages',
    { name: nm, message: t }
  )
    .then(function () {
      f.m.value = '';
      loadChat();
    })
    .catch(bad);
}

function askChatAI(fm) {
  var i = fm.elements.m;
  if (!i.value.trim()) {
    i.focus();
    return;
  }
  if (!/^@ai\b/i.test(i.value.trim()))
    i.value = '@ai ' + i.value.trim();
  fm.requestSubmit();
}

// ============================================================
// GAME ADVISOR: AI kwa kila category na kila game
// ============================================================
function saveDev() {
  var f = document.getElementById('dvf');
  if (!f) return;
  var E = f.elements;
  db.dev = {
    type: E.type.value,
    specs: E.specs.value.trim(),
    ram: E.ram.value.trim(),
    storage: E.storage.value.trim()
  };
  save();
}

function autoDev() {
  var ua = navigator.userAgent,
    m = ua.match(/Android[^;]*;\s*([^;)]+)/),
    E = document.getElementById('dvf').elements;
  if (/Android|iPhone|iPad/.test(ua)) {
    E.type.value = 'Simu';
    if (m) E.specs.value = m[1].trim();
  } else E.type.value = 'PC/Laptop';
  if (navigator.deviceMemory)
    E.ram.value = '~'
      + navigator.deviceMemory
      + 'GB (makadirio ya browser)';
  if (navigator.hardwareConcurrency && !E.specs.value)
    E.specs.value = navigator.hardwareConcurrency
      + ' CPU cores';
  saveDev();
  toast(
    'Nimejaza kadiri ya browser — ongeza '
      + 'chipset/GPU kwa jibu sahihi zaidi'
  );
}

function advBubbles(k) {
  return botHtml(k);
}

function upAdv(k) {
  var b = document.getElementById('ax');
  if (b) {
    b.innerHTML = advBubbles(k);
    b.scrollTop = b.scrollHeight;
  }
}

function advisorHtml(key, plat, game) {
  var d = db.dev;
  db.adv[key] = db.adv[key] || [];
  return '<div class="panel">'
    + '<h2 style="margin-top:0">'
    + '🤖 Game Advisor — '
    + esc(game || plat)
    + '</h2><p class="sub">Jaza kifaa chako '
    + 'kisha uliza: litacheza? settings gani '
    + 'za kutumia? Ni ushauri wa AI, si '
    + 'uhakika wa 100% — angalia pia mahitaji '
    + 'rasmi ya game.</p><form id="dvf" '
    + 'onsubmit="event.preventDefault()" '
    + 'style="margin-bottom:12px"><label>Kifaa'
    + '<select name="type" '
    + 'onchange="saveDev()">'
    + ['Simu', 'PC/Laptop'].map(function (o) {
      return '<option'
        + (d.type === o ? ' selected' : '')
        + '>'
        + o
        + '</option>';
    }).join('')
    + '</select></label><label>'
    + 'Specs (chipset au CPU/GPU)'
    + '<input name="specs" value="'
    + esc(d.specs)
    + '" placeholder="mf. Snapdragon 680 au '
    + 'i5-9400F + GTX 1650" '
    + 'onchange="saveDev()"></label><label>RAM'
    + '<input name="ram" value="'
    + esc(d.ram)
    + '" placeholder="mf. 6GB" '
    + 'onchange="saveDev()"></label><label>'
    + 'Nafasi iliyobaki'
    + '<input name="storage" value="'
    + esc(d.storage)
    + '" placeholder="mf. 20GB" '
    + 'onchange="saveDev()"></label>'
    + '<div class="full"><button class="btn o" '
    + 'type="button" onclick="autoDev()">'
    + '🔍 Gundua kifaa kiotomatiki</button>'
    + '</div></form><div id="ax" '
    + 'style="max-height:50vh;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px">'
    + advBubbles(key)
    + '</div><form class="row" '
    + 'style="flex-wrap:wrap" '
    + 'onsubmit="advSend(event,\''
    + key
    + '\')"><input name="m" '
    + 'style="flex:1;min-width:160px" required '
    + 'autocomplete="off" placeholder="mf. Je, '
    + esc(game || 'game hili')
    + ' litacheza kwenye kifaa changu?">'
    + '<button class="btn" type="submit">Uliza'
    + '</button></form></div>';
}

function advSend(e, key) {
  e.preventDefault();
  var i = e.target.elements.m,
    t = i.value.trim();
  if (!t) return;
  saveDev();
  var p = key.indexOf('g:') === 0 ? P(key.slice(2)) : null,
    plat = p ? (p.platform || 'Gaming') : key.slice(2),
    H = db.adv[key] = db.adv[key] || [];
  H.push({ role: 'user', text: t });
  i.value = '';
  H.push({ role: 'bot', text: '…', tmp: 1 });
  upAdv(key);
  api(
    'POST',
    '/ai/game-advisor',
    {
      message: t,
      platform: plat,
      game: p ? p.title : '',
      device: db.dev,
      history: H.filter(function (x) {
        return !x.tmp;
      }).slice(-7, -1)
    }
  )
    .then(function (r) {
      H.pop();
      H.push({ role: 'bot', text: r.reply || '—' });
      upAdv(key);
    })
    .catch(function (er) {
      H.pop();
      H.push(
        { role: 'bot', text: 'Hitilafu: ' + er.message }
      );
      upAdv(key);
    });
}

function delChat(id) {
  api('DELETE', '/admin/public-chat/' + id).then(
    loadChat
  ).catch(bad);
}

// ============================================================
// AI ASSISTANT NA HEALTH ASSISTANT
// ============================================================
function botHtml(k) {
  var H = db.bots[k] || db.adv[k] || [];
  return H.length
    ? H.map(function (x) {
      var u = x.role === 'user';
      return '<div style="align-self:'
        + (u ? 'flex-end' : 'flex-start')
        + ';max-width:85%;padding:8px '
        + '12px;border-radius:12px;background:'
        + (
          u
            ? 'linear-gradient(90deg,var(--p),var(--p2))'
            : '#0a1136;border:1px solid var(--line)'
        )
        + '">'
        + esc(x.text).replace(/\n/g, '<br>')
        + '</div>';
    }).join('')
    : '<div class="empty">'
      + 'Anza kwa kuuliza swali.</div>';
}

function upBot(k) {
  var b = document.getElementById('bx');
  if (b) {
    b.innerHTML = botHtml(k);
    b.scrollTop = b.scrollHeight;
  }
}

function botSend(e, k) {
  e.preventDefault();
  var i = e.target.elements.m,
    t = i.value.trim();
  if (!t) return;
  var H = db.bots[k];
  H.push({ role: 'user', text: t });
  i.value = '';
  H.push({ role: 'bot', text: '…', tmp: 1 });
  upBot(k);
  api(
    'POST',
    k === 'health' ? '/ai/health' : '/ai/chat',
    {
      message: t,
      history: H.filter(function (x) {
        return !x.tmp;
      }).slice(-7, -1)
    }
  )
    .then(function (r) {
      H.pop();
      H.push({ role: 'bot', text: r.reply || '—' });
      upBot(k);
    })
    .catch(function (er) {
      H.pop();
      H.push(
        { role: 'bot', text: 'Hitilafu: ' + er.message }
      );
      upBot(k);
    });
}

// ============================================================
// LIBRARY: CODES NA DOWNLOAD YA FAILI
// ============================================================
function codesHtml(p) {
  var o = '';
  db.delivered.forEach(function (d, i) {
    if (d.id !== p.id) return;
    o += d.code
      ? '<div class="row" style="gap:6px"><code '
        + 'style="flex:1;word-break:break-all;white-space:pre-wrap;background:#0a1136;border:1px solid var(--line);border-radius:6px;padding:4px 6px">'
        + esc(d.code)
        + '</code>'
        + '<button class="btn o" onclick="cpy('
        + i
        + ')">Copy</button></div>'
      : '<span class="sub">'
        + 'Code inasubiriwa — wasiliana na admin'
        + '</span>';
  });
  if (o && p.cat === 'eFootball Squad')
    o += '<div class="sub" style="margin:6px 0 0">'
      + 'Hatua za kwanza: ingia mara moja, '
      + 'badilisha password, weka recovery '
      + 'email/simu yako, toa devices zingine, '
      + 'kisha unganisha Konami ID/Google yako. '
      + 'Unaweza kuendelea kutumia Gmail hii au '
      + 'kuweka yako mwenyewe.</div>';
  return o;
}

function cpy(i) {
  var d = db.delivered[i];
  if (d && d.code && navigator.clipboard)
    navigator.clipboard
      .writeText(d.code)
      .then(function () { toast('Imenakiliwa'); })
      .catch(function () {});
}

function fmtSz(n) {
  n = Number(n) || 0;
  return n >= 1073741824
    ? (n / 1073741824).toFixed(2) + ' GB'
    : n >= 1048576
      ? (n / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function loadSb() {
  return window.supabase
    ? Promise.resolve()
    : new Promise(function (res, rej) {
      var t = document.createElement('script');
      t.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      t.onload = res;
      t.onerror = function () {
        rej(
          new Error('Imeshindwa kupakia maktaba ya upload')
        );
      };
      document.head.appendChild(t);
    });
}

function upGame(file) {
  var cfg;
  return api('GET', '/auth/social/config')
    .then(function (c) {
      if (!c.url || !c.anonKey)
        throw new Error(
          'Upload haijawekwa: weka SUPABASE_URL na '
            + 'SUPABASE_ANON_KEY kwenye Render'
        );
      cfg = c;
      return api(
        'POST',
        '/admin/game-files/sign',
        { filename: file.name, size: file.size }
      );
    })
    .then(function (sg) {
      return loadSb()
        .then(function () {
          var c = window.supabase.createClient(
            cfg.url,
            cfg.anonKey
          );
          return c.storage.from(
            sg.bucket
          ).uploadToSignedUrl(sg.path, sg.token, file);
        })
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          return {
            path: sg.path,
            name: file.name,
            size: file.size
          };
        });
    });
}

function dlHtml(p) {
  if (!p.hasFile) return '';
  if (!me())
    return p.free
      ? '<a class="btn" href="login.html">'
        + 'Ingia ili kudownload</a>'
      : '';
  if (p.free
    || isAdm()
    || db.libp.some(function (x) { return x.id === p.id; }))
    return '<button class="btn" onclick="dl(\''
      + p.id
      + '\')">⬇ Download ('
      + fmtSz(p.fileSize)
      + ')</button>';
  return '';
}

function dl(id) {
  api('GET', '/download/' + id)
    .then(function (r) { location.href = r.url; })
    .catch(bad);
}

function proofsHtml(p) {
  var o = '';
  if (p.proofs && p.proofs.length)
    o += '<h2>Ushahidi (screenshots)</h2>'
      + '<div class="row" style="flex-wrap:wrap">'
      + p.proofs.map(function (u) {
        return '<a href="'
          + esc(u)
          + '" target="_blank" rel="noopener '
          + 'noreferrer"><img src="'
          + esc(u)
          + '" alt="" '
          + 'style="height:130px;border-radius:10px">'
          + '</a>';
      }).join('')
      + '</div>';
  if (p.stats)
    o += '<p class="sub">' + esc(p.stats) + '</p>';
  return o;
}

function aiPanel(key, title, hint, opts) {
  db.adv[key] = db.adv[key] || [];
  return '<div class="panel">'
    + '<h2 style="margin-top:0">'
    + title
    + '</h2><p class="sub">'
    + hint
    + '</p><div id="ax" '
    + 'style="max-height:50vh;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px">'
    + botHtml(key)
    + '</div><form class="row" '
    + 'style="flex-wrap:wrap" '
    + 'onsubmit="aiSend(event,\''
    + key
    + '\')">'
    + (opts || '')
    + '<input name="m" '
    + 'style="flex:1;min-width:160px" required '
    + 'autocomplete="off" '
    + 'placeholder="Andika swali lako...">'
    + '<button class="btn" type="submit">Tuma'
    + '</button></form></div>';
}

function aiSend(e, key) {
  e.preventDefault();
  var el = e.target.elements,
    i = el.m,
    t = i.value.trim();
  if (!t) return;
  var H = db.adv[key] = db.adv[key] || [],
    ep = '/ai/squad',
    x = {};
  if (key.indexOf('tu:') === 0) {
    ep = '/ai/course-tutor';
    x.courseId = key.slice(3);
  } else if (key === 'pt') {
    ep = '/ai/partner';
    x.mode = el.md ? el.md.value : 'find';
  }
  H.push({ role: 'user', text: t });
  i.value = '';
  H.push({ role: 'bot', text: '…', tmp: 1 });
  upAdv(key);
  x.message = t;
  x.history = H.filter(function (y) {
    return !y.tmp;
  }).slice(-7, -1);
  api('POST', ep, x)
    .then(function (r) {
      H.pop();
      H.push({ role: 'bot', text: r.reply || '—' });
      upAdv(key);
    })
    .catch(function (er) {
      H.pop();
      H.push(
        { role: 'bot', text: 'Hitilafu: ' + er.message }
      );
      upAdv(key);
    });
}

function tutorPanel(sel) {
  return aiPanel(
    'tu:' + (sel ? sel.id : ''),
    '🎓 AI Mwalimu — '
      + (sel ? esc(sel.name) : 'chagua kozi yoyote'),
    'Uliza chochote kuhusu kozi; AI '
      + 'inakufundisha hatua kwa hatua, '
      + 'inakuuliza maswali ya mazoezi na kukupa '
      + 'kazi ndogo.',
    '<select '
      + 'onchange="cs=this.value;route()" '
      + 'style="max-width:220px">'
      + '<option value="">Mada yoyote / kozi zote'
      + '</option>'
      + db.courses.map(function (c) {
        return '<option value="'
          + esc(c.id)
          + '"'
          + (sel && sel.id === c.id ? ' selected' : '')
          + '>'
          + esc(c.name)
          + '</option>';
      }).join('')
      + '</select>'
  );
}

// ============================================================
// SQUAD MARKET (eFootball) NA BIASHARA
// ============================================================
function subSq(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/squads/submit',
      {
        title: f.t.value.trim(),
        price: f.p.value,
        desc: f.d.value.trim(),
        stats: f.s.value.trim(),
        proofs: f.pr.value.split('\n').map(function (x) {
          return x.trim();
        }).filter(Boolean),
        email: f.e.value.trim(),
        password: f.w.value
      }
    ),
    'Imewasilishwa — inakaguliwa na admin'
  );
}

function admCreate(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/squads/create',
      {
        title: f.t.value.trim(),
        price: f.p.value,
        desc: f.d.value.trim(),
        stats: f.s.value.trim(),
        proofs: f.pr.value.split('\n').map(function (x) {
          return x.trim();
        }).filter(Boolean),
        email: f.e.value.trim(),
        password: f.w.value
      }
    ),
    'Kikosi kimewekwa live'
  );
}

function revealSq(id) {
  api('GET', '/admin/squads/' + id + '/reveal')
    .then(function (r) {
      document.getElementById(
        'rv_' + id
      ).textContent = 'Gmail: '
        + r.email
        + '\nPassword: '
        + r.password;
    })
    .catch(bad);
}

function aiRev(id) {
  var b = document.getElementById('ar_' + id);
  b.textContent = 'AI inakagua…';
  api('POST', '/admin/squads/' + id + '/ai-review')
    .then(function (r) { b.textContent = r.reply || '—'; })
    .catch(function (er) {
      b.textContent = '';
      bad(er);
    });
}

function secSq(e, id) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/squads/' + id + '/secure',
      {
        email: f.e.value.trim(),
        password: f.w.value,
        checklist: {
          a: f.c1.checked,
          b: f.c2.checked,
          c: f.c3.checked,
          d: f.c4.checked
        }
      }
    ),
    'Kikosi kimelindwa na kimewekwa live'
  );
}

function rejSq(id) {
  var n = prompt(
    'Sababu ya kukataa (itamwonekana muuzaji):'
  );
  if (n === null) return;
  ok(
    api(
      'POST',
      '/admin/squads/' + id + '/reject',
      { note: n }
    ),
    'Imekataliwa'
  );
}

function genPw(b) {
  var a = new Uint32Array(20),
    c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  crypto.getRandomValues(a);
  b.parentNode.querySelector('input').value = Array.from(
    a
  ).map(function (x) { return c[x % c.length]; }).join('');
}

function sqRev(s) {
  return '<div class="panel"><div><b>'
    + esc(s.title)
    + '</b> <span class="tag">'
    + tsh(s.price)
    + '</span>'
    + '<div class="sub" style="margin:0">'
    + esc(s.sellerName)
    + ' · '
    + esc(s.sellerEmail)
    + ' · '
    + esc(s.sellerPhone || '')
    + '</div></div><p class="sub">'
    + esc(s.desc)
    + ' '
    + esc(s.stats)
    + '</p>'
    + '<div class="row" style="flex-wrap:wrap">'
    + (s.proofs || []).map(function (u) {
      return '<a href="'
        + esc(u)
        + '" target="_blank" rel="noopener '
        + 'noreferrer" class="tag">picha ↗</a>';
    }).join('')
    + '</div><div class="row" '
    + 'style="margin:8px 0;flex-wrap:wrap">'
    + '<button class="btn o" '
    + 'onclick="revealSq(\''
    + s.id
    + '\')">🔑 Onyesha credentials za muuzaji'
    + '</button>'
    + '<button class="btn o" onclick="aiRev(\''
    + s.id
    + '\')">🤖 AI Review</button></div>'
    + '<pre id="rv_'
    + s.id
    + '" class="sub" '
    + 'style="white-space:pre-wrap;margin:0">'
    + '</pre><div id="ar_'
    + s.id
    + '" class="sub" '
    + 'style="white-space:pre-wrap"></div>'
    + '<form onsubmit="secSq(event,\''
    + s.id
    + '\')" style="margin-top:10px"><label>'
    + 'Gmail ya mwisho'
    + '<input name="e" type="email" required>'
    + '</label><label>'
    + 'Password mpya (ya duka pekee)'
    + '<div class="row"><input name="w" '
    + 'style="flex:1" required minlength="8">'
    + '<button class="btn o" type="button" '
    + 'onclick="genPw(this)">Generate</button>'
    + '</div></label><div class="full">'
    + [
      'Nimeingia na kuthibitisha kikosi '
        + 'kinafanana na ushahidi',
      'Nimebadilisha password ya akaunti kuwa mpya',
      'Nimeondoa recovery email/simu za '
        + 'muuzaji na 2FA yake',
      'Nimetoa devices/sessions zote za zamani'
    ].map(function (t, i) {
      return '<label '
        + 'style="flex-direction:row;align-items:center;gap:8px;color:var(--t)">'
        + '<input type="checkbox" name="c'
        + (i + 1)
        + '" required>'
        + t
        + '</label>';
    }).join('')
    + '</div><div class="full row">'
    + '<button class="btn" type="submit">'
    + 'Secure &amp; Publish</button><button '
    + 'class="btn d" type="button" '
    + 'onclick="rejSq(\''
    + s.id
    + '\')">Reject</button></div></form></div>';
}

function sendInq(e) {
  e.preventDefault();
  var f = e.target.elements;
  api(
    'POST',
    '/business-inquiry',
    {
      company: f.n.value.trim(),
      contact: f.c.value.trim(),
      phone: f.p.value.trim(),
      email: f.e.value.trim(),
      website: f.w.value.trim(),
      budget: f.b.value.trim(),
      message: f.m.value.trim()
    }
  )
    .then(function (r) {
      toast(r.message || 'Ombi limepokelewa');
      e.target.reset();
    })
    .catch(bad);
}

function delInq(i) {
  var x = db.inq[i];
  if (x && confirm('Futa ombi hili?'))
    ok(
      api('DELETE', '/admin/inquiries/' + x.id),
      'Imefutwa'
    );
}

function say(p) {
  return p.then(function (r) {
    toast((r && r.message) || 'Sawa');
    return boot();
  }).catch(bad);
}

// ============================================================
// TOURNAMENTS, LIVE SCORES, GAME REQUESTS, MOVIES, MARKETPLACE
// ============================================================
function regT(e) {
  e.preventDefault();
  var f = e.target.elements;
  say(
    api(
      'POST',
      '/tournaments/register',
      {
        tournamentId: f.t.value,
        name: f.n.value.trim(),
        phone: f.p.value.trim()
      }
    )
  );
}

function addLive(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/live-streams',
      {
        title: f.t.value.trim(),
        league: f.l.value.trim(),
        homeTeam: f.h.value.trim(),
        awayTeam: f.a.value.trim(),
        status: f.s.value,
        startTime: f.st.value.trim(),
        streamUrl: f.u.value.trim()
      }
    ),
    'Mechi imeongezwa'
  );
}

function setScore(e, id) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/live-streams/' + id + '/score',
      {
        homeScore: f.h.value,
        awayScore: f.a.value,
        minute: f.m.value,
        status: f.s.value
      }
    ),
    'Imesasishwa'
  );
}

function delLive(id) {
  if (!confirm('Futa mechi hii?')) return;
  ok(
    api('DELETE', '/admin/live-streams/' + id),
    'Imefutwa'
  );
}

function addReq(e) {
  e.preventDefault();
  say(
    api(
      'POST',
      '/requests',
      { gameName: e.target.elements.g.value.trim() }
    )
  );
}

function voteReq(id) {
  say(api('POST', '/requests/' + id + '/vote'));
}

function delReq(id) {
  if (!confirm('Futa ombi hili?')) return;
  ok(api('DELETE', '/requests/' + id), 'Imefutwa');
}

function player(m) {
  var u = m.videoUrl || '';
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)
    ? '<video controls playsinline '
      + 'style="width:100%;border-radius:12px;background:#000" '
      + 'src="'
      + esc(u)
      + '"></video>'
    : '<a class="btn" target="_blank" '
      + 'rel="noopener noreferrer" href="'
      + esc(u)
      + '">Fungua video ↗</a>';
}

function movCard(m) {
  return '<div class="card">'
    + (
      m.poster
        ? '<img src="'
          + esc(m.poster)
          + '" alt="'
          + esc(m.title)
          + '">'
        : '<div class="ph"></div>'
    )
    + '<div class="b"><b>'
    + esc(m.title)
    + '</b><span class="tag">'
    + esc(m.genre)
    + ' · '
    + esc(m.year)
    + '</span>'
    + '<button class="btn" onclick="mv=\''
    + m.id
    + '\';route();scrollTo(0,0)">Watch</button>'
    + (
      isAdm()
        ? '<button class="btn d" onclick="delMov(\''
          + m.id
          + '\')">Futa</button>'
        : ''
    )
    + '</div></div>';
}

function addMovie(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/admin/movies/upload',
      {
        title: f.t.value.trim(),
        genre: f.g.value.trim(),
        year: f.y.value.trim(),
        poster: f.p.value.trim(),
        videoUrl: f.v.value.trim(),
        description: f.d.value.trim()
      }
    ),
    'Movie imeongezwa'
  );
}

function delMov(id) {
  if (!confirm('Futa movie hii?')) return;
  ok(api('DELETE', '/admin/movies/' + id), 'Imefutwa');
}

function addM(e) {
  e.preventDefault();
  var f = e.target.elements;
  ok(
    api(
      'POST',
      '/marketplace',
      {
        businessName: f.b.value.trim(),
        category: f.c.value.trim(),
        contact: f.k.value.trim(),
        imageUrl: f.i.value.trim(),
        description: f.d.value.trim()
      }
    ),
    'Listing imeongezwa'
  );
}

function delM(id) {
  if (!confirm('Futa listing hii?')) return;
  ok(api('DELETE', '/marketplace/' + id), 'Imefutwa');
}

// ============================================================
// SUPPORT (tiketi za wateja)
// ============================================================
function sendTicket(e) {
  e.preventDefault();
  var f = e.target.elements;
  api(
    'POST',
    '/support-ticket',
    {
      name: f.n.value.trim(),
      contact: f.c.value.trim(),
      category: f.k.value,
      orderRef: f.o.value.trim(),
      message: f.m.value.trim()
    }
  )
    .then(function (r) {
      toast(r.message || 'Ombi limepokelewa');
      e.target.reset();
    })
    .catch(bad);
}

function resTicket(i) {
  var t = db.tix[i];
  if (t)
    ok(
      api(
        'PATCH',
        '/admin/tickets/' + t.id,
        {
          status: t.status === 'open' ? 'resolved' : 'open'
        }
      ),
      'Imesasishwa'
    );
}

function delTicket(i) {
  var t = db.tix[i];
  if (t && confirm('Futa tiketi hii?'))
    ok(api('DELETE', '/admin/tickets/' + t.id), 'Imefutwa');
}

/* ===== Mfumo wa kurasa (multi-page) ===== */
var NAVF = [
  ['index.html', 'Home'],
  ['store.html', 'Store'],
  ['free-games.html', 'Free Games'],
  ['squad-market.html', 'Squad Market'],
  ['gift-cards.html', 'Gift Cards'],
  ['efootball-topup.html', 'Top Up'],
  ['movies.html', 'Movies'],
  ['marketplace.html', 'Biashara & Washirika'],
  ['tournament.html', 'Tournaments'],
  ['live-scores.html', 'Live Scores'],
  ['game-requests.html', 'Game Requests'],
  ['academy.html', 'Academy'],
  ['community-chat.html', 'Community'],
  ['ai-assistant.html', 'AI Assistant'],
  ['health-assistant.html', 'Health Assistant'],
  ['cart.html', 'Cart'],
  ['wishlist.html', 'Wishlist'],
  ['my-games-library.html', 'My Games / Library'],
  ['my-orders.html', 'My Orders'],
  ['profile.html', 'My Profile'],
  ['faq-help.html', 'FAQ & Help'],
  ['contact-support.html', 'Support']
],
  PLF = [
    ['psp-gaming.html', 'PSP Gaming'],
    ['ps2-gaming.html', 'PS2 Gaming'],
    ['ps3-gaming.html', 'PS3 Gaming'],
    ['nintendo-switch.html', 'Nintendo Switch'],
    ['android-gaming.html', 'Android Gaming'],
    ['pc-gaming.html', 'PC Gaming']
  ];
var LGZ = { cfg: null, fn: null };

// ============================================================
// MFUMO WA KURASA: nav, render na LGZ.page
// ============================================================
function flash(m) {
  try {
    sessionStorage.setItem('lgz_flash', m);
  } catch (e) {}
}

function nav(f) {
  function l(a) {
    var n = a[0] === 'cart.html'
      ? db.cart.length
      : a[0] === 'wishlist.html' ? db.wish.length : 0;
    return '<a href="'
      + a[0]
      + '" class="'
      + (f === a[0] ? 'on' : '')
      + '">'
      + a[1]
      + (n ? '<span class="bd">' + n + '</span>' : '')
      + '</a>';
  }
  side.innerHTML = '<div class="logo">LIFEISGAMETZ</div>'
    + NAVF.map(l).join('')
    + '<h6>GAMES</h6>'
    + PLF.map(l).join('');
}

function abar(f) {
  return '<div class="row" '
    + 'style="flex-wrap:wrap;margin-bottom:16px">'
    + [
      ['dashboard.html', 'Dashboard'],
      ['games-management.html', 'Manage Games'],
      ['orders-sales.html', 'Orders'],
      ['users-management.html', 'Users'],
      ['coupons-discounts.html', 'Coupons'],
      ['squads-management.html', 'Squads'],
      ['partners-management.html', 'Partners'],
      ['support-tickets.html', 'Tickets'],
      ['analytics.html', 'Analytics'],
      ['profile.html', '← Profile']
    ].map(function (x) {
      return '<a class="btn '
        + (f === x[0] ? '' : 'o')
        + '" href="'
        + x[0]
        + '">'
        + x[1]
        + '</a>';
    }).join('')
    + '</div>';
}

function edit(id) {
  ed = id;
  render();
  scrollTo(0, 0);
}

function render() {
  var c = LGZ.cfg;
  if (!c) return;
  var qs = new URLSearchParams(location.search),
    qi = document.getElementById('q');
  if (!qi._i) {
    qi._i = 1;
    if (qs.get('s')) qi.value = qs.get('s');
  }
  var p = c.p || qs.get('p') || '',
    a = ['#', c.pg, p],
    q = (qi.value || '').toLowerCase(),
    A = db.products.filter(function (x) {
      return x.status === 'Active';
    });
  nav(c.file);
  var m0 = me();
  usr.innerHTML = m0
    ? '<a class="me" href="profile.html">'
      + '<span class="av">'
      + esc(m0.name.charAt(0).toUpperCase())
      + '</span><span>'
      + esc(m0.name)
      + '<small>'
      + esc(m0.role)
      + '</small></span></a>'
    : '<a class="btn" href="login.html">'
      + 'Login / Register</a>';
  if (!(c.pg === 'admin' && a[2] === 'games')) ed = '';
  var ad = c.admin && isAdm(),
    body = (c.admin && !ad)
      ? '<div class="empty">'
        + 'Ukurasa huu ni wa Super Admin tu.<br>'
        + '<br><a class="btn" href="login.html">'
        + 'Login</a></div>'
      : LGZ.fn(a, q, A, c.pg);
  main.innerHTML = (ad ? abar(c.file) : '') + body;
  if (ed && ad && a[2] === 'games') fillForm();
  clearInterval(cmT);
  if (c.pg === 'community') {
    loadChat();
    cmT = setInterval(loadChat, 8000);
  }
  side.classList.remove('open');
}

function route() {
  render();
}

LGZ.page = function (cfg, fn) {
  LGZ.cfg = cfg;
  LGZ.fn = fn;
  render();
  boot();
  try {
    var fm = sessionStorage.getItem('lgz_flash');
    if (fm) {
      sessionStorage.removeItem('lgz_flash');
      toast(fm);
    }
    var rp = sessionStorage.getItem('lgz_poll');
    if (rp) poll(rp, 0);
  } catch (e) {}
};
(
  function () {
    var SRCH = /^(store|games|free|movies|market|platform|giftcards|topup|squads)$/,
      qe = document.getElementById('q');
    qe.addEventListener('input', function () {
      if (LGZ.cfg && SRCH.test(LGZ.cfg.pg)) render();
    });
    qe.addEventListener('keydown', function (e) {
      if (e.key === 'Enter'
        && LGZ.cfg
        && !SRCH.test(LGZ.cfg.pg))
        location.href = 'store.html?s='
          + encodeURIComponent(this.value);
    });
  }
)();
