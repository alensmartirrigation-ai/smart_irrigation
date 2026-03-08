/**
 * Smart Irrigation System — ESP32 Firmware
 *
 * Cooperative task scheduler driving:
 *   sensor reads, irrigation FSM, relay control, cloud upload,
 *   offline buffer replay, WiFi/GSM state machines, and SMS alerts.
 */

#include <Arduino.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <FS.h>
#include <SPIFFS.h>
#include <esp_task_wdt.h>
#include <algorithm>

// ============================================================
//  Hardware Pins
// ============================================================
#define DHTPIN       18
#define DHTTYPE      DHT11
#define SOIL_PIN     34
#define RELAY_PIN    23
#define GSM_UART_RX  16
#define GSM_UART_TX  17

// ============================================================
//  Device & Cloud
// ============================================================
static const char* DEVICE_NAME = "Chilly";
static const char* FARM_ID     = "b04eaa68-cc1e-4817-8ba2-da6e0f074648";
static const char* DEVICE_ID   = "0a6bc08f-b6bd-48ee-8d78-dad81debaa93";

static const char* WIFI_SSID = "V_R0N1CA";
static const char* WIFI_PASS = "jebin7037";

static const char* API_SENSOR = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/sensor/ingest";
static const char* API_START  = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/start";
static const char* API_STOP   = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation/log/stop";
static const char* API_RECORD = "http://ec2-3-108-190-207.ap-south-1.compute.amazonaws.com:4000/api/irrigation";

// ============================================================
//  Timing
// ============================================================
static constexpr unsigned long SENSOR_MS      = 20000;
static constexpr unsigned long UPLOAD_MS      = 30000;
static constexpr unsigned long BUF_SYNC_MS    = 10000;
static constexpr unsigned long WIFI_CHECK_MS  = 5000;
static constexpr unsigned long SMS_TICK_MS    = 1000;
static constexpr unsigned long RELAY_MS       = 5000;
static constexpr unsigned long LOOP_WDT_MS    = 300000;

static constexpr int           WIFI_TIMEOUT_MS     = 15000;
static constexpr int           HTTP_TIMEOUT_MS      = 10000;
static constexpr unsigned long MAX_PUMP_ON_MS       = 1800000;

// NTP
static const char*    NTP_SERVER      = "pool.ntp.org";
static constexpr long GMT_OFFSET_SEC  = 19800;
static constexpr int  DAYLIGHT_OFFSET = 0;

// Storage
static const char*       BUFFER_PATH     = "/tx-buffer.log";
static const char*       CONFIG_PATH     = "/config.json";
static constexpr size_t  MAX_BUF_BYTES   = 40 * 1024;
static constexpr int     STREAM_CHUNK    = 256;

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

enum RecType : uint8_t { REC_SENSOR, REC_IRR_START, REC_IRR_STOP, REC_IRR_DUR };

enum WifiPhase : uint8_t { WF_IDLE, WF_CONNECTING, WF_CONNECTED };


// Ring buffer for outgoing SMS
static constexpr int SMS_Q_CAP = 4;
static constexpr int SMS_LEN   = 160;

struct SmsRing {
  char msgs[SMS_Q_CAP][SMS_LEN];
  int  head  = 0;
  int  tail  = 0;
  int  count = 0;

  void push(const char* m) {
    if (count >= SMS_Q_CAP) {
      head = (head + 1) % SMS_Q_CAP;
      count--;
    }
    strncpy(msgs[tail], m, SMS_LEN - 1);
    msgs[tail][SMS_LEN - 1] = '\0';
    tail = (tail + 1) % SMS_Q_CAP;
    count++;
  }
  void push(const String& m) { push(m.c_str()); }

  const char* front() const { return msgs[head]; }

  void pop() {
    head = (head + 1) % SMS_Q_CAP;
    count--;
  }
};

struct Sys {
  unsigned long lastLoopMs;
  unsigned long lastSensorMs;
  unsigned long lastDecisionMs;
  unsigned long lastUploadMs;
  unsigned long lastBufSyncMs;
  unsigned long lastWifiMs;
  unsigned long lastSmsMs;
  unsigned long lastRelayMs;

  WifiPhase     wfPhase;
  unsigned long wfConnStartMs;

  bool backendUp;
  bool prevWifiUp;

  int soilFaultRun;
  int dhtFaultRun;
};

// ============================================================
//  Globals
// ============================================================
static DHT            dht(DHTPIN, DHTTYPE);
static HardwareSerial SerialToGSM(2);

static IrrConfig   cfg;
static IrrState    irr;
static Sys         sys;
static SensorData  lastReading;
static SmsRing     smsQ;

// ============================================================
//  Forward Declarations
// ============================================================
void taskSensor();
void taskDecision();
void taskRelay();
void taskUpload();
void taskBufSync();
void taskWifi();
void taskSmsQueue();

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
  { "bufsync", BUF_SYNC_MS,  &sys.lastBufSyncMs,   taskBufSync  },
  { "wifi",    WIFI_CHECK_MS, &sys.lastWifiMs,      taskWifi     },
  { "sms",     SMS_TICK_MS,   &sys.lastSmsMs,       taskSmsQueue },
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
//  SPIFFS Buffer (streaming, no full-file load)
// ============================================================
static bool storageInit() {
  if (!SPIFFS.begin(true)) {
    Serial.println(F("[Storage] SPIFFS init failed"));
    return false;
  }
  if (!SPIFFS.exists(BUFFER_PATH)) {
    File f = SPIFFS.open(BUFFER_PATH, FILE_WRITE);
    if (f) f.close();
  }
  Serial.println(F("[Storage] SPIFFS mounted"));
  return true;
}

static size_t bufSize() {
  File f = SPIFFS.open(BUFFER_PATH, FILE_READ);
  if (!f) return 0;
  size_t s = f.size();
  f.close();
  return s;
}

static void trimBuffer() {
  if (bufSize() <= MAX_BUF_BYTES) return;

  File src = SPIFFS.open(BUFFER_PATH, FILE_READ);
  if (!src) return;

  while (src.available()) {
    if (src.read() == '\n') break;
  }

  File tmp = SPIFFS.open("/tx-tmp.log", FILE_WRITE);
  if (!tmp) { src.close(); return; }

  uint8_t chunk[STREAM_CHUNK];
  while (src.available()) {
    int n = src.read(chunk, sizeof(chunk));
    if (n > 0) tmp.write(chunk, n);
  }
  src.close();
  tmp.close();

  SPIFFS.remove(BUFFER_PATH);
  SPIFFS.rename("/tx-tmp.log", BUFFER_PATH);
}

static void bufAppend(const String& json) {
  File f = SPIFFS.open(BUFFER_PATH, FILE_APPEND);
  if (!f) { Serial.println(F("[Storage] Append failed")); return; }
  f.println(json);
  f.close();
  trimBuffer();
}

static bool bufPop(String& out) {
  File src = SPIFFS.open(BUFFER_PATH, FILE_READ);
  if (!src || !src.available()) {
    if (src) src.close();
    return false;
  }

  String first = src.readStringUntil('\n');
  first.trim();

  File tmp = SPIFFS.open("/tx-tmp.log", FILE_WRITE);
  if (tmp) {
    uint8_t chunk[STREAM_CHUNK];
    while (src.available()) {
      int n = src.read(chunk, sizeof(chunk));
      if (n > 0) tmp.write(chunk, n);
    }
    tmp.close();
  }
  src.close();

  SPIFFS.remove(BUFFER_PATH);
  SPIFFS.rename("/tx-tmp.log", BUFFER_PATH);

  if (first.length() == 0) return false;
  out = first;
  return true;
}

// ============================================================
//  Config Persistence
// ============================================================
static void loadConfig() {
  if (!SPIFFS.exists(CONFIG_PATH)) {
    Serial.println(F("[Config] No saved config — defaults"));
    return;
  }
  File f = SPIFFS.open(CONFIG_PATH, FILE_READ);
  if (!f) return;

  StaticJsonDocument<512> doc;
  auto err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.printf("[Config] Parse error: %s\n", err.c_str());
    return;
  }

  cfg.soilStartBelow = doc["soilStartBelow"] | cfg.soilStartBelow;
  cfg.soilStopAbove  = doc["soilStopAbove"]  | cfg.soilStopAbove;
  cfg.tempStartAbove = doc["tempStartAbove"] | cfg.tempStartAbove;
  cfg.tempStopBelow  = doc["tempStopBelow"]  | cfg.tempStopBelow;
  cfg.humStartBelow  = doc["humStartBelow"]  | cfg.humStartBelow;
  cfg.humStopAbove   = doc["humStopAbove"]   | cfg.humStopAbove;
  cfg.minOnMs        = doc["minOnMs"]        | (long)cfg.minOnMs;
  cfg.minOffMs       = doc["minOffMs"]       | (long)cfg.minOffMs;

  Serial.println(F("[Config] Loaded"));
}

static void saveConfig() {
  StaticJsonDocument<512> doc;
  doc["soilStartBelow"] = cfg.soilStartBelow;
  doc["soilStopAbove"]  = cfg.soilStopAbove;
  doc["tempStartAbove"] = cfg.tempStartAbove;
  doc["tempStopBelow"]  = cfg.tempStopBelow;
  doc["humStartBelow"]  = cfg.humStartBelow;
  doc["humStopAbove"]   = cfg.humStopAbove;
  doc["minOnMs"]        = (long)cfg.minOnMs;
  doc["minOffMs"]       = (long)cfg.minOffMs;

  File f = SPIFFS.open(CONFIG_PATH, FILE_WRITE);
  if (!f) { Serial.println(F("[Config] Save failed")); return; }
  serializeJson(doc, f);
  f.close();
  Serial.println(F("[Config] Saved"));
}

// ============================================================
//  SMS Queue Task — send to secondary ESP32 over UART
// ============================================================
void taskSmsQueue() {
  while (smsQ.count > 0) {
    const char* msg = smsQ.front();
    String frame = String("sms_string:") + msg;
    Serial.println(frame);
    SerialToGSM.println(frame);
    smsQ.pop();
  }
}

// ============================================================
//  WiFi — non-blocking
// ============================================================
static void ntpSync() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET, NTP_SERVER);
  struct tm t;
  Serial.println(getLocalTime(&t, 10000) ? F("[NTP] Synced") : F("[NTP] Failed"));
}

static void wifiBeginConnect() {
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  sys.wfPhase = WF_CONNECTING;
  sys.wfConnStartMs = millis();
  Serial.println(F("[WiFi] Connecting..."));
}

static bool wifiUp() {
  return sys.wfPhase == WF_CONNECTED && WiFi.status() == WL_CONNECTED;
}

void taskWifi() {
  bool wasUp = sys.prevWifiUp;
  sys.prevWifiUp = wifiUp();

  if (wasUp && !sys.prevWifiUp) {
    smsQ.push("WiFi connection is down.");
  }

  switch (sys.wfPhase) {
    case WF_CONNECTED:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[WiFi] Lost — reconnecting"));
        wifiBeginConnect();
      }
      break;

    case WF_CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        sys.wfPhase = WF_CONNECTED;
        Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
        ntpSync();
      } else if (millis() - sys.wfConnStartMs > (unsigned long)WIFI_TIMEOUT_MS) {
        Serial.println(F("[WiFi] Timeout — retry"));
        wifiBeginConnect();
      }
      break;

    case WF_IDLE:
      wifiBeginConnect();
      break;
  }
}

// ============================================================
//  HTTP + Buffered Transmit
// ============================================================
static void flagBackend(bool ok) {
  if (!ok && sys.backendUp) {
    sys.backendUp = false;
    Serial.println(F("[Net] Backend down"));
  } else if (ok && !sys.backendUp) {
    sys.backendUp = true;
    Serial.println(F("[Net] Backend restored"));
  }
}

static bool httpPost(const char* url, const String& body, String& resp) {
  if (!wifiUp()) return false;

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

static String wrapRecord(RecType type, const char* ep, const String& payload) {
  StaticJsonDocument<768> doc;
  doc["type"]        = (int)type;
  doc["endpoint"]    = ep;
  doc["payload"]     = payload;
  doc["buffered_at"] = isoNow();
  String out;
  serializeJson(doc, out);
  return out;
}

static bool sendOrBuffer(RecType type, const char* ep, const String& payload) {
  String resp;
  bool ok = httpPost(ep, payload, resp);
  flagBackend(ok);
  if (!ok) bufAppend(wrapRecord(type, ep, payload));
  return ok;
}

void taskBufSync() {
  if (!wifiUp() || !sys.backendUp) return;

  for (int i = 0; i < 3; i++) {
    String line;
    if (!bufPop(line)) return;

    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, line)) continue;

    const char* ep = doc["endpoint"] | "";
    const char* pl = doc["payload"]  | "";
    if (!*ep || !*pl) continue;

    String resp;
    if (httpPost(ep, String(pl), resp)) {
      Serial.println(F("[Sync] Replayed OK"));
    } else {
      bufAppend(line);
      return;
    }
  }
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
    sendOrBuffer(REC_IRR_START, API_START, payloadIrrEvent(epochNow()));
    Serial.println(F("[Relay] Pump ON"));
  } else {
    unsigned long dur = millis() - irr.pumpStartMs;
    irr.lastDurMs = dur;
    irr.pumpStartMs = 0;

    sendOrBuffer(REC_IRR_STOP,  API_STOP,   payloadIrrEvent(epochNow()));
    sendOrBuffer(REC_IRR_DUR,   API_RECORD, payloadIrrDuration((float)dur / 60000.0f));
    Serial.printf("[Relay] Pump OFF — %lu sec\n", dur / 1000UL);
  }

  if (!wifiUp()) {
    smsQ.push(irr.pumpOn
      ? "Irrigation started while WiFi is down."
      : "Irrigation stopped while WiFi is down.");
  }

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
//  Command Processing
// ============================================================
static void processCommand(JsonObject cmd) {
  const char* type = cmd["command"] | "";

  if (strcmp(type, "START_IRRIGATION") == 0) {
    int dur = cmd["payload"]["duration"] | 0;
    if (dur > 0) {
      irr.manualEndMs = millis() + ((unsigned long)dur * 1000UL);
      irr.safetyTripped = false;
      Serial.printf("[Cmd] START %ds\n", dur);
    }
  } else if (strcmp(type, "STOP_IRRIGATION") == 0) {
    irr.manualEndMs = 0;
    Serial.println(F("[Cmd] STOP"));
  } else if (strcmp(type, "UPDATE_CONFIG") == 0) {
    JsonObject p = cmd["payload"];
    cfg.soilStartBelow = p["soilStartBelow"] | cfg.soilStartBelow;
    cfg.soilStopAbove  = p["soilStopAbove"]  | cfg.soilStopAbove;
    cfg.tempStartAbove = p["tempStartAbove"] | cfg.tempStartAbove;
    cfg.tempStopBelow  = p["tempStopBelow"]  | cfg.tempStopBelow;
    cfg.humStartBelow  = p["humStartBelow"]  | cfg.humStartBelow;
    cfg.humStopAbove   = p["humStopAbove"]   | cfg.humStopAbove;
    cfg.minOnMs        = p["minOnMs"]        | (long)cfg.minOnMs;
    cfg.minOffMs       = p["minOffMs"]       | (long)cfg.minOffMs;
    saveConfig();
    Serial.println(F("[Cmd] Config updated"));
  }
}

// ============================================================
//  Upload + Command Poll
// ============================================================
void taskUpload() {
  String payload = payloadSensor(lastReading);
  String resp;
  bool ok = httpPost(API_SENSOR, payload, resp);
  flagBackend(ok);

  if (!ok) {
    bufAppend(wrapRecord(REC_SENSOR, API_SENSOR, payload));
    return;
  }

  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, resp)) return;
  if (!doc.containsKey("commands")) return;

  for (JsonObject c : doc["commands"].as<JsonArray>()) {
    processCommand(c);
  }
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

  storageInit();
  loadConfig();
  dht.begin();

  SerialToGSM.begin(9600, SERIAL_8N1, GSM_UART_RX, GSM_UART_TX);

  smsQ.push("Irrigation system is up and ready.");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  wifiBeginConnect();

  esp_task_wdt_deinit();

  sys.lastLoopMs = millis();
  Serial.printf("[Boot] Farm  : %s\n", FARM_ID);
  Serial.printf("[Boot] Device: %s (%s)\n", DEVICE_ID, DEVICE_NAME);
  Serial.printf("[Boot] Soil: <%d start, >%d stop | T>%.0f/%.0f | H<%.0f/>%.0f\n",
    cfg.soilStartBelow, cfg.soilStopAbove,
    cfg.tempStartAbove, cfg.tempStopBelow,
    cfg.humStartBelow,  cfg.humStopAbove);
  Serial.println(F("[Boot] Ready — background init running"));
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
