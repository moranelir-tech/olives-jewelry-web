/* ── Config ───────────────────────────────────────────────── */
const API = window.location.origin;   // עובד על כל פורט אוטומטית

/* ── Token helpers ────────────────────────────────────────── */
const getToken  = () => localStorage.getItem('admin_token');
const setToken  = (t) => localStorage.setItem('admin_token', t);
const clearAuth = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user'); };

/* ── API fetch wrapper ────────────────────────────────────── */
async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(API + endpoint, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'שגיאה בשרת');
  return json;
}

/* ── Auth guard (call on every protected page) ────────────── */
async function requireAuth() {
  if (!getToken()) { redirect(); return; }
  try {
    const { valid, username } = await api('GET', '/admin/auth/verify');
    if (!valid) throw new Error();
    const el = document.getElementById('admin-username');
    if (el) el.textContent = username;
  } catch {
    clearAuth();
    redirect();
  }
}
function redirect() { window.location.href = './login.html'; }

/* ── Logout ───────────────────────────────────────────────── */
function logout() { clearAuth(); redirect(); }

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, type = '') {
  let wrap = document.querySelector('.toast-container');
  if (!wrap) { wrap = Object.assign(document.createElement('div'), { className: 'toast-container' }); document.body.append(wrap); }
  const el = Object.assign(document.createElement('div'), { className: `toast ${type}`, textContent: msg });
  wrap.append(el);
  setTimeout(() => el.remove(), 3200);
}
const toastOk  = (m) => toast(m, 'success');
const toastErr = (m) => toast(m, 'error');

/* ── Modal helpers ────────────────────────────────────────── */
const openModal  = (id) => document.getElementById(id)?.classList.add('open');
const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

/* ── Status labels + badge ────────────────────────────────── */
const STATUS = {
  pending:       { label: 'ממתינה',  cls: 'badge-pending'      },
  in_production: { label: 'בייצור',  cls: 'badge-in_production' },
  shipped:       { label: 'נשלחה',   cls: 'badge-shipped'       },
  completed:     { label: 'הושלמה',  cls: 'badge-completed'     },
  cancelled:     { label: 'בוטלה',   cls: 'badge-cancelled'     },
};
function statusBadge(s) {
  const d = STATUS[s] || { label: s, cls: '' };
  return `<span class="badge ${d.cls}">${d.label}</span>`;
}

/* ── Date formatter ───────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Number formatter ─────────────────────────────────────── */
function fmtMoney(n) { return '₪' + Number(n).toLocaleString('he-IL'); }

/* ── Confirm dialog ───────────────────────────────────────── */
function confirmAction(msg) { return window.confirm(msg); }

/* ── Close modal on overlay click ────────────────────────── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});
