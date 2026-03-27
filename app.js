// ============ CONFIGURACIÓN ============
const SUPABASE_URL = 'https://lrgkuqlkhchhneznkspl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZ2t1cWxraGNoaG5lem5rc3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTIxOTEsImV4cCI6MjA5MDEyODE5MX0.KG3M8uK1PiX85IYvXXPm2yc5cdUhxVm_Fw-qiFH8GYw';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado global
let currentUser = null;
let editingQuoteId = null;
let trabajosExtras = [];
let conceptosElectricidad = [];

// Conceptos predefinidos
const CONCEPTOS_ELECTRICIDAD = [
    'Instalación de base de medidor',
    'Instalación de centro de carga',
    'Pegado de centro de carga',
    'Pegado de chalupas',
    'Entubado (precio por salida)',
    'Instalación de contacto',
    'Instalación de lámparas',
    'Instalación de canaleta'
];

const NEGOCIO = {
    nombre: 'Victor Enrique Tuz Dzidz',
    telefono: '9831860555'
};

// ============ FUNCIONES DE AUTENTICACIÓN ============
async function handleLogin(email, password) {
    try {
        console.log('🔍 Buscando usuario:', email);
        
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('email', email);
        
        if (error) {
            alert('Error: ' + error.message);
            return false;
        }
        
        if (!data || data.length === 0) {
            alert('Email no encontrado. Regístrate primero.');
            return false;
        }
        
        const usuario = data[0];
        
        if (usuario.password !== password) {
            alert('Contraseña incorrecta');
            return false;
        }
        
        currentUser = usuario;
        localStorage.setItem('currentUser', JSON.stringify(usuario));
        console.log('✅ Login exitoso');
        return true;
        
    } catch (err) {
        console.error('❌ Error:', err);
        alert('Error de conexión');
        return false;
    }
}

async function handleRegister(nombre, email, password) {
    if (password.length < 4) {
        alert('La contraseña debe tener al menos 4 caracteres');
        return false;
    }
    
    try {
        const { error } = await supabaseClient
            .from('usuarios')
            .insert([{ nombre, email, password }]);
        
        if (error) {
            alert('Error: ' + error.message);
            return false;
        }
        
        alert('Registro exitoso. Ahora inicia sesión.');
        return true;
        
    } catch (err) {
        alert('Error de conexión');
        return false;
    }
}

function checkSession() {
    console.log('🔍 Verificando sesión...');
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        console.log('✅ Sesión activa:', currentUser.email);
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        cargarCotizaciones();
        actualizarEstadisticas();
    } else {
        console.log('⚠️ No hay sesión activa');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    trabajosExtras = [];
    conceptosElectricidad = [];
    if (typeof renderExtrasTable === 'function') renderExtrasTable();
    if (typeof actualizarCalculosYPreview === 'function') actualizarCalculosYPreview();
}

// ============ GUARDAR COTIZACIÓN ============
async function guardarCotizacion() {
    if (!currentUser) {
        alert('Debes iniciar sesión');
        return;
    }
    
    const cliente = {
        nombre: document.getElementById('clienteNombre').value.trim(),
        telefono: document.getElementById('clienteTelefono').value.trim(),
        direccion: document.getElementById('clienteDireccion').value.trim()
    };
    
    if (!cliente.nombre) {
        alert('Ingrese el nombre del cliente');
        return;
    }
    
    try {
        // Verificar que el usuario existe
        const { data: userCheck } = await supabaseClient
            .from('usuarios')
            .select('id')
            .eq('id', currentUser.id);
        
        if (!userCheck || userCheck.length === 0) {
            await supabaseClient
                .from('usuarios')
                .insert([{
                    id: currentUser.id,
                    nombre: currentUser.nombre,
                    email: currentUser.email,
                    password: currentUser.password
                }]);
        }
        
        // Guardar cliente
        let clienteId;
        
        const { data: clientesExistentes } = await supabaseClient
            .from('clientes')
            .select('id')
            .eq('nombre', cliente.nombre)
            .eq('telefono', cliente.telefono)
            .eq('user_id', currentUser.id);
        
        if (clientesExistentes && clientesExistentes.length > 0) {
            clienteId = clientesExistentes[0].id;
        } else {
            const { data: newCliente, error } = await supabaseClient
                .from('clientes')
                .insert([{
                    nombre: cliente.nombre,
                    telefono: cliente.telefono,
                    direccion: cliente.direccion,
                    user_id: currentUser.id
                }])
                .select();
            
            if (error) throw error;
            clienteId = newCliente[0].id;
        }
        
        // Obtener items
        const tipoTrabajo = document.getElementById('tipoTrabajo').value;
        const otrosTexto = tipoTrabajo === 'otros' ? document.getElementById('otrosEspecificar').value : '';
        
        let items = [];
        
        if (tipoTrabajo === 'electricidad') {
            items = conceptosElectricidad.map(c => ({
                descripcion: c.concepto,
                cantidad: c.cantidad,
                precio: c.precio,
                total: c.total
            }));
        } else if (tipoTrabajo === 'plomeria') {
            const salidas = parseFloat(document.getElementById('salidasPlomeria')?.value) || 0;
            const precio = parseFloat(document.getElementById('precioSalidaPlomeria')?.value) || 0;
            if (salidas > 0) {
                items.push({
                    descripcion: 'Instalación de plomería',
                    cantidad: salidas,
                    precio: precio,
                    total: salidas * precio
                });
            }
        } else if (tipoTrabajo === 'climas') {
            const equipos = parseFloat(document.getElementById('equiposClimas')?.value) || 0;
            const precio = parseFloat(document.getElementById('precioEquipoClimas')?.value) || 0;
            if (equipos > 0) {
                items.push({
                    descripcion: 'Instalación de aire acondicionado',
                    cantidad: equipos,
                    precio: precio,
                    total: equipos * precio
                });
            }
        } else if (tipoTrabajo === 'otros') {
            const descripcion = document.getElementById('descripcionOtros')?.value;
            const cantidad = parseFloat(document.getElementById('cantidadOtros')?.value) || 1;
            const precio = parseFloat(document.getElementById('precioOtros')?.value) || 0;
            if (descripcion) {
                items.push({
                    descripcion: descripcion,
                    cantidad: cantidad,
                    precio: precio,
                    total: cantidad * precio
                });
            }
        }
        
        items.push(...trabajosExtras);
        
        const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
        const descuentoPorc = parseFloat(document.getElementById('descuentoPorcentaje').value) || 0;
        const totalFinal = subtotal - (subtotal * (descuentoPorc / 100));
        const notas = document.getElementById('notasCondiciones').value;
        
        // Guardar cotización
        const cotizacionData = {
            cliente_id: clienteId,
            tipo_trabajo: tipoTrabajo,
            descripcion_otro: otrosTexto || null,
            subtotal: subtotal,
            descuento: descuentoPorc,
            total: totalFinal,
            notas: notas,
            fecha: new Date().toISOString(),
            user_id: currentUser.id
        };
        
        let cotizacionId;
        
        if (editingQuoteId) {
            await supabaseClient
                .from('cotizaciones')
                .update(cotizacionData)
                .eq('id', editingQuoteId);
            cotizacionId = editingQuoteId;
            await supabaseClient.from('items_cotizacion').delete().eq('cotizacion_id', editingQuoteId);
        } else {
            const { data: newCotizacion, error } = await supabaseClient
                .from('cotizaciones')
                .insert([cotizacionData])
                .select();
            if (error) throw error;
            cotizacionId = newCotizacion[0].id;
        }
        
        // Guardar items
        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                cotizacion_id: cotizacionId,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                precio: item.precio,
                total: item.total
            }));
            await supabaseClient.from('items_cotizacion').insert(itemsToInsert);
        }
        
        alert(editingQuoteId ? 'Cotización actualizada' : 'Cotización guardada');
        editingQuoteId = null;
        await cargarCotizaciones();
        actualizarEstadisticas();
        
    } catch (err) {
        console.error('Error:', err);
        alert('Error al guardar: ' + err.message);
    }
}

async function cargarCotizaciones() {
    if (!currentUser) return;
    
    const { data: cotizaciones, error } = await supabaseClient
        .from('cotizaciones')
        .select(`
            *,
            clientes (nombre, telefono, direccion)
        `)
        .eq('user_id', currentUser.id)
        .order('fecha', { ascending: false });
    
    if (error) {
        console.error(error);
        return;
    }
    
    const container = document.getElementById('listaCotizaciones');
    if (!cotizaciones || cotizaciones.length === 0) {
        container.innerHTML = '<div class="loading">📭 No hay cotizaciones guardadas</div>';
        return;
    }
    
    container.innerHTML = cotizaciones.map(c => `
        <div class="quote-item">
            <div class="quote-info">
                <strong>${escapeHtml(c.clientes.nombre)}</strong>
                <span>📅 ${new Date(c.fecha).toLocaleDateString()}</span>
                <span>💰 $${c.total.toFixed(2)}</span>
                <span class="badge-work">${c.tipo_trabajo}</span>
            </div>
            <div class="quote-actions">
                <button class="btn-sm verQuote" data-id="${c.id}">👁️ Ver</button>
                <button class="btn-sm editarQuote" data-id="${c.id}">✏️ Editar</button>
                <button class="btn-sm eliminarQuote" data-id="${c.id}">🗑️ Eliminar</button>
                <button class="btn-sm duplicarQuote" data-id="${c.id}">📋 Duplicar</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.verQuote').forEach(btn => {
        btn.addEventListener('click', () => cargarCotizacionParaVer(btn.dataset.id));
    });
    document.querySelectorAll('.editarQuote').forEach(btn => {
        btn.addEventListener('click', () => cargarCotizacionParaEditar(btn.dataset.id));
    });
    document.querySelectorAll('.eliminarQuote').forEach(btn => {
        btn.addEventListener('click', () => eliminarCotizacion(btn.dataset.id));
    });
    document.querySelectorAll('.duplicarQuote').forEach(btn => {
        btn.addEventListener('click', () => duplicarCotizacion(btn.dataset.id));
    });
}

async function eliminarCotizacion(id) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    
    await supabaseClient.from('items_cotizacion').delete().eq('cotizacion_id', id);
    await supabaseClient.from('cotizaciones').delete().eq('id', id);
    await cargarCotizaciones();
    actualizarEstadisticas();
}

// ============ FUNCIONES DE INTERFAZ ============
function mostrarSelectorConcepto() {
    const modalHtml = `
        <div id="modalConcepto" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
            <div style="background:white; border-radius:24px; padding:24px; max-width:400px; width:90%;">
                <h3>Agregar concepto eléctrico</h3>
                <div class="form-group">
                    <label>Concepto</label>
                    <select id="selectConcepto" style="width:100%; padding:10px;">
                        ${CONCEPTOS_ELECTRICIDAD.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Cantidad</label>
                    <input type="number" id="cantidadConcepto" value="1" min="1">
                </div>
                <div class="form-group">
                    <label>Precio unitario ($)</label>
                    <input type="number" id="precioConcepto" value="200">
                </div>
                <div style="display:flex; gap:12px; margin-top:20px;">
                    <button id="confirmarConcepto">Agregar</button>
                    <button id="cancelarConcepto" class="btn-secondary">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('confirmarConcepto').onclick = () => {
        const concepto = document.getElementById('selectConcepto').value;
        const cantidad = parseFloat(document.getElementById('cantidadConcepto').value) || 1;
        const precio = parseFloat(document.getElementById('precioConcepto').value) || 0;
        
        conceptosElectricidad.push({
            concepto: concepto,
            cantidad: cantidad,
            precio: precio,
            total: cantidad * precio
        });
        
        renderConceptosElectricidad();
        actualizarCalculosYPreview();
        document.getElementById('modalConcepto').remove();
    };
    
    document.getElementById('cancelarConcepto').onclick = () => {
        document.getElementById('modalConcepto').remove();
    };
}

function manejarTipoTrabajoDinamico() {
    const tipo = document.getElementById('tipoTrabajo').value;
    const seccionDiv = document.getElementById('seccionEspecifica');
    const otrosDiv = document.getElementById('otrosInput');
    
    otrosDiv.style.display = tipo === 'otros' ? 'block' : 'none';
    
    if (tipo === 'electricidad') {
        seccionDiv.innerHTML = `
            <div style="margin-top:15px">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                    <label>📋 Conceptos eléctricos</label>
                    <button id="agregarConceptoBtn" class="btn-secondary btn-sm">+ Agregar</button>
                </div>
                <div id="conceptosElectricidadList"></div>
            </div>
        `;
        renderConceptosElectricidad();
        document.getElementById('agregarConceptoBtn')?.addEventListener('click', mostrarSelectorConcepto);
    } else if (tipo === 'plomeria') {
        seccionDiv.innerHTML = `
            <div class="form-group"><label>Número de salidas</label><input type="number" id="salidasPlomeria" value="1"></div>
            <div class="form-group"><label>Precio por salida ($)</label><input type="number" id="precioSalidaPlomeria" value="350"></div>
        `;
        document.getElementById('salidasPlomeria')?.addEventListener('input', actualizarCalculosYPreview);
        document.getElementById('precioSalidaPlomeria')?.addEventListener('input', actualizarCalculosYPreview);
    } else if (tipo === 'climas') {
        seccionDiv.innerHTML = `
            <div class="form-group"><label>Cantidad de equipos</label><input type="number" id="equiposClimas" value="1"></div>
            <div class="form-group"><label>Precio por instalación ($)</label><input type="number" id="precioEquipoClimas" value="800"></div>
        `;
        document.getElementById('equiposClimas')?.addEventListener('input', actualizarCalculosYPreview);
        document.getElementById('precioEquipoClimas')?.addEventListener('input', actualizarCalculosYPreview);
    } else if (tipo === 'otros') {
        seccionDiv.innerHTML = `
            <div class="form-group"><label>Descripción</label><input type="text" id="descripcionOtros"></div>
            <div class="row-flex">
                <div class="form-group"><label>Cantidad</label><input type="number" id="cantidadOtros" value="1"></div>
                <div class="form-group"><label>Precio unitario</label><input type="number" id="precioOtros" value="0"></div>
            </div>
        `;
        document.getElementById('cantidadOtros')?.addEventListener('input', actualizarCalculosYPreview);
        document.getElementById('precioOtros')?.addEventListener('input', actualizarCalculosYPreview);
    }
    
    actualizarCalculosYPreview();
}

function renderConceptosElectricidad() {
    const container = document.getElementById('conceptosElectricidadList');
    if (!container) return;
    
    if (conceptosElectricidad.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">No hay conceptos</div>';
        return;
    }
    
    container.innerHTML = conceptosElectricidad.map((c, idx) => `
        <div style="background:#f8fafd; padding:10px; margin-bottom:10px; border-radius:12px;">
            <div style="display:flex; justify-content:space-between;">
                <strong>⚡ ${escapeHtml(c.concepto)}</strong>
                <button onclick="eliminarConceptoElectricidad(${idx})" style="background:#dc3545; color:white; padding:2px 8px;">✖️</button>
            </div>
            <div class="row-flex">
                <div><label>Cantidad</label><input type="number" value="${c.cantidad}" class="concepto-cant" data-idx="${idx}"></div>
                <div><label>Precio</label><input type="number" value="${c.precio}" class="concepto-precio" data-idx="${idx}"></div>
                <div><label>Total</label><input type="text" value="$${c.total.toFixed(2)}" readonly></div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.concepto-cant').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = e.target.dataset.idx;
            conceptosElectricidad[idx].cantidad = parseFloat(e.target.value) || 0;
            conceptosElectricidad[idx].total = conceptosElectricidad[idx].cantidad * conceptosElectricidad[idx].precio;
            renderConceptosElectricidad();
            actualizarCalculosYPreview();
        });
    });
    
    document.querySelectorAll('.concepto-precio').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = e.target.dataset.idx;
            conceptosElectricidad[idx].precio = parseFloat(e.target.value) || 0;
            conceptosElectricidad[idx].total = conceptosElectricidad[idx].cantidad * conceptosElectricidad[idx].precio;
            renderConceptosElectricidad();
            actualizarCalculosYPreview();
        });
    });
}

window.eliminarConceptoElectricidad = function(idx) {
    conceptosElectricidad.splice(idx, 1);
    renderConceptosElectricidad();
    actualizarCalculosYPreview();
};

function agregarExtra() {
    trabajosExtras.push({
        descripcion: 'Trabajo extra',
        cantidad: 1,
        precio: 100,
        total: 100
    });
    renderExtrasTable();
    actualizarCalculosYPreview();
}

function renderExtrasTable() {
    const tbody = document.getElementById('extrasList');
    if (!tbody) return;
    
    if (trabajosExtras.length === 0) {
        tbody.innerHTML = '同事<td colspan="5" style="text-align:center; padding:20px; color:#aaa;">Sin trabajos extras</td></tr>';
        return;
    }
    
    tbody.innerHTML = trabajosExtras.map((item, idx) => `
        <tr>
            <td><input type="text" value="${escapeHtml(item.descripcion)}" class="extra-desc" data-idx="${idx}"></td>
            <td><input type="number" value="${item.cantidad}" class="extra-cant" data-idx="${idx}"></td>
            <td><input type="number" value="${item.precio}" class="extra-precio" data-idx="${idx}"></td>
            <td><strong>$${item.total.toFixed(2)}</strong></td>
            <td><button class="btn-danger btn-sm" onclick="eliminarExtra(${idx})">✖️</button></td>
        </tr>
    `).join('');
    
    document.querySelectorAll('.extra-desc').forEach(inp => {
        inp.addEventListener('change', (e) => {
            trabajosExtras[e.target.dataset.idx].descripcion = e.target.value;
            actualizarCalculosYPreview();
        });
    });
    
    document.querySelectorAll('.extra-cant').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = e.target.dataset.idx;
            trabajosExtras[idx].cantidad = parseFloat(e.target.value) || 0;
            trabajosExtras[idx].total = trabajosExtras[idx].cantidad * trabajosExtras[idx].precio;
            renderExtrasTable();
            actualizarCalculosYPreview();
        });
    });
    
    document.querySelectorAll('.extra-precio').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = e.target.dataset.idx;
            trabajosExtras[idx].precio = parseFloat(e.target.value) || 0;
            trabajosExtras[idx].total = trabajosExtras[idx].cantidad * trabajosExtras[idx].precio;
            renderExtrasTable();
            actualizarCalculosYPreview();
        });
    });
}

window.eliminarExtra = function(idx) {
    trabajosExtras.splice(idx, 1);
    renderExtrasTable();
    actualizarCalculosYPreview();
};

function actualizarCalculosYPreview() {
    let subtotal = 0;
    const tipo = document.getElementById('tipoTrabajo').value;
    
    if (tipo === 'electricidad') {
        subtotal += conceptosElectricidad.reduce((sum, c) => sum + c.total, 0);
    } else if (tipo === 'plomeria') {
        const salidas = parseFloat(document.getElementById('salidasPlomeria')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioSalidaPlomeria')?.value) || 0;
        subtotal += salidas * precio;
    } else if (tipo === 'climas') {
        const equipos = parseFloat(document.getElementById('equiposClimas')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioEquipoClimas')?.value) || 0;
        subtotal += equipos * precio;
    } else if (tipo === 'otros') {
        const cantidad = parseFloat(document.getElementById('cantidadOtros')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioOtros')?.value) || 0;
        subtotal += cantidad * precio;
    }
    
    subtotal += trabajosExtras.reduce((sum, e) => sum + e.total, 0);
    
    const descuentoPorc = parseFloat(document.getElementById('descuentoPorcentaje').value) || 0;
    const totalFinal = subtotal - (subtotal * (descuentoPorc / 100));
    
    document.getElementById('subtotalDisplay').innerHTML = `$${subtotal.toFixed(2)}`;
    document.getElementById('totalFinalDisplay').innerHTML = `$${totalFinal.toFixed(2)}`;
    
    generarVistaPrevia();
}

function generarVistaPrevia() {
    const cliente = {
        nombre: document.getElementById('clienteNombre').value || 'Cliente',
        telefono: document.getElementById('clienteTelefono').value,
        direccion: document.getElementById('clienteDireccion').value
    };
    
    let items = [];
    const tipo = document.getElementById('tipoTrabajo').value;
    
    // Agregar conceptos de electricidad
    if (tipo === 'electricidad' && conceptosElectricidad.length > 0) {
        conceptosElectricidad.forEach(c => {
            items.push({
                descripcion: c.concepto,
                cantidad: c.cantidad,
                precio: c.precio,
                total: c.total
            });
        });
    }
    
    // Agregar trabajo principal de plomería
    if (tipo === 'plomeria') {
        const salidas = parseFloat(document.getElementById('salidasPlomeria')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioSalidaPlomeria')?.value) || 0;
        if (salidas > 0) {
            items.push({
                descripcion: `Instalación de plomería (${salidas} salidas)`,
                cantidad: salidas,
                precio: precio,
                total: salidas * precio
            });
        }
    }
    
    // Agregar trabajo principal de climas
    if (tipo === 'climas') {
        const equipos = parseFloat(document.getElementById('equiposClimas')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioEquipoClimas')?.value) || 0;
        if (equipos > 0) {
            items.push({
                descripcion: `Instalación de aire acondicionado (${equipos} equipo${equipos !== 1 ? 's' : ''})`,
                cantidad: equipos,
                precio: precio,
                total: equipos * precio
            });
        }
    }
    
    // Agregar trabajo de otros
    if (tipo === 'otros') {
        const descripcion = document.getElementById('descripcionOtros')?.value;
        const cantidad = parseFloat(document.getElementById('cantidadOtros')?.value) || 0;
        const precio = parseFloat(document.getElementById('precioOtros')?.value) || 0;
        if (descripcion && cantidad > 0) {
            items.push({
                descripcion: descripcion,
                cantidad: cantidad,
                precio: precio,
                total: cantidad * precio
            });
        }
    }
    
    // Agregar trabajos extras
    if (trabajosExtras.length > 0) {
        trabajosExtras.forEach(extra => {
            if (extra.descripcion && extra.cantidad > 0) {
                items.push({
                    descripcion: extra.descripcion,
                    cantidad: extra.cantidad,
                    precio: extra.precio,
                    total: extra.total
                });
            }
        });
    }
    
    // Si no hay items, mostrar mensaje
    if (items.length === 0) {
        items.push({
            descripcion: 'No hay servicios agregados',
            cantidad: 0,
            precio: 0,
            total: 0
        });
    }
    
    const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
    const descuento = parseFloat(document.getElementById('descuentoPorcentaje').value) || 0;
    const total = subtotal - (subtotal * descuento / 100);
    const notas = document.getElementById('notasCondiciones').value;
    const fecha = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Formato compacto y profesional para el PDF
    const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 800px; margin: 0 auto; background: white; padding: 30px;">
            <!-- Encabezado compacto -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #2c7cb6; padding-bottom: 15px;">
                <div>
                    <div style="font-size: 20px; font-weight: 700; color: #1e6f9f;">
                        🔧 ${NEGOCIO.nombre}
                    </div>
                    <div style="font-size: 11px; color: #5a6e7c; margin-top: 3px;">
                        📞 ${NEGOCIO.telefono}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: 700; color: #2c7cb6;">COTIZACIÓN</div>
                    <div style="font-size: 11px; color: #8a9aa8;">N°: ${Date.now().toString().slice(-8)}</div>
                    <div style="font-size: 12px; font-weight: 500;">${fecha}</div>
                </div>
            </div>
            
            <!-- Datos del cliente compacto -->
            <div style="background: #f8fbfe; padding: 12px 15px; border-radius: 10px; margin-bottom: 20px; border-left: 3px solid #2c7cb6;">
                <div style="font-size: 10px; text-transform: uppercase; color: #2c7cb6; margin-bottom: 5px;">CLIENTE</div>
                <div style="font-size: 14px; font-weight: 600; color: #1e2a3a;">${escapeHtml(cliente.nombre)}</div>
                <div style="font-size: 12px; color: #5a6e7c;">${escapeHtml(cliente.direccion)}</div>
                <div style="font-size: 12px; color: #5a6e7c;">📞 ${escapeHtml(cliente.telefono)}</div>
            </div>
            
            <!-- Tabla de servicios compacta -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px; color: #2c7cb6;">DETALLE DE SERVICIOS</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background: #2c7cb6; color: white;">
                            <th style="padding: 8px; text-align: left;">Descripción</th>
                            <th style="padding: 8px; text-align: center; width: 15%;">Cant.</th>
                            <th style="padding: 8px; text-align: right; width: 20%;">Precio Unit.</th>
                            <th style="padding: 8px; text-align: right; width: 20%;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, idx) => `
                            <tr style="border-bottom: 1px solid #e2edf2;">
                                <td style="padding: 8px; text-align: left;">
                                    <strong>${escapeHtml(item.descripcion)}</strong>
                                </td>
                                <td style="padding: 8px; text-align: center;">${item.cantidad}</td>
                                <td style="padding: 8px; text-align: right;">$${item.precio.toFixed(2)}</td>
                                <td style="padding: 8px; text-align: right;">$${item.total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Resumen de costos compacto -->
            <div style="background: #f8fbfe; padding: 12px 15px; border-radius: 10px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; padding: 4px 0;">
                    <span style="font-size: 12px; color: #5a6e7c;">Subtotal</span>
                    <span style="font-size: 12px; font-weight: 600;">$${subtotal.toFixed(2)}</span>
                </div>
                ${descuento > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 4px 0;">
                    <span style="font-size: 12px; color: #5a6e7c;">Descuento (${descuento}%)</span>
                    <span style="font-size: 12px; color: #dc3545;">-$${(subtotal * descuento / 100).toFixed(2)}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding: 8px 0; margin-top: 5px; border-top: 2px solid #2c7cb6;">
                    <span style="font-size: 14px; font-weight: 700; color: #1e6f9f;">TOTAL</span>
                    <span style="font-size: 16px; font-weight: 800; color: #1e6f9f;">$${total.toFixed(2)}</span>
                </div>
            </div>
            
            <!-- Notas y condiciones compactas -->
            <div style="margin-bottom: 20px; padding: 10px 12px; background: #fff8e7; border-left: 3px solid #ffc107; border-radius: 6px;">
                <div style="font-size: 10px; font-weight: 600; color: #ffc107; margin-bottom: 3px;">📋 NOTAS</div>
                <div style="font-size: 10px; color: #5a6e7c;">${escapeHtml(notas)}</div>
            </div>
            
            <!-- Firma compacta -->
            <div style="display: flex; justify-content: flex-end; margin-top: 25px; padding-top: 15px; border-top: 1px dashed #cbdde6;">
                <div style="text-align: right;">
                    <div style="font-weight: 600; font-size: 12px;">${NEGOCIO.nombre}</div>
                    <div style="font-size: 10px; color: #8a9aa8;">Responsable técnico</div>
                </div>
            </div>
            
            <!-- Footer compacto -->
            <div style="text-align: center; margin-top: 20px; padding-top: 10px; font-size: 9px; color: #8a9aa8; border-top: 1px solid #e2edf2;">
                Cotización válida por 15 días | ${NEGOCIO.nombre} - Servicios Técnicos
            </div>
        </div>
    `;
    
    document.getElementById('vistaPreviaContainer').innerHTML = html;
}


function exportarPDF() {
    const element = document.getElementById('vistaPreviaContainer');
    if (!element) {
        alert('No hay contenido para exportar');
        return;
    }
    
    // Mostrar indicador de carga
    const btnPDF = document.getElementById('exportarPDFBtn');
    const originalText = btnPDF.innerHTML;
    btnPDF.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';
    btnPDF.disabled = true;
    
    // Asegurar que el elemento sea visible
    element.style.display = 'block';
    
    // Usar html2canvas directamente para mejor control
    html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
    }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        pdf.save(`cotizacion_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`);
        
        btnPDF.innerHTML = originalText;
        btnPDF.disabled = false;
    }).catch(error => {
        console.error('Error:', error);
        alert('Error al generar PDF: ' + error.message);
        btnPDF.innerHTML = originalText;
        btnPDF.disabled = false;
    });
}

async function cargarCotizacionParaVer(id) {
    const { data: cotizacion } = await supabaseClient
        .from('cotizaciones')
        .select('*, clientes(*), items_cotizacion(*)')
        .eq('id', id)
        .single();
    
    if (cotizacion) {
        document.getElementById('clienteNombre').value = cotizacion.clientes.nombre;
        document.getElementById('clienteTelefono').value = cotizacion.clientes.telefono;
        document.getElementById('clienteDireccion').value = cotizacion.clientes.direccion;
        document.getElementById('descuentoPorcentaje').value = cotizacion.descuento;
        document.getElementById('notasCondiciones').value = cotizacion.notas || '';
        trabajosExtras = cotizacion.items_cotizacion || [];
        conceptosElectricidad = [];
        renderExtrasTable();
        actualizarCalculosYPreview();
    }
}

async function cargarCotizacionParaEditar(id) {
    await cargarCotizacionParaVer(id);
    editingQuoteId = id;
    alert('Editando cotización');
}

async function duplicarCotizacion(id) {
    await cargarCotizacionParaVer(id);
    editingQuoteId = null;
    alert('Datos cargados. Guarda como nueva');
}

function compartirWhatsApp() {
    const total = document.getElementById('totalFinalDisplay').innerText;
    const cliente = document.getElementById('clienteNombre').value;
    window.open(`https://wa.me/?text=Cotización: ${cliente} - ${total}`, '_blank');
}

async function actualizarEstadisticas() {
    if (!currentUser) return;
    const { data: cotizaciones } = await supabaseClient.from('cotizaciones').select('total').eq('user_id', currentUser.id);
    const total = cotizaciones?.reduce((s, c) => s + c.total, 0) || 0;
    document.getElementById('statsPanel').innerHTML = `<i class="fas fa-chart-line"></i> Total: $${total.toFixed(2)}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// ============ INICIALIZACIÓN ============
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iniciando aplicación...');
    checkSession();
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        if (await handleLogin(email, password)) {
            location.reload();
        }
    });
    
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('regNombre').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        if (await handleRegister(nombre, email, password)) {
            document.getElementById('showLoginBtn').click();
        }
    });
    
    document.getElementById('showRegisterBtn').addEventListener('click', () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });
    
    document.getElementById('showLoginBtn').addEventListener('click', () => {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    });
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('tipoTrabajo').addEventListener('change', manejarTipoTrabajoDinamico);
    document.getElementById('descuentoPorcentaje').addEventListener('input', actualizarCalculosYPreview);
    document.getElementById('guardarCotizacionBtn').addEventListener('click', guardarCotizacion);
    document.getElementById('exportarPDFBtn').addEventListener('click', exportarPDF);
    document.getElementById('compartirWhatsAppBtn').addEventListener('click', compartirWhatsApp);
    document.getElementById('agregarExtraBtn').addEventListener('click', agregarExtra);
    document.getElementById('duplicarDesdeFormBtn').addEventListener('click', () => {
        if (document.getElementById('clienteNombre').value) guardarCotizacion();
        else alert('Complete datos');
    });
    
    manejarTipoTrabajoDinamico();
});