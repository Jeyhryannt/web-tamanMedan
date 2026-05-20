// routes/about.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const { rows: stats } = await db.query(`
      SELECT
        COUNT(*)::int AS total_taman,
        COUNT(DISTINCT kecamatan_id)::int AS total_kecamatan,
        COALESCE(SUM(luas_m2),0) AS total_luas,
        COUNT(CASE WHEN tiket_masuk=0 THEN 1 END)::int AS gratis,
        (SELECT COUNT(*)::int FROM taman_ulasan) AS total_ulasan,
        (SELECT COUNT(*)::int FROM fasilitas_taman) AS total_fasilitas
      FROM taman WHERE status='aktif'
    `);
    res.render('about', { stats: stats[0], page: 'about' });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
