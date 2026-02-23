/**
 * Smart Irrigation System - ESP32 Firmware
 * 
 * Version: 2.0 - Cloud-connected (AWS EC2) with Chilly device mapping
 * 
 * Hardware: ESP32 + DHT11 + Soil Moisture Sensor + Relay + SIM800L GSM
 * Server  : http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000
 * Device  : Chilly (b517b2a6-442e-46aa-873a-7adc0eb3840a)
 * Farm    : test farm (bd17c7be-9f95-4a56-ad35-a698d37d3513)
 */

#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <time.h>

// ──────────────────────────────────────────────
//  Hardware Configuration
// ──────────────────────────────────────────────
#define DHTPIN 4
#define DHTTYPE DHT11
#define SOIL_PIN 34
#define RELAY_PIN 23

// ──────────────────────────────────────────────
//  GSM (SIM800L) Configuration
// ──────────────────────────────────────────────
#define SIM800_TX 16  // ESP32 RX2 <- SIM800L TX
#define SIM800_RX 17  // ESP32 TX2 -> SIM800L RX
const char* phoneNumber = "+918129437037";
HardwareSerial sim800(2);  // UART2

// ──────────────────────────────────────────────
//  WiFi Credentials
// ──────────────────────────────────────────────
const char* ssid     = "V_R0N1CA";
const char* password = "jebin7037";

// ──────────────────────────────────────────────
//  Cloud API Configuration (AWS EC2)
// ──────────────────────────────────────────────
const char* apiUrl   = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/sensor/ingest";
const char* apiStartLogUrl = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/start";
const char* apiStopLogUrl = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/stop";
const char* farmId   = "bd17c7be-9f95-4a56-ad35-a698d37d3513";   // test farm
const char* deviceId = "b517b2a6-442e-46aa-873a-7adc0eb3840a";   // Chilly device

// ──────────────────────────────────────────────
//  Timing Configuration
// ──────────────────────────────────────────────
const unsigned long SEND_INTERVAL       = 10000;     // Data push every 10 s
const unsigned long STATUS_SMS_INTERVAL = 300000;   // Periodic SMS every 5 minß
const unsigned long WIFI_RETRY_INTERVAL = 30000;    // WiFi reconnect attempt every 30 s
const int           WIFI_CONNECT_TIMEOUT = 40;      // Max connection attempts at boot

// ──────────────────────────────────────────────
//  NTP & Queue Configuration
// ──────────────────────────────────────────────
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 19800; // India Time (IST) +5:30
const int   daylightOffset_sec = 0;

#define QUEUE_SIZE 10

struct IrrigationEvent {
  bool isStart;
  time_t timestamp;
};

IrrigationEvent eventQueue[QUEUE_SIZE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

const unsigned long QUEUE_PROCESS_INTERVAL = 5000;
unsigned long lastQueueProcessTime = 0;

// ──────────────────────────────────────────────
//  Global Objects
// ──────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);

// ──────────────────────────────────────────────
//  State Variables
// ──────────────────────────────────────────────
unsigned long lastSendTime          = 0;
unsigned long lastStatusSmsTime     = 0;
unsigned long lastWifiRetryTime     = 0;
unsigned long manualIrrigationEnd   = 0;  // millis() timestamp when manual irrigation stops

bool wifiWasDown     = false;
bool lastPumpState   = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GSM Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void initGSM() {
  sim800.begin(9600, SERIAL_8N1, SIM800_TX, SIM800_RX);
  delay(3000);
  Serial.println("Initializing GSM module...");

  sim800.println("AT");
  delay(1000);
  while (sim800.available()) Serial.write(sim800.read());

  sim800.println("AT+CMGF=1");   // SMS text mode
  delay(1000);
  while (sim800.available()) Serial.write(sim800.read());

  sim800.println("AT+CSCS=\"GSM\"");
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
  sim800.write(26);   // Ctrl+Z
  delay(5000);

  while (sim800.available()) Serial.write(sim800.read());
  Serial.println("\nSMS sent.");
}

void sendStatusSMS(float temp, float hum, int soil, bool pumpOn) {
  char msg[200];
  snprintf(msg, sizeof(msg),
    "[Chilly] STATUS:\n"
    "Temp: %.1f C\n"
    "Humidity: %.1f%%\n"
    "Soil: %d%%\n"
    "Pump: %s\n"
    "WiFi: %s",
    isnan(temp) ? 0.0f : temp,
    isnan(hum)  ? 0.0f : hum,
    soil,
    pumpOn ? "ON" : "OFF",
    WiFi.status() == WL_CONNECTED ? "OK" : "DOWN");
  sendSMS(msg);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WiFi Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_CONNECT_TIMEOUT) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
    
    // Sync time with NTP
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 10000)) {
      Serial.println("Time synchronized.");
    } else {
      Serial.println("Failed to synchronize time.");
    }

    if (wifiWasDown) {
      wifiWasDown = false;
      Serial.println("WiFi recovered.");
    }
  } else {
    Serial.println("\nWiFi connection failed!");
    if (!wifiWasDown) {
      wifiWasDown = true;
      sendSMS("[Chilly] ALERT: WiFi connection failed. Sensor data not reaching cloud.");
    }
  }
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  // Attempt reconnect at intervals
  if (millis() - lastWifiRetryTime >= WIFI_RETRY_INTERVAL) {
    lastWifiRetryTime = millis();
    Serial.println("Attempting WiFi reconnect...");
    WiFi.disconnect();
    connectWiFi();
  }
  return WiFi.status() == WL_CONNECTED;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Event Queue Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void enqueueIrrigationEvent(bool isStart) {
  time_t now;
  time(&now);
  
  if (queueCount < QUEUE_SIZE) {
    eventQueue[queueTail].isStart = isStart;
    eventQueue[queueTail].timestamp = now;
    queueTail = (queueTail + 1) % QUEUE_SIZE;
    queueCount++;
    Serial.printf("Enqueued event: %s at %ld. Queue size: %d\n", isStart ? "START" : "STOP", (long)now, queueCount);
  } else {
    Serial.println("Queue is full! Overwriting oldest event.");
    eventQueue[queueHead].isStart = isStart;
    eventQueue[queueHead].timestamp = now;
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueTail = (queueTail + 1) % QUEUE_SIZE;
    Serial.printf("Queue size: %d\n", queueCount);
  }
}

void processEventQueue() {
  if (queueCount == 0 || !ensureWiFi()) {
    return;
  }

  IrrigationEvent event = eventQueue[queueHead];
  
  HTTPClient http;
  const char* url = event.isStart ? apiStartLogUrl : apiStopLogUrl;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  StaticJsonDocument<256> doc;
  doc["device_id"] = deviceId;
  doc["farm_id"] = farmId;
  doc["timestamp"] = event.timestamp;
  
  String payload;
  serializeJson(doc, payload);

  Serial.printf("POST %s\n  Payload: %s\n", url, payload.c_str());
  
  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("  Response [%d]: %s\n", httpCode, response.c_str());
    
    // Dequeue on success (2xx) or explicit client error (4xx) so we don't get stuck
    if (httpCode >= 200 && httpCode < 500) {
      queueHead = (queueHead + 1) % QUEUE_SIZE;
      queueCount--;
      Serial.printf("Event processed. Queue size: %d\n", queueCount);
    } else {
       Serial.printf("Server error %d. Retrying later.\n", httpCode);
    }
  } else {
     Serial.printf("  HTTP Error [%d]: %s\n", httpCode, http.errorToString(httpCode).c_str());
  }
  http.end();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Cloud Data Push & Command Polling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void sendToCloudAndPollCommands(float temp, float hum, int soil) {
  if (!ensureWiFi()) {
    // Offline — send periodic SMS
    if (millis() - lastStatusSmsTime >= STATUS_SMS_INTERVAL) {
      lastStatusSmsTime = millis();
      sendStatusSMS(temp, hum, soil, digitalRead(RELAY_PIN) == HIGH);
      Serial.println("SMS: Periodic status sent (offline).");
    }
    return;
  }

  // WiFi just recovered
  if (wifiWasDown) {
    wifiWasDown = false;
    Serial.println("WiFi recovered — resuming cloud data push.");
  }

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);  // 10 s timeout for cloud calls

  // Build JSON payload matching the server's sensorSchema:
  //   { farm_id, sensor_id, temperature, humidity, soil_moisture }
  StaticJsonDocument<256> doc;
  doc["farm_id"]       = farmId;
  doc["sensor_id"]     = deviceId;   // Maps to the Chilly device UUID
  doc["temperature"]   = isnan(temp) ? 0.0 : temp;
  doc["humidity"]      = isnan(hum)  ? 0.0 : hum;
  doc["soil_moisture"] = soil;

  String payload;
  serializeJson(doc, payload);

  Serial.printf("POST %s\n", apiUrl);
  Serial.printf("  Payload: %s\n", payload.c_str());

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("  Response [%d]: %s\n", httpCode, response.c_str());

    // Parse response for pending commands (irrigation control etc.)
    StaticJsonDocument<1024> respDoc;
    DeserializationError err = deserializeJson(respDoc, response);

    if (!err && respDoc.containsKey("commands")) {
      JsonArray commands = respDoc["commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        processCommand(cmd);
      }
    }
  } else {
    Serial.printf("  HTTP Error [%d]: %s\n", httpCode, http.errorToString(httpCode).c_str());

    // Server unreachable — fall back to SMS
    if (!wifiWasDown) {
      wifiWasDown = true;
      sendSMS("[Chilly] ALERT: Cloud server unreachable. API error.");
      lastStatusSmsTime = millis();
    }
    if (millis() - lastStatusSmsTime >= STATUS_SMS_INTERVAL) {
      lastStatusSmsTime = millis();
      sendStatusSMS(temp, hum, soil, digitalRead(RELAY_PIN) == HIGH);
    }
  }

  http.end();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Command Processing (from backend)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void processCommand(JsonObject cmd) {
  const char* commandType = cmd["command"];
  Serial.printf("Command received: %s\n", commandType);

  if (strcmp(commandType, "START_IRRIGATION") == 0) {
    int duration = cmd["payload"]["duration"];  // seconds
    if (duration > 0) {
      manualIrrigationEnd = millis() + ((unsigned long)duration * 1000UL);
      Serial.printf("  Manual irrigation started for %d seconds.\n", duration);
      char smsMsg[100];
      snprintf(smsMsg, sizeof(smsMsg), "[Chilly] Irrigation started for %d seconds (remote command).", duration);
      sendSMS(smsMsg);
    }
  } else if (strcmp(commandType, "STOP_IRRIGATION") == 0) {
    manualIrrigationEnd = 0;
    Serial.println("  Manual irrigation stopped.");
    sendSMS("[Chilly] Irrigation stopped (remote command).");
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println(" Smart Irrigation v2.0 — Chilly Device");
  Serial.println("========================================");

  dht.begin();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  initGSM();
  connectWiFi();

  Serial.printf("Farm ID  : %s\n", farmId);
  Serial.printf("Device ID: %s\n", deviceId);
  Serial.printf("API URL  : %s\n", apiUrl);
  Serial.println("Setup complete. Entering main loop.\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Main Loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

void loop() {
  // ── 1. Read Sensors ──
  float humidity    = dht.readHumidity();
  float temperature = dht.readTemperature();
  int   soilRaw     = analogRead(SOIL_PIN);
  int   soilPercent = map(soilRaw, 4095, 0, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);

  // ── 2. Irrigation Control Logic ──
  bool shouldBeOn = false;

  // Auto: turn on when soil moisture is too low
  if (soilPercent < 25) {
    shouldBeOn = true;
    Serial.println("Auto-Irrigation: Soil moisture low.");
  }

  // Manual override from cloud command
  if (millis() < manualIrrigationEnd) {
    shouldBeOn = true;
    unsigned long remaining = (manualIrrigationEnd - millis()) / 1000;
    Serial.printf("Manual-Irrigation active: %lu s remaining.\n", remaining);
  }

  // Set relay
  digitalWrite(RELAY_PIN, shouldBeOn ? HIGH : LOW);

  // ── 3. Pump State Change SMS & Logging ──
  if (shouldBeOn != lastPumpState) {
    if (shouldBeOn) {
      sendSMS("[Chilly] Pump Turned ON — Irrigation started.");
      enqueueIrrigationEvent(true);
    } else {
      sendSMS("[Chilly] Pump Turned OFF — Irrigation stopped.");
      enqueueIrrigationEvent(false);
    }
    lastPumpState = shouldBeOn;
  }

  // ── 4. Process Event Queue ──
  if (millis() - lastQueueProcessTime >= QUEUE_PROCESS_INTERVAL) {
    lastQueueProcessTime = millis();
    processEventQueue();
  }

  // ── 5. Periodic Cloud Push & Command Poll ──
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = millis();
    sendToCloudAndPollCommands(temperature, humidity, soilPercent);
  }

  delay(2000);
}
