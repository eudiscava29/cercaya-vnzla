const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'db.json');

function getDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      plans: [
        { id: 1, name: 'Plan Ciudadano', price_usd: 1.00, role: 'user', desc: 'Acceso exclusivo al comparador de precios inteligente, buscador avanzado y alertas en todo el país.' },
        { id: 2, name: 'Emprendedor Casero', price_usd: 3.00, role: 'merchant', desc: 'Ideal para ventas desde casa. Límite de hasta 10 productos activos.' },
        { id: 3, name: 'Comercio Local / Bodega', price_usd: 7.00, role: 'merchant', desc: 'Para negocios de barrio. Límite de hasta 50 productos y presencia en múltiples categorías.' },
        { id: 4, name: 'Gran Comercio Céntrico', price_usd: 15.00, role: 'merchant', desc: 'Inventario totalmente ilimitado, máxima visibilidad y estadísticas avanzadas.' }
      ],
      categories: [
        'Comida y Víveres', 'Frutas y Verduras', 'Comida Rápida', 
        'Barbería y Peluquería', 'Salón de Belleza y Uñas', 
        'Reparación y Servicio Técnico', 'Electrodomésticos', 'Repuestos y Autopartes', 'Otros Servicios'
      ],
      users: [],
      businesses: [],
      products: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }

  let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  
  // Verificador automático de vencimiento para negocios
  const now = new Date().getTime();
  let changed = false;
  db.businesses.forEach(b => {
    if (b.status !== 'blocked') {
      const limitDate = new Date(b.expires_at).getTime();
      if (now > limitDate) {
        b.status = 'blocked';
        changed = true;
      }
    }
  });

  // Verificador automático de vencimiento para ciudadanos ($1/mes)
  db.users.forEach(u => {
    if (u.role === 'user' && u.status !== 'blocked') {
      const limitDate = new Date(u.expires_at || new Date()).getTime();
      if (now > limitDate) {
        u.status = 'blocked';
        changed = true;
      }
    }
  });

  if (changed) saveDB(db);

  return db;
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const tailwindLayout = (title, content) => `
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
  <body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col justify-between">
    <div class="max-w-2xl w-full mx-auto px-4 py-6">
      ${content}
    </div>
    <footer class="text-center py-6 text-xs text-slate-400">
      CercaYa © 2026 • Impulsando el comercio local en Venezuela
    </footer>
  </body>
  </html>
`;

// ==================== 1. LANDING PAGE PÚBLICA ====================
app.get('/', (req, res) => {
  const db = getDB();
  let plansCards = db.plans.map(p => `
    <div class="bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-md hover:border-rose-500 transition space-y-2">
      <div class="flex justify-between items-center">
        <h4 class="font-extrabold text-slate-900 text-base">${p.name}</h4>
        <span class="bg-rose-50 text-rose-600 font-black text-sm px-3 py-1 rounded-full">$${p.price_usd.toFixed(2)}/mes</span>
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
        <a href="/admin-login" class="px-2.5 py-2 bg-slate-800 text-white rounded-xl shadow-sm hover:bg-slate-900 transition">Admin</a>
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
        <h3 class="text-lg font-extrabold text-slate-900">💎 Planes Diseñados para Ti</h3>
        <p class="text-xs text-slate-500">Conoce el valor y la justificación de cada membresía</p>
      </div>
      <div class="grid grid-cols-1 gap-3.5">
        ${plansCards}
      </div>
    </div>
  `;

  res.send(tailwindLayout('Bienvenido', body));
});

// ==================== 2. PANEL EXCLUSIVO DEL PLAN CIUDADANO ($1/mes) ====================
app.get('/citizen-dashboard', (req, res) => {
  const userId = req.query.user_id;
  const db = getDB();
  const user = db.users.find(u => u.id == userId && u.role === 'user');

  if (!user) return res.send("<h3>Acceso restringido para Plan Ciudadano. <a href='/login'>Iniciar Sesión</a></h3>");

  if (user.status === 'blocked') {
    const waMsg = encodeURIComponent(`Hola Admin Mercy, quiero pagar la mensualidad de mi cuenta Ciudadana. \n🆔 ID: ${user.account_id}\n👤 Nombre: ${user.full_name}\n📞 Tel: ${user.phone}`);
    const blockedBody = `
      <div class="max-w-md mx-auto bg-rose-50 border border-rose-100 rounded-3xl p-6 text-center mt-10">
        <h2 class="text-xl font-extrabold text-rose-600 mb-2">⚠️ Cuenta Bloqueada</h2>
        <p class="text-xs text-slate-600 mb-2">Tu periodo de prueba de 14 días o mes activo ha vencido.</p>
        <p class="text-[11px] font-bold text-slate-500 mb-4">ID de Cuenta: <span class="text-rose-600">${user.account_id}</span></p>
        <a href="https://wa.me/584167455485?text=${waMsg}" target="_blank" class="block w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mb-3">
          📲 Enviar Comprobante al WhatsApp de Admin
        </a>
        <a href="/login" class="text-xs text-slate-500 hover:underline">Cerrar sesión</a>
      </div>
    `;
    return res.send(tailwindLayout('Bloqueado', blockedBody));
  }

  let categoryOptions = db.categories.map(c => `<option value="${c}">${c}</option>`).join('');

  const body = `
    <header class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-extrabold text-rose-600">📍 Panel Ciudadano</h1>
        <p class="text-xs text-slate-500">ID: <b class="text-rose-600">${user.account_id}</b> • Bienvenido, <b>${user.full_name}</b></p>
      </div>
      <a href="/login" class="text-xs font-semibold bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl hover:bg-rose-100 transition">Cerrar Sesión</a>
    </header>

    <div class="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-4 text-white shadow-lg mb-6">
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-rose-100">📍 Ubicación Activa</h2>
        <button onclick="obtenerGPSCliente()" class="bg-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded-xl font-bold transition">Actualizar GPS</button>
      </div>
      <p id="gps_status" class="text-xs text-rose-100">Buscando los mejores precios a tu alrededor en todo el país.</p>
    </div>

    <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-6 space-y-3">
      <div class="relative">
        <input type="text" id="query" placeholder="🔍 Compara precios: Busca harina, repuestos, servicios..." onkeyup="buscar()" class="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
      </div>
      <select id="cat_filter" onchange="buscar()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500">
        <option value="">📂 Todas las Categorías</option>
        ${categoryOptions}
      </select>
    </div>

    <div id="resultados" class="space-y-4"></div>

    <script>
      function obtenerGPSCliente() {
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('gps_status').innerText = "✅ GPS Activo (" + pos.coords.latitude.toFixed(4) + ", " + pos.coords.longitude.toFixed(4) + ")";
            alert("¡Ubicación detectada con éxito!");
            buscar();
          }, () => alert("No se pudo obtener la ubicación GPS."));
        }
      }

      async function buscar() {
        const q = document.getElementById('query').value;
        const cat = document.getElementById('cat_filter').value;

        const res = await fetch(\`/api/search?query=\${encodeURIComponent(q)}&cat=\${encodeURIComponent(cat)}\`);
        const json = await res.json();
        
        let html = '';
        if(json.data.length === 0) {
          html = \`<div class="text-center py-12 bg-white rounded-2xl border border-slate-100"><p class="text-slate-400 text-sm">No hay productos o servicios coincidentes.</p></div>\`;
        } else {
          json.data.forEach((item, index) => {
            const waText = encodeURIComponent("Hola, vi su producto " + item.title + " en CercaYa");
            const esElMasBarato = index === 0;
            
            html += \`
              <div class="bg-white rounded-2xl p-4 shadow-sm border \${esElMasBarato ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-100'} relative">
                \${esElMasBarato ? '<span class="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">🔥 ¡Opción Más Barata!</span>' : ''}
                
                <span class="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">\${item.category}</span>
                <h3 class="font-bold text-slate-800 text-base mt-2 mb-1">\${item.title}</h3>
                <p class="text-xs text-slate-500 mb-1">Negocio: <span class="font-semibold text-slate-700">\${item.business_name}</span></p>
                <p class="text-[11px] text-rose-600 font-medium mb-3">📍 Ref: \${item.reference}</p>
                
                <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl mb-3">
                  <div>
                    <span class="text-xs text-slate-400 block">Comparador USD</span>
                    <span class="text-emerald-600 font-extrabold text-lg">$\${item.price_usd} USD</span>
                  </div>
                  <div class="text-right">
                    <span class="text-xs text-slate-400 block">En Bolívares</span>
                    <span class="text-slate-700 font-bold text-sm">Bs. \${item.price_ves}</span>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <a href="\${item.map_url}" target="_blank" class="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-xl transition">
                    🗺️ Ver en Mapa
                  </a>
                  <a href="https://wa.me/58\${item.phone.replace(/[^0-9]/g, '')}?text=\${waText}" target="_blank" class="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2.5 px-3 rounded-xl shadow-sm transition">
                    💬 Pedir por WhatsApp
                  </a>
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

  res.send(tailwindLayout('Panel Ciudadano', body));
});

// ==================== 3. REGISTRO DE CUENTAS ====================
app.get('/register', (req, res) => {
  const db = getDB();
  let planOpts = db.plans.map(p => `<option value="${p.id}">${p.name} ($${p.price_usd}/mes)</option>`).join('');
  let catOpts = db.categories.map(c => `<option value="${c}">${c}</option>`).join('');

  const body = `
    <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div class="flex items-center mb-4">
        <a href="/" class="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl transition">⬅️ Volver al Inicio</a>
      </div>
      
      <div class="text-center mb-6">
        <h2 class="text-2xl font-extrabold text-slate-800">📝 Registro CercaYa</h2>
        <p class="text-xs text-slate-500 mt-1">Crea tu cuenta con <span class="text-rose-600 font-semibold">14 días de prueba gratis</span>.</p>
      </div>

      <form action="/api/register" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tipo de Cuenta / Plan:</label>
          <select name="plan_id" id="plan_select" onchange="toggleNegocio()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
            ${planOpts}
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Correo Electrónico:</label>
          <input type="email" name="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña:</label>
          <input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre Completo:</label>
            <input type="text" name="full_name" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Teléfono / WhatsApp:</label>
            <input type="text" name="phone" placeholder="04121234567" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
          </div>
        </div>

        <!-- Campos exclusivos para Negocios -->
        <div id="negocio_fields" style="display:none;" class="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl space-y-3">
          <h3 class="text-xs font-bold text-rose-600 uppercase tracking-wider">Información y Ubicación del Negocio</h3>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Nombre del Local o Emprendimiento:</label>
            <input type="text" name="business_name" placeholder="Ej. Bodega La Esquina" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Categoría Principal:</label>
            <select name="category" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500">${catOpts}</select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Lugar de Referencia para Llegar:</label>
            <input type="text" name="reference" placeholder="Ej. Cerca de la plaza central..." class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Ubicación GPS Precisa del Local:</label>
            <input type="text" name="lat_lng" id="lat_lng_input" placeholder="Coordenadas GPS" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2" readonly>
            <button type="button" onclick="capturarUbicacionNegocio()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition">
              📍 Registrar Ubicación GPS Precisa
            </button>
          </div>
        </div>

        <hr class="border-slate-100 my-2">

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Pregunta de Seguridad:</label>
            <input type="text" name="sec_question" placeholder="Ej. Tu primera mascota" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Respuesta:</label>
            <input type="text" name="sec_answer" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
          </div>
        </div>

        <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mt-4">
          Registrarse en CercaYa
        </button>
      </form>
    </div>

    <script>
      function toggleNegocio() {
        const val = document.getElementById('plan_select').value;
        const fields = document.getElementById('negocio_fields');
        fields.style.display = (val == "1") ? "none" : "block";
      }
      function capturarUbicacionNegocio() {
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('lat_lng_input').value = pos.coords.latitude + "," + pos.coords.longitude;
            alert("¡Ubicación GPS precisa registrada con éxito!");
          }, () => alert("Error al capturar la ubicación del negocio."));
        }
      }
      toggleNegocio();
    </script>
  `;

  res.send(tailwindLayout('Registro', body));
});

// ==================== 4. LOGIN Y ACCESO ADMIN ====================
app.get('/login', (req, res) => {
  const body = `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4">
        <a href="/" class="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl transition">⬅️ Volver al Inicio</a>
      </div>
      
      <div class="text-center mb-6">
        <h2 class="text-2xl font-extrabold text-slate-800">🔐 Iniciar Sesión</h2>
        <p class="text-xs text-slate-500 mt-1">Accede a tu panel en CercaYa</p>
      </div>

      <form action="/api/login" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Correo Electrónico:</label>
          <input type="email" name="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña:</label>
          <input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none" required>
        </div>
        <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition">
          Entrar
        </button>
      </form>

      <div class="flex justify-between items-center text-xs text-slate-500 mt-4">
        <a href="/forgot" class="hover:underline">¿Olvidaste tu contraseña?</a>
        <a href="/register" class="text-rose-600 font-semibold hover:underline">Registrarse</a>
      </div>
    </div>
  `;
  res.send(tailwindLayout('Iniciar Sesión', body));
});

app.get('/admin-login', (req, res) => {
  const body = `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4">
        <a href="/" class="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl transition">⬅️ Volver al Inicio</a>
      </div>

      <div class="text-center mb-6">
        <h2 class="text-2xl font-extrabold text-slate-800">🛡️ Acceso de Administrador</h2>
        <p class="text-xs text-slate-500 mt-1">Introduce tus credenciales de sistema</p>
      </div>

      <form action="/api/admin-login" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Usuario Admin:</label>
          <input type="text" name="username" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none" required>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña Admin:</label>
          <input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none" required>
        </div>
        <button type="submit" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl shadow-md transition">
          Ingresar al Panel Admin
        </button>
      </form>
    </div>
  `;
  res.send(tailwindLayout('Login Admin', body));
});

// ==================== 5. RECUPERAR CONTRASEÑA ====================
app.get('/forgot', (req, res) => {
  const emailQuery = req.query.email || '';
  const db = getDB();
  const user = db.users.find(u => u.email === emailQuery);

  const body = `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4">
        <a href="/login" class="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl transition">⬅️ Volver al Login</a>
      </div>

      <div class="text-center mb-6">
        <h2 class="text-2xl font-extrabold text-slate-800">🔄 Recuperar Contraseña</h2>
        <p class="text-xs text-slate-500 mt-1">Ingresa tu correo para verificar tu pregunta de seguridad</p>
      </div>

      ${!user ? `
        <form action="/forgot" method="GET" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Correo Electrónico:</label>
            <input type="email" name="email" value="${emailQuery}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>
          </div>
          <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition">Siguiente</button>
        </form>
      ` : `
        <form action="/api/forgot" method="POST" class="space-y-4">
          <input type="hidden" name="email" value="${user.email}">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tu Pregunta de Seguridad:</label>
            <div class="bg-slate-100 p-3 rounded-xl text-sm font-semibold text-slate-700">${user.sec_question}</div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Escribe tu Respuesta:</label>
            <input type="text" name="sec_answer" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nueva Contraseña:</label>
            <input type="password" name="new_password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>
          </div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition">Cambiar Contraseña</button>
        </form>
      `}
    </div>
  `;
  res.send(tailwindLayout('Recuperar Clave', body));
});

// ==================== 6. PANEL DE CONTROL DE NEGOCIO ====================
app.get('/dashboard', (req, res) => {
  const userId = req.query.user_id;
  const db = getDB();
  const business = db.businesses.find(b => b.user_id == userId);

  if (!business) return res.send("<h3>Acceso denegado. <a href='/login'>Volver</a></h3>");

  if (business.status === 'blocked') {
    const waMsg = encodeURIComponent(`Hola Admin Mercy, quiero pagar la mensualidad para desbloquear mi cuenta. \n🆔 ID: ${business.account_id}\n🏢 Negocio: ${business.name}\n👤 Dueño: ${business.owner_name}\n📞 Tel: ${business.phone}`);
    const blockedBody = `
      <div class="max-w-md mx-auto bg-rose-50 border border-rose-100 rounded-3xl p-6 text-center mt-10">
        <h2 class="text-xl font-extrabold text-rose-600 mb-2">⚠️ Cuenta Bloqueada</h2>
        <p class="text-xs text-slate-600 mb-2">Tu periodo de prueba o mes activo ha vencido.</p>
        <p class="text-[11px] font-bold text-slate-500 mb-4">ID de Cuenta: <span class="text-rose-600">${business.account_id}</span></p>
        <a href="https://wa.me/584167455485?text=${waMsg}" target="_blank" class="block w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mb-3">
          📲 Enviar Comprobante al WhatsApp de Admin
        </a>
        <a href="/login" class="text-xs text-slate-500 hover:underline">Cerrar sesión</a>
      </div>
    `;
    return res.send(tailwindLayout('Bloqueado', blockedBody));
  }

  const myProducts = db.products.filter(p => p.business_id == business.id);
  let catOpts = db.categories.map(c => `<option value="${c}">${c}</option>`).join('');
  
  let prodList = myProducts.map(p => `
    <div class="py-3 border-b border-slate-100 text-sm space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <span class="font-bold text-slate-800 block">${p.title}</span>
          <span class="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">${p.category}</span>
        </div>
        <div class="text-right">
          <span class="font-extrabold text-emerald-600">$${p.price_usd} USD</span>
          <span class="text-xs text-slate-400 block">Bs. ${(p.price_usd * business.bcv_rate).toFixed(2)}</span>
        </div>
      </div>
      <form action="/api/merchant/product/edit" method="POST" class="bg-slate-50 p-2 rounded-xl flex gap-2 items-center">
        <input type="hidden" name="product_id" value="${p.id}">
        <input type="hidden" name="user_id" value="${userId}">
        <input type="text" name="title" value="${p.title}" class="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
        <input type="number" step="0.01" name="price_usd" value="${p.price_usd}" class="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
        <button type="submit" class="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">Guardar</button>
      </form>
    </div>
  `).join('');

  const body = `
    <div class="space-y-6">
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h2 class="text-xl font-extrabold text-slate-800">${business.name}</h2>
            <p class="text-xs text-slate-500">ID: <b class="text-rose-600">${business.account_id}</b> • <span class="text-emerald-600 font-semibold uppercase">${business.status}</span></p>
          </div>
          <a href="/login" class="text-xs text-rose-600 font-semibold bg-rose-50 px-3 py-1.5 rounded-xl">Cerrar Sesión</a>
        </div>

        <form action="/api/merchant/rate" method="POST" class="bg-slate-50 p-4 rounded-2xl flex items-end gap-3">
          <div class="flex-1">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Tasa Dólar BCV:</label>
            <input type="number" step="0.01" name="bcv_rate" value="${business.bcv_rate}" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none" required>
            <input type="hidden" name="business_id" value="${business.id}">
          </div>
          <button type="submit" class="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition">Actualizar</button>
        </form>
      </div>

      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-1">📦 Publicar Producto o Servicio</h3>
        <p class="text-xs text-slate-400 mb-4">Tus publicaciones actuales: ${myProducts.length} productos registrados.</p>
        <form action="/api/merchant/product" method="POST" class="space-y-3">
          <input type="hidden" name="business_id" value="${business.id}">
          <input type="hidden" name="user_id" value="${userId}">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Título:</label>
            <input type="text" name="title" placeholder="Ej. Harina PAN / Servicio de Uñas" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Categoría Específica:</label>
            <select name="category" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>${catOpts}</select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Precio en USD ($):</label>
            <input type="number" step="0.01" name="price_usd" placeholder="0.00" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" required>
          </div>
          <button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mt-2">
            Publicar
          </button>
        </form>
      </div>

      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-2">Tus Publicaciones Activas</h3>
        <div class="divide-y divide-slate-100">
          ${prodList || '<p class="text-xs text-slate-400 py-2">No tienes productos o servicios registrados aún.</p>'}
        </div>
      </div>
    </div>
  `;

  res.send(tailwindLayout('Panel de Negocio', body));
});

// ==================== 7. PANEL ADMIN (Con Módulo de Plan Ciudadano) ====================
app.get('/admin', (req, res) => {
  const db = getDB();
  const activeTab = req.query.tab || 'trial';

  let listHtml = '';

  if (activeTab === 'citizen') {
    // Filtrar cuentas de usuarios del Plan Ciudadano (role: 'user')
    const citizens = db.users.filter(u => u.role === 'user');
    listHtml = citizens.map(u => `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 relative overflow-hidden">
        <div class="absolute left-0 top-0 bottom-0 w-2 ${u.status === 'blocked' ? 'bg-rose-500' : 'bg-emerald-500'}"></div>
        <div class="pl-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-slate-800 text-base">${u.full_name} <span class="text-xs text-rose-600 font-bold">(${u.account_id})</span></h4>
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded-full ${u.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">${u.status || 'active'}</span>
          </div>
          <p class="text-xs text-slate-600 mt-1">Correo: <b>${u.email}</b> • 📱 <b>${u.phone}</b></p>
          <p class="text-xs text-slate-400 mt-0.5">Plan: <b>Ciudadano ($1/mes)</b></p>
          
          ${u.status === 'blocked' ? `
            <form action="/api/admin/unlock-citizen" method="POST" class="mt-3">
              <input type="hidden" name="user_id" value="${u.id}">
              <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-sm transition">
                🔓 Pago y Desbloquear Ciudadano
              </button>
            </form>
          ` : ''}
        </div>
      </div>
    `).join('');
  } else {
    // Filtrar negocios según el módulo o pestaña seleccionada
    let filteredBusinesses = [];
    if (activeTab === 'trial') {
      filteredBusinesses = db.businesses.filter(b => b.status === 'trialing' || b.status === 'active');
    } else {
      filteredBusinesses = db.businesses.filter(b => b.plan_id == parseInt(activeTab));
    }

    listHtml = filteredBusinesses.map(b => `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 relative overflow-hidden">
        <div class="absolute left-0 top-0 bottom-0 w-2 ${b.status === 'blocked' ? 'bg-rose-500' : 'bg-emerald-500'}"></div>
        <div class="pl-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-slate-800 text-base">${b.name} <span class="text-xs text-rose-600 font-bold">(${b.account_id})</span></h4>
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded-full ${b.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">${b.status}</span>
          </div>
          <p class="text-xs text-slate-600 mt-1">Dueño: <b>${b.owner_name}</b> • 📱 <b>${b.phone}</b></p>
          <p class="text-xs text-slate-400 mt-0.5">Vence: ${b.expires_at.split('T')[0]}</p>
          
          ${b.status === 'blocked' ? `
            <form action="/api/admin/unlock" method="POST" class="mt-3">
              <input type="hidden" name="business_id" value="${b.id}">
              <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-sm transition">
                🔓 Pago y Desbloquear Cuenta
              </button>
            </form>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  const body = `
    <div class="space-y-6">
      <div class="flex justify-between items-center bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div>
          <h2 class="text-2xl font-extrabold text-slate-800">⚙️ Admin CercaYa (Mercy)</h2>
          <p class="text-xs text-slate-500">Módulos de control y suscripciones</p>
        </div>
        <a href="/" class="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl transition">Salir / Inicio</a>
      </div>

      <div class="flex gap-2 overflow-x-auto pb-2">
        <a href="/admin?tab=citizen" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab === 'citizen' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">👥 Plan Ciudadano ($1)</a>
        <a href="/admin?tab=trial" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab === 'trial' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🎁 Activos y Prueba</a>
        <a href="/admin?tab=2" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab === '2' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏠 Emprendedor ($3)</a>
        <a href="/admin?tab=3" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab === '3' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏪 Comercio Local ($7)</a>
        <a href="/admin?tab=4" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab === '4' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏬 Gran Comercio ($15)</a>
      </div>

      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-4">Cuentas Registradas en este Módulo</h3>
        <div>
          ${listHtml || '<p class="text-xs text-slate-400 py-4 text-center">No hay cuentas registradas en este módulo.</p>'}
        </div>
      </div>
    </div>
  `;

  res.send(tailwindLayout('Panel Administrador', body));
});

// ==================== API ENDPOINTS ====================

app.post('/api/register', (req, res) => {
  const { email, password, full_name, plan_id, business_name, category, reference, lat_lng, phone, sec_question, sec_answer } = req.body;
  const db = getDB();

  if (db.users.find(u => u.email === email)) return res.send("<h3>El correo ya existe. <a href='/register'>Volver</a></h3>");

  const userId = db.users.length + 1;
  const planIdInt = parseInt(plan_id);
  const accountId = 'CY-' + Math.floor(1000 + Math.random() * 9000);
  const trialDate = new Date();
  trialDate.setDate(trialDate.getDate() + 14);

  if (planIdInt === 1) {
    // Registro de Usuario Plan Ciudadano
    db.users.push({
      id: userId,
      account_id: accountId,
      email,
      password,
      full_name,
      phone,
      role: 'user',
      status: 'trialing',
      expires_at: trialDate.toISOString(),
      sec_question,
      sec_answer
    });
  } else {
    // Registro de Negocio Comercial
    db.users.push({
      id: userId,
      email,
      password,
      full_name,
      role: 'merchant',
      sec_question,
      sec_answer
    });

    if (business_name) {
      db.businesses.push({
        id: db.businesses.length + 1,
        account_id: accountId,
        user_id: userId,
        name: business_name,
        owner_name: full_name,
        category: category || 'Otros Servicios',
        reference: reference || 'Zona céntrica',
        lat_lng: lat_lng || '10.2241,-67.5871',
        phone: phone,
        plan_id: planIdInt,
        bcv_rate: 36.50,
        status: 'trialing',
        expires_at: trialDate.toISOString()
      });
    }
  }

  saveDB(db);
  res.redirect('/login');
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db = getDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) return res.send("<h3>Datos incorrectos. <a href='/login'>Volver</a></h3>");

  if (user.role === 'user') {
    return res.redirect(`/citizen-dashboard?user_id=${user.id}`);
  }

  const business = db.businesses.find(b => b.user_id == user.id);
  if (business) return res.redirect(`/dashboard?user_id=${user.id}`);
  res.redirect('/');
});

app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'Mercy' && password === 'mercy1234') {
    res.redirect('/admin');
  } else {
    res.send("<h3>Usuario o clave de Administrador incorrectos. <a href='/admin-login'>Intentar de nuevo</a></h3>");
  }
});

app.post('/api/forgot', (req, res) => {
  const { email, sec_answer, new_password } = req.body;
  const db = getDB();
  const user = db.users.find(u => u.email === email);
  if (!user || user.sec_answer.toLowerCase() !== sec_answer.toLowerCase()) return res.send("<h3>Respuesta incorrecta. <a href='/forgot'>Volver</a></h3>");
  user.password = new_password;
  saveDB(db);
  res.send("<h3>Contraseña actualizada con éxito. <a href='/login'>Ir al Login</a></h3>");
});

app.post('/api/merchant/rate', (req, res) => {
  const { business_id, bcv_rate } = req.body;
  const db = getDB();
  const biz = db.businesses.find(b => b.id == business_id);
  if (biz) {
    biz.bcv_rate = parseFloat(bcv_rate);
    saveDB(db);
  }
  res.redirect(`/dashboard?user_id=${biz.user_id}`);
});

app.post('/api/merchant/product', (req, res) => {
  const { business_id, user_id, title, category, price_usd } = req.body;
  const db = getDB();
  const biz = db.businesses.find(b => b.id == parseInt(business_id));
  
  if (!biz) return res.send("<h3>Negocio no encontrado.</h3>");

  const currentProductsCount = db.products.filter(p => p.business_id == biz.id).length;

  if (biz.plan_id === 2 && currentProductsCount >= 10) {
    return res.send("<h3>Límite alcanzado: El Plan Emprendedor Casero permite máximo 10 productos. <a href='/dashboard?user_id=" + user_id + "'>Volver</a></h3>");
  }
  if (biz.plan_id === 3 && currentProductsCount >= 50) {
    return res.send("<h3>Límite alcanzado: El Plan Comercio Local permite máximo 50 productos. <a href='/dashboard?user_id=" + user_id + "'>Volver</a></h3>");
  }

  db.products.push({
    id: db.products.length + 1,
    business_id: parseInt(business_id),
    title,
    category,
    price_usd: parseFloat(price_usd)
  });
  saveDB(db);
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/merchant/product/edit', (req, res) => {
  const { product_id, user_id, title, price_usd } = req.body;
  const db = getDB();
  const prod = db.products.find(p => p.id == parseInt(product_id));
  if (prod) {
    prod.title = title;
    prod.price_usd = parseFloat(price_usd);
    saveDB(db);
  }
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/admin/unlock', (req, res) => {
  const { business_id } = req.body;
  const db = getDB();
  const biz = db.businesses.find(b => b.id == parseInt(business_id));
  if (biz) {
    biz.status = 'active';
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    biz.expires_at = nextMonth.toISOString();
    saveDB(db);
  }
  res.redirect('/admin?tab=trial');
});

// Desbloquear cuenta de Plan Ciudadano
app.post('/api/admin/unlock-citizen', (req, res) => {
  const { user_id } = req.body;
  const db = getDB();
  const u = db.users.find(user => user.id == parseInt(user_id) && user.role === 'user');
  if (u) {
    u.status = 'active';
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    u.expires_at = nextMonth.toISOString();
    saveDB(db);
  }
  res.redirect('/admin?tab=citizen');
});

// Comparador API
app.get('/api/search', (req, res) => {
  const query = (req.query.query || '').toLowerCase();
  const catFilter = req.query.cat || '';
  const db = getDB();

  let results = [];
  db.products.forEach(p => {
    const biz = db.businesses.find(b => b.id == p.business_id);
    if (biz && biz.status !== 'blocked') {
      const matchQuery = p.title.toLowerCase().includes(query) || biz.name.toLowerCase().includes(query);
      const matchCat = catFilter === '' || p.category === catFilter;

      if (matchQuery && matchCat) {
        results.push({
          title: p.title,
          category: p.category,
          price_usd: p.price_usd,
          price_ves: (p.price_usd * biz.bcv_rate).toFixed(2),
          business_name: biz.name,
          reference: biz.reference,
          phone: biz.phone,
          map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.lat_lng || (biz.name + ' ' + biz.reference))}`
        });
      }
    }
  });

  results.sort((a, b) => a.price_usd - b.price_usd);
  res.json({ data: results });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CercaYa Activo en http://localhost:${PORT}`);
});
