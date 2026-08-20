const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc && rc.split) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function isSandboxActive(req) {
  const cookies = parseCookies(req);
  return cookies.cercaya_sandbox === 'true';
}
function isAdmin(req) {
  const cookies = parseCookies(req);
  return cookies.admin_session === 'true';
}

const d1Client = {
  async execute(sql, params = [], isSandbox = false) {
    if (typeof DB !== 'undefined') {
      const targetDB = (isSandbox && typeof DB_SANDBOX !== 'undefined') ? DB_SANDBOX : DB;
      const stmt = targetDB.prepare(sql).bind(...params);
      const res = await stmt.all();
      return { rows: res.results || [] };
    }
    
    const accountId = process.env.CF_ACCOUNT_ID;
    const databaseId = isSandbox 
      ? (process.env.CF_DATABASE_ID_SANDBOX || process.env.CF_DATABASE_ID) 
      : process.env.CF_DATABASE_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
      throw new Error("Faltan las variables de entorno de Cloudflare D1");
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(JSON.stringify(data.errors));
    }
    
    const resultObj = data.result[0] || {};
    return { rows: resultObj.results || [] };
  }
};

const pool = {
  async query(text, params = [], req = {}) {
    let sql = text;
    let args = params;
    const isSandbox = isSandboxActive(req);

    if (sql.includes('ANY($1::int[])') && Array.isArray(params[0])) {
      const arr = params[0];
      if (arr.length === 0) {
        sql = sql.replace(/WHERE business_id = ANY\(\$1::int\[\]\)/g, 'WHERE 1 = 0');
        args = [];
      } else {
        const placeholders = arr.map(() => '?').join(',');
        sql = sql.replace(/ANY\(\$1::int\[\]\)/g, `IN (${placeholders})`);
        args = arr;
      }
    } else {
      let index = 1;
      while (sql.includes(`$${index}`)) {
        sql = sql.replace(`$${index}`, '?');
        index++;
      }
    }

    const res = await d1Client.execute(sql, args, isSandbox);
    return res;
  }
};

async function inicializarTablasEn(isSandbox = false) {
  const dbWrapper = {
    async query(sql, params = []) {
      return await d1Client.execute(sql, params, isSandbox);
    }
  };

  await dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price_usd NUMERIC,
      role TEXT,
      desc TEXT
    );
  `);
  await dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    );
  `);
  await dbWrapper.query(`
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
    );
  `);
  await dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      user_id INTEGER,
      name TEXT,
      owner_name TEXT,
      category TEXT,
      reference TEXT,
      lat_lng TEXT,
      phone TEXT,
      plan_id INTEGER,
      bcv_rate NUMERIC,
      status TEXT,
      expires_at TEXT
    );
  `);
  await dbWrapper.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER,
      title TEXT,
      category TEXT,
      price_usd NUMERIC,
      status TEXT DEFAULT 'disponible',
      is_flash INTEGER DEFAULT 0,
      clicks_count INTEGER DEFAULT 0
    );
  `);

  try { await dbWrapper.query("ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'disponible'"); } catch(e) {}
  try { await dbWrapper.query("ALTER TABLE products ADD COLUMN is_flash INTEGER DEFAULT 0"); } catch(e) {}
  try { await dbWrapper.query("ALTER TABLE products ADD COLUMN clicks_count INTEGER DEFAULT 0"); } catch(e) {}
  try { await dbWrapper.query("ALTER TABLE businesses ADD COLUMN bcv_rate NUMERIC DEFAULT 36.50"); } catch(e) {}

  const plansCheck = await dbWrapper.query('SELECT COUNT(*) as count FROM plans');
  if (parseInt(plansCheck.rows[0]?.count || 0) === 0) {
    await dbWrapper.query(`
      INSERT INTO plans (name, price_usd, role, desc) VALUES
      ('Plan Ciudadano', 1.00, 'user', 'Acceso exclusivo al comparador de precios inteligente, buscador avanzado y alertas en todo el país.'),
      ('Emprendedor Casero', 3.00, 'merchant', 'Ideal para ventas desde casa. Límite de hasta 10 productos activos.');
    `);
  }

  const catCheck = await dbWrapper.query('SELECT COUNT(*) as count FROM categories');
  if (parseInt(catCheck.rows[0]?.count || 0) === 0) {
    await dbWrapper.query(`
      INSERT INTO categories (name) VALUES
      ('Comida y Víveres'), ('Frutas y Verduras'), ('Comida Rápida'), 
      ('Barbería y Peluquería'), ('Salón de Belleza y Uñas'), 
      ('Reparación y Servicio Técnico'), ('Electrodomésticos'), ('Repuestos y Autopartes'), ('Otros Servicios');
    `);
  }
}

async function conectarDB() {
  try {
    await inicializarTablasEn(false);
    await inicializarTablasEn(true);
    console.log("🚀 Conectado exitosamente a Cloudflare D1");
  } catch (e) {
    console.error("Error al conectar con Cloudflare D1:", e);
  }
}

conectarDB();

async function verificarAccesoNegocio(user, req) {
  if (user.status === 'pre-launch') return { bloqueado: false, prelaunch: true };
  if (user.status === 'active') return { bloqueado: false, prelaunch: false };
  
  const now = new Date();
  const expires = new Date(user.expires_at);
  if (now > expires) {
    return { bloqueado: true, prelaunch: false };
  }
  return { bloqueado: false, prelaunch: false };
}

const tailwindLayout = (title, content, req = {}) => {
  const sandboxActive = isSandboxActive(req);
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - CercaYa</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style> body { font-family: 'Inter', sans-serif; } </style>
    </head>
    <body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col justify-between relative">
      
      ${sandboxActive ? `
        <div class="bg-amber-500 text-slate-900 text-center font-black text-xs py-2 px-4 shadow-md uppercase tracking-wider sticky top-0 z-50 flex justify-between items-center gap-3">
          <span>⚠️ ZONA DE PRUEBAS (SANDBOX) PRIVADA ACTIVA • Base de Datos Aislada</span>
          <a href="/" class="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs hover:bg-slate-800 transition shadow-sm font-extrabold whitespace-nowrap">Ir a inicio en modo sandbox</a>
        </div>
      ` : ''}

      <div class="max-w-2xl w-full mx-auto px-4 py-6 flex-1">
        ${content}
      </div>

      <a href="/admin" class="fixed bottom-6 right-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 z-50 border-2 border-rose-500 transition-all hover:scale-105">
        🛡️ Panel Admin ${sandboxActive ? '(Test Activo)' : ''}
      </a>

      <footer class="text-center py-6 text-xs text-slate-400">
        CercaYa © 2026 • Impulsando el comercio local en Venezuela
      </footer>
    </body>
    </html>
  `;
};

// ==================== LANDING PAGE ====================
app.get('/', async (req, res) => {
  const plansRes = await pool.query('SELECT * FROM plans ORDER BY id ASC', [], req);
  const plans = plansRes.rows || [];
  let plansCards = plans.map(p => `
    <div class="bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-md hover:border-rose-500 transition space-y-2">
      <div class="flex justify-between items-center">
        <h4 class="font-extrabold text-slate-900 text-base">${p.name}</h4>
        <span class="bg-rose-50 text-rose-600 font-black text-sm px-3 py-1 rounded-full">$${Number(p.price_usd).toFixed(2)}/mes</span>
      </div>
      <p class="text-xs text-slate-600 leading-relaxed font-medium">${p.desc}</p>
    </div>
  `).join('');

  const body = `
    <header class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-3xl font-extrabold text-rose-600 tracking-tight flex items-center gap-1">📍 CercaYa</h1>
        <p class="text-xs text-slate-500 font-medium">Comparador de precios inteligente y local</p>
      </div>
      <div class="flex gap-2 text-xs font-semibold">
        <a href="/login" class="px-3.5 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition text-slate-700">Entrar</a>
        <a href="/register" class="px-3.5 py-2 bg-rose-600 text-white rounded-xl shadow-sm hover:bg-rose-700 transition">Registrarse</a>
      </div>
    </header>

    <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-xl mb-6 text-center space-y-3">
      <span class="bg-rose-500/20 text-rose-400 text-xs font-bold px-3.5 py-1 rounded-full border border-rose-500/35 inline-block">⚡ Tu ciudad en tiempo real</span>
      <h2 class="text-2xl font-black leading-tight">Encuentra el precio más bajo a pocos pasos de ti.</h2>
      <p class="text-xs text-slate-300 leading-relaxed">Únete a CercaYa por solo <b class="text-white">$1 al mes (Plan Ciudadano)</b> para acceder al comparador de precios inteligente y ahorrar en cada compra.</p>
      <div class="pt-2">
        <a href="/register" class="inline-block bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 px-6 rounded-xl shadow-lg transition">¡Crear mi cuenta ahora!</a>
      </div>
    </div>

    <div class="space-y-4 pt-2">
      <div class="text-center space-y-1">
        <h3 class="text-lg font-extrabold text-slate-900">💎 Planes Oficiales</h3>
        <p class="text-xs text-slate-500">Conoce el valor de cada membresía</p>
      </div>
      <div class="grid grid-cols-1 gap-3.5">
        ${plansCards}
      </div>
    </div>
  `;
  res.send(tailwindLayout('Bienvenido', body, req));
});

// ==================== PANEL CIUDADANO ====================
app.get('/citizen-dashboard', async (req, res) => {
  const userId = req.query.user_id;
  const userRes = await pool.query('SELECT * FROM users WHERE id = ? AND role = ?', [userId, 'user'], req);
  const user = userRes.rows[0];

  if (!user) return res.send("<h3>Acceso restringido. <a href='/login'>Iniciar Sesión</a></h3>");

  const catRes = await pool.query('SELECT * FROM categories', [], req);
  let categoryOptions = (catRes.rows || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  const body = `
    <header class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-2">
        <a href="/" class="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition">⬅️ Salir</a>
        <div>
          <h1 class="text-xl font-extrabold text-rose-600">📍 Panel Ciudadano</h1>
          <p class="text-[11px] text-slate-500">ID: <b class="text-rose-600">${user.account_id}</b> • <b>${user.full_name}</b></p>
        </div>
      </div>
      <a href="/login" class="text-xs font-semibold bg-rose-50 text-rose-600 px-3 py-2 rounded-xl hover:bg-rose-100 transition">Cerrar Sesión</a>
    </header>

    <div class="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-4 text-white shadow-lg mb-6 flex justify-between items-center">
      <div>
        <h2 class="text-sm font-semibold uppercase tracking-wider text-rose-100">📍 Ubicación Activa</h2>
        <p id="gps_status" class="text-xs text-rose-100 mt-0.5">Buscando los mejores precios a tu alrededor.</p>
      </div>
      <button onclick="obtenerGPSCliente()" class="bg-white/20 hover:bg-white/30 text-xs px-3 py-2 rounded-xl font-bold transition">Actualizar GPS</button>
    </div>

    <div class="flex gap-2 mb-4">
      <button onclick="cambiarTab('buscador')" id="btn_tab_buscador" class="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white shadow-sm transition">🔍 Comparador</button>
      <button onclick="cambiarTab('carrito')" id="btn_tab_carrito" class="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-sm transition">🛒 Lista Inteligente</button>
    </div>

    <div id="seccion_buscador" class="space-y-4">
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <input type="text" id="query" placeholder="🔍 Compara precios..." onkeyup="buscar()" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
        <select id="cat_filter" onchange="buscar()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700">
          <option value="">📂 Todas las Categorías</option>
          ${categoryOptions}
        </select>
      </div>
      <div id="resultados" class="space-y-4"></div>
    </div>

    <div id="seccion_carrito" class="space-y-4" style="display:none;">
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
        <div>
          <h3 class="font-extrabold text-slate-800 text-base">🛒 Asistente de Presupuesto</h3>
          <p class="text-xs text-slate-500">Escribe lo que necesitas y el sistema calculará dónde comprar más económico.</p>
        </div>
        <div class="flex gap-2">
          <input type="text" id="item_input" placeholder="Ej. Harina Pan..." class="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
          <button onclick="agregarItemLista()" class="bg-rose-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl">Agregar</button>
        </div>
        <div id="lista_compras_items" class="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span class="text-xs text-slate-400 italic">No hay productos agregados todavía.</span>
        </div>
        <button onclick="calcularRutaPresupuesto()" class="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl text-xs">⚡ Calcular Ruta de Menor Precio</button>
      </div>
      <div id="resultado_presupuesto" class="space-y-3"></div>
    </div>

    <script>
      let miListaDeCompras = [];

      function cambiarTab(tab) {
        if(tab === 'buscador') {
          document.getElementById('seccion_buscador').style.display = 'block';
          document.getElementById('seccion_carrito').style.display = 'none';
          document.getElementById('btn_tab_buscador').className = 'flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white shadow-sm transition';
          document.getElementById('btn_tab_carrito').className = 'flex-1 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-sm transition';
        } else {
          document.getElementById('seccion_buscador').style.display = 'none';
          document.getElementById('seccion_carrito').style.display = 'block';
          document.getElementById('btn_tab_carrito').className = 'flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white shadow-sm transition';
          document.getElementById('btn_tab_buscador').className = 'flex-1 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 shadow-sm transition';
        }
      }

      function agregarItemLista() {
        const input = document.getElementById('item_input');
        if(!input.value.trim()) return;
        miListaDeCompras.push(input.value.trim());
        input.value = '';
        actualizarVistaLista();
      }

      function eliminarItemLista(idx) {
        miListaDeCompras.splice(idx, 1);
        actualizarVistaLista();
      }

      function actualizarVistaLista() {
        const contenedor = document.getElementById('lista_compras_items');
        if(miListaDeCompras.length === 0) {
          contenedor.innerHTML = '<span class="text-xs text-slate-400 italic">No hay productos agregados todavía.</span>';
          return;
        }
        contenedor.innerHTML = miListaDeCompras.map((item, idx) => \`<span class="bg-white border border-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">\${item} <button onclick="eliminarItemLista(\${idx})" class="text-rose-500 font-bold">×</button></span>\`).join('');
      }

      async function calcularRutaPresupuesto() {
        if(miListaDeCompras.length === 0) return alert("Agrega productos.");
        const res = await fetch('/api/search');
        const json = await res.json();
        const productos = json.data || [];
        let totalUSD = 0, sugerencias = [], comercios = new Set();

        miListaDeCompras.forEach(busq => {
          const matches = productos.filter(p => p.title.toLowerCase().includes(busq.toLowerCase()) && p.status === 'disponible');
          if(matches.length > 0) {
            matches.sort((a,b) => a.price_usd - b.price_usd);
            totalUSD += matches[0].price_usd;
            comercios.add(matches[0].business_name);
            sugerencias.push({ buscado: busq, ...matches[0] });
          } else {
            sugerencias.push({ buscado: busq, encontrado: 'No disponible' });
          }
        });

        let html = \`<div class="bg-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-1"><h4 class="text-lg font-black">Total: $\${totalUSD.toFixed(2)}</h4><p class="text-xs text-slate-300">Locales a visitar: \${comercios.size}</p></div>\`;
        sugerencias.forEach(s => {
          const mapsUrl = s.lat_lng ? \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(s.lat_lng)}\` : '#';
          const mensajeWpp = encodeURIComponent(\`¡Hola! Vi su producto "\${s.title}" en CercaYa y me interesa.\`);
          const whatsappUrl = s.phone ? \`https://wa.me/\${s.phone.replace(/\\D/g,'')}?text=\${mensajeWpp}\` : '#';

          html += \`
            <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
              <span class="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">Buscaste: \${s.buscado}</span>
              <h5 class="font-bold text-slate-800 text-sm">\${s.title || s.encontrado}</h5>
              \${s.price_usd ? \`
                <div class="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
                  <span class="text-xs text-emerald-600 font-extrabold">$\${s.price_usd} (\${s.business_name})</span>
                  <div class="flex gap-2">
                    <a href="\${mapsUrl}" target="_blank" class="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow transition">📍 Ir</a>
                    <a href="\${whatsappUrl}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow transition">💬 WhatsApp</a>
                  </div>
                </div>
              \` : ''}
            </div>\`;
        });
        document.getElementById('resultado_presupuesto').innerHTML = html;
      }

      function obtenerGPSCliente() {
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('gps_status').innerText = "✅ GPS Activo (Ubicación detectada)";
            buscar();
          }, () => {
            document.getElementById('gps_status').innerText = "⚠️ No se pudo obtener la ubicación GPS.";
          });
        }
      }

      async function buscar() {
        const q = document.getElementById('query').value;
        const cat = document.getElementById('cat_filter').value;
        const res = await fetch(\`/api/search?query=\${encodeURIComponent(q)}&cat=\${encodeURIComponent(cat)}\`);
        const json = await res.json();
        
        let html = '';
        if(json.data.length === 0) {
          html = \`<div class="text-center py-12 bg-white rounded-2xl border"><p class="text-slate-400 text-sm">Sin resultados en este entorno.</p></div>\`;
        } else {
          json.data.forEach((item, index) => {
            const mapsUrl = \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(item.lat_lng || '10.2241,-67.5871')}\`;
            const mensajeWpp = encodeURIComponent(\`¡Hola! Vi su producto "\${item.title}" en CercaYa y me interesa.\`);
            const whatsappUrl = \`https://wa.me/\${item.phone ? item.phone.replace(/\\D/g,'') : ''}?text=\${mensajeWpp}\`;

            const isFlash = item.is_flash === 1;

            html += \`
              <div class="bg-white rounded-2xl p-4 shadow-sm border \${isFlash ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20' : (index === 0 ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-100')} relative">
                \${isFlash ? '<span class="absolute top-3 right-3 bg-amber-500 text-slate-900 text-[10px] font-black px-2.5 py-1 rounded-full uppercase shadow animate-pulse">⚡ OFERTA BOMBA</span>' : (index === 0 ? '<span class="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase">🔥 Mejor Precio</span>' : '')}
                <span class="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">\${item.category}</span>
                <h3 class="font-bold text-slate-800 text-base mt-2">\${item.title}</h3>
                <p class="text-xs text-slate-500">Negocio: <b>\${item.business_name}</b></p>
                <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl mt-3">
                  <span class="text-emerald-600 font-extrabold text-lg">$\${item.price_usd}</span>
                  <span class="text-xs text-slate-600 font-bold">Bs. \${item.price_ves}</span>
                </div>
                <div class="mt-3 flex gap-2 justify-end">
                  <a href="\${whatsappUrl}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow-sm flex items-center gap-1">💬 WhatsApp</a>
                  <a href="\${mapsUrl}" target="_blank" class="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow-sm">🗺️ Google Maps</a>
                </div>
              </div>
            \`;
          });
        }
        document.getElementById('resultados').innerHTML = html;
      }
      window.onload = buscar;
    </script>
  `;
  res.send(tailwindLayout('Panel Ciudadano', body, req));
});

// ==================== REGISTRO ====================
app.get('/register', async (req, res) => {
  const plansRes = await pool.query('SELECT * FROM plans ORDER BY id ASC', [], req);
  const catRes = await pool.query('SELECT * FROM categories', [], req);
  let planOpts = (plansRes.rows || []).map(p => `<option value="${p.id}">${p.name} ($${p.price_usd}/mes)</option>`).join('');
  let catOpts = (catRes.rows || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  const body = `
    <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
      <div class="flex items-center justify-between">
        <a href="/" class="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1">⬅️ Volver al Inicio</a>
        <span class="text-xs text-slate-400 font-medium">Paso 1 de 1</span>
      </div>
      <h2 class="text-2xl font-extrabold text-slate-800 text-center">📝 Registro CercaYa</h2>
      <form action="/api/register" method="POST" class="space-y-4">
        <div><label class="block text-xs font-bold uppercase mb-1">Plan:</label><select name="plan_id" id="plan_select" onchange="toggleNegocio()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm">${planOpts}</select></div>
        <div><label class="block text-xs font-bold uppercase mb-1">Correo:</label><input type="email" name="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <div><label class="block text-xs font-bold uppercase mb-1">Contraseña:</label><input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs font-bold uppercase mb-1">Nombre:</label><input type="text" name="full_name" class="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm" required></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Teléfono:</label><input type="text" name="phone" class="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm" required></div>
        </div>
        
        <div id="negocio_fields" style="display:none;" class="bg-rose-50/50 p-4 rounded-2xl space-y-3 border">
          <h3 class="text-xs font-bold text-rose-600 uppercase">Datos del Local</h3>
          <div><label class="block text-xs font-bold mb-1">Nombre del Local:</label><input type="text" name="business_name" class="w-full bg-white border rounded-xl px-3 py-2 text-sm"></div>
          <div><label class="block text-xs font-bold mb-1">Categoría:</label><select name="category" class="w-full bg-white border rounded-xl px-3 py-2 text-sm">${catOpts}</select></div>
          <div><label class="block text-xs font-bold mb-1">Referencia:</label><input type="text" name="reference" class="w-full bg-white border rounded-xl px-3 py-2 text-sm"></div>
          
          <div class="pt-1">
            <label class="block text-xs font-bold mb-1 text-slate-700">Ubicación GPS del Local:</label>
            <div class="flex gap-2">
              <input type="text" id="lat_lng" name="lat_lng" value="10.2241,-67.5871" readonly class="w-full bg-white border rounded-xl px-3 py-2 text-xs text-slate-600 font-mono">
              <button type="button" onclick="obtenerUbicacionRegistro()" class="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-xl whitespace-nowrap transition shadow-sm">📍 Obtener GPS</button>
            </div>
            <p id="gps_msg" class="text-[10px] text-slate-500 mt-1">Se usará para calcular la cercanía con los clientes.</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs font-bold uppercase mb-1">Pregunta Seg:</label><input type="text" name="sec_question" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Respuesta:</label><input type="text" name="sec_answer" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
        </div>
        <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition">Registrarse</button>
      </form>
    </div>
    <script>
      function toggleNegocio() {
        const val = document.getElementById('plan_select').value;
        document.getElementById('negocio_fields').style.display = (val == "1") ? "none" : "block";
      }
      
      function obtenerUbicacionRegistro() {
        const msg = document.getElementById('gps_msg');
        if(navigator.geolocation) {
          msg.innerText = "📡 Obteniendo coordenadas exactas...";
          navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            document.getElementById('lat_lng').value = lat + "," + lng;
            msg.innerText = "✅ ¡Ubicación GPS guardada con éxito!";
          }, err => {
            msg.innerText = "⚠️ No se pudo obtener el GPS. Se usará la predeterminada.";
          });
        } else {
          msg.innerText = "⚠️ Tu navegador no soporta geolocalización.";
        }
      }

      toggleNegocio();
    </script>
  `;
  res.send(tailwindLayout('Registro', body, req));
});

app.post('/api/register', async (req, res) => {
  const { email, password, full_name, plan_id, business_name, category, reference, phone, sec_question, sec_answer, lat_lng } = req.body;

  await pool.query(
    `INSERT INTO users (account_id, email, password, full_name, phone, role, status, expires_at, sec_question, sec_answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['CY-' + Math.floor(1000 + Math.random() * 9000), email, password, full_name, phone, parseInt(plan_id) === 1 ? 'user' : 'merchant', 'pre-launch', '2000-01-01', sec_question, sec_answer],
    req
  );
  
  const userRes = await pool.query('SELECT id, account_id FROM users WHERE email = ?', [email], req);
  const user = userRes.rows[0];

  if (parseInt(plan_id) !== 1 && business_name) {
    await pool.query(
      `INSERT INTO businesses (account_id, user_id, name, owner_name, category, reference, lat_lng, phone, plan_id, bcv_rate, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.account_id, user.id, business_name, full_name, category || 'Otros', reference || 'Céntrico', lat_lng || '10.2241,-67.5871', phone, parseInt(plan_id), 36.50, 'pre-launch', '2000-01-01'],
      req
    );
  }
  res.redirect('/login');
});

// ==================== LOGIN ====================
app.get('/login', (req, res) => {
  res.send(tailwindLayout('Login', `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border mt-10 space-y-4">
      <div class="flex items-center">
        <a href="/" class="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1">⬅️ Volver al Inicio</a>
      </div>
      <h2 class="text-2xl font-extrabold text-slate-800 text-center">🔐 Iniciar Sesión</h2>
      <form action="/api/login" method="POST" class="space-y-4">
        <div><label class="block text-xs font-bold uppercase mb-1">Correo:</label><input type="email" name="email" class="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm" required></div>
        <div><label class="block text-xs font-bold uppercase mb-1">Contraseña:</label><input type="password" name="password" class="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm" required></div>
        <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-md transition">Entrar</button>
      </form>
    </div>
  `, req));
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const userRes = await pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], req);
  const user = (userRes.rows || [])[0];
  if (!user) return res.send("<h3>Datos incorrectos. <a href='/login'>Volver</a></h3>");
  if (user.role === 'user') return res.redirect(`/citizen-dashboard?user_id=${user.id}`);
  
  const bizRes = await pool.query('SELECT * FROM businesses WHERE user_id = ?', [user.id], req);
  const business = (bizRes.rows || [])[0];
  if (business) return res.redirect(`/dashboard?user_id=${user.id}`);
  res.redirect('/');
});

// ==================== PANEL NEGOCIO ====================
app.get('/dashboard', async (req, res) => {
  const userId = req.query.user_id;
  const userRes = await pool.query('SELECT * FROM users WHERE id = ?', [userId], req);
  const user = (userRes.rows || [])[0];
  if (!user) return res.send("<h3>Acceso denegado. <a href='/login'>Volver al Login</a></h3>");

  const verificacion = await verificarAccesoNegocio(user, req);
  const bizRes = await pool.query('SELECT * FROM businesses WHERE user_id = ?', [userId], req);
  const business = (bizRes.rows || [])[0];

  // PANTALLA DE CUENTA BLOQUEADA POR FALTA DE PAGO (CON TU NÚMERO +58 4167455485)
  if (verificacion.bloqueado) {
    const mensajeWpp = encodeURIComponent(`¡Hola! Mi cuenta CercaYa está bloqueada por falta de pago. 
Datos de mi negocio:
- ID de Cuenta: ${user.account_id}
- Nombre del Negocio: ${business ? business.name : 'N/A'}
- Nombre del Propietario: ${user.full_name}
- Email: ${user.email}
Adjunto mi comprobante de pago de la mensualidad para la reactivación:`);
    
    return res.send(tailwindLayout('Cuenta Bloqueada', `
      <div class="bg-white rounded-3xl p-8 shadow-xl border border-rose-200 text-center space-y-6 mt-6">
        <div class="text-6xl">🚫</div>
        <div class="space-y-2">
          <h1 class="text-2xl font-black text-rose-600">CUENTA BLOQUEADA</h1>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">Tu periodo gratuito o membresía mensual ha finalizado. Para volver a mostrar tus productos en el mapa y en el comparador, envía tu comprobante.</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-2xl text-left text-xs space-y-1 border">
          <p class="font-bold text-slate-700">Datos de tu cuenta:</p>
          <p class="text-slate-500">ID: <b>${user.account_id}</b></p>
          <p class="text-slate-500">Correo: <b>${user.email}</b></p>
        </div>
        <a href="https://wa.me/584167455485?text=${mensajeWpp}" target="_blank" class="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg transition text-sm">
          ✅ Enviar Comprobante al WhatsApp
        </a>
        <div class="pt-2">
          <a href="/login" class="text-xs text-slate-400 hover:text-slate-600 font-bold">Cerrar Sesión</a>
        </div>
      </div>
    `, req));
  }

  if (!business) return res.send("<h3>Negocio no encontrado. <a href='/login'>Volver</a></h3>");

  const prodRes = await pool.query('SELECT * FROM products WHERE business_id = ?', [business.id], req);
  const products = prodRes.rows || [];
  const catRes = await pool.query('SELECT * FROM categories', [], req);
  let catOpts = (catRes.rows || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  let prodList = products.map(p => `
    <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-sm space-y-3">
      <div class="flex justify-between items-center">
        <div>
          <span class="font-bold text-slate-800">${p.title}</span>
          <div class="flex gap-2 items-center mt-0.5">
            <span class="text-[10px] font-extrabold text-emerald-600">$${p.price_usd}</span>
            <span class="text-[10px] text-slate-400">👁️ ${p.clicks_count || 0} visitas/clics</span>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <form action="/api/merchant/product/toggle-status" method="POST">
            <input type="hidden" name="product_id" value="${p.id}"><input type="hidden" name="user_id" value="${userId}">
            <button type="submit" class="text-[10px] font-bold px-2.5 py-1 rounded-full ${p.status === 'disponible' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
              ${p.status === 'disponible' ? '📦 Disponible' : '❌ Agotado'}
            </button>
          </form>
        </div>
      </div>

      <form action="/api/merchant/product/edit" method="POST" class="bg-white p-2.5 rounded-xl border flex flex-col gap-2">
        <input type="hidden" name="product_id" value="${p.id}"><input type="hidden" name="user_id" value="${userId}">
        <div class="flex gap-2">
          <input type="text" name="title" value="${p.title}" class="flex-1 bg-slate-50 border rounded-lg px-2 py-1 text-xs" required>
          <input type="number" step="0.01" name="price_usd" value="${p.price_usd}" class="w-20 bg-slate-50 border rounded-lg px-2 py-1 text-xs font-bold text-emerald-600" required>
        </div>
        <div class="flex justify-between items-center pt-1">
          <label class="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 cursor-pointer">
            <input type="checkbox" name="is_flash" value="1" ${p.is_flash === 1 ? 'checked' : ''} class="rounded text-amber-500 focus:ring-amber-400"> ⚡ Oferta Flash / Bomba
          </label>
          <button type="submit" class="bg-slate-900 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-slate-800 transition">💾 Guardar</button>
        </div>
      </form>
    </div>
  `).join('');

  res.send(tailwindLayout('Panel Negocio', `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <a href="/login" class="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition flex items-center gap-1">⬅️ Salir / Cambiar Cuenta</a>
        <span class="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-xl">🏪 Panel de Comercio</span>
      </div>

      ${verificacion.prelaunch ? `
        <div class="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 text-amber-900 shadow-sm space-y-1">
          <span class="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">⏳ Preventa Activa</span>
          <h3 class="font-extrabold text-sm mt-1">En espera de la gran apertura</h3>
          <p class="text-xs text-amber-800">Tus 14 días gratis y tu periodo de prueba se activarán automáticamente cuando el administrador inicie la gran apertura oficial de la plataforma.</p>
        </div>
      ` : ''}

      <div class="bg-white rounded-3xl p-6 shadow-sm border space-y-3">
        <h2 class="text-xl font-extrabold text-slate-800">${business.name}</h2>
        <p class="text-xs text-slate-500">ID: <b class="text-rose-600">${business.account_id}</b></p>
        
        <form action="/api/merchant/rate" method="POST" class="bg-slate-50 p-3 rounded-2xl border flex items-center gap-3">
          <input type="hidden" name="business_id" value="${business.id}"><input type="hidden" name="user_id" value="${userId}">
          <div class="flex-1">
            <label class="block text-[10px] font-bold text-slate-500 uppercase">Tasa del Dólar (Bs/USD):</label>
            <input type="number" step="0.01" name="bcv_rate" value="${business.bcv_rate || 36.50}" class="w-full bg-white border rounded-xl px-3 py-1.5 text-sm font-bold text-emerald-600" required>
          </div>
          <button type="submit" class="mt-4 bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-800 transition">Actualizar Tasa</button>
        </form>
      </div>

      <div class="bg-white rounded-3xl p-6 shadow-sm border">
        <h3 class="text-base font-bold text-slate-800 mb-2">📦 Publicar Producto</h3>
        <form action="/api/merchant/product" method="POST" class="space-y-3">
          <input type="hidden" name="business_id" value="${business.id}"><input type="hidden" name="user_id" value="${userId}">
          <div><label class="block text-xs font-bold uppercase mb-1">Título:</label><input type="text" name="title" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Categoría:</label><select name="category" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm">${catOpts}</select></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Precio USD:</label><input type="number" step="0.01" name="price_usd" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
          <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2">
            <input type="checkbox" name="is_flash" value="1" id="flash_new" class="rounded text-amber-500">
            <label for="flash_new" class="text-xs font-bold text-amber-800 cursor-pointer">⚡ Marcar como Oferta Flash / Precio BOMBA</label>
          </div>
          <button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-md transition">Publicar</button>
        </form>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border space-y-3">
        <h3 class="text-base font-bold mb-2">Inventario y Control de Stock</h3>
        <div class="space-y-3">${prodList || '<p class="text-xs text-slate-400">Sin productos.</p>'}</div>
      </div>
    </div>
  `, req));
});

// ==================== PANEL ADMIN PRIVADO ====================
app.get('/admin', async (req, res) => {
  if (!adminLoggedIn) {
    return res.send(tailwindLayout('Login Admin', `
      <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border mt-10 space-y-4">
        <div class="flex items-center">
          <a href="/" class="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1">⬅️ Volver al Inicio</a>
        </div>
        <h2 class="text-xl font-extrabold text-slate-800 text-center">🛡️ Acceso Restringido Admin</h2>
        <form action="/api/admin/login" method="POST" class="space-y-3">
          <div><label class="block text-xs font-bold uppercase mb-1">Usuario Admin:</label><input type="text" name="username" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Contraseña:</label><input type="password" name="password" class="w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm" required></div>
          <button type="submit" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition">Entrar al Panel</button>
        </form>
      </div>
    `, req));
  }

  const tab = req.query.tab || 'citizen';
  const sandboxActive = isSandboxActive(req);
  const usersRes = await pool.query(tab === 'merchant' ? "SELECT * FROM users WHERE role = 'merchant'" : "SELECT * FROM users WHERE role = 'user'", [], req);
  const usersList = usersRes.rows || [];

  let listHtml = usersList.map(u => `
    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 space-y-3">
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold text-slate-800 text-base">${u.full_name} <span class="text-rose-600 text-xs">(${u.account_id})</span></h4>
          <p class="text-xs text-slate-500">📧 ${u.email} • 📱 ${u.phone}</p>
        </div>
        <span class="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">${u.status}</span>
      </div>

      <div class="flex flex-wrap gap-2 pt-1">
        ${tab === 'merchant' ? `
          <a href="/api/admin/unlock-user?id=${u.id}&tab=${tab}" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-2 rounded-xl shadow transition">
            ✅ Pago Cancelado y Desbloquear
          </a>
        ` : ''}
      </div>

      <form action="/api/admin/user/edit" method="POST" class="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
        <input type="hidden" name="user_id" value="${u.id}"><input type="hidden" name="tab" value="${tab}">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] font-bold text-slate-400 uppercase">Nombre:</label>
            <input type="text" name="full_name" value="${u.full_name}" class="w-full bg-slate-50 border rounded-lg px-2 py-1 text-xs" required>
          </div>
          <div>
            <label class="text-[10px] font-bold text-slate-400 uppercase">Teléfono:</label>
            <input type="text" name="phone" value="${u.phone}" class="w-full bg-slate-50 border rounded-lg px-2 py-1 text-xs" required>
          </div>
        </div>
        <div class="flex justify-between items-center pt-1">
          <button type="submit" class="bg-slate-800 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg">💾 Actualizar Datos</button>
          <a href="/api/admin/user/delete?id=${u.id}&tab=${tab}" onclick="return confirm('¿Seguro que deseas eliminar esta cuenta?')" class="text-rose-600 font-bold text-[10px] hover:underline">🗑️ Eliminar Cuenta</a>
        </div>
      </form>
    </div>
  `).join('');

  res.send(tailwindLayout('Admin Panel', `
    <div class="space-y-6">
      <div class="bg-white rounded-3xl p-6 shadow-sm border space-y-4">
        <div class="flex justify-between items-center">
          <a href="/" class="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1">⬅️ Volver a Inicio</a>
          <span class="text-xs text-slate-400 font-medium">Panel de Control General</span>
        </div>

        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800">🛡️ Admin CercaYa</h2>
            <p class="text-xs text-slate-500">Entorno Privado: <b class="${sandboxActive ? 'text-amber-600' : 'text-emerald-600'}">${sandboxActive ? 'SANDBOX (Tus pruebas)' : 'PRODUCCIÓN'}</b></p>
          </div>
          <form action="/api/admin/toggle-env" method="POST">
            <button type="submit" class="font-bold text-xs px-4 py-3 rounded-2xl shadow transition ${sandboxActive ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}">
              ${sandboxActive ? '🟢 Apagar mi Sandbox' : '⚪ Encender mi Sandbox'}
            </button>
          </form>
        </div>

        <div class="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-md space-y-2">
          <span class="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">⚡ Control de Preventa</span>
          <h3 class="font-extrabold text-base">Gran Apertura Oficial</h3>
          <p class="text-xs text-indigo-200">Al presionar este botón, todos los negocios en espera (pre-launch) iniciarán sus 14 días gratis simultáneamente. Los registros futuros correrán normal.</p>
          <div class="pt-2">
            <a href="/api/admin/start-grand-opening" onclick="return confirm('¿Iniciar gran apertura para todos los usuarios en espera?')" class="inline-block bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-5 py-3 rounded-xl shadow transition">
              🚀 INICIO DE GRAN APERTURA
            </a>
          </div>
        </div>

        ${sandboxActive ? `
          <div class="pt-2 border-t border-slate-100 flex justify-between items-center">
            <span class="text-xs text-slate-500 font-medium">¿Deseas limpiar todos los registros de prueba creados?</span>
            <a href="/api/admin/clear-sandbox" onclick="return confirm('¿Estás seguro de borrar todas las cuentas del sandbox?')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs px-3 py-2 rounded-xl transition">🗑️ Borrar Sandbox</a>
          </div>
        ` : ''}
      </div>

      <div class="flex gap-2">
        <a href="/admin?tab=citizen" class="flex-1 py-3 rounded-2xl text-center text-xs font-bold transition shadow-sm ${tab === 'citizen' ? 'bg-rose-600 text-white' : 'bg-white text-slate-700 border'}">
          👥 Plan Ciudadano
        </a>
        <a href="/admin?tab=merchant" class="flex-1 py-3 rounded-2xl text-center text-xs font-bold transition shadow-sm ${tab === 'merchant' ? 'bg-rose-600 text-white' : 'bg-white text-slate-700 border'}">
          🏪 Comercios y Negocios
        </a>
      </div>

      <div class="bg-white rounded-3xl p-6 shadow-sm border">
        <h3 class="text-base font-bold mb-4">Cuentas Registradas en este Módulo</h3>
        <div>${listHtml || '<p class="text-xs text-slate-400">No hay cuentas registradas en este módulo.</p>'}</div>
      </div>

      <div class="text-center pt-2">
        <a href="/api/admin/logout" class="text-xs font-bold text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">Cerrar Sesión de Administrador</a>
      </div>
    </div>
  `, req));
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'Eudis' && password === 'mercy123') {
    adminLoggedIn = true;
    res.setHeader('Set-Cookie', 'cercaya_sandbox=true; Path=/; HttpOnly');
    return res.redirect('/admin');
  }
  res.send("<h3>Credenciales incorrectas. <a href='/admin'>Volver</a></h3>");
});

app.post('/api/admin/toggle-env', (req, res) => {
  if (adminLoggedIn) {
    const sandboxActive = isSandboxActive(req);
    const newState = !sandboxActive;
    res.setHeader('Set-Cookie', `cercaya_sandbox=${newState}; Path=/; HttpOnly`);
  }
  res.redirect('/admin');
});

app.get('/api/admin/start-grand-opening', async (req, res) => {
  if (adminLoggedIn) {
    const finTrial = new Date();
    finTrial.setDate(finTrial.getDate() + 14); // 14 días a partir de hoy
    await pool.query("UPDATE users SET status = 'trialing', expires_at = ? WHERE status = 'pre-launch'", [finTrial.toISOString()], req);
  }
  res.redirect('/admin?tab=merchant');
});

app.get('/api/admin/unlock-user', async (req, res) => {
  if (adminLoggedIn) {
    const userId = req.query.id;
    const tab = req.query.tab || 'merchant';
    const nuevaFecha = new Date();
    nuevaFecha.setMonth(nuevaFecha.getMonth() + 1); // 1 mes completo más
    
    await pool.query("UPDATE users SET status = 'active', expires_at = ? WHERE id = ?", [nuevaFecha.toISOString(), userId], req);
    return res.redirect(`/admin?tab=${tab}`);
  }
  res.redirect('/admin');
});

app.get('/api/admin/clear-sandbox', async (req, res) => {
  if (adminLoggedIn && isSandboxActive(req)) {
    await pool.query('DELETE FROM users', [], req);
    await pool.query('DELETE FROM businesses', [], req);
    await pool.query('DELETE FROM products', [], req);
  }
  res.redirect('/admin');
});

app.get('/api/admin/logout', (req, res) => {
  adminLoggedIn = false;
  res.setHeader('Set-Cookie', 'cercaya_sandbox=false; Path=/; HttpOnly');
  res.redirect('/admin');
});

app.post('/api/admin/user/edit', async (req, res) => {
  if (adminLoggedIn) {
    const { user_id, full_name, phone, tab } = req.body;
    await pool.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [full_name, phone, user_id], req);
    return res.redirect(`/admin?tab=${tab || 'citizen'}`);
  }
  res.redirect('/admin');
});

app.get('/api/admin/user/delete', async (req, res) => {
  if (adminLoggedIn) {
    const userId = req.query.id;
    const tab = req.query.tab || 'citizen';
    await pool.query('DELETE FROM users WHERE id = ?', [userId], req);
    await pool.query('DELETE FROM businesses WHERE user_id = ?', [userId], req);
    return res.redirect(`/admin?tab=${tab}`);
  }
  res.redirect('/admin');
});

app.post('/api/merchant/rate', async (req, res) => {
  const { business_id, user_id, bcv_rate } = req.body;
  await pool.query('UPDATE businesses SET bcv_rate = ? WHERE id = ?', [parseFloat(bcv_rate) || 36.50, business_id], req);
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/merchant/product', async (req, res) => {
  const { business_id, user_id, title, category, price_usd, is_flash } = req.body;
  await pool.query('INSERT INTO products (business_id, title, category, price_usd, status, is_flash, clicks_count) VALUES (?, ?, ?, ?, ?, ?, ?)', [business_id, title, category, parseFloat(price_usd), 'disponible', is_flash ? 1 : 0, 0], req);
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/merchant/product/edit', async (req, res) => {
  const { product_id, user_id, title, price_usd, is_flash } = req.body;
  await pool.query('UPDATE products SET title = ?, price_usd = ?, is_flash = ? WHERE id = ?', [title, parseFloat(price_usd), is_flash ? 1 : 0, product_id], req);
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/merchant/product/toggle-status', async (req, res) => {
  const { product_id, user_id } = req.body;
  const pRes = await pool.query('SELECT status FROM products WHERE id = ?', [product_id], req);
  const p = pRes.rows[0];
  if (p) {
    const newStatus = p.status === 'disponible' ? 'agotado' : 'disponible';
    await pool.query('UPDATE products SET status = ? WHERE id = ?', [newStatus, product_id], req);
  }
  res.redirect(`/dashboard?user_id=${user_id}`);
});

// ==================== BÚSQUEDA / MAPA (FILTRO ANTI-VIVOS) ====================
app.get('/api/search', async (req, res) => {
  const query = (req.query.query || '').toLowerCase();
  const catFilter = req.query.cat || '';
  
  // Anti-vivos: Solo trae negocios cuyos usuarios estén 'active' o en 'trialing' vigentes. Los bloqueados o pre-launch no aparecen en el mapa.
  const bizRes = await pool.query(`
    SELECT b.* FROM businesses b 
    JOIN users u ON b.user_id = u.id 
    WHERE u.status IN ('active', 'trialing') 
    AND (u.status = 'active' OR u.expires_at > datetime('now'))
  `, [], req);
  
  const businesses = bizRes.rows || [];
  const bizIds = businesses.map(b => b.id);
  
  if (bizIds.length === 0) return res.json({ data: [] });

  const prodRes = await pool.query(`SELECT * FROM products`, [], req);
  const products = prodRes.rows || [];
  let results = [];

  products.forEach(p => {
    const biz = businesses.find(b => b.id === p.business_id);
    if (biz) {
      const matchQuery = p.title.toLowerCase().includes(query) || biz.name.toLowerCase().includes(query);
      const matchCat = catFilter === '' || p.category === catFilter;
      if (matchQuery && matchCat) {
        const tasa = parseFloat(biz.bcv_rate || 36.50);
        results.push({
          id: p.id,
          title: p.title,
          category: p.category,
          price_usd: p.price_usd,
          price_ves: (p.price_usd * tasa).toFixed(2),
          business_name: biz.name,
          lat_lng: biz.lat_lng,
          phone: biz.phone,
          status: p.status || 'disponible',
          is_flash: p.is_flash || 0
        });
      }
    }
  });

  results.sort((a, b) => {
    if (a.is_flash !== b.is_flash) return b.is_flash - a.is_flash;
    return a.price_usd - b.price_usd;
  });
  res.json({ data: results });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 CercaYa activo en puerto ${PORT}`); });
