let charts = {};
let historialPeso = {};
let nrosIncubadoras = []; 
let incubadoraCount = 0; 

const INTERVALO_GRAFICOS_AMBIENTE = 10 * 60 * 1000;
const INTERVALO_CHEQUEO_PESO = 30 * 1000;
const INTERVALO_PANEL = 3000;
const INTERVALO_SIMULACION_PESO = 60 * 60 * 1000; 

let ultimosPesosSimulados = {};

async function parsearCSV(url) {
    const response = await fetch(url + `?cacheBust=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Error de carga: ${response.statusText} en ${url}`);
    }
    const textoCsv = await response.text();
    if (!textoCsv) {
        return [];
    }
    return textoCsv.split('\n')
        .filter(linea => linea.trim() !== "") 
        .map(linea => linea.split(','));
}

function eliminarIncubadora(event) {
    const card = event.target.closest('.incubadora-card');
    const nombre = card.dataset.nombreIncubadora; 

    if (nombre && confirm(`¿Estás seguro de que querés eliminar la incubadora ${nombre}?`)) {
        nrosIncubadoras = nrosIncubadoras.filter(n => n !== nombre);
        if (nrosIncubadoras.length > 0) {
            localStorage.setItem('listaIncubadoras', JSON.stringify(nrosIncubadoras));
            window.location.reload();
        } else {
            localStorage.removeItem('listaIncubadoras'); 
            window.location.href = 'inicio.html'; 
        }
    }
}

function crearGrafico(ctx, titulo, colorBorde, colorFondo) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: titulo, 
                data: [],
                borderColor: colorBorde,
                backgroundColor: colorFondo,
                tension: 0.1,
                fill: true,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Hora' },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                },
                y: {
                    beginAtZero: false,
                    title: { display: true, text: titulo }
                }
            }
        }
    });
}

function inicializarTodosLosGraficos() {
    const ctxTempAire = document.getElementById('graficoTempAire')?.getContext('2d');
    const ctxTempPiel = document.getElementById('graficoTempPiel')?.getContext('2d');
    const ctxHumedad = document.getElementById('graficoHumedad')?.getContext('2d');
    const ctxPeso = document.getElementById('graficoPeso')?.getContext('2d');

    const RANGO_COLOR_BORDE = 'rgba(75, 192, 75, 0.2)';
    const RANGO_COLOR_FONDO = 'rgba(75, 192, 75, 0.1)';

    if (ctxTempAire) {
        charts['tempAire'] = crearGrafico(ctxTempAire, 'Temp. Aire (°C)', 'rgb(255, 99, 132)', 'rgba(255, 99, 132, 0.2)');
        charts['tempAire'].data.datasets.push({
            label: 'Setpoint Aire',
            data: [],
            borderColor: 'rgb(255, 99, 132)', 
            backgroundColor: 'transparent',
            borderDash: [5, 5], 
            tension: 0,
            fill: false,
            pointRadius: 0 
        });
        charts['tempAire'].data.datasets.push({
            label: 'Rango Mínimo',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            pointRadius: 0,
            fill: false
        });
        charts['tempAire'].data.datasets.push({
            label: 'Rango Seguro',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            backgroundColor: RANGO_COLOR_FONDO,
            pointRadius: 0,
            fill: '-1'
        });

        charts['tempPiel'] = crearGrafico(ctxTempPiel, 'Temp. Piel (°C)', 'rgb(255, 159, 64)', 'rgba(255, 159, 64, 0.2)');
        charts['tempPiel'].data.datasets.push({
            label: 'Setpoint Piel',
            data: [],
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0,
            fill: false,
            pointRadius: 0
        });
        charts['tempPiel'].data.datasets.push({
            label: 'Rango Mínimo',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            pointRadius: 0,
            fill: false
        });
        charts['tempPiel'].data.datasets.push({
            label: 'Rango Seguro',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            backgroundColor: RANGO_COLOR_FONDO,
            pointRadius: 0,
            fill: '-1' 
        });

        charts['humedad'] = crearGrafico(ctxHumedad, 'Humedad (%)', 'rgb(54, 162, 235)', 'rgba(54, 162, 235, 0.2)');
        charts['humedad'].data.datasets.push({
            label: 'Setpoint Humedad',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0,
            fill: false,
            pointRadius: 0
        });
        charts['humedad'].data.datasets.push({
            label: 'Rango Mínimo',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            pointRadius: 0,
            fill: false
        });
        charts['humedad'].data.datasets.push({
            label: 'Rango Seguro',
            data: [],
            borderColor: RANGO_COLOR_BORDE,
            borderWidth: 1,
            backgroundColor: RANGO_COLOR_FONDO,
            pointRadius: 0,
            fill: '-1'
        });

        charts['peso'] = crearGrafico(ctxPeso, 'Peso (g)', 'rgb(75, 192, 192)', 'rgba(75, 192, 192, 0.2)');
    }
}


async function cargarDatosAmbiente(idIncubadora) {
    const archivoTempHum = `Datos_Incubadoras/${idIncubadora}/temp&hum_Inc${idIncubadora}.csv`;
    const archivoSetPoints = `Datos_Incubadoras/${idIncubadora}/setPoints_Inc${idIncubadora}.csv`;
    console.log(`Cargando datos de ambiente desde CSV: ${archivoTempHum}`);

    try {
        const datosAmbiente = await parsearCSV(archivoTempHum);
        
        let datosSetpoints = []; 
        try {
            datosSetpoints = await parsearCSV(archivoSetPoints);
        } catch (error) {
            console.warn(`No se encontró ${archivoSetPoints}. El gráfico de setpoints y rangos estará vacío.`);
        }

        if (!datosAmbiente || datosAmbiente.length === 0) {
            console.warn(`No hay datos de ambiente en ${archivoTempHum}`);
            return;
        }

        const etiquetas = [];
        const tempsAire = [], setpointsAire = [], rangoMinAire = [], rangoMaxAire = [];
        const tempsPiel = [], setpointsPiel = [], rangoMinPiel = [], rangoMaxPiel = [];
        const humedades = [], setpointsHumedad = [], rangoMinHumedad = [], rangoMaxHumedad = [];

        let spIndex = 0;
        for (const lineaAmb of datosAmbiente) {
            const tsAmb = new Date(lineaAmb[0]); 

            if (datosSetpoints.length > 0) {
                while (spIndex < datosSetpoints.length - 1 && new Date(datosSetpoints[spIndex + 1][0]) <= tsAmb) {
                    spIndex++;
                }
            }
            const setpointActual = (datosSetpoints.length > 0) ? datosSetpoints[spIndex] : null;

            etiquetas.push(tsAmb.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
            tempsAire.push(parseFloat(lineaAmb[1]));
            tempsPiel.push(parseFloat(lineaAmb[2]));
            humedades.push(parseFloat(lineaAmb[3]));

            if (setpointActual) {
                const set_ta = parseFloat(setpointActual[1]);
                const set_tp = parseFloat(setpointActual[2]);
                const set_h = parseFloat(setpointActual[3]);

                setpointsAire.push(set_ta);
                setpointsPiel.push(set_tp);
                setpointsHumedad.push(set_h);

                rangoMinAire.push(set_ta - 2);
                rangoMaxAire.push(set_ta + 2);
                rangoMinPiel.push(set_tp - 2);
                rangoMaxPiel.push(set_tp + 2);
                rangoMinHumedad.push(set_h - (set_h * 0.10));
                rangoMaxHumedad.push(set_h + (set_h * 0.10));
            }
        }

        if (charts['tempAire']) {
            charts['tempAire'].data.labels = etiquetas;
            charts['tempAire'].data.datasets[0].data = tempsAire; 
            charts['tempAire'].data.datasets[1].data = setpointsAire; 
            charts['tempAire'].data.datasets[2].data = rangoMinAire; 
            charts['tempAire'].data.datasets[3].data = rangoMaxAire; 
            charts['tempAire'].update();
        }

        if (charts['tempPiel']) {
            charts['tempPiel'].data.labels = etiquetas;
            charts['tempPiel'].data.datasets[0].data = tempsPiel; 
            charts['tempPiel'].data.datasets[1].data = setpointsPiel; 
            charts['tempPiel'].data.datasets[2].data = rangoMinPiel; 
            charts['tempPiel'].data.datasets[3].data = rangoMaxPiel; 
            charts['tempPiel'].update();
        }

        if (charts['humedad']) {
            charts['humedad'].data.labels = etiquetas;
            charts['humedad'].data.datasets[0].data = humedades;
            charts['humedad'].data.datasets[1].data = setpointsHumedad;
            charts['humedad'].data.datasets[2].data = rangoMinHumedad; 
            charts['humedad'].data.datasets[3].data = rangoMaxHumedad; 
            charts['humedad'].update();
        }

    } catch (error) {
        console.error(`Error al actualizar gráficos de ambiente para ${idIncubadora}:`, error);
    }
}

async function chequearNuevosDatosPeso(idIncubadora) {
    const archivoCsv = `Datos_Incubadoras/${idIncubadora}/peso_Inc${idIncubadora}.csv`;
    console.log(`Chequeando peso desde CSV: ${archivoCsv}`);

    try {
        const lineas = await parsearCSV(archivoCsv);
        if (lineas.length === 0) {
            console.warn(`No hay datos de peso en ${archivoCsv}`);
            return;
        }

        const datosActualesEnGrafico = historialPeso[idIncubadora] || 0;

        if (lineas.length > datosActualesEnGrafico) {
            console.log(`¡Nuevo peso detectado para ${idIncubadora}! Actualizando gráfico.`);

            const etiquetas = [];
            const pesos = [];

            for (const linea of lineas) {
                etiquetas.push(new Date(linea[0]).toLocaleDateString('es-AR'));
                pesos.push(parseFloat(linea[1]));
            }

            if (charts['peso']) {
                charts['peso'].data.labels = etiquetas;
                charts['peso'].data.datasets[0].data = pesos;
                charts['peso'].update();
            }

            historialPeso[idIncubadora] = lineas.length;
        }

    } catch (error) {
        console.error(`Error al chequear peso para ${idIncubadora}:`, error);
    }
}

async function cargarRegistroAlarmas(idIncubadora) {
    const archivoCsv = `Datos_Incubadoras/${idIncubadora}/alarmas_Inc${idIncubadora}.csv`;
    const contenedor = document.getElementById('contenido-alarma');
    console.log(`Cargando registro de alarmas desde: ${archivoCsv}`);
    contenedor.innerHTML = "<p>Cargando...</p>"; 

    try {
        const lineas = await parsearCSV(archivoCsv);
        
        if (lineas.length === 0) {
            contenedor.innerHTML = "<p>No hay alarmas registradas.</p>";
            return;
        }

        lineas.reverse();

        let tablaHtml = '<table id="tabla-alarmas">';
        tablaHtml += '<thead><tr><th>Inicio Alarma</th><th>Fin Alarma</th><th>Duración</th><th>Evento</th></tr></thead>';
        tablaHtml += '<tbody>';

        for (const linea of lineas) {
            tablaHtml += `<tr>`;
            tablaHtml += `<td>${linea[0]}</td>`;
            tablaHtml += `<td>${linea[1]}</td>`;
            tablaHtml += `<td>${linea[2]}</td>`;
            tablaHtml += `<td>${linea[3]}</td>`;
            tablaHtml += `</tr>`;
        }

        tablaHtml += '</tbody></table>';
        contenedor.innerHTML = tablaHtml; 

    } catch (error) {
        console.warn(`No se pudo cargar ${archivoCsv}.`, error.message);
        contenedor.innerHTML = `<p>No se pudo cargar el registro. Es posible que aún no existan alarmas.</p>`;
    }
}

async function actualizarDatosPanel(id, idArchivo) {
    try {
        const responseEstado = await fetch(`Datos_Incubadoras/${idArchivo}/estado_${idArchivo}.json?cacheBust=${new Date().getTime()}`);
        if (!responseEstado.ok) throw new Error(`No se encontró estado_${idArchivo}.json`);
        
        const datos = await responseEstado.json();

        const RANGOS_DINAMICOS = {
            tempAire: { min: datos.set_ta - 2 , max: datos.set_ta + 2 },
            tempPiel: { min: datos.set_tp - 2, max: datos.set_tp + 2 },
            humedad: { 
                min: datos.set_h - (datos.set_h * 0.10),
                max: datos.set_h + (datos.set_h * 0.10)
            } 
        };

        const audio = document.getElementById('alarma-sonora');
        const card = document.getElementById(`inc-${id}`);

        if (card && audio) {
            if (datos.alarma_activa) {
                card.classList.add('alarma-global');
                if (audio.paused) {
                    audio.play().catch(e => {
                        console.warn("Audio bloqueado por el navegador. Se necesita interacción del usuario.");
                    });
                }
            } else {
                card.classList.remove('alarma-global');
                if (!audio.paused) {
                    audio.pause();
                    audio.currentTime = 0;
                }
            }
        }

        const elTempAire = document.getElementById(`temp-aire-${id}`);
        if (elTempAire && datos.ta !== undefined) {
            elTempAire.textContent = `${datos.ta.toFixed(1)} °C`;
            if (datos.ta >= RANGOS_DINAMICOS.tempAire.min && datos.ta <= RANGOS_DINAMICOS.tempAire.max) {
                elTempAire.classList.add('estado-ok');
                elTempAire.classList.remove('estado-alerta');
            } else {
                elTempAire.classList.add('estado-alerta');
                elTempAire.classList.remove('estado-ok');
            }
        }

        const elTempPiel = document.getElementById(`temp-piel-${id}`);
        if (elTempPiel && datos.tp !== undefined) {
            elTempPiel.textContent = `${datos.tp.toFixed(1)} °C`;
            if (datos.tp >= RANGOS_DINAMICOS.tempPiel.min && datos.tp <= RANGOS_DINAMICOS.tempPiel.max) {
                elTempPiel.classList.add('estado-ok');
                elTempPiel.classList.remove('estado-alerta');
            } else {
                elTempPiel.classList.add('estado-alerta');
                elTempPiel.classList.remove('estado-ok');
            }
        }

        const elHumedad = document.getElementById(`humedad-${id}`);
        if (elHumedad && datos.h !== undefined) {
            elHumedad.textContent = `${datos.h.toFixed(0)} %`;
            if (datos.h >= RANGOS_DINAMICOS.humedad.min && datos.h <= RANGOS_DINAMICOS.humedad.max) {
                elHumedad.classList.add('estado-ok');
                elHumedad.classList.remove('estado-alerta');
            } else {
                elHumedad.classList.add('estado-alerta');
                elHumedad.classList.remove('estado-ok');
            }
        }
        
        const elPeso = document.getElementById(`peso-${id}`);
        if (elPeso) {
            if (datos.peso_actual !== undefined) {
                elPeso.textContent = `${datos.peso_actual} g`;
            } else if (elPeso.textContent === '-- g' || elPeso.textContent === '') {
                elPeso.textContent = "Sin datos";
            }
        }
        
    } catch (error) {
        console.warn(`No se pudieron cargar datos de estado para ${idArchivo}:`, error);
    }
}

function mostrarProximaIncubadora() {
    const inputSerie = document.getElementById('nuevoNroSerie');
    const nombreIncubadora = inputSerie.value.trim();
    if (nombreIncubadora === "") {
        alert("Por favor, ingrese un Número de incubadora.");
        return;
    }
    if (nrosIncubadoras.includes(nombreIncubadora)) {
        alert("Esa incubadora ya está en el panel.");
        return;
    }
    if (nrosIncubadoras.length >= 6) {
        alert("No se pueden agregar más incubadoras. El panel está lleno.");
        return;
    }
    nrosIncubadoras.push(nombreIncubadora);
    localStorage.setItem('listaIncubadoras', JSON.stringify(nrosIncubadoras));
    window.location.reload();
}

async function simularDatosAmbiente(idArchivo) {
    
    const set_ta = 36.5; 
    const set_tp = 37.0;
    const set_h = 80;

    const tempAire = (Math.random() * (38.5 - 34.5) + 34.5).toFixed(1);
    const tempPiel = (Math.random() * (39.0 - 35.0) + 35.0).toFixed(1);
    
    const min_h = set_h - (set_h * 0.10);
    const max_h = set_h + (set_h * 0.10);
    const humedad = Math.floor(Math.random() * (max_h - min_h + 1)) + min_h;

    let urlAmbiente = `index.php?id=${idArchivo}`;
    urlAmbiente += `&temp_aire=${tempAire}`;
    urlAmbiente += `&temp_piel=${tempPiel}`;
    urlAmbiente += `&humedad=${humedad}`;
    urlAmbiente += `&setpoint_temp_aire=${set_ta}`; 
    urlAmbiente += `&setpoint_temp_piel=${set_tp}`; 
    urlAmbiente += `&setpoint_humedad=${set_h}`; 

    try {
        await fetch(urlAmbiente);
    } catch (error) {
        console.error(`Error en simulación de AMBIENTE para ID ${idArchivo}:`, error);
    }
}

async function simularDatosPeso(idArchivo) {
    let nuevoPeso;

    if (ultimosPesosSimulados[idArchivo]) {
        const pesoAnterior = ultimosPesosSimulados[idArchivo];
        const incremento = Math.random(); 
        nuevoPeso = pesoAnterior + incremento;
    } else {
        nuevoPeso = (Math.random() * 2) + 2490;
    }

    ultimosPesosSimulados[idArchivo] = nuevoPeso;
    
    const pesoRedondeado = nuevoPeso.toFixed(0);
    
    let urlPeso = `index.php?id=${idArchivo}&peso=${pesoRedondeado}`;

    try {
        await fetch(urlPeso);
        console.log(`Enviando simulación de PESO ASCENDENTE para ID ${idArchivo}: ${pesoRedondeado}g`);
    } catch (error) {
        console.error(`Error en simulación de PESO para ID ${idArchivo}:`, error);
    }
}

function validarSoloNumeros(event) {
    event.target.value = event.target.value.replace(/[^0-9]/g, '');
}

document.addEventListener('DOMContentLoaded', () => {
    
    const botonComenzar = document.getElementById('botonComenzar');
    if (botonComenzar) {
        const nroSerieInput = document.getElementById('nroSerie1');
        if (nroSerieInput) {
            nroSerieInput.addEventListener('input', validarSoloNumeros);
        }
        botonComenzar.addEventListener('click', function (event) {
            event.preventDefault();
            const nroSerie = nroSerieInput ? nroSerieInput.value.trim() : "";
            if (nroSerie === "") {
                alert("Por favor, ingrese un Número de Serie para comenzar.");
                return;
            }
            const incubadorasIniciales = [nroSerie];
            localStorage.setItem('listaIncubadoras', JSON.stringify(incubadorasIniciales));
            window.location.href = `index.html`; 
        });
    }

    const panel = document.getElementById('panel-incubadoras');
    if (panel) {
        
        const guardadas = localStorage.getItem('listaIncubadoras');
        
        if (guardadas && JSON.parse(guardadas).length > 0) {
            nrosIncubadoras = JSON.parse(guardadas);
        } else {
            nrosIncubadoras = [];
            console.warn("No hay incubadoras guardadas. Redirigiendo a inicio.html");
            window.location.href = 'inicio.html';
            return; 
        }
        
        console.log("Incubadoras cargadas:", nrosIncubadoras);

        incubadoraCount = 0;
        for (const nombreIncubadora of nrosIncubadoras) {
            incubadoraCount++; 
            const htmlId = incubadoraCount;
            const idArchivo = nombreIncubadora; 

            const card = document.getElementById(`inc-${htmlId}`);
            if (!card) {
                console.error(`Se intentó cargar la incubadora ${nombreIncubadora} pero no hay más tarjetas HTML`);
                break; 
            }

            card.style.display = 'flex';
            card.querySelector('h2').textContent = `Incubadora ${nombreIncubadora}:`;
            card.dataset.nombreIncubadora = nombreIncubadora; 

            const botonTendencias = card.querySelector('.boton-detalles');
            if (botonTendencias) {
                botonTendencias.href = `tendencias.html?nombre=${encodeURIComponent(nombreIncubadora)}&archivo=${encodeURIComponent(idArchivo)}`;
            }
            
            const botonEliminar = card.querySelector('.boton-eliminar');
            if (botonEliminar) {
                botonEliminar.addEventListener('click', eliminarIncubadora);
            }

            actualizarDatosPanel(htmlId, idArchivo); 
            setInterval(() => actualizarDatosPanel(htmlId, idArchivo), INTERVALO_PANEL);
            
            if (idArchivo !== "1" && idArchivo !== "2") {
                console.log(`Iniciando simulación para Incubadora ${htmlId} (ID: ${idArchivo})`);
                simularDatosAmbiente(idArchivo);
                setInterval(() => simularDatosAmbiente(idArchivo), INTERVALO_PANEL); 
                simularDatosPeso(idArchivo);
                setInterval(() => simularDatosPeso(idArchivo), INTERVALO_SIMULACION_PESO);
            } else {
                console.log(`Incubadora ${htmlId} (ID: ${idArchivo}) es REAL. No se simularán datos.`);
            }
        }
        
        if (incubadoraCount >= 6) {
            const seccionAgregar = document.getElementById('seccionAgregar');
            if (seccionAgregar) seccionAgregar.style.display = 'none';
        }

        const botonAgregar = document.getElementById('botonAgregar');
        if (botonAgregar) {
            botonAgregar.addEventListener('click', mostrarProximaIncubadora);
        }
        
        const inputNuevoSerie = document.getElementById('nuevoNroSerie');
        if (inputNuevoSerie) {
            inputNuevoSerie.addEventListener('input', validarSoloNumeros);
        }
    }
    const botonHabilitarAudio = document.getElementById('habilitar-audio-btn');
    if (botonHabilitarAudio) {
        
        botonHabilitarAudio.addEventListener('click', () => {
            const audio = document.getElementById('alarma-sonora');
            if (audio) {
                audio.play().catch(e => {}); 
                audio.pause(); 
                botonHabilitarAudio.style.display = 'none'; 
                console.log("Audio desbloqueado por el usuario.");
            }
        });
    }
    const gridGraficos = document.querySelector('.grid-graficos');
    if (gridGraficos) {
        let idIncubadora = "Desconocida", idArchivo = "1";
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const nombreUrl = urlParams.get('nombre');
            const archivoUrl = urlParams.get('archivo');
            if (nombreUrl) idIncubadora = decodeURIComponent(nombreUrl);
            if (archivoUrl) idArchivo = decodeURIComponent(archivoUrl);
            const displayID = document.getElementById('incubadora-id-display');
            if (displayID) displayID.textContent = idIncubadora;
        } catch (e) { console.error("Error al leer ID de URL:", e); }
        
        try {
            inicializarTodosLosGraficos();
            cargarDatosAmbiente(idArchivo);
            setInterval(() => cargarDatosAmbiente(idArchivo), INTERVALO_GRAFICOS_AMBIENTE);
            chequearNuevosDatosPeso(idArchivo);
            setInterval(() => chequearNuevosDatosPeso(idArchivo), INTERVALO_CHEQUEO_PESO);
        } catch(e) {
            console.error(`No se pudieron cargar gráficos para el ID de archivo: ${idArchivo}`, e);
        }

        const modalBackdrop = document.getElementById('modal-backdrop');
        const botonAbrir = document.getElementById('botonRegistroAlarmas');
        const botonCerrar = document.getElementById('modal-cerrar-btn');

        if (modalBackdrop && botonAbrir && botonCerrar) {
            
            botonAbrir.addEventListener('click', () => {
                cargarRegistroAlarmas(idArchivo); 
                modalBackdrop.classList.add('mostrar');
            });

            botonCerrar.addEventListener('click', () => {
                modalBackdrop.classList.remove('mostrar');
            });

            modalBackdrop.addEventListener('click', (event) => {
                if (event.target === modalBackdrop) {
                    modalBackdrop.classList.remove('mostrar');
                }
            });
        }
    }

    const mensajeDisplay = document.getElementById('mensaje-display');
    if (mensajeDisplay) {
        const TIEMPO_ESPERA = 5000;
        const VIDEOS = {
            LEVANTAR: 'videoLevantar.mp4',
            CALIBRAR: 'videoCalibrar.mp4',
            APOYAR: 'videoApoyar.mp4',
            PESANDO: 'videoPesando.mp4',
            FINAL: null
        };
        function actualizarMensaje(texto) {
            mensajeDisplay.textContent = texto;
        }
        function controlarVideo(nombreArchivo) {
            const video = document.getElementById('video-incubadora');
            if (!video) return;
            if (nombreArchivo) {
                video.src = nombreArchivo;
                video.load();
                video.style.display = 'block';
                video.play().catch(error => {
                    console.error("Error al iniciar la reproducción:", error);
                });
            } else {
                video.pause();
                video.style.display = 'none';
            }
        }
        controlarVideo(VIDEOS.LEVANTAR);
        actualizarMensaje("Levante al Neonato");
        setTimeout(() => {
            controlarVideo(VIDEOS.CALIBRAR);
            actualizarMensaje("Espere a que la balanza se calibre"); 
            setTimeout(() => {
                controlarVideo(VIDEOS.APOYAR);
                actualizarMensaje("Apoye al Neonato");
                setTimeout(() => {
                    controlarVideo(VIDEOS.PESANDO);
                    actualizarMensaje("Aguarde a que se pese al neonato");
                }, TIEMPO_ESPERA);
            }, TIEMPO_ESPERA);
        }, TIEMPO_ESPERA);
    }
});