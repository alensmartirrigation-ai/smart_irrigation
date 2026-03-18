/**
 * Smart Irrigation System — ESP32 Firmware
 *
 * Cooperative task scheduler driving:
 *   sensor reads, irrigation FSM, relay control, cloud upload,
 *   WiFi/GSM state machines, and event-driven SMS alerts.
 */

 #include <Arduino.h>
 #include <DHT.h>
 #include <WiFi.h>
 #include <HTTPClient.h>
 #include <ArduinoJson.h>
 #include <time.h>
 #include <esp_task_wdt.h>
 #include <algorithm>
 
 // Enable/disable GSM features at compile time
 #define GSM_ENABLED 1
 
 #if GSM_ENABLED
 #define TINY_GSM_MODEM_SIM800
 #define TINY_GSM_RX_BUFFER 1024
 #define SerialMon Serial
 #define SerialAT  Serial1
 #define TINY_GSM_DEBUG SerialMon
 #define GSM_PIN ""
 #include <TinyGsmClient.h>
 #endif
 
 // ============================================================
 //  Hardware Pins
 // ============================================================
 #define DHTPIN       18
 #define DHTTYPE      DHT11
 #define SOIL_PIN     34
 #define RELAY_PIN    25
 
 // GSM modem pins (SIM800)
 #if GSM_ENABLED
 #define MODEM_TX       27
 #define MODEM_RX       26
 #define MODEM_PWRKEY   4
 #define MODEM_RST      5
 #define MODEM_POWER_ON 23
 // TinyGSM snippet uses MODEM_PWKEY spelling.
 #define MODEM_PWKEY    MODEM_PWRKEY
 #endif
 
 // ============================================================
 //  Device & Cloud
 // ============================================================
 static const char* DEVICE_NAME = "Chilly";
 static const char* FARM_ID     = "b04eaa68-cc1e-4817-8ba2-da6e0f074648";
 static const char* DEVICE_ID   = "0a6bc08f-b6bd-48ee-8d78-dad81debaa93";
 
 static const char* WIFI_SSID = "V_R0N1CA";
 static const char* WIFI_PASS = "jebin7037";
 
 static const char* PHONE_NUMBER = "+918129437037";
 
 static const char* API_SENSOR = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/sensor/ingest";
 static const char* API_START  = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/start";
 static const char* API_STOP   = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/stop";
 static const char* API_RECORD = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation";
 
 // ============================================================
 //  Timing
 // ============================================================
 static constexpr unsigned long SENSOR_MS      = 20000;
 static constexpr unsigned long UPLOAD_MS      = 30000;
 static constexpr unsigned long RELAY_MS       = 5000;
 static constexpr unsigned long LOOP_WDT_MS    = 300000;
 
 static constexpr int           WIFI_TIMEOUT_MS     = 15000;
 static constexpr int           HTTP_TIMEOUT_MS      = 10000;
 static constexpr unsigned long MAX_PUMP_ON_MS       = 1800000;
 
 // NTP
 static const char*    NTP_SERVER      = "pool.ntp.org";
 static constexpr long GMT_OFFSET_SEC  = 19800;
 static constexpr int  DAYLIGHT_OFFSET = 0;
 
 // Soil calibration
 static constexpr int SOIL_DRY_RAW     = 4095;
 static constexpr int SOIL_WET_RAW     = 1500;
 static constexpr int SOIL_FAULT_RAW   = 4095;
 static constexpr int SOIL_SAMPLES     = 5;
 static constexpr int SOIL_SAMPLE_DLY  = 10;
 static constexpr int FAULT_THRESHOLD  = 3;
 
 // ============================================================
 //  Types
 // ============================================================
 struct SensorData {
   float  temperature;
   float  humidity;
   int    soilRaw;
   int    soilPercent;
   bool   dhtOk;
   bool   soilOk;
   time_t ts;
 };
 
 struct IrrConfig {
   int            soilStartBelow  = 30;
   int            soilStopAbove   = 40;
   float          tempStartAbove  = 30.0f;
   float          tempStopBelow   = 27.0f;
   float          humStartBelow   = 45.0f;
   float          humStopAbove    = 55.0f;
   unsigned long  minOnMs         = 20000;
   unsigned long  minOffMs        = 20000;
 };
 
 enum AutoState : uint8_t { AUTO_IDLE, AUTO_IRRIGATING, AUTO_COOLDOWN };
 
 struct IrrState {
   AutoState     phase          = AUTO_IDLE;
   bool          pumpOn         = false;
   bool          prevPumpOn     = false;
   unsigned long pumpStartMs    = 0;
   unsigned long holdUntilMs    = 0;
   unsigned long manualEndMs    = 0;
   unsigned long lastDurMs      = 0;
   bool          safetyTripped  = false;
 };
 
 struct Sys {
   unsigned long lastLoopMs;
   unsigned long lastSensorMs;
   unsigned long lastDecisionMs;
   unsigned long lastUploadMs;
   unsigned long lastRelayMs;
   unsigned long lastGsmMs;
   int soilFaultRun;
   int dhtFaultRun;
 };
 
 // ============================================================
 //  Globals (before GSM so SMS helpers can access them)
 // ============================================================
 static DHT         dht(DHTPIN, DHTTYPE);
 static IrrConfig   cfg;
 static IrrState    irr;
 static Sys         sys;
 static SensorData  lastReading;
 
 // ============================================================
 //  GSM / SMS — event-driven notifications
 // ============================================================
 #if GSM_ENABLED
 #ifdef DUMP_AT_COMMANDS
 #include <StreamDebugger.h>
 StreamDebugger debugger(SerialAT, SerialMon);
 TinyGsm modem(debugger);
 #else
 TinyGsm modem(SerialAT);
 #endif
 
 TinyGsmClient client(modem);
 static bool gsmReady = false;
 static unsigned long lastPrintMs = 0;
 static bool prevWifiConnected = false;
 
 static void gsmInit() {
   pinMode(MODEM_PWKEY, OUTPUT);
   pinMode(MODEM_RST, OUTPUT);
   pinMode(MODEM_POWER_ON, OUTPUT);
 
   digitalWrite(MODEM_PWKEY, LOW);
   digitalWrite(MODEM_RST, HIGH);
   digitalWrite(MODEM_POWER_ON, HIGH);
 
   SerialMon.println(F("Wait ..."));
 
   SerialAT.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
   delay(3000);
 
   SerialMon.println(F("Initializing modem ..."));
   modem.restart();
 
   String modemInfo = modem.getModemInfo();
   SerialMon.print(F("Modem Info: "));
   SerialMon.println(modemInfo);
 
   if (GSM_PIN[0] != '\0' && modem.getSimStatus() != 3) {
     modem.simUnlock(GSM_PIN);
   }
 
   SerialMon.print(F("Waiting for network..."));
   gsmReady = modem.waitForNetwork(240000L);
   if (!gsmReady) {
     SerialMon.println(F(" fail"));
     delay(10000);
   } else {
     SerialMon.println(F(" success"));
   }
 
   if (modem.isNetworkConnected()) {
     SerialMon.println(F("Network connected"));
   }
 
   if (!modem.isNetworkConnected()) return;
 
   SerialMon.println(F("Fetching SIM info..."));
   SerialMon.print(F("CCID: "));     SerialMon.println(modem.getSimCCID());
   SerialMon.print(F("IMEI: "));     SerialMon.println(modem.getIMEI());
   SerialMon.print(F("IMSI: "));     SerialMon.println(modem.getIMSI());
   SerialMon.print(F("Operator: ")); SerialMon.println(modem.getOperator());
 
   IPAddress local = modem.localIP();
   SerialMon.print(F("Local IP: "));
   SerialMon.println(local);
 
   int signalQuality = modem.getSignalQuality();
   SerialMon.print(F("Signal Quality (0-31): "));
   SerialMon.println(signalQuality);
 }
 
 static String buildStatusSms(const char* event) {
   String msg(event);
   msg += "\nT:";    msg += String(lastReading.temperature, 1);
   msg += "C H:";    msg += String(lastReading.humidity, 1);
   msg += "% Soil:"; msg += lastReading.soilPercent;
   msg += "%\nPump:"; msg += irr.pumpOn ? "ON" : "OFF";
   msg += " WiFi:";  msg += (WiFi.status() == WL_CONNECTED) ? "Up" : "Down";
   return msg;
 }
 
 static void sendSMS(const String& msg) {
   if (!modem.isNetworkConnected()) {
     SerialMon.println(F("[SMS] Reconnecting GSM..."));
     modem.waitForNetwork(30000L);
   }
   SerialMon.print(F("[SMS] ")); SerialMon.println(msg);
   bool ok = modem.sendSMS(PHONE_NUMBER, msg);
   SerialMon.println(ok ? F("[SMS] Sent OK") : F("[SMS] Failed"));
 }
 
 void taskGsm() {
   unsigned long now = millis();
 
   if (now - lastPrintMs > 5000UL) {
     SerialMon.print(F("Signal: "));
     SerialMon.println(modem.getSignalQuality());
     lastPrintMs = now;
   }
 
   bool wifiNow = (WiFi.status() == WL_CONNECTED);
   if (wifiNow != prevWifiConnected) {
     sendSMS(buildStatusSms(wifiNow ? "WiFi connected" : "WiFi connection lost"));
     prevWifiConnected = wifiNow;
   }
 }
 
 static void sendPumpSms(bool on) {
   sendSMS(buildStatusSms(on ? "Pump turned ON" : "Pump turned OFF"));
 }
 
 static void sendStartupSms() {
   sendSMS(buildStatusSms("Irrigation system started"));
 }
 
 #else
 static void gsmInit() {}
 void taskGsm() {}
 static void sendPumpSms(bool) {}
 static void sendStartupSms() {}
 #endif
 
 // ============================================================
 //  Forward Declarations
 // ============================================================
 void taskSensor();
 void taskDecision();
 void taskRelay();
 void taskUpload();
 void taskGsm();
 
 String payloadIrrEvent(time_t ts);
 String payloadIrrDuration(float mins);
 String payloadSensor(const SensorData& s);
 
 // ============================================================
 //  Task Table
 // ============================================================
 struct Task {
   const char*    name;
   unsigned long  intervalMs;
   unsigned long* lastMs;
   void (*fn)();
 };
 
 static Task tasks[] = {
   { "sensor",  SENSOR_MS,     &sys.lastSensorMs,   taskSensor   },
   { "decide",  SENSOR_MS,     &sys.lastDecisionMs,  taskDecision },
   { "relay",   RELAY_MS,      &sys.lastRelayMs,     taskRelay    },
   { "upload",  UPLOAD_MS,     &sys.lastUploadMs,    taskUpload   },
 #if GSM_ENABLED
   { "gsm",     5000UL,        &sys.lastGsmMs,       taskGsm      },
 #endif
 };
 static constexpr int TASK_COUNT = sizeof(tasks) / sizeof(tasks[0]);
 
 // ============================================================
 //  Utility
 // ============================================================
 static String isoNow() {
   time_t now;
   time(&now);
   struct tm t;
   if (!gmtime_r(&now, &t)) return "";
   char buf[25];
   strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
   return String(buf);
 }
 
 static time_t epochNow() {
   time_t t;
   time(&t);
   return t;
 }
 
 // ============================================================
 //  HTTP
 // ============================================================
 static bool httpPost(const char* url, const String& body, String& resp) {
   if (WiFi.status() != WL_CONNECTED) return false;
 
   HTTPClient http;
   http.begin(url);
   http.addHeader("Content-Type", "application/json");
   http.setTimeout(HTTP_TIMEOUT_MS);
 
   int code = http.POST(body);
   bool ok = (code >= 200 && code < 300);
   resp = (code > 0) ? http.getString() : http.errorToString(code);
   http.end();
 
   Serial.printf("[HTTP] %s -> %d\n", url, code);
   return ok;
 }
 
 // ============================================================
 //  Sensor Acquisition
 // ============================================================
 static int readSoilMedian() {
   int r[SOIL_SAMPLES];
   for (int i = 0; i < SOIL_SAMPLES; i++) {
     r[i] = analogRead(SOIL_PIN);
     if (i < SOIL_SAMPLES - 1) delay(SOIL_SAMPLE_DLY);
   }
   std::sort(r, r + SOIL_SAMPLES);
   return r[SOIL_SAMPLES / 2];
 }
 
 void taskSensor() {
   SensorData s;
   s.temperature = dht.readTemperature();
   s.humidity    = dht.readHumidity();
   s.soilRaw     = readSoilMedian();
 
   if (s.soilRaw == SOIL_FAULT_RAW) sys.soilFaultRun++;
   else                              sys.soilFaultRun = 0;
   s.soilOk = (sys.soilFaultRun < FAULT_THRESHOLD);
 
   if (s.soilOk) {
     int mapped = map(s.soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
     s.soilPercent = constrain(mapped, 0, 100);
   } else {
     s.soilPercent = -1;
   }
 
   bool dhtGood = !(isnan(s.temperature) || isnan(s.humidity));
   if (!dhtGood) sys.dhtFaultRun++;
   else          sys.dhtFaultRun = 0;
   s.dhtOk = (sys.dhtFaultRun < FAULT_THRESHOLD);
 
   if (!dhtGood) {
     s.temperature = lastReading.dhtOk ? lastReading.temperature : 0.0f;
     s.humidity    = lastReading.dhtOk ? lastReading.humidity    : 0.0f;
   }
 
   s.ts = epochNow();
 
   Serial.printf("[Sensor] T:%.1fC H:%.1f%% Soil:%s(raw:%d) DHT:%s\n",
     s.temperature, s.humidity,
     s.soilOk ? String(s.soilPercent).c_str() : "FAULT",
     s.soilRaw,
     s.dhtOk ? "OK" : "FAULT");
 
   lastReading = s;
 }
 
 // ============================================================
 //  Decision Engine — hysteresis FSM
 // ============================================================
 static bool needsWater(const SensorData& s) {
   if (!s.soilOk || !s.dhtOk) return false;
   return s.soilPercent <= cfg.soilStartBelow
       && (s.temperature >= cfg.tempStartAbove || s.humidity <= cfg.humStartBelow);
 }
 
 static bool waterSatisfied(const SensorData& s) {
   bool soilOk = s.soilPercent >= cfg.soilStopAbove;
   bool envOk  = s.temperature <= cfg.tempStopBelow && s.humidity >= cfg.humStopAbove;
   return soilOk || envOk;
 }
 
 void taskDecision() {
   unsigned long now = millis();
 
   switch (irr.phase) {
     case AUTO_IDLE:
       if (needsWater(lastReading)) {
         irr.phase = AUTO_IRRIGATING;
         irr.holdUntilMs = now + cfg.minOnMs;
         irr.safetyTripped = false;
         Serial.println(F("[FSM] Idle -> Irrigating"));
       }
       break;
 
     case AUTO_IRRIGATING:
       if (now >= irr.holdUntilMs && waterSatisfied(lastReading)) {
         irr.phase = AUTO_COOLDOWN;
         irr.holdUntilMs = now + cfg.minOffMs;
         Serial.println(F("[FSM] Irrigating -> Cooldown"));
       }
       break;
 
     case AUTO_COOLDOWN:
       if (now >= irr.holdUntilMs) {
         irr.phase = AUTO_IDLE;
         Serial.println(F("[FSM] Cooldown -> Idle"));
       }
       break;
   }
 
   bool autoOn   = (irr.phase == AUTO_IRRIGATING);
   bool manualOn = (now < irr.manualEndMs);
   irr.pumpOn    = (autoOn || manualOn) && !irr.safetyTripped;
 }
 
 // ============================================================
 //  Relay Control + Pump Safety
 // ============================================================
 void taskRelay() {
   unsigned long now = millis();
 
   if (irr.pumpOn && irr.pumpStartMs > 0 &&
       now - irr.pumpStartMs > MAX_PUMP_ON_MS) {
     irr.pumpOn = false;
     irr.safetyTripped = true;
     irr.phase = AUTO_COOLDOWN;
     irr.holdUntilMs = now + cfg.minOffMs;
     Serial.println(F("[Safety] Pump forced OFF — max runtime"));
   }
 
   digitalWrite(RELAY_PIN, irr.pumpOn ? LOW : HIGH);
 
   if (irr.pumpOn == irr.prevPumpOn) return;
 
   if (irr.pumpOn) {
     irr.pumpStartMs = millis();
     String resp;
     httpPost(API_START, payloadIrrEvent(epochNow()), resp);
     Serial.println(F("[Relay] Pump ON"));
   } else {
     unsigned long dur = millis() - irr.pumpStartMs;
     irr.lastDurMs = dur;
     irr.pumpStartMs = 0;
 
     String resp1, resp2;
     httpPost(API_STOP,   payloadIrrEvent(epochNow()),                         resp1);
     httpPost(API_RECORD, payloadIrrDuration((float)dur / 60000.0f),          resp2);
     Serial.printf("[Relay] Pump OFF — %lu sec\n", dur / 1000UL);
   }
 
   sendPumpSms(irr.pumpOn);
   irr.prevPumpOn = irr.pumpOn;
 }
 
 // ============================================================
 //  Payload Builders
 // ============================================================
 String payloadIrrEvent(time_t ts) {
   StaticJsonDocument<256> doc;
   doc["device_id"] = DEVICE_ID;
   doc["farm_id"]   = FARM_ID;
   doc["timestamp"] = (long)ts;
   String out;
   serializeJson(doc, out);
   return out;
 }
 
 String payloadIrrDuration(float mins) {
   StaticJsonDocument<256> doc;
   doc["farm_id"]          = FARM_ID;
   doc["duration_minutes"] = mins;
   doc["timestamp"]        = isoNow();
   String out;
   serializeJson(doc, out);
   return out;
 }
 
 String payloadSensor(const SensorData& s) {
   StaticJsonDocument<384> doc;
   doc["farm_id"]           = FARM_ID;
   doc["sensor_id"]         = DEVICE_ID;
   doc["temperature"]       = s.temperature;
   doc["humidity"]          = s.humidity;
   doc["soil_moisture"]     = s.soilPercent;
   doc["irrigation_status"] = irr.pumpOn ? "ON" : "OFF";
   doc["last_duration_sec"] = (int)(irr.lastDurMs / 1000UL);
   doc["timestamp"]         = isoNow();
   String out;
   serializeJson(doc, out);
   return out;
 }
 
 // ============================================================
 //  Upload
 // ============================================================
 void taskUpload() {
   String payload = payloadSensor(lastReading);
   String resp;
   httpPost(API_SENSOR, payload, resp);
 }
 
 // ============================================================
 //  Setup
 // ============================================================
 void setup() {
   Serial.begin(115200);
   delay(2000);
   Serial.println(F("\n=== Smart Irrigation System ==="));
 
   pinMode(RELAY_PIN, OUTPUT);
   digitalWrite(RELAY_PIN, HIGH);
 
   dht.begin();
 
 #if GSM_ENABLED
   gsmInit();
 #endif
 
   WiFi.mode(WIFI_STA);
   WiFi.setAutoReconnect(true);
   WiFi.persistent(false);
   WiFi.begin(WIFI_SSID, WIFI_PASS);
 
   Serial.println(F("[WiFi] Connecting..."));
   unsigned long start = millis();
   while (WiFi.status() != WL_CONNECTED && millis() - start < (unsigned long)WIFI_TIMEOUT_MS) {
     delay(500);
     Serial.print('.');
   }
   Serial.println();
   if (WiFi.status() == WL_CONNECTED) {
     Serial.printf("[WiFi] Connected, IP: %s\n", WiFi.localIP().toString().c_str());
     configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET, NTP_SERVER);
     struct tm t;
     Serial.println(getLocalTime(&t, 10000) ? F("[NTP] Synced") : F("[NTP] Failed"));
   } else {
     Serial.println(F("[WiFi] Failed to connect within timeout"));
   }
 
   esp_task_wdt_deinit();
 
   sys.lastLoopMs = millis();
   Serial.printf("[Boot] Farm  : %s\n", FARM_ID);
   Serial.printf("[Boot] Device: %s (%s)\n", DEVICE_ID, DEVICE_NAME);
   Serial.printf("[Boot] Soil: <%d start, >%d stop | T>%.0f/%.0f | H<%.0f/>%.0f\n",
     cfg.soilStartBelow, cfg.soilStopAbove,
     cfg.tempStartAbove, cfg.tempStopBelow,
     cfg.humStartBelow,  cfg.humStopAbove);
 
   taskSensor();
 
 #if GSM_ENABLED
   sendStartupSms();
   prevWifiConnected = (WiFi.status() == WL_CONNECTED);
 #endif
 
   Serial.println(F("[Boot] Ready"));
 }
 
 // ============================================================
 //  Main Loop — cooperative scheduler
 // ============================================================
 void loop() {
   unsigned long now = millis();
 
   if (now - sys.lastLoopMs > LOOP_WDT_MS) {
     Serial.println(F("[WDT] Stall — rebooting"));
     ESP.restart();
   }
 
   for (int i = 0; i < TASK_COUNT; i++) {
     Task& t = tasks[i];
     unsigned long last = t.lastMs ? *t.lastMs : 0;
     if (now - last >= t.intervalMs) {
       if (t.lastMs) *t.lastMs = now;
       t.fn();
     }
   }
 
   sys.lastLoopMs = millis();
   delay(50);
 }
 