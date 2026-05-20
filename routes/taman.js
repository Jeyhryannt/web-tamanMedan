const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

function getFasilitasIcon(nama) {
  const icons = {
    'Jogging Track':'🏃','Area Bermain Anak':'🛝','Toilet Umum':'🚻',
    'Parkir':'🅿️','Musholla':'🕌','Cafe / Kantin':'☕','WiFi':'📶',
    'Flying Fox':'🪂','Kolam Air Mancur':'⛲','Area Fitness Outdoor':'💪',
    'Danau Buatan':'🏞️','Spot Foto':'📸','Area Perkemahan':'⛺',
    'Outbound':'🧗','Monumen':'🗿','Hutan Kota':'🌳',
    'Tempat Duduk Teduh':'🪑','Pinggir Sungai':'🌊',
  };
  return icons[nama] || '✅';
}

// Daftar taman dengan filter & sorting
router.get('/', async (req, res) => {
  try {
    const { q, kategori, kecamatan, tiket, sort = 'nama', view = 'grid' } = req.query;

    let where = [`t.status = 'aktif'`];
    let params = [];

    if (q)         { params.push(`%${q}%`);    where.push(`t.nama_taman ILIKE $${params.length}`); }
    if (kategori)  { params.push(kategori);     where.push(`kt.nama = $${params.length}`); }
    if (kecamatan) { params.push(kecamatan);    where.push(`k.nama = $${params.length}`); }
    if (tiket === 'gratis') where.push(`t.tiket_masuk = 0`);
    if (tiket === 'bayar')  where.push(`t.tiket_masuk > 0`);

    const orderMap = {
      'nama': 't.nama_taman ASC',
      'rating': 'rating_avg DESC',
      'luas': 't.luas_m2 DESC NULLS LAST',
      'ulasan': 'jumlah_ulasan DESC',
    };
    const orderBy = orderMap[sort] || 't.nama_taman ASC';

    const { rows: taman } = await db.query(`
      SELECT t.*, k.nama AS kecamatan, kt.nama AS kategori,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
        COUNT(DISTINCT u.id) AS jumlah_ulasan,
        COALESCE(JSON_AGG(DISTINCT f.nama) FILTER (WHERE f.nama IS NOT NULL),'[]'::json) AS fasilitas
      FROM taman t
      LEFT JOIN kecamatan k       ON t.kecamatan_id = k.id
      LEFT JOIN kategori_taman kt  ON t.kategori_id  = kt.id
      LEFT JOIN taman_ulasan u     ON t.id = u.taman_id
      LEFT JOIN taman_fasilitas tf ON t.id = tf.taman_id
      LEFT JOIN fasilitas_taman f  ON tf.fasilitas_id = f.id
      WHERE ${where.join(' AND ')}
      GROUP BY t.id, k.nama, kt.nama
      ORDER BY ${orderBy}
    `, params);

    const { rows: kategoriList }  = await db.query(`SELECT * FROM kategori_taman ORDER BY id`);
    const { rows: kecamatanList } = await db.query(`SELECT DISTINCT k.id, k.nama FROM kecamatan k JOIN taman t ON t.kecamatan_id=k.id ORDER BY k.nama`);

    res.render('taman', {
      taman, kategoriList, kecamatanList,
      filters: { q, kategori, kecamatan, tiket, sort, view },
      page: 'taman'
    });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Perbandingan taman
router.get('/bandingkan', async (req, res) => {
  try {
    const { id1, id2 } = req.query;
    let taman1 = null, taman2 = null;

    const queryDetail = async (id) => {
      if (!id) return null;
      const { rows } = await db.query(`
        SELECT t.*, k.nama AS kecamatan, kt.nama AS kategori,
          COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
          COUNT(DISTINCT u.id) AS jumlah_ulasan,
          COALESCE(JSON_AGG(DISTINCT f.nama) FILTER (WHERE f.nama IS NOT NULL),'[]'::json) AS fasilitas
        FROM taman t
        LEFT JOIN kecamatan k       ON t.kecamatan_id = k.id
        LEFT JOIN kategori_taman kt  ON t.kategori_id  = kt.id
        LEFT JOIN taman_ulasan u     ON t.id = u.taman_id
        LEFT JOIN taman_fasilitas tf ON t.id = tf.taman_id
        LEFT JOIN fasilitas_taman f  ON tf.fasilitas_id = f.id
        WHERE t.id = $1
        GROUP BY t.id, k.nama, kt.nama
      `, [id]);
      return rows[0] || null;
    };

    taman1 = await queryDetail(id1);
    taman2 = await queryDetail(id2);

    const { rows: semua } = await db.query(`SELECT id, nama_taman FROM taman WHERE status='aktif' ORDER BY nama_taman`);

    res.render('bandingkan', { taman1, taman2, semua, page: 'taman' });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Detail taman
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await db.query(`
      SELECT t.*, k.nama AS kecamatan, kt.nama AS kategori,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg,
        COUNT(DISTINCT u.id) AS jumlah_ulasan
      FROM taman t
      LEFT JOIN kecamatan k       ON t.kecamatan_id = k.id
      LEFT JOIN kategori_taman kt  ON t.kategori_id  = kt.id
      LEFT JOIN taman_ulasan u     ON t.id = u.taman_id
      WHERE t.id = $1
      GROUP BY t.id, k.nama, kt.nama
    `, [id]);

    if (!rows.length) return res.status(404).render('404');

    const { rows: fasilitas } = await db.query(`
      SELECT f.nama FROM fasilitas_taman f
      JOIN taman_fasilitas tf ON f.id = tf.fasilitas_id
      WHERE tf.taman_id = $1 ORDER BY f.nama
    `, [id]);

    const { rows: foto } = await db.query(`SELECT * FROM taman_foto WHERE taman_id=$1`, [id]);

    const { rows: ulasan } = await db.query(`
      SELECT u.*, COALESCE(us.username,'Anonim') AS username FROM taman_ulasan u
      LEFT JOIN users us ON u.user_id = us.id
      WHERE u.taman_id = $1 ORDER BY u.created_at DESC LIMIT 10
    `, [id]);

    // Rating distribution
    const { rows: ratingDist } = await db.query(`
      SELECT rating::int AS bintang, COUNT(*)::int AS jumlah
      FROM taman_ulasan WHERE taman_id=$1
      GROUP BY rating ORDER BY rating DESC
    `, [id]);

    // Terdekat
    const { rows: terdekat } = await db.query(`
      SELECT t.*, k.nama AS kecamatan,
        ROUND((6371 * acos(LEAST(1.0,
          cos(radians($1::float)) * cos(radians(t.latitude::float)) *
          cos(radians(t.longitude::float) - radians($2::float)) +
          sin(radians($1::float)) * sin(radians(t.latitude::float))
        )))::numeric, 1) AS jarak_km,
        COALESCE(ROUND(AVG(u.rating)::numeric,1),0) AS rating_avg
      FROM taman t
      LEFT JOIN kecamatan k ON t.kecamatan_id=k.id
      LEFT JOIN taman_ulasan u ON t.id=u.taman_id
      WHERE t.id != $3 AND t.status='aktif'
      GROUP BY t.id, k.nama
      ORDER BY jarak_km ASC LIMIT 3
    `, [rows[0].latitude, rows[0].longitude, id]);

    res.render('detail', {
      taman: rows[0], fasilitas, foto, ulasan, terdekat, ratingDist,
      getFasilitasIcon, page: 'taman'
    });
  } catch(err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
