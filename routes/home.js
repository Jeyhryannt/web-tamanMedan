const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const { rows: featured } = await db.query(`
      SELECT t.*, k.nama AS kecamatan, kt.nama AS kategori,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
        COUNT(DISTINCT u.id) AS jumlah_ulasan
      FROM taman t
      LEFT JOIN kecamatan k      ON t.kecamatan_id = k.id
      LEFT JOIN kategori_taman kt ON t.kategori_id  = kt.id
      LEFT JOIN taman_ulasan u    ON t.id = u.taman_id
      WHERE t.status = 'aktif'
      GROUP BY t.id, k.nama, kt.nama
      ORDER BY rating_avg DESC, jumlah_ulasan DESC
      LIMIT 3
    `);

    const { rows: stats } = await db.query(`
      SELECT
        COUNT(*)::int                          AS total_taman,
        COUNT(DISTINCT kecamatan_id)::int      AS total_kecamatan,
        COALESCE(SUM(luas_m2),0)               AS total_luas,
        COUNT(CASE WHEN tiket_masuk=0 THEN 1 END)::int AS gratis
      FROM taman WHERE status='aktif'
    `);

    const { rows: kategori } = await db.query(`SELECT * FROM kategori_taman ORDER BY id`);

    res.render('home', { featured, stats: stats[0], kategori, page: 'home' });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
