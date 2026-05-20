// routes/api.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// GET semua taman (untuk map)
router.get('/taman', async (req, res) => {
  try {
    const { kategori, kecamatan, q } = req.query;
    let where = [`t.status='aktif'`], params = [];
    if (kategori)  { params.push(kategori);  where.push(`kt.nama=$${params.length}`); }
    if (kecamatan) { params.push(kecamatan); where.push(`k.nama=$${params.length}`); }
    if (q)         { params.push(`%${q}%`);  where.push(`t.nama_taman ILIKE $${params.length}`); }

    const { rows } = await db.query(`
      SELECT t.id, t.nama_taman, t.alamat, t.latitude, t.longitude,
        t.photo_url, t.luas_m2, t.jam_buka, t.jam_tutup, t.tiket_masuk,
        k.nama AS kecamatan, kt.nama AS kategori,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
        COALESCE(JSON_AGG(DISTINCT f.nama) FILTER (WHERE f.nama IS NOT NULL),'[]'::json) AS fasilitas
      FROM taman t
      LEFT JOIN kecamatan k       ON t.kecamatan_id=k.id
      LEFT JOIN kategori_taman kt  ON t.kategori_id=kt.id
      LEFT JOIN taman_ulasan u     ON t.id=u.taman_id
      LEFT JOIN taman_fasilitas tf ON t.id=tf.taman_id
      LEFT JOIN fasilitas_taman f  ON tf.fasilitas_id=f.id
      WHERE ${where.join(' AND ')}
      GROUP BY t.id, k.nama, kt.nama
      ORDER BY t.nama_taman
    `, params);
    res.json({ success: true, data: rows });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST ulasan
router.post('/taman/:id/ulasan', async (req, res) => {
  try {
    const { rating, komentar, username } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, message: 'Rating tidak valid' });

    let userId = null;
    if (username) {
      const { rows } = await db.query(`SELECT id FROM users WHERE username=$1`, [username]);
      if (rows.length) userId = rows[0].id;
    }

    await db.query(
      `INSERT INTO taman_ulasan (taman_id,user_id,rating,komentar) VALUES($1,$2,$3,$4)`,
      [req.params.id, userId, rating, komentar || null]
    );

    // Ambil rating terbaru
    const { rows } = await db.query(`
      SELECT ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*)::int AS total
      FROM taman_ulasan WHERE taman_id=$1
    `, [req.params.id]);

    res.json({ success: true, message: 'Ulasan berhasil!', stats: rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET statistik taman
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)::int AS total_taman,
        COUNT(DISTINCT kecamatan_id)::int AS total_kecamatan,
        COUNT(CASE WHEN tiket_masuk=0 THEN 1 END)::int AS gratis,
        COALESCE(ROUND(AVG(sub.r)::numeric,1),0) AS rating_rata
      FROM taman t
      LEFT JOIN (SELECT taman_id, AVG(rating) AS r FROM taman_ulasan GROUP BY taman_id) sub
        ON t.id=sub.taman_id
      WHERE t.status='aktif'
    `);
    res.json({ success: true, data: rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
