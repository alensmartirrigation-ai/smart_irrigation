/**
 * Smart Irrigation System - ESP32 Firmware
 * 
 * Version: 1.1 - Added Remote Relay Control support
 */

#include "DHT.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- Hardware Configuration ----
#define DHTPIN 4
#define DHTTYPE DHT11
#define SOIL_PIN 34
#define RELAY_PIN 23

// ---- WiFi Credentials ----
const char* ssid = "FTTH";
const char* password = "sini1125";

// ---- API Configuration ----
const char* apiUrl = "http://192.168.1.34:4000/api/sensor/ingest";
const char* farmId = "farm-01";
const char* sensorId = "fc9dd0ac-558c-460b-ab78-28efacc0256c";

// ---- Global Objects ----
DHT dht(DHTPIN, DHTTYPE);

// ---- State Variables ----
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000;
unsigned long manualIrrigationEndTime = 0; // Timestamp when manual irrigation should stop

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
}

void loop() {
  // 1. Read Sensors
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int soilValue = analogRead(SOIL_PIN);
  int soilPercent = map(soilValue, 4095, 0, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);

  // 2. Control Logic
  bool shouldBeOn = false;
  
  // Auto Logic (Sensor-based)
  if (soilPercent < 25) {
    shouldBeOn = true;
    Serial.println("Auto-Irrigation: Soil moisture low.");
  }

  // Manual Override (API-based)
  if (millis() < manualIrrigationEndTime) {
    shouldBeOn = true;
    unsigned long remaining = (manualIrrigationEndTime - millis()) / 1000;
    Serial.printf("Manual-Irrigation active: %lu seconds remaining.\n", remaining);
  }

  // Set Relay
  if (shouldBeOn) {
    digitalWrite(RELAY_PIN, HIGH);
  } else {
    digitalWrite(RELAY_PIN, LOW);
  }

  // 3. Periodic Data Push & Command Poll
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    sendSensorAndPollCommands(temperature, humidity, soilPercent);
  }

  delay(2000);
}

/**
 * Sends sensor data and checks for pending commands in the response.
 */
void sendSensorAndPollCommands(float temp, float hum, int soil) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["farm_id"] = farmId;
  doc["sensor_id"] = sensorId;
  doc["temperature"] = isnan(temp) ? 0.0 : temp;
  doc["humidity"] = isnan(hum) ? 0.0 : hum;
  doc["soil_moisture"] = soil;

  String jsonString;
  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("API Response [%d]: %s\n", httpResponseCode, response.c_str());
    
    // Parse response for commands
    StaticJsonDocument<1024> respDoc;
    DeserializationError error = deserializeJson(respDoc, response);
    
    if (!error && respDoc.containsKey("commands")) {
      JsonArray commands = respDoc["commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        processCommand(cmd);
      }
    }
  } else {
    Serial.printf("API Error [%d]\n", httpResponseCode);
  }
  http.end();
}

/**
 * Handles commands received from the backend.
 */
void processCommand(JsonObject cmd) {
  const char* commandType = cmd["command"];
  Serial.printf("Received Command: %s\n", commandType);

  if (strcmp(commandType, "START_IRRIGATION") == 0) {
    int duration = cmd["payload"]["duration"]; // in seconds
    if (duration > 0) {
      manualIrrigationEndTime = millis() + (duration * 1000);
      Serial.printf("Started manual irrigation for %d seconds.\n", duration);
    }
  } else if (strcmp(commandType, "STOP_IRRIGATION") == 0) {
    manualIrrigationEndTime = 0;
    Serial.println("Stopped manual irrigation.");
  }
}
