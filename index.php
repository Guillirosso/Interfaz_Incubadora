<?php
header('Content-Type: application/json');
date_default_timezone_set('America/Argentina/Buenos_Aires');

$baseDir = "Datos_Incubadoras";
$intervaloHistorial = 10 * 60; 

if (!isset($_GET['id']) || empty($_GET['id'])) {
    echo json_encode(['status' => 'error', 'message' => 'ID no proporcionado.']);
    exit;
}

$id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id']);
$timestamp = date('Y-m-d H:i:s');
$incubadoraPath = $baseDir . "/" . $id;
$estadoFile = $incubadoraPath . "/estado_" . $id . ".json";
$fileTempHum   = $incubadoraPath . "/temp&hum_Inc" . $id . ".csv";
$filePeso      = $incubadoraPath . "/peso_Inc" . $id . ".csv";
$filePesoJson  = $incubadoraPath . "/datos_peso_" . $id . ".json"; 
$fileSetPoints = $incubadoraPath . "/setPoints_Inc" . $id . ".csv";
$fileAlarmas   = $incubadoraPath . "/alarmas_Inc" . $id . ".csv";

if (!file_exists($baseDir)) { @mkdir($baseDir, 0777, true); }
if (!file_exists($incubadoraPath)) { @mkdir($incubadoraPath, 0777, true); }
$datosEstado = file_exists($estadoFile) ? json_decode(file_get_contents($estadoFile), true) : [];
if (!is_array($datosEstado)) $datosEstado = [];

$alarmaAnterior = $datosEstado['alarma_activa'] ?? false;

if (isset($_GET['temp_aire']) && isset($_GET['temp_piel']) && isset($_GET['humedad'])) {
    $datosEstado['ta'] = (float)$_GET['temp_aire'];
    $datosEstado['tp'] = (float)$_GET['temp_piel'];
    $datosEstado['h'] = (float)$_GET['humedad'];
    $datosEstado['set_ta'] = (float)$_GET['setpoint_temp_aire'];
    $datosEstado['set_tp'] = (float)$_GET['setpoint_temp_piel'];
    $datosEstado['set_h'] = (float)$_GET['setpoint_humedad'];
    $datosEstado['ts_ambiente'] = time();
    $alarmaNueva = false;
    
    $min_ta = $datosEstado['set_ta'] - 2; $max_ta = $datosEstado['set_ta'] + 2;
    $min_tp = $datosEstado['set_tp'] - 2; $max_tp = $datosEstado['set_tp'] + 2;
    $min_h  = $datosEstado['set_h'] * 0.90; $max_h = $datosEstado['set_h'] * 1.10;

    if ($datosEstado['ta'] < $min_ta || $datosEstado['ta'] > $max_ta) $alarmaNueva = true;
    elseif ($datosEstado['tp'] < $min_tp || $datosEstado['tp'] > $max_tp) $alarmaNueva = true;
    elseif ($datosEstado['h'] < $min_h || $datosEstado['h'] > $max_h) $alarmaNueva = true;

    $datosEstado['alarma_activa'] = $alarmaNueva;

    file_put_contents($estadoFile, json_encode($datosEstado, JSON_PRETTY_PRINT), LOCK_EX);
    $ultimaModificacion = @filemtime($fileTempHum);
    if ($ultimaModificacion === false) $ultimaModificacion = 0;

    if (((time() - $ultimaModificacion) > $intervaloHistorial) || ($alarmaNueva && !$alarmaAnterior)) {
        $lineaTempHum = $timestamp . "," . $datosEstado['ta'] . "," . $datosEstado['tp'] . "," . $datosEstado['h'] . "\n";
        file_put_contents($fileTempHum, $lineaTempHum, FILE_APPEND | LOCK_EX);
    }
    
    $guardarSetpoints = true;
    if (file_exists($fileSetPoints)) {
        $lineas = file($fileSetPoints);
        $ultimaLinea = end($lineas);
        $partes = explode(',', $ultimaLinea);
        
        if (count($partes) >= 4) {
            $ultimoSetTA = (float)$partes[1];
            $ultimoSetTP = (float)$partes[2];
            $ultimoSetH  = (float)$partes[3];
            
            if ($ultimoSetTA == $datosEstado['set_ta'] && 
                $ultimoSetTP == $datosEstado['set_tp'] && 
                $ultimoSetH  == $datosEstado['set_h']) {
                $guardarSetpoints = false; 
            }
        }
    }
    
    if ($guardarSetpoints) {
        $lineaSetPoints = $timestamp . "," . $datosEstado['set_ta'] . "," . $datosEstado['set_tp'] . "," . $datosEstado['set_h'] . "\n";
        file_put_contents($fileSetPoints, $lineaSetPoints, FILE_APPEND | LOCK_EX);
    }
    
    echo json_encode(['status' => 'success', 'action' => 'ambiente_updated']);

} elseif (isset($_GET['peso'])) {
    
    $nuevoPeso = (float)$_GET['peso'];
    
    $datosEstado['peso_actual'] = $nuevoPeso;
    file_put_contents($estadoFile, json_encode($datosEstado, JSON_PRETTY_PRINT), LOCK_EX);
    $nuevoDatoJson = ['ts' => $timestamp, 'p' => $nuevoPeso];
    $datosPesoJson = file_exists($filePesoJson) ? json_decode(file_get_contents($filePesoJson), true) : [];
    if (!is_array($datosPesoJson)) $datosPesoJson = [];
    $datosPesoJson[] = $nuevoDatoJson;
    if (count($datosPesoJson) > 50) $datosPesoJson = array_slice($datosPesoJson, -50);
    file_put_contents($filePesoJson, json_encode($datosPesoJson, JSON_PRETTY_PRINT), LOCK_EX);
    $guardarPeso = true;
    if (file_exists($filePeso)) {
        $lineas = file($filePeso);
        $ultimaLinea = end($lineas);
        $partes = explode(',', $ultimaLinea);
        if (count($partes) >= 2 && (float)$partes[1] == $nuevoPeso) {
            $guardarPeso = false;
        }
    }

    if ($guardarPeso) {
        $lineaPeso = $timestamp . "," . $nuevoPeso . "\n";
        file_put_contents($filePeso, $lineaPeso, FILE_APPEND | LOCK_EX);
    }
    
    echo json_encode(['status' => 'success', 'action' => 'peso_updated']);

} elseif (isset($_GET['alarma_evento'])) {
    
    $inicio = $_GET['inicio'] ?? $timestamp;
    $fin = $_GET['fin'] ?? $timestamp;
    $duracion = $_GET['duracion'] ?? "00:00:00";
    $evento = $_GET['evento'] ?? "Alarma General";
    $pico_max = $_GET['pico_max'] ?? "-";
    $pico_min = $_GET['pico_min'] ?? "-";
    
    $linea_csv = "$inicio,$fin,$duracion,$evento,$pico_max,$pico_min\n";
    
    if (file_put_contents($fileAlarmas, $linea_csv, FILE_APPEND | LOCK_EX)) {
        echo json_encode(['status' => 'success', 'action' => 'alarma_registered']);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Error escribiendo alarma']);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Parametros insuficientes.']);
}
?>