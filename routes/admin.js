// routes/admin.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ── Middleware sederhana: cek session admin ──────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null, page: 'admin' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Username atau password salah.', page: 'admin' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows: stats } = await db.query(`
      SELECT
        COUNT(*)::int                                           AS total_taman,
        COUNT(CASE WHEN status='aktif'  THEN 1 END)::int       AS aktif,
        COUNT(CASE WHEN status='nonaktif' THEN 1 END)::int     AS nonaktif,
        COUNT(CASE WHEN tiket_masuk=0   THEN 1 END)::int       AS gratis,
        COUNT(DISTINCT kecamatan_id)::int                      AS kecamatan
      FROM taman
    `);
    const { rows: ulasanStats } = await db.query(`
      SELECT COUNT(*)::int AS total FROM taman_ulasan
    `);
    const { rows: recentTaman } = await db.query(`
      SELECT t.id, t.nama_taman, t.status, k.nama AS kecamatan, t.created_at
      FROM taman t
      LEFT JOIN kecamatan k ON t.kecamatan_id = k.id
      ORDER BY t.created_at DESC LIMIT 5
    `);
    res.render('admin/dashboard', {
      stats: stats[0],
      ulasanStats: ulasanStats[0],
      recentTaman,
      page: 'admin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ── DAFTAR TAMAN ─────────────────────────────────────────────────────────────
router.get('/taman', requireAdmin, async (req, res) => {
  try {
    const { q, status, kecamatan } = req.query;
    let where = [], params = [];

    if (q)         { params.push(`%${q}%`); where.push(`t.nama_taman ILIKE $${params.length}`); }
    if (status)    { params.push(status);   where.push(`t.status = $${params.length}`); }
    if (kecamatan) { params.push(kecamatan); where.push(`k.nama = $${params.length}`); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: taman } = await db.query(`
      SELECT t.*, k.nama AS kecamatan, kt.nama AS kategori,
        COUNT(DISTINCT u.id)::int AS jumlah_ulasan
      FROM taman t
      LEFT JOIN kecamatan k       ON t.kecamatan_id = k.id
      LEFT JOIN kategori_taman kt ON t.kategori_id  = kt.id
      LEFT JOIN taman_ulasan u    ON t.id = u.taman_id
      ${whereStr}
      GROUP BY t.id, k.nama, kt.nama
      ORDER BY t.nama_taman ASC
    `, params);

    const { rows: kecamatanList } = await db.query(`SELECT * FROM kecamatan ORDER BY nama`);

    res.render('admin/taman-list', {
      taman, kecamatanList,
      filters: { q, status, kecamatan },
      page: 'admin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ── FORM TAMBAH TAMAN ────────────────────────────────────────────────────────
router.get('/taman/tambah', requireAdmin, async (req, res) => {
  try {
    const { rows: kategoriList }  = await db.query(`SELECT * FROM kategori_taman ORDER BY nama`);
    const { rows: kecamatanList } = await db.query(`SELECT * FROM kecamatan ORDER BY nama`);
    const { rows: fasilitasList } = await db.query(`SELECT * FROM fasilitas_taman ORDER BY nama`);
    res.render('admin/taman-form', {
      taman: null, kategoriList, kecamatanList, fasilitasList,
      fasilitasTerpilih: [],
      mode: 'tambah', error: null, page: 'admin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ── SIMPAN TAMBAH TAMAN ──────────────────────────────────────────────────────
router.post('/taman/tambah', requireAdmin, async (req, res) => {
  const client = await db.connect();
  try {
    const {
      nama_taman, kategori_id, kecamatan_id, alamat,
      latitude, longitude, luas_m2, jam_buka, jam_tutup,
      tiket_masuk, deskripsi, photo_url, status, fasilitas
    } = req.body;

    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO taman
        (nama_taman, kategori_id, kecamatan_id, alamat, latitude, longitude,
         luas_m2, jam_buka, jam_tutup, tiket_masuk, deskripsi, photo_url, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      nama_taman, kategori_id, kecamatan_id, alamat,
      latitude || null, longitude || null, luas_m2 || null,
      jam_buka || null, jam_tutup || null, tiket_masuk || 0,
      deskripsi || null, photo_url || null, status || 'aktif'
    ]);

    const tamanId = rows[0].id;

    // Insert fasilitas
    const fasilitasArr = Array.isArray(fasilitas) ? fasilitas : (fasilitas ? [fasilitas] : []);
    for (const fId of fasilitasArr) {
      await client.query(
        `INSERT INTO taman_fasilitas (taman_id, fasilitas_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [tamanId, fId]
      );
    }

    await client.query('COMMIT');
    res.redirect('/admin/taman?success=tambah');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    const { rows: kategoriList }  = await db.query(`SELECT * FROM kategori_taman ORDER BY nama`);
    const { rows: kecamatanList } = await db.query(`SELECT * FROM kecamatan ORDER BY nama`);
    const { rows: fasilitasList } = await db.query(`SELECT * FROM fasilitas_taman ORDER BY nama`);
    res.render('admin/taman-form', {
      taman: req.body, kategoriList, kecamatanList, fasilitasList,
      fasilitasTerpilih: [],
      mode: 'tambah', error: err.message, page: 'admin'
    });
  } finally {
    client.release();
  }
});

// ── FORM EDIT TAMAN ──────────────────────────────────────────────────────────
router.get('/taman/:id/edit', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`SELECT * FROM taman WHERE id=$1`, [id]);
    if (!rows.length) return res.status(404).send('Taman tidak ditemukan');

    const { rows: kategoriList }  = await db.query(`SELECT * FROM kategori_taman ORDER BY nama`);
    const { rows: kecamatanList } = await db.query(`SELECT * FROM kecamatan ORDER BY nama`);
    const { rows: fasilitasList } = await db.query(`SELECT * FROM fasilitas_taman ORDER BY nama`);
    const { rows: fasilitasTerpilih } = await db.query(
      `SELECT fasilitas_id FROM taman_fasilitas WHERE taman_id=$1`, [id]
    );

    res.render('admin/taman-form', {
      taman: rows[0], kategoriList, kecamatanList, fasilitasList,
      fasilitasTerpilih: fasilitasTerpilih.map(r => r.fasilitas_id),
      mode: 'edit', error: null, page: 'admin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ── SIMPAN EDIT TAMAN ────────────────────────────────────────────────────────
router.post('/taman/:id/edit', requireAdmin, async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const {
      nama_taman, kategori_id, kecamatan_id, alamat,
      latitude, longitude, luas_m2, jam_buka, jam_tutup,
      tiket_masuk, deskripsi, photo_url, status, fasilitas
    } = req.body;

    await client.query('BEGIN');

    await client.query(`
      UPDATE taman SET
        nama_taman=$1, kategori_id=$2, kecamatan_id=$3, alamat=$4,
        latitude=$5, longitude=$6, luas_m2=$7, jam_buka=$8, jam_tutup=$9,
        tiket_masuk=$10, deskripsi=$11, photo_url=$12, status=$13
      WHERE id=$14
    `, [
      nama_taman, kategori_id, kecamatan_id, alamat,
      latitude || null, longitude || null, luas_m2 || null,
      jam_buka || null, jam_tutup || null, tiket_masuk || 0,
      deskripsi || null, photo_url || null, status || 'aktif', id
    ]);

    // Update fasilitas: hapus lama, masukkan baru
    await client.query(`DELETE FROM taman_fasilitas WHERE taman_id=$1`, [id]);
    const fasilitasArr = Array.isArray(fasilitas) ? fasilitas : (fasilitas ? [fasilitas] : []);
    for (const fId of fasilitasArr) {
      await client.query(
        `INSERT INTO taman_fasilitas (taman_id, fasilitas_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, fId]
      );
    }

    await client.query('COMMIT');
    res.redirect('/admin/taman?success=edit');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    const { rows: kategoriList }  = await db.query(`SELECT * FROM kategori_taman ORDER BY nama`);
    const { rows: kecamatanList } = await db.query(`SELECT * FROM kecamatan ORDER BY nama`);
    const { rows: fasilitasList } = await db.query(`SELECT * FROM fasilitas_taman ORDER BY nama`);
    res.render('admin/taman-form', {
      taman: { ...req.body, id: req.params.id },
      kategoriList, kecamatanList, fasilitasList,
      fasilitasTerpilih: [],
      mode: 'edit', error: err.message, page: 'admin'
    });
  } finally {
    client.release();
  }
});

// ── HAPUS TAMAN ──────────────────────────────────────────────────────────────
router.post('/taman/:id/hapus', requireAdmin, async (req, res) => {
  try {
    await db.query(`DELETE FROM taman WHERE id=$1`, [req.params.id]);
    res.redirect('/admin/taman?success=hapus');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/taman?error=hapus');
  }
});

// ── TOGGLE STATUS ─────────────────────────────────────────────────────────────
router.post('/taman/:id/status', requireAdmin, async (req, res) => {
  try {
    await db.query(`
      UPDATE taman SET status = CASE WHEN status='aktif' THEN 'nonaktif' ELSE 'aktif' END
      WHERE id=$1
    `, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── KELOLA FASILITAS ──────────────────────────────────────────────────────────
router.get('/fasilitas', requireAdmin, async (req, res) => {
  try {
    const { rows: fasilitasList } = await db.query(`
      SELECT f.*, COUNT(tf.taman_id)::int AS digunakan
      FROM fasilitas_taman f
      LEFT JOIN taman_fasilitas tf ON f.id = tf.fasilitas_id
      GROUP BY f.id ORDER BY f.nama
    `);
    res.render('admin/fasilitas', { fasilitasList, page: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/fasilitas/tambah', requireAdmin, async (req, res) => {
  try {
    const { nama } = req.body;
    if (nama) await db.query(`INSERT INTO fasilitas_taman (nama) VALUES ($1) ON CONFLICT DO NOTHING`, [nama]);
    res.redirect('/admin/fasilitas?success=1');
  } catch (err) {
    res.redirect('/admin/fasilitas?error=1');
  }
});

router.post('/fasilitas/:id/hapus', requireAdmin, async (req, res) => {
  try {
    await db.query(`DELETE FROM fasilitas_taman WHERE id=$1`, [req.params.id]);
    res.redirect('/admin/fasilitas?success=hapus');
  } catch (err) {
    res.redirect('/admin/fasilitas?error=1');
  }
});

// ── KELOLA ULASAN ─────────────────────────────────────────────────────────────
router.get('/ulasan', requireAdmin, async (req, res) => {
  try {
    const { rows: ulasan } = await db.query(`
      SELECT u.*, t.nama_taman, COALESCE(us.username,'Anonim') AS username
      FROM taman_ulasan u
      LEFT JOIN taman t ON u.taman_id = t.id
      LEFT JOIN users us ON u.user_id = us.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    res.render('admin/ulasan', { ulasan, page: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/ulasan/:id/hapus', requireAdmin, async (req, res) => {
  try {
    await db.query(`DELETE FROM taman_ulasan WHERE id=$1`, [req.params.id]);
    res.redirect('/admin/ulasan?success=hapus');
  } catch (err) {
    res.redirect('/admin/ulasan?error=1');
  }
});

module.exports = router;
