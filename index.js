const express = require('express');
const cookieParser = require('cookie-parser');
const { createClient } = require('@libsql/client');

const app = express();
const port = process.env.PORT || 10000;

// Configuración de middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Configuración de la base de datos (Cloudflare D1 / Turso / LibSQL)
const pool = createClient({
  url: process.env.DATABASE_URL || 'libsql://cercaya-db.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || ''
});

// Inicialización de tablas esenciales por seguridad
async function initDB() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT,
        email TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        phone TEXT,
        role TEXT,
        status TEXT,
        expires_at TEXT,
        sec_question TEXT,
        sec_answer TEXT
      )
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT,
        user_id INTEGER,
        name TEXT,
        owner TEXT,
        category TEXT,
        reference TEXT,
        lat_lng TEXT,
        phone TEXT,
        plan_id INTEGER,
        price REAL,
        status TEXT,
        expires_at TEXT
      )
    `);
    console.log("Base de datos verificada y lista.");
  } catch (e) {
    console.error("Error al inicializar tablas:", e);
  }
}
initDB();

// Layout base con Tailwind CSS integrado
function tailwindLayout(title, content) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - CercaYa</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-50 text-slate-800 font-sans antialiased min-h-screen flex flex-col justify-between">
      <div class="max-w-4xl mx-auto px-4 py-8 w-full">
        ${content}
      </div>
      <footer class="text-center py-6 text-xs text-slate-400">
        &copy; 2026 CercaYa - Todos los derechos reservados.
      </footer>
    </body>
    </html>
  `;
}
