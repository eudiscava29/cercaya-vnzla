const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión a MongoDB Atlas (puedes reemplazar esta URL con tu cadena de conexión oficial de Atlas)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://tu_usuario:tu_contrasena@cluster.mongodb.net/?retryWrites=true&w=majority";
let db;

async function conectarDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db("cercaya_db");
    console.log("🚀 Conectado exitosamente a MongoDB Atlas");
    
    // Inicializar planes y categorías por defecto si no existen
    const plansCount = await db.collection("plans").countDocuments();
    if (plansCount === 0) {
      await db.collection("plans").insertMany([
        { id: 1, name: 'Plan Ciudadano', price_usd: 1.00, role: 'user', desc: 'Acceso exclusivo al comparador de precios inteligente, buscador avanzado y alertas en todo el país.' },
        { id: 2, name: 'Emprendedor Casero', price_usd: 3.00, role: 'merchant', desc: 'Ideal para ventas desde casa. Límite de hasta 10 productos activos.' },
        { id: 3, name: 'Comercio Local / Bodega', price_usd: 7.00, role: 'merchant', desc: 'Para negocios de barrio. Límite de hasta 50 productos y presencia en múltiples categorías.' },
        { id: 4, name: 'Gran Comercio Céntrico', price_usd: 15.00, role: 'merchant', desc: 'Inventario totalmente ilimitado, máxima visibilidad y estadísticas avanzadas.' }
      ]);
    }

    const catCount = await db.collection("categories").countDocuments();
    if (catCount === 0) {
      await db.collection("categories").insertMany([
        { name: 'Comida y Víveres' }, { name: 'Frutas y Verduras' }, { name: 'Comida Rápida' }, 
        { name: 'Barbería y Peluquería' }, { name: 'Salón de Belleza y Uñas' }, 
        { name: 'Reparación y Servicio Técnico' }, { name: 'Electrodomésticos' }, { name: 'Repuestos y Autopartes' }, { name: 'Otros Servicios' }
      ]);
    }
  } catch (e) {
    console.error("Error al conectar con MongoDB Atlas:", e);
  }
}

conectarDB();

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

// ==================== LANDING PAGE ====================
app.get('/', async (req, res) => {
  const plans = await db.collection("plans").find({}).toArray();
  let plansCards = plans.map(p => `
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

// ==================== PANEL CIUDADANO ====================
app.get('/citizen-dashboard', async (req, res) => {
  const userId = req.query.user_id;
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId), role: 'user' });

  if (!user) return res.send("<h3>Acceso restringido. <a href='/login'>Iniciar Sesión</a></h3>");

  const now = new Date().getTime();
  if (user.status === 'blocked' || (user.expires_at && now > new Date(user.expires_at).getTime())) {
    await db.collection("users").updateOne({ _id: user._id }, { $set: { status: 'blocked' } });
    const waMsg = encodeURIComponent(`Hola Admin Mercy, quiero pagar la mensualidad de mi cuenta Ciudadana. \n🆔 ID: ${user.account_id}\n👤 Nombre: ${user.full_name}\n📞 Tel: ${user.phone}`);
    return res.send(tailwindLayout('Bloqueado', `
      <div class="max-w-md mx-auto bg-rose-50 border border-rose-100 rounded-3xl p-6 text-center mt-10">
        <h2 class="text-xl font-extrabold text-rose-600 mb-2">⚠️ Cuenta Bloqueada</h2>
        <p class="text-xs text-slate-600 mb-2">Tu periodo de prueba o mes activo ha vencido.</p>
        <p class="text-[11px] font-bold text-slate-500 mb-4">ID: <span class="text-rose-600">${user.account_id}</span></p>
        <a href="https://wa.me/584126722071?text=${waMsg}" target="_blank" class="block w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mb-3">
          📲 Enviar Comprobante al WhatsApp de Admin
        </a>
        <a href="/login" class="text-xs text-slate-500 hover:underline">Cerrar sesión</a>
      </div>
    `));
  }

  const categories = await db.collection("categories").find({}).toArray();
  let categoryOptions = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

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
        <input type="text" id="query" placeholder="🔍 Compara precios: Busca harina, repuestos..." onkeyup="buscar()" class="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
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
                  <div><span class="text-xs text-slate-400 block">USD</span><span class="text-emerald-600 font-extrabold text-lg">$\${item.price_usd}</span></div>
                  <div class="text-right"><span class="text-xs text-slate-400 block">Bolívares</span><span class="text-slate-700 font-bold text-sm">Bs. \${item.price_ves}</span></div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <a href="\${item.map_url}" target="_blank" class="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-xl transition">🗺️ Mapa</a>
                  <a href="https://wa.me/58\${item.phone.replace(/[^0-9]/g, '')}?text=\${waText}" target="_blank" class="flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2.5 px-3 rounded-xl shadow-sm transition">💬 WhatsApp</a>
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

// ==================== REGISTRO ====================
app.get('/register', async (req, res) => {
  const plans = await db.collection("plans").find({}).toArray();
  const categories = await db.collection("categories").find({}).toArray();
  let planOpts = plans.map(p => `<option value="${p.id}">${p.name} ($${p.price_usd}/mes)</option>`).join('');
  let catOpts = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  const body = `
    <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div class="flex items-center mb-4"><a href="/" class="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl transition">⬅️ Volver</a></div>
      <div class="text-center mb-6">
        <h2 class="text-2xl font-extrabold text-slate-800">📝 Registro CercaYa</h2>
        <p class="text-xs text-slate-500 mt-1">Crea tu cuenta con <span class="text-rose-600 font-semibold">14 días de prueba gratis</span>.</p>
      </div>
      <form action="/api/register" method="POST" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Plan:</label>
          <select name="plan_id" id="plan_select" onchange="toggleNegocio()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required>${planOpts}</select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Correo:</label>
          <input type="email" name="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña:</label>
          <input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre:</label><input type="text" name="full_name" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Teléfono:</label><input type="text" name="phone" placeholder="04121234567" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        </div>
        <div id="negocio_fields" style="display:none;" class="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl space-y-3">
          <h3 class="text-xs font-bold text-rose-600 uppercase">Datos del Negocio</h3>
          <div><label class="block text-xs font-bold text-slate-700 mb-1">Nombre del Local:</label><input type="text" name="business_name" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm"></div>
          <div><label class="block text-xs font-bold text-slate-700 mb-1">Categoría:</label><select name="category" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">${catOpts}</select></div>
          <div><label class="block text-xs font-bold text-slate-700 mb-1">Referencia:</label><input type="text" name="reference" placeholder="Ej. Cerca de la plaza..." class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm"></div>
          <div><label class="block text-xs font-bold text-slate-700 mb-1">GPS:</label><input type="text" name="lat_lng" id="lat_lng_input" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm mb-2" readonly><button type="button" onclick="capturarGPS()" class="w-full bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl">📍 Registrar GPS</button></div>
        </div>
        <hr class="border-slate-100 my-2">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Pregunta de Seguridad:</label><input type="text" name="sec_question" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Respuesta:</label><input type="text" name="sec_answer" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        </div>
        <button type="submit" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mt-4">Registrarse</button>
      </form>
    </div>
    <script>
      function toggleNegocio() {
        const val = document.getElementById('plan_select').value;
        document.getElementById('negocio_fields').style.display = (val == "1") ? "none" : "block";
      }
      function capturarGPS() {
        if(navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('lat_lng_input').value = pos.coords.latitude + "," + pos.coords.longitude;
            alert("¡GPS capturado!");
          }, () => alert("Error GPS"));
        }
      }
      toggleNegocio();
    </script>
  `;
  res.send(tailwindLayout('Registro', body));
});

app.post('/api/register', async (req, res) => {
  const { email, password, full_name, plan_id, business_name, category, reference, lat_lng, phone, sec_question, sec_answer } = req.body;
  const existing = await db.collection("users").findOne({ email });
  if (existing) return res.send("<h3>El correo ya existe. <a href='/register'>Volver</a></h3>");

  const planIdInt = parseInt(plan_id);
  const accountId = 'CY-' + Math.floor(1000 + Math.random() * 9000);
  const trialDate = new Date();
  trialDate.setDate(trialDate.getDate() + 14);

  const newUser = {
    account_id: accountId,
    email,
    password,
    full_name,
    phone,
    role: planIdInt === 1 ? 'user' : 'merchant',
    status: 'trialing',
    expires_at: trialDate.toISOString(),
    sec_question,
    sec_answer
  };

  const result = await db.collection("users").insertOne(newUser);
  const userId = result.insertedId;

  if (planIdInt !== 1 && business_name) {
    await db.collection("businesses").insertOne({
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

  res.redirect('/login');
});

// ==================== LOGIN / ADMIN ====================
app.get('/login', (req, res) => {
  res.send(tailwindLayout('Login', `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4"><a href="/" class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">⬅️ Volver</a></div>
      <h2 class="text-2xl font-extrabold text-slate-800 text-center mb-6">🔐 Iniciar Sesión</h2>
      <form action="/api/login" method="POST" class="space-y-4">
        <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Correo:</label><input type="email" name="email" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Contraseña:</label><input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <button type="submit" class="w-full bg-rose-600 text-white font-bold py-3 rounded-xl shadow-md">Entrar</button>
      </form>
      <div class="flex justify-between text-xs text-slate-500 mt-4"><a href="/forgot" class="hover:underline">¿Olvidaste tu contraseña?</a><a href="/register" class="text-rose-600 font-semibold hover:underline">Registrarse</a></div>
    </div>
  `));
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.collection("users").findOne({ email, password });
  if (!user) return res.send("<h3>Datos incorrectos. <a href='/login'>Volver</a></h3>");
  if (user.role === 'user') return res.redirect(`/citizen-dashboard?user_id=${user._id}`);
  
  const business = await db.collection("businesses").findOne({ user_id: user._id });
  if (business) return res.redirect(`/dashboard?user_id=${user._id}`);
  res.redirect('/');
});

app.get('/admin-login', (req, res) => {
  res.send(tailwindLayout('Admin Login', `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4"><a href="/" class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">⬅️ Volver</a></div>
      <h2 class="text-2xl font-extrabold text-slate-800 text-center mb-6">🛡️ Administrador</h2>
      <form action="/api/admin-login" method="POST" class="space-y-4">
        <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Usuario:</label><input type="text" name="username" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Contraseña:</label><input type="password" name="password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
        <button type="submit" class="w-full bg-slate-800 text-white font-bold py-3 rounded-xl shadow-md">Ingresar</button>
      </form>
    </div>
  `));
});

app.post('/api/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'Mercy' && password === 'mercy1234') res.redirect('/admin');
  else res.send("<h3>Credenciales admin incorrectas. <a href='/admin-login'>Volver</a></h3>");
});

// ==================== RECUPERAR CLAVE ====================
app.get('/forgot', async (req, res) => {
  const emailQuery = req.query.email || '';
  const user = await db.collection("users").findOne({ email: emailQuery });
  res.send(tailwindLayout('Recuperar Clave', `
    <div class="max-w-md mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-10">
      <div class="flex items-center mb-4"><a href="/login" class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">⬅️ Volver</a></div>
      <h2 class="text-2xl font-extrabold text-slate-800 text-center mb-6">🔄 Recuperar Contraseña</h2>
      ${!user ? `
        <form action="/forgot" method="GET" class="space-y-4">
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Correo:</label><input type="email" name="email" value="${emailQuery}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <button type="submit" class="w-full bg-rose-600 text-white font-bold py-3 rounded-xl">Siguiente</button>
        </form>
      ` : `
        <form action="/api/forgot" method="POST" class="space-y-4">
          <input type="hidden" name="email" value="${user.email}">
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Pregunta:</label><div class="bg-slate-100 p-3 rounded-xl text-sm font-semibold">${user.sec_question}</div></div>
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Respuesta:</label><input type="text" name="sec_answer" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <div><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nueva Contraseña:</label><input type="password" name="new_password" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <button type="submit" class="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl">Cambiar Contraseña</button>
        </form>
      `}
    </div>
  `));
});

app.post('/api/forgot', async (req, res) => {
  const { email, sec_answer, new_password } = req.body;
  const user = await db.collection("users").findOne({ email });
  if (!user || user.sec_answer.toLowerCase() !== sec_answer.toLowerCase()) return res.send("<h3>Respuesta incorrecta. <a href='/forgot'>Volver</a></h3>");
  await db.collection("users").updateOne({ email }, { $set: { password: new_password } });
  res.send("<h3>Contraseña actualizada. <a href='/login'>Ir al Login</a></h3>");
});

// ==================== PANEL NEGOCIO ====================
app.get('/dashboard', async (req, res) => {
  const userId = req.query.user_id;
  const business = await db.collection("businesses").findOne({ user_id: new ObjectId(userId) });
  if (!business) return res.send("<h3>Acceso denegado. <a href='/login'>Volver</a></h3>");

  const now = new Date().getTime();
  if (business.status === 'blocked' || (business.expires_at && now > new Date(business.expires_at).getTime())) {
    await db.collection("businesses").updateOne({ _id: business._id }, { $set: { status: 'blocked' } });
    const waMsg = encodeURIComponent(`Hola Admin Mercy, quiero pagar la mensualidad para desbloquear mi negocio. \n🆔 ID: ${business.account_id}\n🏢 Negocio: ${business.name}\n👤 Dueño: ${business.owner_name}`);
    return res.send(tailwindLayout('Bloqueado', `
      <div class="max-w-md mx-auto bg-rose-50 border border-rose-100 rounded-3xl p-6 text-center mt-10">
        <h2 class="text-xl font-extrabold text-rose-600 mb-2">⚠️ Cuenta Bloqueada</h2>
        <p class="text-xs text-slate-600 mb-4">Tu prueba o mes activo ha vencido. ID: <span class="text-rose-600 font-bold">${business.account_id}</span></p>
        <a href="https://wa.me/584126722071?text=${waMsg}" target="_blank" class="block w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl shadow-md transition mb-3">📲 Enviar Comprobante WhatsApp</a>
        <a href="/login" class="text-xs text-slate-500 hover:underline">Cerrar sesión</a>
      </div>
    `));
  }

  const products = await db.collection("products").find({ business_id: business._id }).toArray();
  const categories = await db.collection("categories").find({}).toArray();
  let catOpts = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  let prodList = products.map(p => `
    <div class="py-3 border-b border-slate-100 text-sm space-y-2">
      <div class="flex justify-between items-start">
        <div><span class="font-bold text-slate-800 block">${p.title}</span><span class="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">${p.category}</span></div>
        <div class="text-right"><span class="font-extrabold text-emerald-600">$${p.price_usd}</span><span class="text-xs text-slate-400 block">Bs. ${(p.price_usd * business.bcv_rate).toFixed(2)}</span></div>
      </div>
      <form action="/api/merchant/product/edit" method="POST" class="bg-slate-50 p-2 rounded-xl flex gap-2 items-center">
        <input type="hidden" name="product_id" value="${p._id}"><input type="hidden" name="user_id" value="${userId}">
        <input type="text" name="title" value="${p.title}" class="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
        <input type="number" step="0.01" name="price_usd" value="${p.price_usd}" class="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
        <button type="submit" class="bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">Guardar</button>
      </form>
    </div>
  `).join('');

  res.send(tailwindLayout('Panel Negocio', `
    <div class="space-y-6">
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div class="flex justify-between items-start mb-4">
          <div><h2 class="text-xl font-extrabold text-slate-800">${business.name}</h2><p class="text-xs text-slate-500">ID: <b class="text-rose-600">${business.account_id}</b> • <span class="text-emerald-600 font-semibold uppercase">${business.status}</span></p></div>
          <a href="/login" class="text-xs text-rose-600 font-semibold bg-rose-50 px-3 py-1.5 rounded-xl">Salir</a>
        </div>
        <form action="/api/merchant/rate" method="POST" class="bg-slate-50 p-4 rounded-2xl flex items-end gap-3">
          <div class="flex-1"><label class="block text-xs font-bold text-slate-700 uppercase mb-1">Tasa BCV:</label><input type="number" step="0.01" name="bcv_rate" value="${business.bcv_rate}" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm" required><input type="hidden" name="business_id" value="${business._id}"></div>
          <button type="submit" class="bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl">Actualizar</button>
        </form>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-1">📦 Publicar Producto</h3>
        <p class="text-xs text-slate-400 mb-4">Registrados: ${products.length}</p>
        <form action="/api/merchant/product" method="POST" class="space-y-3">
          <input type="hidden" name="business_id" value="${business._id}"><input type="hidden" name="user_id" value="${userId}">
          <div><label class="block text-xs font-bold uppercase mb-1">Título:</label><input type="text" name="title" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Categoría:</label><select name="category" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required>${catOpts}</select></div>
          <div><label class="block text-xs font-bold uppercase mb-1">Precio USD ($):</label><input type="number" step="0.01" name="price_usd" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" required></div>
          <button type="submit" class="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-md">Publicar</button>
        </form>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-2">Tus Publicaciones</h3>
        <div class="divide-y divide-slate-100">${prodList || '<p class="text-xs text-slate-400 py-2">Sin productos.</p>'}</div>
      </div>
    </div>
  `));
});

// ==================== PANEL ADMIN ====================
app.get('/admin', async (req, res) => {
  const activeTab = req.query.tab || 'citizen';
  let listHtml = '';

  if (activeTab === 'citizen') {
    const citizens = await db.collection("users").find({ role: 'user' }).toArray();
    listHtml = citizens.map(u => `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 relative overflow-hidden">
        <div class="absolute left-0 top-0 bottom-0 w-2 ${u.status === 'blocked' ? 'bg-rose-500' : 'bg-emerald-500'}"></div>
        <div class="pl-2 space-y-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-slate-800 text-base">${u.full_name} <span class="text-xs text-rose-600 font-bold">(${u.account_id})</span></h4>
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded-full ${u.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">${u.status || 'active'}</span>
          </div>
          <p class="text-xs text-slate-600">Correo: <b>${u.email}</b> • 📱 <b>${u.phone}</b></p>
          <form action="/api/admin/edit-citizen" method="POST" class="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <input type="hidden" name="user_id" value="${u._id}">
            <div class="grid grid-cols-2 gap-2">
              <input type="text" name="full_name" value="${u.full_name}" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
              <input type="text" name="phone" value="${u.phone}" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
            </div>
            <div class="flex gap-2">
              <button type="submit" class="flex-1 bg-slate-800 text-white font-bold text-[10px] py-1.5 rounded-lg">💾 Guardar</button>
              <a href="/api/admin/delete-citizen?user_id=${u._id}" onclick="return confirm('¿Eliminar cuenta?')" class="bg-rose-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg text-center">🗑️ Eliminar</a>
            </div>
          </form>
          ${u.status === 'blocked' ? `
            <form action="/api/admin/unlock-citizen" method="POST">
              <input type="hidden" name="user_id" value="${u._id}">
              <button type="submit" class="w-full bg-amber-500 text-white font-bold text-xs py-2 rounded-xl shadow-sm">🔓 Desbloquear</button>
            </form>
          ` : ''}
        </div>
      </div>
    `).join('');
  } else {
    let query = activeTab === 'trial' ? { $or: [{ status: 'trialing' }, { status: 'active' }] } : { plan_id: parseInt(activeTab) };
    const businesses = await db.collection("businesses").find(query).toArray();
    
    listHtml = businesses.map(b => `
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 relative overflow-hidden">
        <div class="absolute left-0 top-0 bottom-0 w-2 ${b.status === 'blocked' ? 'bg-rose-500' : 'bg-emerald-500'}"></div>
        <div class="pl-2 space-y-2">
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-slate-800 text-base">${b.name} <span class="text-xs text-rose-600 font-bold">(${b.account_id})</span></h4>
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded-full ${b.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">${b.status}</span>
          </div>
          <p class="text-xs text-slate-600">Dueño: <b>${b.owner_name}</b> • 📱 <b>${b.phone}</b></p>
          <form action="/api/admin/edit-business" method="POST" class="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <input type="hidden" name="business_id" value="${b._id}">
            <div class="grid grid-cols-2 gap-2">
              <input type="text" name="name" value="${b.name}" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
              <input type="text" name="phone" value="${b.phone}" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" required>
            </div>
            <div class="flex gap-2">
              <button type="submit" class="flex-1 bg-slate-800 text-white font-bold text-[10px] py-1.5 rounded-lg">💾 Guardar</button>
              <a href="/api/admin/delete-business?business_id=${b._id}" onclick="return confirm('¿Eliminar negocio?')" class="bg-rose-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg text-center">🗑️ Eliminar</a>
            </div>
          </form>
          ${b.status === 'blocked' ? `
            <form action="/api/admin/unlock" method="POST">
              <input type="hidden" name="business_id" value="${b._id}">
              <button type="submit" class="w-full bg-amber-500 text-white font-bold text-xs py-2 rounded-xl shadow-sm">🔓 Desbloquear</button>
            </form>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  res.send(tailwindLayout('Admin Panel', `
    <div class="space-y-6">
      <div class="flex justify-between items-center bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div><h2 class="text-2xl font-extrabold text-slate-800">⚙️ Admin (Mercy)</h2><p class="text-xs text-slate-500">Gestión de cuentas</p></div>
        <a href="/" class="text-xs font-semibold bg-slate-100 px-3 py-2 rounded-xl">Salir</a>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2">
        <a href="/admin?tab=citizen" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${activeTab === 'citizen' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">👥 Ciudadano ($1)</a>
        <a href="/admin?tab=trial" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${activeTab === 'trial' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🎁 Activos y Prueba</a>
        <a href="/admin?tab=2" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${activeTab === '2' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏠 Emprendedor ($3)</a>
        <a href="/admin?tab=3" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${activeTab === '3' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏪 Comercio ($7)</a>
        <a href="/admin?tab=4" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${activeTab === '4' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}">🏬 Gran Comercio ($15)</a>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h3 class="text-base font-bold text-slate-800 mb-4">Cuentas Registradas</h3>
        <div>${listHtml || '<p class="text-xs text-slate-400 py-4 text-center">No hay cuentas en este módulo.</p>'}</div>
      </div>
    </div>
  `));
});

// ==================== API ENDPOINTS CRUD ====================
app.post('/api/admin/edit-citizen', async (req, res) => {
  const { user_id, full_name, phone } = req.body;
  await db.collection("users").updateOne({ _id: new ObjectId(user_id) }, { $set: { full_name, phone } });
  res.redirect('/admin?tab=citizen');
});

app.get('/api/admin/delete-citizen', async (req, res) => {
  const userId = req.query.user_id;
  await db.collection("users").deleteOne({ _id: new ObjectId(userId) });
  res.redirect('/admin?tab=citizen');
});

app.post('/api/admin/edit-business', async (req, res) => {
  const { business_id, name, phone } = req.body;
  await db.collection("businesses").updateOne({ _id: new ObjectId(business_id) }, { $set: { name, phone } });
  res.redirect('/admin?tab=trial');
});

app.get('/api/admin/delete-business', async (req, res) => {
  const businessId = req.query.business_id;
  await db.collection("businesses").deleteOne({ _id: new ObjectId(businessId) });
  await db.collection("products").deleteMany({ business_id: new ObjectId(businessId) });
  res.redirect('/admin?tab=trial');
});

app.post('/api/merchant/rate', async (req, res) => {
  const { business_id, bcv_rate } = req.body;
  const biz = await db.collection("businesses").findOne({ _id: new ObjectId(business_id) });
  if (biz) {
    await db.collection("businesses").updateOne({ _id: biz._id }, { $set: { bcv_rate: parseFloat(bcv_rate) } });
    res.redirect(`/dashboard?user_id=${biz.user_id}`);
  } else {
    res.redirect('/');
  }
});

app.post('/api/merchant/product', async (req, res) => {
  const { business_id, user_id, title, category, price_usd } = req.body;
  const biz = await db.collection("businesses").findOne({ _id: new ObjectId(business_id) });
  if (!biz) return res.send("<h3>Negocio no encontrado.</h3>");
  
  const count = await db.collection("products").countDocuments({ business_id: biz._id });
  if (biz.plan_id === 2 && count >= 10) return res.send("<h3>Límite de 10 productos alcanzado. <a href='/dashboard?user_id=" + user_id + "'>Volver</a></h3>");
  if (biz.plan_id === 3 && count >= 50) return res.send("<h3>Límite de 50 productos alcanzado. <a href='/dashboard?user_id=" + user_id + "'>Volver</a></h3>");

  await db.collection("products").insertOne({ business_id: biz._id, title, category, price_usd: parseFloat(price_usd) });
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/merchant/product/edit', async (req, res) => {
  const { product_id, user_id, title, price_usd } = req.body;
  await db.collection("products").updateOne({ _id: new ObjectId(product_id) }, { $set: { title, price_usd: parseFloat(price_usd) } });
  res.redirect(`/dashboard?user_id=${user_id}`);
});

app.post('/api/admin/unlock', async (req, res) => {
  const { business_id } = req.body;
  const next = new Date();
  next.setDate(next.getDate() + 30);
  await db.collection("businesses").updateOne({ _id: new ObjectId(business_id) }, { $set: { status: 'active', expires_at: next.toISOString() } });
  res.redirect('/admin?tab=trial');
});

app.post('/api/admin/unlock-citizen', async (req, res) => {
  const { user_id } = req.body;
  const next = new Date();
  next.setDate(next.getDate() + 30);
  await db.collection("users").updateOne({ _id: new ObjectId(user_id) }, { $set: { status: 'active', expires_at: next.toISOString() } });
  res.redirect('/admin?tab=citizen');
});

app.get('/api/search', async (req, res) => {
  const query = (req.query.query || '').toLowerCase();
  const catFilter = req.query.cat || '';
  
  const businesses = await db.collection("businesses").find({ status: { $ne: 'blocked' } }).toArray();
  const bizIds = businesses.map(b => b._id);
  
  const products = await db.collection("products").find({ business_id: { $in: bizIds } }).toArray();
  let results = [];

  products.forEach(p => {
    const biz = businesses.find(b => b._id.toString() === p.business_id.toString());
    if (biz) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 CercaYa con MongoDB Atlas activo en puerto ${PORT}`); });
