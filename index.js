require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const session = require('express-session');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session untuk admin
app.use(session({
  secret: process.env.SESSION_SECRET || 'tamanmedan-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 hari
}));

// Teruskan query ke template (untuk pesan sukses/error)
app.use((req, res, next) => {
  res.locals.query = req.query;
  next();
});

app.use('/',       require('./routes/home'));
app.use('/peta',   require('./routes/peta'));
app.use('/taman',  require('./routes/taman'));
app.use('/about',  require('./routes/about'));
app.use('/api',    require('./routes/api'));
app.use('/admin',  require('./routes/admin'));

app.use((req, res) => res.status(404).render('404'));

// ========== PERUBAHAN UNTUK DEPLOY (Vercel) ==========
// Hanya jalankan server jika bukan di environment production Vercel
// Di production, Vercel akan memanggil app sebagai serverless function.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🌿 TamanMedan berjalan di http://localhost:${PORT}`);
    console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
  });
}

// WAJIB: export app untuk Vercel (dan tetap bisa di-run secara normal di lokal)
module.exports = app;
