/**
 * Smart Irrigation System - ESP32 Firmware
 * 
 * Version: 1.3 - Added periodic SMS status updates & pump state notifications
 */

#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// ---- Hardware Configuration ----
#define DHTPIN 4
#define DHTTYPE DHT11
#define SOIL_PIN 34
#define RELAY_PIN 23

// ---- GSM (SIM800L) Configuration ----
#define SIM800_TX 16  // ESP32 RX2 <- SIM800L TX
#define SIM800_RX 17  // ESP32 TX2 -> SIM800L RX
const char* phoneNumber = "+918129437037";
HardwareSerial sim800(2);  // Use UART2

// ---- WiFi Credentials ----
const char* ssid = "V_RON1CA";
const char* password = "jebin7037";

// ---- API Configuration ----
const char* apiUrl = "http://192.168.2.1:4000/api/sensor/ingest";
const char* farmId = "farm-01";
const char* sensorId = "fc9dd0ac-558c-460b-ab78-28efacc0256c";

// ---- Global Objects ----
DHT dht(DHTPIN, DHTTYPE);

// ---- State Variables ----
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000;
unsigned long manualIrrigationEndTime = 0; // Timestamp when manual irrigation should stop

// ---- SMS State Tracking (to avoid duplicate SMS) ----
bool wifiWasDown = false;
bool lastPumpState = false;

// ---- Periodic SMS Status Timer ----
unsigned long lastStatusSmsTime = 0;
const unsigned long statusSmsInterval = 300000;  // 5 minutes in ms

// ---- GSM Functions ----
void initGSM() {
  sim800.begin(9600, SERIAL_8N1, SIM800_TX, SIM800_RX);
  delay(3000);  // Wait for SIM800L to boot
  Serial.println("Initializing GSM module...");

  sim800.println("AT");
  delay(1000);
  while (sim800.available()) Serial.write(sim800.read());

  sim800.println("AT+CMGF=1");  // Set SMS to text mode
  delay(1000);
  while (sim800.available()) Serial.write(sim800.read());

  sim800.println("AT+CSCS=\"GSM\"");  // Set character set
  delay(1000);
  while (sim800.available()) Serial.write(sim800.read());

  Serial.println("GSM module initialized.");
}

void sendSMS(const char* message) {
  Serial.printf("Sending SMS to %s: %s\n", phoneNumber, message);

  sim800.print("AT+CMGS=\"");
  sim800.print(phoneNumber);
  sim800.println("\"");
  delay(1000);

  sim800.print(message);
  delay(100);
  sim800.write(26);  // Ctrl+Z to send
  delay(5000);       // Wait for SMS to be sent

  while (sim800.available()) {
    char c = sim800.read();
    Serial.write(c);
  }
  Serial.println("\nSMS sent.");
}

/**
 * Sends a periodic status SMS with current sensor readings and pump state.
 */
void sendStatusSMS(float temp, float hum, int soil, bool pumpOn) {
  char msg[200];
  snprintf(msg, sizeof(msg),
    "STATUS UPDATE:\n"
    "Temp: %.1f C\n"
    "Humidity: %.1f%%\n"
    "Soil Moisture: %d%%\n"
    "Pump: %s",
    isnan(temp) ? 0.0f : temp,
    isnan(hum) ? 0.0f : hum,
    soil,
    pumpOn ? "ON" : "OFF");
  sendSMS(msg);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Initialize GSM module
  initGSM();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 40) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
  } else {
    Serial.println("\nWiFi connection failed!");
    wifiWasDown = true;
    sendSMS("ALERT: Smart Irrigation - WiFi connection failed at startup. Unable to send sensor data to server.");
  }
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

  // 3. Pump State Change SMS
  if (shouldBeOn != lastPumpState) {
    if (shouldBeOn) {
      sendSMS("Smart Irrigation - Pump Turned ON. Irrigation started.");
      Serial.println("SMS: Pump ON notification sent.");
    } else {
      sendSMS("Smart Irrigation - Pump Turned OFF. Irrigation stopped.");
      Serial.println("SMS: Pump OFF notification sent.");
    }
    lastPumpState = shouldBeOn;
  }

  // 4. Periodic Data Push & Command Poll
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
  // WiFi down detection & SMS alert
  if (WiFi.status() != WL_CONNECTED) {
    if (!wifiWasDown) {
      wifiWasDown = true;
      sendSMS("ALERT: Smart Irrigation - WiFi is down. Unable to send sensor data to server.");
      Serial.println("SMS: WiFi down notification sent.");
      lastStatusSmsTime = millis();  // Reset timer on first disconnect
    }

    // Periodic status SMS every 5 minutes while offline
    if (millis() - lastStatusSmsTime >= statusSmsInterval) {
      lastStatusSmsTime = millis();
      sendStatusSMS(temp, hum, soil, digitalRead(RELAY_PIN) == HIGH);
      Serial.println("SMS: Periodic status update sent (WiFi down).");
    }
    return;
  }

  // WiFi recovered
  if (wifiWasDown) {
    wifiWasDown = false;
    Serial.println("WiFi reconnected.");
  }

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
    // HTTP error (server unreachable) — also treated as connectivity issue
    if (!wifiWasDown) {
      wifiWasDown = true;
      sendSMS("ALERT: Smart Irrigation - Unable to reach server. API error occurred.");
      Serial.println("SMS: Server unreachable notification sent.");
      lastStatusSmsTime = millis();
    }

    // Periodic status SMS every 5 minutes while server unreachable
    if (millis() - lastStatusSmsTime >= statusSmsInterval) {
      lastStatusSmsTime = millis();
      sendStatusSMS(temp, hum, soil, digitalRead(RELAY_PIN) == HIGH);
      Serial.println("SMS: Periodic status update sent (server unreachable).");
    }
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
