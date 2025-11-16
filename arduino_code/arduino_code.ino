#include <ESP8266WiFi.h>
#include <DHT.h>
#include <ESP8266HTTPClient.h>

#define DHTTYPE DHT11
#define DHTPIN 4 
DHT dht(DHTPIN, DHTTYPE); 
float temp_aire = 0.0;
float temp_piel = 0.0;
float humedad = 0.0;

const char* ssid     = "TeleCentro-5e16";//"San lorenzo el mas grande"; //"Galaxy A52 CB08";
const char* password = "pablo2020";//"aaa12345";//"gouu2562";
const char* host     = "192.168.0.44";//"10.204.168.47";//"192.168.6.47";
const uint16_t httpPort = 80;
const char* script   = "/ESP8266/index.php";

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConectado.");
}

void loop() {
  delay(2000); 

  temp_aire= 36.3;
  temp_piel= 37.0;
  humedad = 80.0;

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    String url = "http://" + String(host) + String(script);
    url += "?temp_aire=" + String(temp_aire);
    url += "&humedad=" + String(humedad);
    url += "&temp_piel=" + String(temp_piel); 
    url += "&id=1";
    url += "&setpoint_temp_aire=36.5";
    url += "&setpoint_temp_piel=37";
    url += "&setpoint_humedad=80";

    Serial.print("Enviando a URL: ");
    Serial.println(url);

    if (http.begin(client, url)) {
      int httpCode = http.GET();
      if (httpCode > 0) {
        Serial.print("Codigo de respuesta HTTP: ");
        Serial.println(httpCode);
        
        String payload = http.getString();
        Serial.println("Respuesta del servidor:");
        Serial.println(payload);
      } else {
        Serial.print("Fallo en GET, error: ");
        Serial.println(http.errorToString(httpCode).c_str());
      }
      http.end();
    } else {
      Serial.println("No se pudo conectar al servidor.");
    }
  } else {
    Serial.println("WiFi desconectado.");
  }
}