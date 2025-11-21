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

// --- LEER ESTADO ---
$datosEstado = [];
if (file_exists($estadoFile)) {
    $fp = fopen($estadoFile, 'r');
    if ($fp && flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        $datosEstado = json_decode($content, true);
        flock($fp, LOCK_UN);
    }
    if ($fp) fclose($fp);
}
if (!is_array($datosEstado)) $datosEstado = [];

$alarmaAnterior = $datosEstado['alarma_activa'] ?? false;

// 1. AMBIENTE
if (isset($_GET['temp_aire']) && isset($_GET['temp_piel']) && isset($_GET['humedad'])) {
    $datosEstado['ta'] = (float)$_GET['temp_aire'];
    $datosEstado['tp'] = (float)$_GET['temp_piel'];
    $datosEstado['h'] = (float)$_GET['humedad'];
    
    if(isset($_GET['setpoint_temp_aire'])) $datosEstado['set_ta'] = (float)$_GET['setpoint_temp_aire'];
    if(isset($_GET['setpoint_temp_piel'])) $datosEstado['set_tp'] = (float)$_GET['setpoint_temp_piel'];
    if(isset($_GET['setpoint_humedad']))   $datosEstado['set_h']  = (float)$_GET['setpoint_humedad'];
    
    if(!isset($datosEstado['set_ta'])) $datosEstado['set_ta'] = 36.5;
    if(!isset($datosEstado['set_tp'])) $datosEstado['set_tp'] = 36.0;
    if(!isset($datosEstado['set_h']))  $datosEstado['set_h']  = 60;

    $datosEstado['ts_ambiente'] = time();
    $alarmaNueva = false;
    $motivoAlarma = "";

    $min_ta = $datosEstado['set_ta'] - 2; $max_ta = $datosEstado['set_ta'] + 2;
    $min_tp = $datosEstado['set_tp'] - 2; $max_tp = $datosEstado['set_tp'] + 2;
    $min_h  = $datosEstado['set_h'] * 0.90; $max_h = $datosEstado['set_h'] * 1.10;

    if ($datosEstado['ta'] < $min_ta || $datosEstado['ta'] > $max_ta) {
        $alarmaNueva = true; $motivoAlarma = "Fallo Temp Aire";
    }
    elseif ($datosEstado['tp'] < $min_tp || $datosEstado['tp'] > $max_tp) {
        $alarmaNueva = true; $motivoAlarma = "Fallo Temp Piel";
    }
    elseif ($datosEstado['h'] < $min_h || $datosEstado['h'] > $max_h) {
        $alarmaNueva = true; $motivoAlarma = "Fallo Humedad";
    }

    $alarmaTermino = false; 

    if ($alarmaNueva && !$alarmaAnterior) {
        $datosEstado['alarma_inicio'] = $timestamp;
        $datosEstado['alarma_pico_max'] = $datosEstado['ta']; 
        $datosEstado['alarma_pico_min'] = $datosEstado['ta'];
        $datosEstado['alarma_motivo'] = $motivoAlarma;
    }
    elseif ($alarmaNueva && $alarmaAnterior) {
        if (!isset($datosEstado['alarma_pico_max'])) $datosEstado['alarma_pico_max'] = $datosEstado['ta'];
        if (!isset($datosEstado['alarma_pico_min'])) $datosEstado['alarma_pico_min'] = $datosEstado['ta'];
        
        if ($datosEstado['ta'] > $datosEstado['alarma_pico_max']) $datosEstado['alarma_pico_max'] = $datosEstado['ta'];
        if ($datosEstado['ta'] < $datosEstado['alarma_pico_min']) $datosEstado['alarma_pico_min'] = $datosEstado['ta'];
        
        if (!empty($motivoAlarma)) $datosEstado['alarma_motivo'] = $motivoAlarma;
    }
    elseif (!$alarmaNueva && $alarmaAnterior) {
        $alarmaTermino = true; 

        $inicio = $datosEstado['alarma_inicio'] ?? $timestamp;
        $fin = $timestamp;
        
        $startObj = new DateTime($inicio);
        $endObj = new DateTime($fin);
        $diff = $startObj->diff($endObj);
        $duracion = $diff->format('%H:%I:%S');
        
        $evento = $datosEstado['alarma_motivo'] ?? "Parametros fuera de rango";
        $picoMax = $datosEstado['alarma_pico_max'] ?? '-';
        $picoMin = $datosEstado['alarma_pico_min'] ?? '-';
        
        $lineaCSV = "$inicio,$fin,$duracion,$evento,$picoMax,$picoMin\n";
        file_put_contents($fileAlarmas, $lineaCSV, FILE_APPEND | LOCK_EX);
        
        unset($datosEstado['alarma_inicio']);
        unset($datosEstado['alarma_pico_max']);
        unset($datosEstado['alarma_pico_min']);
        unset($datosEstado['alarma_motivo']);
    }

    $datosEstado['alarma_activa'] = $alarmaNueva;

    file_put_contents($estadoFile, json_encode($datosEstado, JSON_PRETTY_PRINT), LOCK_EX);
    
    $ultimaModificacion = @filemtime($fileTempHum);
    if ($ultimaModificacion === false) $ultimaModificacion = 0;

    if (((time() - $ultimaModificacion) > $intervaloHistorial) || $alarmaNueva || $alarmaTermino) {
        $lineaTempHum = $timestamp . "," . $datosEstado['ta'] . "," . $datosEstado['tp'] . "," . $datosEstado['h'] . "\n";
        file_put_contents($fileTempHum, $lineaTempHum, FILE_APPEND | LOCK_EX);
    }
    
    $guardarSetpoints = true;
    if (file_exists($fileSetPoints)) {
        $lineas = file($fileSetPoints);
        $ultimaLinea = end($lineas);
        $partes = explode(',', $ultimaLinea);
        if (count($partes) >= 4) {
            if ((float)$partes[1] == $datosEstado['set_ta'] && 
                (float)$partes[2] == $datosEstado['set_tp'] && 
                (float)$partes[3] == $datosEstado['set_h']) {
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
        if (count($partes) >= 2 && (float)$partes[1] == $nuevoPeso) { $guardarPeso = false; }
    }
    if ($guardarPeso) {
        $lineaPeso = $timestamp . "," . $nuevoPeso . "\n";
        file_put_contents($filePeso, $lineaPeso, FILE_APPEND | LOCK_EX);
    }
    echo json_encode(['status' => 'success', 'action' => 'peso_updated']);

} else {
    echo json_encode(['status' => 'error', 'message' => 'Parametros insuficientes.']);
}
?>