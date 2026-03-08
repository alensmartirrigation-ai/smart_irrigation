#define TINY_GSM_MODEM_SIM800
#define TINY_GSM_RX_BUFFER 1024

#include <TinyGsmClient.h>
#include <HardwareSerial.h>

#define MODEM_TX 27
#define MODEM_RX 26
#define MODEM_PWRKEY 4

#define SMS_PREFIX "sms_string:"

// UART for GSM
HardwareSerial SerialAT(1);

// UART for other ESP32
HardwareSerial SerialExt(2);

TinyGsm modem(SerialAT);

String phoneNumber = "+918129437037";

// ================= POWER CONTROL =================
void powerOnModem() {
  pinMode(MODEM_PWRKEY, OUTPUT);
  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(1000);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(1200);
  digitalWrite(MODEM_PWRKEY, HIGH);
}

// ================= NETWORK MANAGEMENT =================
void connectToNetwork() {
  Serial.println("Connecting to network...");

  while (!modem.waitForNetwork(30000)) {
    Serial.println("Network failed. Restarting modem...");
    modem.restart();
    delay(5000);
  }

  Serial.println("Network connected.");
}

void ensureNetwork() {
  if (!modem.isNetworkConnected()) {
    Serial.println("Network lost. Reconnecting...");
    connectToNetwork();
  }
}

// ================= SMS FUNCTION =================
void sendSMSMessage(String message) {
  message.trim();
  if (message.length() == 0) return;

  ensureNetwork();

  Serial.println("Sending SMS: " + message);

  bool success = false;
  int attempts = 0;

  while (!success && attempts < 3) {
    success = modem.sendSMS(phoneNumber, message);

    if (!success) {
      Serial.println("SMS failed. Retrying...");
      ensureNetwork();
      attempts++;
      delay(3000);
    }
  }

  if (success) {
    Serial.println("SMS sent successfully.");
  } else {
    Serial.println("SMS permanently failed.");
  }
}

// ================= MESSAGE FILTER =================
void processIncomingMessage(String rawMsg) {
  rawMsg.trim();

  int idx = rawMsg.indexOf(SMS_PREFIX);
  if (idx < 0) return;

  String actualMessage = rawMsg.substring(idx + strlen(SMS_PREFIX));
  actualMessage.trim();

  if (actualMessage.length() == 0) return;

  Serial.println("SMS queued: " + actualMessage);
  sendSMSMessage(actualMessage);
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Powering modem...");
  powerOnModem();

  SerialAT.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(5000);

  Serial.println("Initializing modem...");
  modem.restart();

  connectToNetwork();

  SerialExt.begin(9600, SERIAL_8N1, 16, 17);

  Serial.println("System ready.");
  Serial.println("Send data starting with sms_string:");
}

// ================= LOOP =================
void loop() {

  // Serial Monitor input
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    processIncomingMessage(msg);
  }

  // External ESP32 input
  if (SerialExt.available()) {
    String extMsg = SerialExt.readStringUntil('\n');
    Serial.println("Received: " + extMsg);
    processIncomingMessage(extMsg);
  }

  // Periodic network check
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 60000) {
    ensureNetwork();
    lastCheck = millis();
  }
}