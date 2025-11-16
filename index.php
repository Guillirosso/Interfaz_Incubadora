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
$fileSetPoints = $incubadoraPath . "/setPoints_Inc" . $id . ".csv";
$fileAlarmas   = $incubadoraPath . "/alarmas_Inc" . $id . ".csv";

if (!file_exists($baseDir)) { @mkdir($baseDir, 0777, true); }
if (!file_exists($incubadoraPath)) { @mkdir($incubadoraPath, 0777, true); }

$datosEstado = file_exists($estadoFile) ? json_decode(file_get_contents($estadoFile), true) : [];
if (!is_array($datosEstado)) $datosEstado = [];

$alarmaAnterior = $datosEstado['alarma_activa'] ?? false;
$alarmaInfoAnterior = [
    'start_time' => $datosEstado['alarma_start_time'] ?? null,
    'peak_value' => $datosEstado['alarma_peak_value'] ?? null,
    'type'       => $datosEstado['alarma_type'] ?? null,
    'message'    => $datosEstado['alarma_message'] ?? null
];

if (isset($_GET['temp_aire']) && isset($_GET['temp_piel']) && isset($_GET['humedad'])) {
    $datosEstado['ta'] = (float)$_GET['temp_aire'];
    $datosEstado['tp'] = (float)$_GET['temp_piel'];
    $datosEstado['h'] = (float)$_GET['humedad'];
    $datosEstado['set_ta'] = (float)$_GET['setpoint_temp_aire'];
    $datosEstado['set_tp'] = (float)$_GET['setpoint_temp_piel'];
    $datosEstado['set_h'] = (float)$_GET['setpoint_humedad'];
    $datosEstado['ts_ambiente'] = time();

    $alarmaNueva = false;
    $mensaje_alarma = "";
    $tipo_alarma = "";
    $valor_alarma = null;

    $min_ta = $datosEstado['set_ta'] - 2;
    $max_ta = $datosEstado['set_ta'] + 2;
    $min_tp = $datosEstado['set_tp'] - 2;
    $max_tp = $datosEstado['set_tp'] + 2;
    $min_h = $datosEstado['set_h'] - ($datosEstado['set_h'] * 0.10);
    $max_h = $datosEstado['set_h'] + ($datosEstado['set_h'] * 0.10);

    if ($datosEstado['ta'] < $min_ta || $datosEstado['ta'] > $max_ta) {
        $alarmaNueva = true;
        $tipo_alarma = "Temp. Aire";
        $valor_alarma = $datosEstado['ta'];
        $mensaje_alarma = "Temp. Aire fuera de rango";
    } elseif ($datosEstado['tp'] < $min_tp || $datosEstado['tp'] > $max_tp) {
        $alarmaNueva = true;
        $tipo_alarma = "Temp. Piel";
        $valor_alarma = $datosEstado['tp'];
        $mensaje_alarma = "Temp. Piel fuera de rango";
    } elseif ($datosEstado['h'] < $min_h || $datosEstado['h'] > $max_h) {
        $alarmaNueva = true;
        $tipo_alarma = "Humedad";
        $valor_alarma = $datosEstado['h'];
        $mensaje_alarma = "Humedad fuera de rango";
    }

    $datosEstado['alarma_activa'] = $alarmaNueva;

    if (!$alarmaAnterior && $alarmaNueva) {
        $datosEstado['alarma_start_time'] = $timestamp;
        $datosEstado['alarma_peak_value'] = $valor_alarma; 
        $datosEstado['alarma_type'] = $tipo_alarma;
        $datosEstado['alarma_message'] = $mensaje_alarma;
    
    } elseif ($alarmaAnterior && $alarmaNueva) {
        if ($tipo_alarma == $alarmaInfoAnterior['type']) {
            $pico_guardado = $alarmaInfoAnterior['peak_value'];
            if ($valor_alarma > $pico_guardado) $datosEstado['alarma_peak_value'] = $valor_alarma;
            if ($valor_alarma < $pico_guardado) $datosEstado['alarma_peak_value'] = $valor_alarma;
        }
        
    } elseif ($alarmaAnterior && !$alarmaNueva) {
        $startTime = new DateTime($alarmaInfoAnterior['start_time']);
        $endTime = new DateTime($timestamp);
        $duracion = $startTime->diff($endTime)->format('%H:%I:%S'); 
        
        $pico = $alarmaInfoAnterior['peak_value'];
        $mensaje = $alarmaInfoAnterior['message'];
        $unidad = ($alarmaInfoAnterior['type'] == "Humedad") ? "%" : "°C";

        $lineaAlarma = "{$alarmaInfoAnterior['start_time']},{$timestamp},{$duracion},{$mensaje} (Pico: {$pico}{$unidad})\n";
        file_put_contents($fileAlarmas, $lineaAlarma, FILE_APPEND | LOCK_EX);

        unset($datosEstado['alarma_start_time']);
        unset($datosEstado['alarma_peak_value']);
        unset($datosEstado['alarma_type']);
        unset($datosEstado['alarma_message']);
    }

    file_put_contents($estadoFile, json_encode($datosEstado, JSON_PRETTY_PRINT), LOCK_EX);

    $ultimaModificacion = @filemtime($fileTempHum);
    if ($ultimaModificacion === false) $ultimaModificacion = 0;

    if (((time() - $ultimaModificacion) > $intervaloHistorial) || $alarmaNueva) {
        $lineaTempHum = $timestamp . "," . $datosEstado['ta'] . "," . $datosEstado['tp'] . "," . $datosEstado['h'] . "\n";
        file_put_contents($fileTempHum, $lineaTempHum, FILE_APPEND | LOCK_EX);
    }
    
    $ultimaLineaSP = '';
    if (file_exists($fileSetPoints)) {
        $f = @fopen($fileSetPoints, 'r');
        if ($f) {
            $cursor = -1;
            fseek($f, $cursor, SEEK_END); $char = fgetc($f);
            while ($char === "\n" || $char === "\r") { fseek($f, $cursor--, SEEK_END); $char = fgetc($f); }
            while ($char !== false && $char !== "\n" && $char !== "\r") { $ultimaLineaSP = $char . $ultimaLineaSP; fseek($f, $cursor--, SEEK_END); $char = fgetc($f); }
            fclose($f);
        }
    }
    $partes = explode(',', $ultimaLineaSP);
    $ultimoSetTA = $partes[1] ?? null;
    $ultimoSetTP = $partes[2] ?? null;
    $ultimoSetH  = $partes[3] ?? null;
    
    if ((float)$ultimoSetTA != $datosEstado['set_ta'] || 
        (float)$ultimoSetTP != $datosEstado['set_tp'] || 
        (float)$ultimoSetH  != $datosEstado['set_h'] ) {
        
        $lineaSetPoints = $timestamp . "," . $datosEstado['set_ta'] . "," . $datosEstado['set_tp'] . "," . $datosEstado['set_h'] . "\n";
        file_put_contents($fileSetPoints, $lineaSetPoints, FILE_APPEND | LOCK_EX);
    }
}

if (isset($_GET['peso'])) {
    $nuevoPeso = (float)$_GET['peso'];
    $datosEstado['peso_actual'] = $nuevoPeso;
    file_put_contents($estadoFile, json_encode($datosEstado, JSON_PRETTY_PRINT), LOCK_EX);

    $ultimoPesoHistorial = null;
    if (file_exists($filePeso)) {
        $f = @fopen($filePeso, 'r');
        if ($f) {
            $cursor = -1;
            fseek($f, $cursor, SEEK_END); $char = fgetc($f);
            while ($char === "\n" || $char === "\r") { fseek($f, $cursor--, SEEK_END); $char = fgetc($f); }
            $ultimaLineaPeso = '';
            while ($char !== false && $char !== "\n" && $char !== "\r") { $ultimaLineaPeso = $char . $ultimaLineaPeso; fseek($f, $cursor--, SEEK_END); $char = fgetc($f); }
            fclose($f);
            $partes = explode(',', $ultimaLineaPeso);
            $ultimoPesoHistorial = $partes[1] ?? null;
        }
    }

    if ($nuevoPeso != (float)$ultimoPesoHistorial) {
        $lineaPeso = $timestamp . "," . $nuevoPeso . "\n";
        file_put_contents($filePeso, $lineaPeso, FILE_APPEND | LOCK_EX);
    }
}

echo json_encode(['status' => 'success', 'id_processed' => $id]);
?>