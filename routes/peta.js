const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const { rows: taman } = await db.query(`
      SELECT t.id, t.nama_taman, t.alamat, t.latitude, t.longitude,
        t.photo_url, t.luas_m2, t.jam_buka, t.jam_tutup, t.tiket_masuk, t.status,
        k.nama AS kecamatan, kt.nama AS kategori,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
        COUNT(DISTINCT u.id) AS jumlah_ulasan,
        COALESCE(JSON_AGG(DISTINCT f.nama) FILTER (WHERE f.nama IS NOT NULL),'[]'::json) AS fasilitas
      FROM taman t
      LEFT JOIN kecamatan k       ON t.kecamatan_id = k.id
      LEFT JOIN kategori_taman kt  ON t.kategori_id  = kt.id
      LEFT JOIN taman_ulasan u     ON t.id = u.taman_id
      LEFT JOIN taman_fasilitas tf ON t.id = tf.taman_id
      LEFT JOIN fasilitas_taman f  ON tf.fasilitas_id = f.id
      WHERE t.status='aktif'
      GROUP BY t.id, k.nama, kt.nama
      ORDER BY t.nama_taman
    `);

    const { rows: kategori }   = await db.query(`SELECT * FROM kategori_taman ORDER BY id`);
    const { rows: kecamatan }  = await db.query(`SELECT DISTINCT k.id, k.nama FROM kecamatan k JOIN taman t ON t.kecamatan_id=k.id WHERE t.status='aktif' ORDER BY k.nama`);
    const { rows: fasilitas }  = await db.query(`SELECT DISTINCT f.nama FROM fasilitas_taman f JOIN taman_fasilitas tf ON f.id=tf.fasilitas_id ORDER BY f.nama`);

    res.render('peta', { taman, kategori, kecamatan, fasilitas, page: 'peta' });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
