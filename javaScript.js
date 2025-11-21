/* SISTEMA DE MONITOREO - VERSIÓN FINAL CORREGIDA
   - Sin inyección de menú fantasma en index.html
   - Fecha local corregida
   - Alarmas y audios funcionando
*/

let charts = {};
let historialPeso = {};
let nrosIncubadoras = [];
let incubadoraCount = 0;
let idArchivoActual = null;
let ultimosPesosSimulados = {};

// --- TIEMPOS ---
const INTERVALO_GRAFICOS_AMBIENTE = 5000;
const INTERVALO_CHEQUEO_PESO = 30 * 1000;
const INTERVALO_PANEL = 3000;
const INTERVALO_ALARMA_GLOBAL = 2000;
const INTERVALO_SIMULACION_PESO = 60 * 60 * 1000;

function parsearFechaLocal(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return null;

    try {
        // 1. Limpieza agresiva
        let limpio = fechaStr.replace(/['"]/g, '').trim();
        limpio = limpio.replace(/-/g, '/'); // Normalizar guiones a barras

        // 2. Separar por CUALQUIER espacio en blanco (tab, doble espacio, etc)
        const partes = limpio.split(/\s+/); 
        
        if (partes.length < 2) return null; 

        const fecha = partes[0];
        const hora = partes[1];

        const fechaPartes = fecha.split('/'); 
        const horaPartes = hora.split(':');   

        if (fechaPartes.length !== 3 || horaPartes.length < 2) return null;

        const anio = parseInt(fechaPartes[0]);
        const mes  = parseInt(fechaPartes[1]);
        const dia  = parseInt(fechaPartes[2]);
        
        const h = parseInt(horaPartes[0]);
        const m = parseInt(horaPartes[1]);
        const s = parseInt(horaPartes[2] || "0"); 

        if (isNaN(anio) || isNaN(mes) || isNaN(dia)) return null;

        return new Date(anio, mes - 1, dia, h, m, s);
    } catch (e) {
        return null;
    }
}

async function parsearCSV(url) {
    try {
        const response = await fetch(url + `?cacheBust=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const textoCsv = await response.text();
        if (!textoCsv) return [];
        return textoCsv.split('\n')
            .filter(linea => linea && linea.trim() !== "")
            .map(linea => linea.split(','));
    } catch (error) {
        return [];
    }
}

function validarSoloNumeros(event) {
    if (event.target) event.target.value = event.target.value.replace(/[^0-9]/g, '');
}

// --- MONITOR GLOBAL ---
async function monitorizarSistemaCompleto() {
    try {
        const audio = document.getElementById('alarma-sonora');
        let algunaAlarmaActiva = false;
        let idIncubadoraConAlarma = null;

        const tarjetas = document.querySelectorAll('.incubadora-card');
        let listaIds = [];

        if (tarjetas.length > 0) {
            tarjetas.forEach(c => {
                if (c.dataset.nombreIncubadora) listaIds.push(c.dataset.nombreIncubadora);
            });
        } else if (idArchivoActual) {
            listaIds.push(idArchivoActual);
        }

        for (const idReal of listaIds) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);

                const response = await fetch(`Datos_Incubadoras/${idReal}/estado_${idReal}.json?cacheBust=${Date.now()}`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const datos = await response.json();
                    if (datos.alarma_activa) {
                        algunaAlarmaActiva = true;
                        idIncubadoraConAlarma = idReal;

                        const card = document.querySelector(`.incubadora-card[data-nombre-incubadora="${idReal}"]`);
                        if (card) card.classList.add('alarma-global');
                    } else {
                        const card = document.querySelector(`.incubadora-card[data-nombre-incubadora="${idReal}"]`);
                        if (card) card.classList.remove('alarma-global');
                    }
                }
            } catch (e) { }
        }

        if (audio) {
            if (algunaAlarmaActiva) {
                if (audio.paused) audio.play().catch(e => { });
            } else {
                if (!audio.paused) {
                    audio.pause();
                    audio.currentTime = 0;
                }
            }
        }

        if (algunaAlarmaActiva) {
            const path = window.location.pathname;
            if (path.includes('balanza.html')) {
                window.location.href = 'index.html';
            }
            else if (path.includes('tendencias.html')) {
                if (idArchivoActual && idIncubadoraConAlarma !== idArchivoActual) {
                    window.location.href = 'index.html';
                }
            }
        }
    } catch (e) { }
}

// --- GRÁFICOS ---
function crearGrafico(ctx, titulo, colorBorde, colorFondo) {
    return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: titulo, data: [], borderColor: colorBorde, backgroundColor: colorFondo, tension: 0.1, fill: true, pointRadius: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Hora' }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                y: { beginAtZero: false, title: { display: true, text: titulo } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function inicializarTodosLosGraficos() {
    const ctxs = {
        tempAire: document.getElementById('graficoTempAire')?.getContext('2d'),
        tempPiel: document.getElementById('graficoTempPiel')?.getContext('2d'),
        humedad: document.getElementById('graficoHumedad')?.getContext('2d'),
        peso: document.getElementById('graficoPeso')?.getContext('2d')
    };
    const RANGO_BORDE = 'rgba(75, 192, 75, 0.2)', RANGO_FONDO = 'rgba(75, 192, 75, 0.1)';

    if (ctxs.tempAire) {
        charts['tempAire'] = crearGrafico(ctxs.tempAire, 'Temp. Aire (°C)', 'rgb(255, 99, 132)', 'rgba(255, 99, 132, 0.2)');
        charts['tempPiel'] = crearGrafico(ctxs.tempPiel, 'Temp. Piel (°C)', 'rgb(255, 159, 64)', 'rgba(255, 159, 64, 0.2)');
        charts['humedad'] = crearGrafico(ctxs.humedad, 'Humedad (%)', 'rgb(54, 162, 235)', 'rgba(54, 162, 235, 0.2)');
        charts['peso'] = crearGrafico(ctxs.peso, 'Peso (g)', 'rgb(75, 192, 192)', 'rgba(75, 192, 192, 0.2)');

        ['tempAire', 'tempPiel', 'humedad'].forEach(key => {
            charts[key].data.datasets.push(
                { label: 'Setpoint', data: [], borderColor: charts[key].data.datasets[0].borderColor, borderDash: [5, 5], fill: false, pointRadius: 0 },
                { label: 'Rango Min', data: [], borderColor: RANGO_BORDE, borderWidth: 1, pointRadius: 0, fill: false },
                { label: 'Rango Max', data: [], borderColor: RANGO_BORDE, borderWidth: 1, backgroundColor: RANGO_FONDO, pointRadius: 0, fill: '-1' }
            );
        });
    }
}

async function cargarDatosAmbiente(idIncubadora) {
    const archivoTempHum = `Datos_Incubadoras/${idIncubadora}/temp&hum_Inc${idIncubadora}.csv`;
    const archivoSetPoints = `Datos_Incubadoras/${idIncubadora}/setPoints_Inc${idIncubadora}.csv`;

    let datosAmbiente = await parsearCSV(archivoTempHum);
    let datosSetpoints = await parsearCSV(archivoSetPoints);

    if (!datosAmbiente || datosAmbiente.length === 0) return;

    const selector = document.getElementById('selectorRango');
    if (selector && selector.value !== 'all') {
        const minutosAtras = parseInt(selector.value, 10);
        const ahora = new Date();
        const fechaCorte = new Date(ahora.getTime() - (minutosAtras * 60 * 1000));

        datosAmbiente = datosAmbiente.filter(linea => {
            if (!linea[0]) return false;
            const fechaDato = parsearFechaLocal(linea[0]);
            if (!fechaDato) return false;
            return fechaDato >= fechaCorte;
        });
    }

    const etiquetas = [], tempsAire = [], tempsPiel = [], humedades = [];
    const spAire = [], minAire = [], maxAire = [];
    const spPiel = [], minPiel = [], maxPiel = [];
    const spHum = [], minHum = [], maxHum = [];

    let spIndex = 0;
    for (const lineaAmb of datosAmbiente) {
        const tsAmb = parsearFechaLocal(lineaAmb[0]);
        if (!tsAmb) continue;

        if (datosSetpoints.length > 0) {
            if (spIndex >= datosSetpoints.length) spIndex = 0;
            while (spIndex < datosSetpoints.length - 1) {
                const fechaSP = parsearFechaLocal(datosSetpoints[spIndex + 1][0]);
                if (fechaSP && fechaSP <= tsAmb) {
                    spIndex++;
                } else {
                    break;
                }
            }
        }
        const sp = (datosSetpoints.length > 0) ? datosSetpoints[spIndex] : null;

        etiquetas.push(tsAmb.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
        tempsAire.push(parseFloat(lineaAmb[1]));
        tempsPiel.push(parseFloat(lineaAmb[2]));
        humedades.push(parseFloat(lineaAmb[3]));

        if (sp) {
            const sa = parseFloat(sp[1]), sp_p = parseFloat(sp[2]), sh = parseFloat(sp[3]);
            spAire.push(sa); minAire.push(sa - 2); maxAire.push(sa + 2);
            spPiel.push(sp_p); minPiel.push(sp_p - 2); maxPiel.push(sp_p + 2);
            spHum.push(sh); minHum.push(sh - (sh * 0.1)); maxHum.push(sh + (sh * 0.1));
        }
    }

    if (charts['tempAire']) {
        charts['tempAire'].data.labels = etiquetas;
        charts['tempAire'].data.datasets[0].data = tempsAire;
        charts['tempAire'].data.datasets[1].data = spAire;
        charts['tempAire'].data.datasets[2].data = minAire;
        charts['tempAire'].data.datasets[3].data = maxAire;
        charts['tempAire'].update();
    }
    if (charts['tempPiel']) {
        charts['tempPiel'].data.labels = etiquetas;
        charts['tempPiel'].data.datasets[0].data = tempsPiel;
        charts['tempPiel'].data.datasets[1].data = spPiel;
        charts['tempPiel'].data.datasets[2].data = minPiel;
        charts['tempPiel'].data.datasets[3].data = maxPiel;
        charts['tempPiel'].update();
    }
    if (charts['humedad']) {
        charts['humedad'].data.labels = etiquetas;
        charts['humedad'].data.datasets[0].data = humedades;
        charts['humedad'].data.datasets[1].data = spHum;
        charts['humedad'].data.datasets[2].data = minHum;
        charts['humedad'].data.datasets[3].data = maxHum;
        charts['humedad'].update();
    }
}

async function chequearNuevosDatosPeso(idIncubadora) {
    const archivoCsv = `Datos_Incubadoras/${idIncubadora}/peso_Inc${idIncubadora}.csv`;
    const lineas = await parsearCSV(archivoCsv);
    if (!lineas || lineas.length === 0) return;

    const datosActuales = historialPeso[idIncubadora] || 0;
    if (lineas.length > datosActuales) {
        const etiquetas = [], pesos = [];
        for (const linea of lineas) {
            const fechaPeso = parsearFechaLocal(linea[0]);
            if (fechaPeso) {
                etiquetas.push(fechaPeso.toLocaleDateString('es-AR') + ' ' + fechaPeso.toLocaleTimeString('es-AR'));
                pesos.push(parseFloat(linea[1]));
            }
        }
        if (charts['peso']) {
            charts['peso'].data.labels = etiquetas;
            charts['peso'].data.datasets[0].data = pesos;
            charts['peso'].update();
        }
        historialPeso[idIncubadora] = lineas.length;
    }
}

async function cargarRegistroAlarmas(idIncubadora) {
    const contenedor = document.getElementById('contenido-alarma');
    if (!contenedor) return;
    contenedor.innerHTML = "<p>Cargando...</p>";

    const lineas = await parsearCSV(`Datos_Incubadoras/${idIncubadora}/alarmas_Inc${idIncubadora}.csv`);
    if (lineas.length === 0) {
        contenedor.innerHTML = "<p>No hay alarmas registradas.</p>";
        return;
    }
    lineas.reverse();

    let html = `
    <table id="tabla-alarmas">
        <thead>
            <tr>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Duración</th>
                <th>Evento</th>
                <th>Pico Máx</th>
                <th>Pico Mín</th>
            </tr>
        </thead>
        <tbody>`;

    lineas.forEach(l => {
        const pMax = l[4] ? l[4] : '-';
        const pMin = l[5] ? l[5] : '-';
        html += `
        <tr>
            <td>${l[0]}</td>
            <td>${l[1]}</td>
            <td>${l[2]}</td>
            <td>${l[3]}</td>
            <td style="color:#d9534f;font-weight:bold;">${pMax}</td>
            <td style="color:#0275d8;font-weight:bold;">${pMin}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    contenedor.innerHTML = html;
}

async function actualizarDatosPanel(id, idArchivo) {
    try {
        const response = await fetch(`Datos_Incubadoras/${idArchivo}/estado_${idArchivo}.json?cacheBust=${Date.now()}`);
        if (!response.ok) throw new Error();
        const datos = await response.json();

        const RANGOS = {
            ta: { min: datos.set_ta - 2, max: datos.set_ta + 2 },
            tp: { min: datos.set_tp - 2, max: datos.set_tp + 2 },
            h: { min: datos.set_h - (datos.set_h * 0.10), max: datos.set_h + (datos.set_h * 0.10) }
        };

        actualizarUI(id, 'temp-aire', datos.ta, RANGOS.ta);
        actualizarUI(id, 'temp-piel', datos.tp, RANGOS.tp);
        actualizarUI(id, 'humedad', datos.h, RANGOS.h, '%');

        if (datos.peso_actual) {
            const el = document.getElementById(`peso-${id}`);
            if (el) el.textContent = `${datos.peso_actual} g`;
        }
    } catch (e) { }
}

function actualizarUI(id, tipo, valor, rango, sufijo = ' °C') {
    const el = document.getElementById(`${tipo}-${id}`);
    if (el) {
        if (typeof valor === 'number') el.textContent = `${valor.toFixed(1)}${sufijo}`;
        else el.textContent = `${valor}${sufijo}`;

        if (typeof valor === 'number' && valor >= rango.min && valor <= rango.max) {
            el.classList.add('estado-ok'); el.classList.remove('estado-alerta');
        } else if (typeof valor === 'number') {
            el.classList.add('estado-alerta'); el.classList.remove('estado-ok');
        } else {
            el.classList.remove('estado-ok'); el.classList.remove('estado-alerta');
        }
    }
}

function mostrarProximaIncubadora() {
    const input = document.getElementById('nuevoNroSerie');
    const nombre = input.value.trim();

    if (!nombre) return alert("Debe ingresar un numero");
    if (nrosIncubadoras.includes(nombre)) return alert("Incubadora ya ingresada");
    if (nrosIncubadoras.length >= 6) return alert("Panel lleno");

    nrosIncubadoras.push(nombre);
    localStorage.setItem('listaIncubadoras', JSON.stringify(nrosIncubadoras));
    window.location.reload();
}

function eliminarIncubadora(event) {
    const card = event.target.closest('.incubadora-card');
    const nombre = card.dataset.nombreIncubadora;

    if (confirm(`¿Seguro que quiere eliminar la Incubadora ${nombre}?`)) {
        nrosIncubadoras = nrosIncubadoras.filter(n => n !== nombre);
        if (nrosIncubadoras.length > 0) {
            localStorage.setItem('listaIncubadoras', JSON.stringify(nrosIncubadoras));
        } else {
            localStorage.removeItem('listaIncubadoras');
            window.location.href = 'inicio.html';
            return;
        }
        window.location.reload();
    }
}

async function simularDatosAmbiente(idArchivo) {
    const set_ta = 36.5, set_tp = 37.0, set_h = 80;
    const tempAire = (Math.random() * (38.5 - 34.5) + 34.5).toFixed(1);
    const tempPiel = (Math.random() * (39.0 - 35.0) + 35.0).toFixed(1);
    const humedad = Math.floor(Math.random() * (88 - 72 + 1)) + 72;

    let url = `index.php?id=${idArchivo}&temp_aire=${tempAire}&temp_piel=${tempPiel}&humedad=${humedad}&setpoint_temp_aire=${set_ta}&setpoint_temp_piel=${set_tp}&setpoint_humedad=${set_h}`;
    try { await fetch(url); } catch (e) { }
}

async function simularDatosPeso(idArchivo) {
    let nuevo = ultimosPesosSimulados[idArchivo] ? ultimosPesosSimulados[idArchivo] + Math.random() : (Math.random() * 2) + 2490;
    ultimosPesosSimulados[idArchivo] = nuevo;
    try { await fetch(`index.php?id=${idArchivo}&peso=${nuevo.toFixed(0)}`); } catch (e) { }
}

document.addEventListener('DOMContentLoaded', () => {

    setInterval(monitorizarSistemaCompleto, INTERVALO_ALARMA_GLOBAL);

    const btnLogin = document.getElementById('botonComenzar');
    if (btnLogin) {
        const input = document.getElementById('nroSerie1');
        if (input) input.addEventListener('input', validarSoloNumeros);
        btnLogin.addEventListener('click', (e) => {
            e.preventDefault();
            if (input && input.value.trim()) {
                localStorage.setItem('listaIncubadoras', JSON.stringify([input.value.trim()]));
                window.location.href = 'index.html';
            } else alert("Ingrese serie");
        });
    }

    const panel = document.getElementById('panel-incubadoras');
    if (panel) {
        const guardadas = localStorage.getItem('listaIncubadoras');
        if (guardadas) nrosIncubadoras = JSON.parse(guardadas);
        else { window.location.href = 'inicio.html'; return; }

        incubadoraCount = 0;
        nrosIncubadoras.forEach(nombre => {
            incubadoraCount++;
            const idHtml = incubadoraCount;
            const idArch = nombre;

            const card = document.getElementById(`inc-${idHtml}`);
            if (card) {
                card.style.display = 'flex';
                card.querySelector('h2').textContent = `Incubadora ${nombre}:`;
                card.dataset.nombreIncubadora = nombre;

                const btnDet = card.querySelector('.boton-detalles');
                if (btnDet) btnDet.href = `tendencias.html?nombre=${encodeURIComponent(nombre)}&archivo=${encodeURIComponent(idArch)}`;

                const btnElim = card.querySelector('.boton-eliminar');
                if (btnElim) btnElim.addEventListener('click', eliminarIncubadora);

                actualizarDatosPanel(idHtml, idArch);
                setInterval(() => actualizarDatosPanel(idHtml, idArch), INTERVALO_PANEL);

                if (idArch !== "1" && idArch !== "2") {
                    simularDatosAmbiente(idArch);
                    setInterval(() => simularDatosAmbiente(idArch), INTERVALO_PANEL);
                    simularDatosPeso(idArch);
                    setInterval(() => simularDatosPeso(idArch), INTERVALO_SIMULACION_PESO);
                }
            }
        });

        if (incubadoraCount >= 6) {
            const sec = document.getElementById('seccionAgregar');
            if (sec) sec.style.display = 'none';
        }

        const btnAdd = document.getElementById('botonAgregar');
        if (btnAdd) btnAdd.addEventListener('click', mostrarProximaIncubadora);

        const inputNuevo = document.getElementById('nuevoNroSerie');
        if (inputNuevo) inputNuevo.addEventListener('input', validarSoloNumeros);

        const btnAudio = document.getElementById('habilitar-audio-btn');
        if (btnAudio) btnAudio.addEventListener('click', () => {
            const a = document.getElementById('alarma-sonora');
            if (a) { a.play().catch(() => { }); a.pause(); btnAudio.style.display = 'none'; }
        });
    }

    if (document.querySelector('.grid-graficos')) {
        const params = new URLSearchParams(window.location.search);
        const nombre = decodeURIComponent(params.get('nombre') || "Desconocida");
        const archivo = decodeURIComponent(params.get('archivo') || "1");

        idArchivoActual = archivo;
        const lblInc = document.getElementById('incubadora-id-display');
        if (lblInc) lblInc.textContent = nombre;

        const btnPesar = document.querySelector('.boton-pesar');
        if (btnPesar) btnPesar.href = `balanza.html?archivo=${encodeURIComponent(archivo)}`;

        const btnAudioTendencias = document.getElementById('habilitar-audio-btn');
        const audioTag = document.getElementById('alarma-sonora');

        if (btnAudioTendencias && audioTag) {
            btnAudioTendencias.style.display = 'inline-block';
            btnAudioTendencias.addEventListener('click', () => {
                audioTag.play().then(() => {
                    audioTag.pause();
                    btnAudioTendencias.style.display = 'none';
                }).catch(e => console.log("Error audio:", e));
            });
        }

        inicializarTodosLosGraficos();
        cargarDatosAmbiente(archivo);
        chequearNuevosDatosPeso(archivo);

        setInterval(() => cargarDatosAmbiente(archivo), INTERVALO_GRAFICOS_AMBIENTE);
        setInterval(() => chequearNuevosDatosPeso(archivo), INTERVALO_CHEQUEO_PESO);

        const sel = document.getElementById('selectorRango');
        if (sel) sel.addEventListener('change', () => cargarDatosAmbiente(archivo));

        const btnAbrir = document.getElementById('botonRegistroAlarmas');
        if (btnAbrir) {
            btnAbrir.addEventListener('click', () => {
                cargarRegistroAlarmas(archivo);
                document.getElementById('modal-backdrop')?.classList.add('mostrar');
                const tabla = document.getElementById('modal-backdrop');
                if (tabla) tabla.style.display = 'flex';
            });

            const btnCerrar = document.getElementById('modal-cerrar-btn');
            if (btnCerrar) btnCerrar.addEventListener('click', () => {
                document.getElementById('modal-backdrop')?.classList.remove('mostrar');
                const tabla = document.getElementById('modal-backdrop');
                if (tabla) tabla.style.display = 'none';
            });
        }
    }

    // PÁGINA BALANZA
    if (document.getElementById('mensaje-display')) {
        const params = new URLSearchParams(window.location.search);
        idArchivoActual = params.get('archivo');

        const TIEMPO = 5000;
        const msj = document.getElementById('mensaje-display');
        const vid = document.getElementById('video-incubadora');

        const play = (src, txt) => {
            msj.textContent = txt;
            if (vid) {
                if (src) { vid.src = src; vid.style.display = 'block'; vid.play().catch(() => { }); }
                else { vid.pause(); vid.style.display = 'none'; }
            }
        };

        play('videoLevantar.mp4', "Levante al Neonato");
        setTimeout(() => {
            play('videoCalibrar.mp4', "Calibrando balanza...");
            setTimeout(() => {
                play('videoApoyar.mp4', "Apoye al Neonato");
                setTimeout(() => {
                    play('videoPesando.mp4', "Pesando...");
                    setTimeout(() => {
                        play(null, "Peso Registrado: 3250 g");
                        if (idArchivoActual) simularDatosPeso(idArchivoActual);
                    }, TIEMPO);
                }, TIEMPO);
            }, TIEMPO);
        }, TIEMPO);
    }
});