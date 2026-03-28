/**
 * database.js — Pure JavaScript JSON database
 * אין צורך בקומפילציה, אין node-gyp, עובד על כל מחשב
 * הנתונים נשמרים בקובץ olives-db.json
 */

const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE    = path.join(__dirname, 'olives-db.json');
const UPLOADS    = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// ── פורמט ה-JSON ─────────────────────────────────────────
let data = {
  products:    [],
  orders:      [],
  order_items: [],
  admin_users: [],
  _seq: { products: 0, orders: 0, order_items: 0, admin_users: 0 }
};

function load() {
  if (fs.existsSync(DB_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { console.error('שגיאת קריאת DB:', e.message); }
  }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(table) {
  data._seq[table] = (data._seq[table] || 0) + 1;
  return data._seq[table];
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════
const products = {

  getAll(filters = {}) {
    let rows = data.products.filter(p => p.is_active !== false);

    if (filters.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(s) ||
        (p.description || '').toLowerCase().includes(s)
      );
    }
    if (filters.category)     rows = rows.filter(p => p.category === filters.category);
    if (filters.is_engravable !== undefined)
      rows = rows.filter(p => Boolean(p.is_engravable) === Boolean(filters.is_engravable));

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getById(id) {
    return data.products.find(p => p.id === parseInt(id)) || null;
  },

  create(fields) {
    const id = nextId('products');
    const row = {
      id,
      name:               fields.name,
      slug:               fields.slug               || '',
      description:        fields.description        || '',
      price:              parseFloat(fields.price)  || 0,
      image_url:          fields.image_url          || '',
      category:           fields.category,
      stock_quantity:     parseInt(fields.stock_quantity) || 0,
      details_material:   fields.details_material   || '',
      details_waterproof: fields.details_waterproof || '',
      details_shipping:   fields.details_shipping   || '',
      details_engraving:  fields.details_engraving  || '',
      is_engravable:      Boolean(fields.is_engravable),
      engraving_settings: fields.engraving_settings || null,
      is_active:          true,
      created_at:         now(),
      updated_at:         now()
    };
    data.products.push(row);
    save();
    return id;
  },

  update(id, fields) {
    const idx = data.products.findIndex(p => p.id === parseInt(id));
    if (idx === -1) return false;
    const p = data.products[idx];
    data.products[idx] = {
      ...p,
      name:               fields.name               ?? p.name,
      slug:               fields.slug               ?? p.slug ?? '',
      description:        fields.description        ?? p.description,
      price:              fields.price !== undefined ? parseFloat(fields.price) : p.price,
      image_url:          fields.image_url           ?? p.image_url,
      category:           fields.category            ?? p.category,
      stock_quantity:     fields.stock_quantity !== undefined ? parseInt(fields.stock_quantity) : p.stock_quantity,
      details_material:   fields.details_material   ?? p.details_material   ?? '',
      details_waterproof: fields.details_waterproof ?? p.details_waterproof ?? '',
      details_shipping:   fields.details_shipping   ?? p.details_shipping   ?? '',
      details_engraving:  fields.details_engraving  ?? p.details_engraving  ?? '',
      is_engravable:      fields.is_engravable !== undefined ? Boolean(fields.is_engravable) : p.is_engravable,
      engraving_settings: fields.engraving_settings !== undefined ? fields.engraving_settings : p.engraving_settings,
      updated_at:         now()
    };
    save();
    return true;
  },

  updateStock(id, qty) {
    const p = data.products.find(p => p.id === parseInt(id));
    if (p) { p.stock_quantity = parseInt(qty); p.updated_at = now(); save(); }
  },

  updateImage(id, url) {
    const p = data.products.find(p => p.id === parseInt(id));
    if (p) { p.image_url = url; p.updated_at = now(); save(); }
  },

  softDelete(id) {
    const p = data.products.find(p => p.id === parseInt(id));
    if (p) { p.is_active = false; p.updated_at = now(); save(); }
  }
};

// ════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════
const orders = {

  getAll(filters = {}) {
    let rows = [...data.orders];

    if (filters.status)       rows = rows.filter(o => o.status === filters.status);
    if (filters.has_engraving !== undefined)
      rows = rows.filter(o => Boolean(o.has_engraving) === Boolean(filters.has_engraving));
    if (filters.from)         rows = rows.filter(o => o.created_at >= filters.from);
    if (filters.to)           rows = rows.filter(o => o.created_at <= filters.to + ' 23:59:59');
    if (filters.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter(o =>
        o.customer_name.toLowerCase().includes(s) ||
        o.order_number.toLowerCase().includes(s)  ||
        o.customer_email.toLowerCase().includes(s)
      );
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getById(id) {
    const order = data.orders.find(o => o.id === parseInt(id));
    if (!order) return null;
    const items = data.order_items
      .filter(i => i.order_id === order.id)
      .map(i => {
        const prod = data.products.find(p => p.id === i.product_id);
        return { ...i, product_name: prod?.name || '—', image_url: prod?.image_url || '' };
      });
    return { ...order, items };
  },

  create(fields) {
    const id = nextId('orders');
    data.orders.push({
      id,
      order_number:   fields.order_number,
      customer_name:  fields.customer_name,
      customer_email: fields.customer_email,
      customer_phone: fields.customer_phone  || '',
      total_amount:   parseFloat(fields.total_amount),
      status:         fields.status          || 'pending',
      has_engraving:  Boolean(fields.has_engraving),
      notes:          fields.notes           || '',
      created_at:     now(),
      updated_at:     now()
    });
    save();
    return id;
  },

  updateStatus(id, status) {
    const o = data.orders.find(o => o.id === parseInt(id));
    if (o) { o.status = status; o.updated_at = now(); save(); }
  }
};

// ════════════════════════════════════════════════════════════
// ORDER ITEMS
// ════════════════════════════════════════════════════════════
const orderItems = {
  create(fields) {
    const id = nextId('order_items');
    data.order_items.push({
      id,
      order_id:        fields.order_id,
      product_id:      fields.product_id,
      quantity:        parseInt(fields.quantity) || 1,
      unit_price:      parseFloat(fields.unit_price),
      engraving_text:  fields.engraving_text  || null,
      engraving_font:  fields.engraving_font  || null,
      engraving_price: parseFloat(fields.engraving_price) || 0
    });
    save();
    return id;
  }
};

// ════════════════════════════════════════════════════════════
// ADMIN USERS
// ════════════════════════════════════════════════════════════
const adminUsers = {
  getByUsername(username) {
    return data.admin_users.find(u => u.username === username) || null;
  },
  updateLastLogin(id) {
    const u = data.admin_users.find(u => u.id === id);
    if (u) { u.last_login = now(); save(); }
  }
};

// ════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ════════════════════════════════════════════════════════════
function getStats() {
  const active   = data.orders.filter(o => o.status !== 'cancelled');
  const revenue  = active.reduce((s, o) => s + o.total_amount, 0);
  const prods    = data.products.filter(p => p.is_active !== false);
  return {
    revenue,
    totalOrders:    data.orders.length,
    pendingOrders:  data.orders.filter(o => o.status === 'pending').length,
    inProduction:   data.orders.filter(o => o.status === 'in_production').length,
    engravingOrders:data.orders.filter(o => o.has_engraving).length,
    totalProducts:  prods.length,
    lowStock:       prods.filter(p => p.stock_quantity < 5).length,
    recentOrders:   [...data.orders]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6)
  };
}

// ════════════════════════════════════════════════════════════
// INIT + SEED
// ════════════════════════════════════════════════════════════
function initDB() {
  load();

  // ── Admin user ─────────────────────────────────────────
  if (!data.admin_users.find(u => u.username === 'admin')) {
    const id   = nextId('admin_users');
    const hash = bcrypt.hashSync('admin123', 10);
    data.admin_users.push({
      id, username: 'admin', password_hash: hash,
      email: 'admin@olivesjewelry.com', last_login: null, created_at: now()
    });
    save();
    console.log('✅  Admin נוצר  →  user: admin | pass: admin123');
  }

  // ── Products ───────────────────────────────────────────
  if (data.products.length === 0) {
    [
      {
        name: 'שרשרת בר זהב עם חריטה',
        description: 'שרשרת בר זהב אלגנטית עם חריטה אישית. ציפוי זהב 18K עמיד. מושלמת למתנה.',
        price: 189, image_url: '/product-necklace.png',
        category: 'שרשראות חריטה', stock_quantity: 15, is_engravable: true,
        engraving_settings: { max_chars: 20, fonts: ['Script','Block','Hebrew'], price_addition: 35 }
      },
      {
        name: 'צמיד חריטה כסף',
        description: 'צמיד נירוסטה כסוף עם לוחית חריטה רחבה. 100% עמיד במים.',
        price: 149, image_url: '/product-bracelet-silver.png',
        category: 'צמידי חריטה', stock_quantity: 20, is_engravable: true,
        engraving_settings: { max_chars: 25, fonts: ['Script','Block','Hebrew','Italic'], price_addition: 0 }
      },
      {
        name: 'צמיד זהב נחש',
        description: 'צמיד זהב נחש בעיצוב מודרני ויוקרתי. ציפוי זהב 18K. מידה אוניברסלית.',
        price: 219, image_url: '/product-bracelet-gold.png',
        category: 'צמידים', stock_quantity: 8, is_engravable: false, engraving_settings: null
      }
    ].forEach(p => products.create(p));
    console.log('✅  3 מוצרים נוספו לקטלוג');
  }

  // ── Sample orders ──────────────────────────────────────
  if (data.orders.length === 0) {
    const o1 = orders.create({ order_number:'OLV-2026-0001', customer_name:'שרה כהן',  customer_email:'sarah@example.com',  customer_phone:'050-1234567', total_amount:224, status:'in_production', has_engraving:true  });
    orderItems.create({ order_id:o1, product_id:1, quantity:1, unit_price:189, engraving_text:'Sarah & David', engraving_font:'Script',  engraving_price:35 });

    const o2 = orders.create({ order_number:'OLV-2026-0002', customer_name:'יוסי לוי',  customer_email:'yossi@example.com',  customer_phone:'052-9876543', total_amount:219, status:'pending',       has_engraving:false });
    orderItems.create({ order_id:o2, product_id:3, quantity:1, unit_price:219, engraving_text:null, engraving_font:null, engraving_price:0 });

    const o3 = orders.create({ order_number:'OLV-2026-0003', customer_name:'מיכל גולן', customer_email:'michal@example.com', customer_phone:'054-5556677', total_amount:149, status:'shipped',        has_engraving:true  });
    orderItems.create({ order_id:o3, product_id:2, quantity:1, unit_price:149, engraving_text:"יברכך ה' וישמרך", engraving_font:'Hebrew', engraving_price:0 });

    const o4 = orders.create({ order_number:'OLV-2026-0004', customer_name:'אלון ברק',  customer_email:'alon@example.com',   customer_phone:'053-1112233', total_amount:408, status:'completed',     has_engraving:true  });
    orderItems.create({ order_id:o4, product_id:1, quantity:1, unit_price:189, engraving_text:'Mom & Dad', engraving_font:'Block',  engraving_price:35 });
    orderItems.create({ order_id:o4, product_id:2, quantity:1, unit_price:149, engraving_text:'לתמיד',     engraving_font:'Hebrew', engraving_price:0  });

    console.log('✅  4 הזמנות לדוגמה נוספו');
  }
}

module.exports = { products, orders, orderItems, adminUsers, getStats, initDB };
