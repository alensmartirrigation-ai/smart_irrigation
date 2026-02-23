/**
 * Smart Irrigation System - ESP32 Firmware
 *
 * Version: 2.1 - SMS Fallback State Machine
 *
 * Hardware: ESP32 + DHT11 + Soil Moisture Sensor + Relay + SIM800L GSM
 * Server  : http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000
 * Device  : Chilly (b517b2a6-442e-46aa-873a-7adc0eb3840a)
 * Farm    : test farm (bd17c7be-9f95-4a56-ad35-a698d37d3513)
 *
 * SMS Fallback Behaviour (v2.1):
 *   Normal mode  → POST to backend; no SMS on success.
 *   First failure → send ONE "network down" SMS; enter Network Down Mode.
 *   Network Down Mode → SMS for every irrigation state change; no extra alerts.
 *   First success after failure → send ONE "network restored" SMS; resume normal mode.
 */

#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ──────────────────────────────────────────────
// Hardware Configuration
// ──────────────────────────────────────────────
#define DHTPIN      4
#define DHTTYPE     DHT11
#define SOIL_PIN    34
#define RELAY_PIN   23

// ──────────────────────────────────────────────
// GSM (SIM800L) Configuration
// ──────────────────────────────────────────────
#define SIM800_TX 16   // ESP32 RX2 <- SIM800L TX
#define SIM800_RX 17   // ESP32 TX2 -> SIM800L RX

const char* phoneNumber = "+918129437037";
HardwareSerial sim800(2);  // UART2

// ──────────────────────────────────────────────
// WiFi Credentials
// ──────────────────────────────────────────────
const char* ssid     = "V_R0N1CA";
const char* password = "jebin7037";

// ──────────────────────────────────────────────
// Cloud API Configuration (AWS EC2)
// ──────────────────────────────────────────────
const char* apiUrl         = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/sensor/ingest";
const char* apiStartLogUrl = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/start";
const char* apiStopLogUrl  = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/stop";
const char* apiRecordUrl   = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation";

const char* farmId   = "bd17c7be-9f95-4a56-ad35-a698d37d3513";  // test farm
const char* deviceId = "b517b2a6-442e-46aa-873a-7adc0eb3840a";  // Chilly device

// ──────────────────────────────────────────────
// Timing Configuration
// ──────────────────────────────────────────────
const unsigned long SEND_INTERVAL        = 10000;  // Data push every 10 s
const unsigned long WIFI_RETRY_INTERVAL  = 30000;  // WiFi reconnect attempt every 30 s
const int           WIFI_CONNECT_TIMEOUT = 40;     // Max connection attempts at boot
const unsigned long DEFAULT_IRRIGATION_DURATION = 20000; // 20 seconds default

// ──────────────────────────────────────────────
// NTP & Queue Configuration
// ──────────────────────────────────────────────
const char* ntpServer          = "pool.ntp.org";
const long  gmtOffset_sec      = 19800;  // India Time (IST) +5:30
const int   daylightOffset_sec = 0;

#define QUEUE_SIZE 10

enum EventType { EVENT_START, EVENT_STOP, EVENT_RECORD };

struct IrrigationEvent {
    EventType type;
    time_t    timestamp;
    float     duration_minutes;
};
IrrigationEvent eventQueue[QUEUE_SIZE];
int queueHead  = 0;
int queueTail  = 0;
int queueCount = 0;

const unsigned long QUEUE_PROCESS_INTERVAL = 5000;
unsigned long lastQueueProcessTime         = 0;

// ──────────────────────────────────────────────
// Global Objects
// ──────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);

// ──────────────────────────────────────────────
// State Variables
// ──────────────────────────────────────────────
unsigned long lastSendTime         = 0;
unsigned long lastWifiRetryTime    = 0;
unsigned long manualIrrigationEnd  = 0;  // millis() when manual irrigation stops
unsigned long pumpStartTime        = 0;  // millis() when pump started

// ── Auto-Irrigation State Machine ───────────────
enum IrrigationState { IDLE, IRRIGATING, COOLDOWN };
IrrigationState currentAutoState = IDLE;
unsigned long autoIrrigationEnd  = 0;
unsigned long cooldownEndTime      = 0;

bool lastPumpState = false;

// ── Network Down State Machine ──────────────────
// networkDown: true  → currently in Network Down Mode
//              false → normal operation (POST succeeds)
//
// Transitions:
//   false → true  : first POST failure  → send "network down" SMS once
//   true  → false : first POST success  → send "network restored" SMS once
bool networkDown = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GSM Functions
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Network Down State Machine — Core Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Call after every POST attempt.
 *
 * @param postSucceeded  true  → HTTP 2xx received
 *                       false → WiFi unavailable, timeout, or non-2xx
 *
 * State transitions:
 *   networkDown == false && postSucceeded == false  → enter Network Down Mode (SMS once)
 *   networkDown == true  && postSucceeded == true   → exit  Network Down Mode (SMS once)
 *   all other combinations                          → no state change, no SMS
 */
void updateNetworkState(bool postSucceeded) {
    if (!postSucceeded && !networkDown) {
        // Transition: normal → Network Down Mode
        networkDown = true;
        Serial.println("[NetworkState] Entering Network Down Mode.");
        sendSMS("[Chilly] ALERT: Backend unreachable. Switching to SMS fallback mode.");
    } else if (postSucceeded && networkDown) {
        // Transition: Network Down Mode → normal
        networkDown = false;
        Serial.println("[NetworkState] Network restored. Resuming normal (POST-only) operation.");
        sendSMS("[Chilly] INFO: Backend connection restored. Resuming normal operation.");
    }
    // No action needed when state does not change.
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WiFi Helpers
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
        configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
        struct tm timeinfo;
        if (getLocalTime(&timeinfo, 10000)) {
            Serial.println("Time synchronized.");
        } else {
            Serial.println("Failed to synchronize time.");
        }
    } else {
        Serial.println("\nWiFi connection failed!");
        // Treat initial WiFi failure as the first network failure so the
        // state machine fires exactly one "network down" SMS.
        updateNetworkState(false);
    }
}

bool ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;

    if (millis() - lastWifiRetryTime >= WIFI_RETRY_INTERVAL) {
        lastWifiRetryTime = millis();
        Serial.println("Attempting WiFi reconnect...");
        WiFi.disconnect();
        connectWiFi();
    }
    return WiFi.status() == WL_CONNECTED;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Irrigation Event Queue
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
void enqueueIrrigationEvent(EventType type, float duration = 0.0) {
    time_t now;
    time(&now);
    if (queueCount < QUEUE_SIZE) {
        eventQueue[queueTail].type      = type;
        eventQueue[queueTail].timestamp = now;
        eventQueue[queueTail].duration_minutes = duration;
        queueTail = (queueTail + 1) % QUEUE_SIZE;
        queueCount++;
    } else {
        Serial.println("Queue full! Overwriting oldest event.");
        eventQueue[queueHead].type      = type;
        eventQueue[queueHead].timestamp = now;
        eventQueue[queueHead].duration_minutes = duration;
        queueHead = (queueHead + 1) % QUEUE_SIZE;
        queueTail = (queueTail + 1) % QUEUE_SIZE;
    }
    const char* typeStr = (type == EVENT_START) ? "START" : (type == EVENT_STOP ? "STOP" : "RECORD");
    Serial.printf("Enqueued %s event. Queue size: %d\n", typeStr, queueCount);
}

/**
 * Attempts to POST the oldest queued irrigation event.
 * Calls updateNetworkState() with the outcome so the SMS fallback
 * state machine stays in sync.
 */
void processEventQueue() {
    if (queueCount == 0) return;

    if (!ensureWiFi()) {
        // No WiFi → treat as POST failure for state tracking
        updateNetworkState(false);
        return;
    }

    IrrigationEvent event = eventQueue[queueHead];
    const char* url;
    if (event.type == EVENT_START) url = apiStartLogUrl;
    else if (event.type == EVENT_STOP) url = apiStopLogUrl;
    else url = apiRecordUrl;

    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(10000);

    StaticJsonDocument<256> doc;
    if (event.type == EVENT_RECORD) {
        doc["farm_id"] = farmId;
        doc["duration_minutes"] = event.duration_minutes;
        // Backend also accepts ISO string for record, but schema says z.datetime().optional()
        // We'll skip timestamp for RECORD as backend defaults it to now if not provided,
        // or we could format it if necessary.
    } else {
        doc["device_id"] = deviceId;
        doc["farm_id"]   = farmId;
        doc["timestamp"] = event.timestamp;
    }

    String payload;
    serializeJson(doc, payload);
    Serial.printf("POST %s\n  Payload: %s\n", url, payload.c_str());

    int httpCode = http.POST(payload);
    bool success = (httpCode >= 200 && httpCode < 300);

    if (httpCode > 0) {
        String response = http.getString();
        Serial.printf("  Response [%d]: %s\n", httpCode, response.c_str());

        if (success) {
            // Dequeue confirmed event
            queueHead = (queueHead + 1) % QUEUE_SIZE;
            queueCount--;
            Serial.printf("Event processed. Queue size: %d\n", queueCount);
        } else if (httpCode >= 400 && httpCode < 500) {
            // Client error (bad request) — discard to avoid infinite retry
            Serial.printf("Client error %d. Discarding event.\n", httpCode);
            queueHead = (queueHead + 1) % QUEUE_SIZE;
            queueCount--;
        } else {
            Serial.printf("Server error %d. Will retry.\n", httpCode);
        }
    } else {
        Serial.printf("  HTTP Error [%d]: %s\n",
                      httpCode, http.errorToString(httpCode).c_str());
    }

    http.end();

    // Update the state machine AFTER processing
    updateNetworkState(success);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cloud Sensor Push & Command Polling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Forward declaration
void processCommand(JsonObject cmd);

void sendToCloudAndPollCommands(float temp, float hum, int soil) {
    if (!ensureWiFi()) {
        // WiFi not available — mark as failure (state machine handles SMS)
        updateNetworkState(false);
        return;
    }

    HTTPClient http;
    http.begin(apiUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(10000);

    StaticJsonDocument<256> doc;
    doc["farm_id"]      = farmId;
    doc["sensor_id"]    = deviceId;
    doc["temperature"]  = isnan(temp) ? 0.0 : temp;
    doc["humidity"]     = isnan(hum)  ? 0.0 : hum;
    doc["soil_moisture"] = soil;

    String payload;
    serializeJson(doc, payload);
    Serial.printf("POST %s\n  Payload: %s\n", apiUrl, payload.c_str());

    int httpCode = http.POST(payload);
    bool success = (httpCode >= 200 && httpCode < 300);

    if (httpCode > 0) {
        String response = http.getString();
        Serial.printf("  Response [%d]: %s\n", httpCode, response.c_str());

        if (success) {
            // Parse any pending commands from the response
            StaticJsonDocument<1024> respDoc;
            DeserializationError err = deserializeJson(respDoc, response);
            if (!err && respDoc.containsKey("commands")) {
                JsonArray commands = respDoc["commands"].as<JsonArray>();
                for (JsonObject cmd : commands) {
                    processCommand(cmd);
                }
            }
        }
    } else {
        Serial.printf("  HTTP Error [%d]: %s\n",
                      httpCode, http.errorToString(httpCode).c_str());
    }

    http.end();
    updateNetworkState(success);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Command Processing (from backend)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
void processCommand(JsonObject cmd) {
    const char* commandType = cmd["command"];
    Serial.printf("Command received: %s\n", commandType);

    if (strcmp(commandType, "START_IRRIGATION") == 0) {
        int duration = cmd["payload"]["duration"];  // seconds
        if (duration > 0) {
            manualIrrigationEnd = millis() + ((unsigned long)duration * 1000UL);
            Serial.printf("  Manual irrigation started for %d s.\n", duration);
        }
    } else if (strcmp(commandType, "STOP_IRRIGATION") == 0) {
        manualIrrigationEnd = 0;
        Serial.println("  Manual irrigation stopped.");
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pump State Change Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Called exactly once per pump state transition (OFF→ON or ON→OFF).
 *
 * Behaviour:
 *   networkDown == false → POST the event; no SMS regardless of result.
 *                          (updateNetworkState inside processEventQueue handles
 *                           the first-failure SMS if the POST fails.)
 *   networkDown == true  → SMS is sent immediately as fallback;
 *                          event is still queued so it will be POSTed once
 *                          the network recovers.
 */
void handlePumpStateChange(bool pumpOn) {
    Serial.printf("Pump state changed: %s\n", pumpOn ? "ON" : "OFF");

    if (pumpOn) {
        pumpStartTime = millis();
        enqueueIrrigationEvent(EVENT_START);
    } else {
        unsigned long durationMs = millis() - pumpStartTime;
        float durationMin = (float)durationMs / 60000.0;
        
        enqueueIrrigationEvent(EVENT_STOP);
        // Also send full record
        enqueueIrrigationEvent(EVENT_RECORD, durationMin);
        
        pumpStartTime = 0;
    }

    if (networkDown) {
        // Fallback: inform operator via SMS while backend is unreachable.
        if (pumpOn) {
            sendSMS("[Chilly] FALLBACK: Irrigation started (backend unreachable).");
        } else {
            sendSMS("[Chilly] FALLBACK: Irrigation stopped (backend unreachable).");
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
void setup() {
    Serial.begin(115200);
    Serial.println("\n========================================");
    Serial.println(" Smart Irrigation v2.1 — Chilly Device");
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
// Main Loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
void loop() {
    // ── 1. Read Sensors ──────────────────────────
    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();
    int   soilRaw     = analogRead(SOIL_PIN);
    int   soilPercent = constrain(map(soilRaw, 4095, 0, 0, 100), 0, 100);

    // ── 2. Irrigation Control Logic ──────────────
    bool autoShouldBeOn = false;

    // --- Auto-Irrigation State Machine ---
    switch (currentAutoState) {
        case IDLE:
            if (soilPercent < 25) {
                currentAutoState = IRRIGATING;
                autoIrrigationEnd = millis() + DEFAULT_IRRIGATION_DURATION;
                Serial.println("Auto-Irrigation: Soil moisture low. Triggering 20s cycle.");
            }
            break;

        case IRRIGATING:
            autoShouldBeOn = true;
            if (millis() >= autoIrrigationEnd) {
                currentAutoState = COOLDOWN;
                cooldownEndTime = millis() + 20000;
                Serial.println("Auto-Irrigation: Cycle finished. Entering 20s cooldown.");
            }
            break;

        case COOLDOWN:
            autoShouldBeOn = false;
            if (millis() >= cooldownEndTime) {
                currentAutoState = IDLE;
                Serial.println("Auto-Irrigation: Cooldown finished. Ready for next check.");
            }
            break;
    }

    // Combine Auto and Manual (Cloud) control
    bool shouldBeOn = autoShouldBeOn || (millis() < manualIrrigationEnd);

    if (millis() < manualIrrigationEnd) {
        unsigned long remaining = (manualIrrigationEnd - millis()) / 1000;
        Serial.printf("Manual-Irrigation active: %lu s remaining.\n", remaining);
    } else if (autoShouldBeOn) {
        unsigned long remaining = (autoIrrigationEnd - millis()) / 1000;
        Serial.printf("Auto-Irrigation active: %lu s remaining.\n", remaining);
    }

    // Apply relay
    digitalWrite(RELAY_PIN, shouldBeOn ? HIGH : LOW);

    // ── 3. Pump State Change Detection ───────────
    // handlePumpStateChange() is the single authority for SMS + event queuing.
    // It respects the networkDown state so SMS is only sent as a true fallback.
    if (shouldBeOn != lastPumpState) {
        lastPumpState = shouldBeOn;
        handlePumpStateChange(shouldBeOn);
    }

    // ── 4. Process Event Queue ───────────────────
    // Drains one event per interval; updateNetworkState() is called inside
    // so state transitions (and their single SMS) fire here too.
    if (millis() - lastQueueProcessTime >= QUEUE_PROCESS_INTERVAL) {
        lastQueueProcessTime = millis();
        processEventQueue();
    }

    // ── 5. Periodic Cloud Push & Command Poll ────
    if (millis() - lastSendTime >= SEND_INTERVAL) {
        lastSendTime = millis();
        sendToCloudAndPollCommands(temperature, humidity, soilPercent);
    }

    delay(2000);
}
