const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const { products, orders, orderItems, adminUsers, getStats, initDB } = require('./database');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'olives-jewelry-2026-secret';

initDB();

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin',   express.static(path.join(__dirname, 'admin')));

// ── Debug ──────────────────────────────────────────────────
const fs = require('fs');
app.get('/api/debug', (req, res) => {
  const files = fs.readdirSync(__dirname);
  res.json({ __dirname, cwd: process.cwd(), files });
});

// ── Multer – העלאת תמונות ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Auth Middleware ────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ error: 'לא מורשה – נדרשת כניסה' });
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקין או פג תוקף' });
  }
}

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
app.post('/admin/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'שם משתמש וסיסמה הם שדות חובה' });

  const admin = adminUsers.getByUsername(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

  adminUsers.updateLastLogin(admin.id);
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: admin.username });
});

app.get('/admin/auth/verify', requireAdmin, (req, res) =>
  res.json({ valid: true, username: req.admin.username })
);

// ════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ════════════════════════════════════════════════════════════
app.get('/admin/dashboard/stats', requireAdmin, (req, res) =>
  res.json(getStats())
);

// ════════════════════════════════════════════════════════════
// PRODUCTS  CRUD
// ════════════════════════════════════════════════════════════
app.get('/admin/products', requireAdmin, (req, res) => {
  const { search, category, is_engravable } = req.query;
  const filters = { search, category };
  if (is_engravable !== undefined) filters.is_engravable = is_engravable === 'true';
  res.json(products.getAll(filters));
});

app.get('/admin/products/:id', requireAdmin, (req, res) => {
  const p = products.getById(req.params.id);
  if (!p) return res.status(404).json({ error: 'מוצר לא נמצא' });
  res.json(p);
});

app.post('/admin/products', requireAdmin, (req, res) => {
  const { name, price, category } = req.body;
  if (!name || !price || !category)
    return res.status(400).json({ error: 'שם, מחיר וקטגוריה הם שדות חובה' });
  const id = products.create(req.body);
  res.status(201).json({ id, message: 'מוצר נוצר בהצלחה' });
});

app.put('/admin/products/:id', requireAdmin, (req, res) => {
  const ok = products.update(req.params.id, req.body);
  if (!ok) return res.status(404).json({ error: 'מוצר לא נמצא' });
  res.json({ message: 'מוצר עודכן בהצלחה' });
});

app.patch('/admin/products/:id/stock', requireAdmin, (req, res) => {
  products.updateStock(req.params.id, req.body.stock_quantity);
  res.json({ message: 'מלאי עודכן' });
});

app.delete('/admin/products/:id', requireAdmin, (req, res) => {
  products.softDelete(req.params.id);
  res.json({ message: 'מוצר הוסר' });
});

app.post('/admin/products/:id/image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא הועלתה תמונה' });
  const url = `/uploads/${req.file.filename}`;
  products.updateImage(req.params.id, url);
  res.json({ image_url: url, message: 'תמונה עודכנה' });
});

// ════════════════════════════════════════════════════════════
// PRODUCTS – BULK IMPORT
// ════════════════════════════════════════════════════════════
app.post('/admin/products/import-bulk', requireAdmin, (req, res) => {
  const { products: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'יש לספק מערך מוצרים' });

  const errors  = [];
  const results = [];
  let   created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row    = { ...rows[i] };
    const rowNum = i + 1;

    // Required-field validation
    if (!row.name || !row.price || !row.category) {
      errors.push(`שורה ${rowNum}: שם, מחיר וקטגוריה הם שדות חובה – המוצר דולג`);
      results.push({ row: rowNum, status: 'skipped' });
      continue;
    }

    // Resolve image_filename → image_url
    if (row.image_filename) {
      const filename  = row.image_filename;
      const imagePath = path.join(__dirname, 'uploads', filename);

      if (fs.existsSync(imagePath)) {
        row.image_url = `/uploads/${filename}`;
      } else {
        errors.push(`אזהרה – שורה ${rowNum}: תמונה "${filename}" לא נמצאה בתיקיית uploads. המוצר נוצר ללא תמונה`);
      }
      delete row.image_filename;
    }

    try {
      const id = products.create(row);
      created++;
      results.push({ row: rowNum, status: 'created', id });
    } catch (err) {
      errors.push(`שורה ${rowNum}: שגיאה ביצירת המוצר – ${err.message}`);
      results.push({ row: rowNum, status: 'error' });
    }
  }

  res.status(201).json({ created, errors, results });
});

// ════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════
app.get('/admin/orders', requireAdmin, (req, res) => {
  const { status, has_engraving, from, to, search } = req.query;
  const filters = { status, from, to, search };
  if (has_engraving !== undefined) filters.has_engraving = has_engraving === 'true';
  res.json(orders.getAll(filters));
});

app.get('/admin/orders/:id', requireAdmin, (req, res) => {
  const order = orders.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  res.json(order);
});

app.patch('/admin/orders/:id/status', requireAdmin, (req, res) => {
  const valid = ['pending','in_production','shipped','completed','cancelled'];
  if (!valid.includes(req.body.status))
    return res.status(400).json({ error: 'סטטוס לא תקין' });
  orders.updateStatus(req.params.id, req.body.status);
  res.json({ message: 'סטטוס עודכן' });
});

// ── API ציבורי: כל המוצרים ─────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category } = req.query;
  res.json(products.getAll(category ? { category } : {}));
});

// ── API ציבורי: מוצר בודד ───────────────────────────────────
app.get('/api/products/:id', (req, res) => {
  const p = products.getById(req.params.id);
  if (!p || p.is_active === false) return res.status(404).json({ error: 'מוצר לא נמצא' });
  res.json(p);
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  שרת פעיל    →  http://localhost:${PORT}`);
  console.log(`🔐  Admin Panel  →  http://localhost:${PORT}/admin/login.html`);
  console.log(`👤  user: admin  |  pass: admin123\n`);
});
