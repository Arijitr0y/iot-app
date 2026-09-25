/*
 * Motor Plug ESP8266 Production-Oriented Firmware
 *
 * Provisioning behavior:
 *  - First boot / no saved Wi-Fi: AP starts automatically.
 *  - Factory reset: AP starts automatically after reboot.
 *  - 5-second button hold: manually enter provisioning mode.
 *  - 10-second button hold: factory reset.
 *
 * Final commercial release still requires hardware validation, electrical
 * safety/interlock testing, brownout/reset testing, OTA recovery testing,
 * and live infrastructure security testing.
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h> // NOTE: Please install "ArduinoJson" (version 7.x) from the Arduino Library Manager
#include <PubSubClient.h> // NOTE: Please install "PubSubClient" from the Arduino Library Manager
#include <EEPROM.h>
#include <time.h>
#include <ESP8266httpUpdate.h>
#include "certs.h"

X509List certList;

// Forward declarations for globals used by functions defined before the
// concrete global-object definitions later in this file.
extern bool relayState;
extern PubSubClient mqttClient;

#define FIRMWARE_VERSION "1.0.0"

// --- EEPROM Configuration ---
const int EEPROM_MAGIC_ADDR = 0;
const int EEPROM_SSID_ADDR = 1;
const int EEPROM_PASS_ADDR = 33;
const int EEPROM_MQTT_USER_ADDR = 130;
const int EEPROM_MQTT_PASS_ADDR = 165;
const byte EEPROM_MAGIC_BYTE = 0xAA;


void saveWifiCredentials(String ssid, String password) {
  // Enforce max lengths
  if (ssid.length() > 32) ssid = ssid.substring(0, 32);
  if (password.length() > 64) password = password.substring(0, 64);
  
  // Two-phase commit: invalidate magic byte first
  EEPROM.write(EEPROM_MAGIC_ADDR, 0x00);
  EEPROM.commit();
  
  for (int i = 0; i < 32; ++i) {
    if (i < ssid.length()) {
      EEPROM.write(EEPROM_SSID_ADDR + i, ssid[i]);
    } else {
      EEPROM.write(EEPROM_SSID_ADDR + i, 0); // null terminate
    }
  }
  
  for (int i = 0; i < 64; ++i) {
    if (i < password.length()) {
      EEPROM.write(EEPROM_PASS_ADDR + i, password[i]);
    } else {
      EEPROM.write(EEPROM_PASS_ADDR + i, 0); // null terminate
    }
  }
  
  EEPROM.commit();
  
  // Write magic byte last to indicate valid data
  EEPROM.write(EEPROM_MAGIC_ADDR, EEPROM_MAGIC_BYTE);
  EEPROM.commit();
  
  Serial.println("Saved Wi-Fi credentials to EEPROM.");
}

bool loadWifiCredentials(String &ssid, String &password) {
  byte magic = EEPROM.read(EEPROM_MAGIC_ADDR);
  Serial.print("\n[BOOT] Reading EEPROM Magic Byte: 0x");
  Serial.println(magic, HEX);
  
  if (magic != EEPROM_MAGIC_BYTE) {
    Serial.println("[BOOT] EEPROM magic byte mismatch or empty. Returning false.");
    return false; // No saved credentials
  }
  
  ssid = "";
  for (int i = 0; i < 32; ++i) {
    char c = EEPROM.read(EEPROM_SSID_ADDR + i);
    if (c == 0) break;
    ssid += c;
  }
  
  password = "";
  for (int i = 0; i < 64; ++i) {
    char c = EEPROM.read(EEPROM_PASS_ADDR + i);
    if (c == 0) break;
    password += c;
  }
  
  Serial.print("[BOOT] Loaded SSID from memory: '");
  Serial.print(ssid);
  Serial.println("'");
  Serial.print("[BOOT] Password length loaded: ");
  Serial.println(password.length());
  
  return ssid.length() > 0;
}

void saveMqttCredentials(String user, String password) {
  if (user.length() > 32) user = user.substring(0, 32);
  if (password.length() > 64) password = password.substring(0, 64);
  
  for (int i = 0; i < 32; ++i) {
    if (i < user.length()) EEPROM.write(EEPROM_MQTT_USER_ADDR + i, user[i]);
    else EEPROM.write(EEPROM_MQTT_USER_ADDR + i, 0);
  }
  
  for (int i = 0; i < 64; ++i) {
    if (i < password.length()) EEPROM.write(EEPROM_MQTT_PASS_ADDR + i, password[i]);
    else EEPROM.write(EEPROM_MQTT_PASS_ADDR + i, 0);
  }
  
  EEPROM.commit();
  Serial.println("Saved MQTT credentials to EEPROM.");
}

bool loadMqttCredentials(String &user, String &password) {
  if (EEPROM.read(EEPROM_MAGIC_ADDR) != EEPROM_MAGIC_BYTE) return false;
  
  user = "";
  for (int i = 0; i < 32; ++i) {
    char c = EEPROM.read(EEPROM_MQTT_USER_ADDR + i);
    if (c == 0) break;
    user += c;
  }
  
  password = "";
  for (int i = 0; i < 64; ++i) {
    char c = EEPROM.read(EEPROM_MQTT_PASS_ADDR + i);
    if (c == 0) break;
    password += c;
  }
  
  return user.length() > 0 && password.length() > 0;
}


void factoryReset() {
  Serial.println("Starting Factory Reset...");

  // Safety: ensure pump relay is OFF before erasing configuration/restarting.
  // Use the hardware pin directly here because this function is declared
  // before the later global relay/MQTT objects. The ESP will restart after reset.
  digitalWrite(2, HIGH); // GPIO2 / D4, active-LOW relay OFF
  
  // 1. Erase EEPROM
  EEPROM.begin(512);
  for (int i = 0; i < 512; i++) {
    EEPROM.write(i, 0);
  }
  EEPROM.commit();
  Serial.println("EEPROM erased.");
  
  // 2. Erase internal Wi-Fi credentials
  WiFi.disconnect(true);
  delay(500);
  Serial.println("Internal Wi-Fi credentials erased.");
  
  // 3. Restart device
  Serial.println("Restarting device...");
  delay(1000);
  ESP.restart();
}

void initNTP() {
  Serial.println("Initializing NTP...");
  // Set time via NTP. Set for IST (+5:30) which is 19800 seconds offset.
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
}

// --- Configuration ---
const char* AP_SSID_PREFIX = "SmartLight"; 
const char* AP_PASS = ""; // Leave empty for an open hotspot

// --- MQTT Configuration (Mosquitto on GCP) ---
const char* mqtt_server = "mqtt.arijitroy.dpdns.org"; 
const int mqtt_port = 8883; // 8883 for TLS
// IMPORTANT: Set these to the unique credentials created for this specific device in Mosquitto
String mqtt_user = "";
String mqtt_password = "";
String backend_url = "";
unsigned long lastClaimPoll = 0;

// Hardware Pins
const int RELAY_PIN = 4; // GPIO4 / D2
const int BUTTON_PIN = 0; // GPIO0 / D3
const int WIFI_LED_PIN = 15; // D8 (GPIO15) - Glows when Wi-Fi is connected

// Global State
bool relayState = false;
bool debugMode = false;
unsigned long lastReconnectAttempt = 0;
bool shouldDisableAP = false;
unsigned long disableAPTime = 0;

// Debouncing for MQTT
bool pendingStatePublish = false;
unsigned long lastStatePublish = 0;

// Pending Wi-Fi configuration from Web App
bool pendingWifiConfig = false;
String pendingSsid = "";
String pendingPass = "";
unsigned long pendingWifiConfigTime = 0;
unsigned long wifiConnectStartTime = 0;
unsigned long wifiSuccessTime = 0;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000UL;

// Boot-time Wi-Fi connection state.
// True only when valid Wi-Fi credentials were loaded from EEPROM.
bool bootWifiAttemptActive = false;
unsigned long bootWifiAttemptStart = 0;
const unsigned long AP_GRACE_AFTER_WIFI_MS = 8000UL;

// Provisioning Security State
enum ProvisioningState {
  STATE_NORMAL,
  STATE_PROVISIONING_STARTING,
  STATE_PROVISIONING_ACTIVE,
  STATE_CONFIGURING,
  STATE_CONNECTING_WIFI,
  STATE_PROVISIONING_SUCCESS,
  STATE_PROVISION_FAILED,
  STATE_NTP_SYNCING,
  STATE_CLOUD_CLAIMING,
  STATE_MQTT_CONNECTING
};

ProvisioningState provState = STATE_NORMAL;
unsigned long provisioningStartTime = 0;
String provisioningToken = "";

// Button state
unsigned long buttonPressTime = 0;
bool isButtonPressed = false;

ESP8266WebServer server(80);
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

String ap_ssid;
String device_mac_str;
String mqtt_topic_command;
String mqtt_topic_state;
String mqtt_topic_schedules;
String mqtt_topic_ota;

// Helper to send CORS headers so the web app can talk to the ESP
void sendCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Handle preflight OPTIONS requests from the browser
void handleOptions() {
  sendCORSHeaders();
  server.send(204);
}

void startProvisioningMode() {
  if (provState != STATE_NORMAL && provState != STATE_PROVISIONING_STARTING) return;

  bootWifiAttemptActive = false; // Cancel any boot Wi-Fi timers to prevent duplicate connections

  // Safety: never leave the pump running while the device is in provisioning mode.
  relayState = false;
  digitalWrite(RELAY_PIN, HIGH);
  if (mqttClient.connected()) mqttClient.disconnect();

  Serial.println("Starting Secure Provisioning Hotspot...");
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(ap_ssid.c_str(), AP_PASS);
  
  provState = STATE_PROVISIONING_ACTIVE;
  provisioningStartTime = millis();
  
  Serial.print("Provisioning Hotspot IP: ");
  Serial.println(WiFi.softAPIP());
}

// Handle GET / (Used by the web app to verify connection)
void handleRoot() {
  sendCORSHeaders();
  String json = "{\"status\":\"OK\", \"mac\":\"" + device_mac_str + "\"}";
  server.send(200, "application/json", json);
}

// Handle GET /status
// Used by the web app to observe the local provisioning state without relying
// on browser navigator.onLine (which describes the phone, not the ESP).
void handleStatus() {
  sendCORSHeaders();

  String state = "normal";
  switch (provState) {
    case STATE_PROVISIONING_STARTING: state = "provisioning_starting"; break;
    case STATE_PROVISIONING_ACTIVE: state = "provisioning_active"; break;
    case STATE_CONFIGURING: state = "configuring"; break;
    case STATE_CONNECTING_WIFI: state = "wifi_connecting"; break;
    case STATE_PROVISIONING_SUCCESS: state = "wifi_connected"; break;
    case STATE_PROVISION_FAILED: state = "wifi_failed"; break;
    case STATE_NTP_SYNCING: state = "ntp_syncing"; break;
    case STATE_CLOUD_CLAIMING: state = "cloud_claiming"; break;
    case STATE_MQTT_CONNECTING: state = "mqtt_connecting"; break;
    default: state = "normal"; break;
  }

  JsonDocument doc;
  doc["success"] = true;
  doc["mac"] = device_mac_str;
  doc["state"] = state;
  doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
  doc["mqtt_connected"] = mqttClient.connected();
  if (WiFi.status() == WL_CONNECTED) {
    doc["ip"] = WiFi.localIP().toString();
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Handle GET /status
// Used by the provisioning web app to determine the real ESP state.


// Handle POST /start_session
void handleStartSession() {
  sendCORSHeaders();
  
  if (provState != STATE_PROVISIONING_ACTIVE) {
    server.send(403, "application/json", "{\"success\": false, \"error\": \"Device not ready for provisioning or session already claimed\"}");
    return;
  }
  
  // Generate high-entropy token using ESP8266 hardware RNG
  uint32_t raw_random = RANDOM_REG32;
  char tokenBuf[16];
  snprintf(tokenBuf, sizeof(tokenBuf), "%08x", raw_random);
  provisioningToken = String(tokenBuf);
  wifiConnectStartTime = 0;
  wifiSuccessTime = 0;
  pendingWifiConfig = false;
  pendingSsid = "";
  pendingPass = "";
  
  provState = STATE_CONFIGURING;
  
  String json = "{\"success\": true, \"token\":\"" + provisioningToken + "\"}";
  server.send(200, "application/json", json);
}

// Handle GET /scan (Used by the web app to list Wi-Fi networks)
void handleScan() {
  sendCORSHeaders();
  if (provState < STATE_PROVISIONING_ACTIVE) {
    server.send(403, "application/json", "{\"success\": false, \"error\": \"Provisioning not active\"}");
    return;
  }
  
  Serial.println("Starting Wi-Fi scan...");
  int n = WiFi.scanNetworks();
  Serial.printf("Found %d networks\n", n);
  
  JsonDocument doc; 
  JsonArray networks = doc["networks"].to<JsonArray>();

  for (int i = 0; i < n; ++i) {
    JsonObject net = networks.add<JsonObject>();
    net["ssid"] = WiFi.SSID(i);
    net["rssi"] = WiFi.RSSI(i);
    net["secure"] = WiFi.encryptionType(i) != ENC_TYPE_NONE;
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// Publish the current state to MQTT
void publishState() {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["id"] = device_mac_str;
  doc["status"] = "online";
  doc["state"] = relayState ? "on" : "off";

  char buffer[256];
  serializeJson(doc, buffer);
  
  String topic = "iot/devices/" + device_mac_str + "/state";
  bool success = mqttClient.publish(topic.c_str(), buffer, true); // Retained message
  
  Serial.println("\n--- MQTT PUBLISH ---");
  Serial.print("Topic: ");
  Serial.println(topic);
  Serial.print("Payload: ");
  Serial.println(buffer);
  Serial.print("Success: ");
  Serial.println(success ? "YES" : "NO");
  Serial.println("--------------------\n");
}

// Toggle Relay and publish state
void setRelayState(bool state) {
  relayState = state;
  // GPIO2/LED_BUILTIN are usually active LOW on ESP8266
  digitalWrite(RELAY_PIN, relayState ? LOW : HIGH);
  digitalWrite(LED_BUILTIN, relayState ? LOW : HIGH);
  pendingStatePublish = true; // Defer publishing to the main loop to prevent buffer overflow
}

// Send Command Acknowledgment back to backend
void sendCommandAck(const char* cmd_id, const char* status = "success") {
  if (!mqttClient.connected() || !cmd_id) return;
  
  String topic = "iot/devices/" + device_mac_str + "/ack";
  JsonDocument doc;
  doc["cmd_id"] = cmd_id;
  doc["status"] = status;
  
  char buffer[128];
  serializeJson(doc, buffer);
  mqttClient.publish(topic.c_str(), buffer);
  Serial.print("Sent ACK for cmd: ");
  Serial.println(cmd_id);
}

// Command Idempotency Tracking (Store last 5 command IDs)
String recentCmdIds[5];
int recentCmdIdx = 0;

bool isDuplicateCommand(const char* cmd_id) {
  if (!cmd_id) return false;
  
  String incomingId = String(cmd_id);
  // Check if we've seen this ID recently
  for (int i = 0; i < 5; i++) {
    if (recentCmdIds[i] == incomingId) {
      return true;
    }
  }
  
  // Store it in the circular buffer
  recentCmdIds[recentCmdIdx] = incomingId;
  recentCmdIdx = (recentCmdIdx + 1) % 5;
  return false;
}

// MQTT Callback when a message arrives
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length > 1024) {
    Serial.println("MQTT payload rejected: too large.");
    return;
  }
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  if (String(topic) == mqtt_topic_command) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
      Serial.print("deserializeJson() failed: ");
      Serial.println(error.c_str());
      return;
    }

    const char* action = doc["action"];
    const char* cmd_id = doc["cmd_id"]; // New tracking ID

    // Deduplication check: Protect against MQTT retries
    if (cmd_id && isDuplicateCommand(cmd_id)) {
      Serial.println("Duplicate command detected! Skipping execution to prevent side effects.");
      sendCommandAck(cmd_id, "success"); // ACK it again to satisfy the backend
      return;
    }

    if (action) {
      if (strcmp(action, "on") == 0) {
        setRelayState(true);
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "off") == 0) {
        setRelayState(false);
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "restart") == 0) {
        Serial.println("Remote restart requested...");
        if (cmd_id) sendCommandAck(cmd_id);
        publishState(); // Acknowledge before restarting
        delay(1000);
        ESP.restart();
      } else if (strcmp(action, "factory_reset") == 0) {
        Serial.println("Remote factory reset requested...");
        if (cmd_id) sendCommandAck(cmd_id);
        delay(1000);
        factoryReset();
      } else if (strcmp(action, "restart_mqtt") == 0) {
        Serial.println("Restarting MQTT connection...");
        if (cmd_id) sendCommandAck(cmd_id);
        mqttClient.disconnect();
      } else if (strcmp(action, "restart_wifi") == 0) {
        Serial.println("Restarting WiFi...");
        if (cmd_id) sendCommandAck(cmd_id);
        WiFi.disconnect();
        delay(100);
        WiFi.reconnect();
      } else if (strcmp(action, "sync_time") == 0) {
        Serial.println("Resyncing NTP Time...");
        initNTP();
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "sync_config") == 0) {
        Serial.println("Sync Config placeholder executed");
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "relay_test") == 0) {
        Serial.println("Running Relay Test...");
        if (cmd_id) sendCommandAck(cmd_id);
        setRelayState(true); delay(500);
        setRelayState(false); delay(500);
        setRelayState(true); delay(500);
        setRelayState(false);
      } else if (strcmp(action, "sensor_test") == 0) {
        Serial.println("Running Sensor Test (Mock)...");
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "led_blink") == 0) {
        Serial.println("Running LED Blink (Mock)...");
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "enable_debug") == 0) {
        debugMode = true;
        Serial.println("Debug mode ENABLED");
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "disable_debug") == 0) {
        debugMode = false;
        Serial.println("Debug mode DISABLED");
        if (cmd_id) sendCommandAck(cmd_id);
      } else if (strcmp(action, "enter_recovery") == 0) {
        Serial.println("Entering Recovery Mode (Mock)...");
        if (cmd_id) sendCommandAck(cmd_id);
      }
    }
    
    if (doc.containsKey("debug")) {
      debugMode = doc["debug"];
      Serial.print("Debug mode set to: ");
      Serial.println(debugMode ? "true" : "false");
    }
    
    // Publish new state back
    publishState();
  }
}

// Non-blocking MQTT reconnect
bool reconnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (mqtt_user == "") return false; // Missing MQTT credentials

  Serial.print("Attempting MQTT connection...");
  
  // Create a client ID EXACTLY matching the MAC address for Mosquitto %c ACLs
  String clientId = device_mac_str;
  
  // Last Will and Testament (LWT) setup
  JsonDocument lwtDoc;
  lwtDoc["id"] = device_mac_str;
  lwtDoc["status"] = "offline";
  char lwtBuffer[128];
  serializeJson(lwtDoc, lwtBuffer);

  // Attempt to connect
  if (mqttClient.connect(clientId.c_str(), mqtt_user.c_str(), mqtt_password.c_str(), mqtt_topic_state.c_str(), 1, true, lwtBuffer)) {
    Serial.println("connected");
    
    // Once connected, publish an announcement and resubscribe
    publishState();
    
    // Subscribe to topics
    mqttClient.subscribe(mqtt_topic_command.c_str());
    mqttClient.subscribe(mqtt_topic_schedules.c_str());
    mqttClient.subscribe(mqtt_topic_ota.c_str());
    
    // Print current time
    time_t now = time(nullptr);
    Serial.print("Current Time: ");
    Serial.println(ctime(&now));
    
    return true;
  } else {
    Serial.print("failed, rc=");
    Serial.print(mqttClient.state());
    
    // Check if it's a TLS error
    char errorBuf[128];
    espClient.getLastSSLError(errorBuf, sizeof(errorBuf));
    if (strlen(errorBuf) > 0) {
      Serial.print(" (TLS Error: ");
      Serial.print(errorBuf);
      Serial.println(")");
    } else {
      Serial.println(" try again in 5 seconds");
    }
    return false;
  }
}

// Handle POST /configure (Used by the web app to send the home Wi-Fi credentials)
void handleConfigure() {
  sendCORSHeaders();
  
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"success\": false, \"message\": \"No JSON body received\"}");
    return;
  }
  
  String body = server.arg("plain");
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    server.send(400, "application/json", "{\"success\": false, \"message\": \"Invalid JSON\"}");
    return;
  }
  
  if (provState != STATE_CONFIGURING && provState != STATE_PROVISION_FAILED) {
    server.send(401, "application/json", "{\"success\": false, \"message\": \"Provisioning session not claimed or expired\"}");
    return;
  }
  
  const char* token = doc["token"];
  if (!token || String(token) != provisioningToken) {
    delay(1000); // Mitigate brute-force
    server.send(401, "application/json", "{\"success\": false, \"message\": \"Invalid provisioning token\"}");
    return;
  }
  
  const char* ssid = doc["ssid"];
  const char* password = doc["password"];
  const char* burl = doc["backend_url"];
  if (!ssid || !password || String(ssid).length() == 0 || String(ssid).length() > 32 ||
      String(password).length() > 64) {
    server.send(400, "application/json", "{\"success\": false, \"message\": \"Invalid Wi-Fi credentials\"}");
    return;
  }
  if (burl) backend_url = String(burl);
  
  
  // Immediately send success response so the phone doesn't timeout/disconnect
  JsonDocument resDoc;
  resDoc["success"] = true;
  resDoc["message"] = "Credentials received. Attempting to connect...";
  String response;
  serializeJson(resDoc, response);
  server.send(200, "application/json", response);
  
  // Queue the Wi-Fi connection attempt for the main loop
  pendingSsid = String(ssid);
  pendingPass = String(password);
  pendingWifiConfig = true;
  pendingWifiConfigTime = millis();
  provState = STATE_CONNECTING_WIFI;
  
  Serial.println("\n--- Received Wi-Fi Credentials ---");
  Serial.print("Target SSID: ");
  Serial.println(ssid);
  Serial.println("Response sent. Will connect in main loop.");
}

void setup() {
  Serial.begin(115200);
  delay(100);
  
  // MUST initialize EEPROM before reading saved credentials!
  EEPROM.begin(512);
  
  Serial.println("\n\n=== ESP8266 PROVISIONING SERVER ===");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Relay OFF

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); // Onboard LED OFF

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  pinMode(WIFI_LED_PIN, OUTPUT);
  digitalWrite(WIFI_LED_PIN, LOW); // LED OFF initially
  


  // Initialize relay to OFF
  digitalWrite(RELAY_PIN, HIGH); // Default OFF (Active LOW)
  
  // 1. Generate a unique SSID and topics based on the MAC address
  uint8_t mac[6];
  WiFi.softAPmacAddress(mac);
  
  char macStr[13];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  device_mac_str = String(macStr);
  
  ap_ssid = String(AP_SSID_PREFIX) + String(mac[4], HEX) + String(mac[5], HEX);
  ap_ssid.toUpperCase();
  
  // Define MQTT Topics
  mqtt_topic_command = "iot/devices/" + device_mac_str + "/command";
  mqtt_topic_state = "iot/devices/" + device_mac_str + "/state";
  mqtt_topic_schedules = "iot/devices/" + device_mac_str + "/schedules";
  mqtt_topic_ota = String("iot/ota/") + AP_SSID_PREFIX;
  
  Serial.println("\n\n=== ESP8266 PROVISIONING SERVER ===");
  Serial.print("Device MAC: ");
  Serial.println(device_mac_str);
  Serial.print("Starting Hotspot: ");
  Serial.println(ap_ssid);
  

  
  String savedSsid, savedPassword;

  // BOOT DECISION:
  // Saved Wi-Fi credentials -> try that Wi-Fi.
  // No saved Wi-Fi credentials -> start provisioning AP immediately.
  if (loadWifiCredentials(savedSsid, savedPassword)) {
    bool haveMqttCredentials = loadMqttCredentials(mqtt_user, mqtt_password);

    Serial.println("[BOOT] Saved Wi-Fi credentials found.");
    Serial.print("[BOOT] Attempting to connect to: ");
    Serial.println(savedSsid);

    Serial.println("[BOOT] Setting WiFi mode to STA...");
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(); // Clear any stuck internal RF state from previous power cycle
    delay(100);
    WiFi.setAutoReconnect(true); // Force hardware-level auto-reconnect
    
    Serial.println("[BOOT] Calling WiFi.begin()...");
    WiFi.begin(savedSsid.c_str(), savedPassword.c_str());
    Serial.println("[BOOT] WiFi.begin() executed.");

    bootWifiAttemptActive = true;
    bootWifiAttemptStart = millis();

    if (!haveMqttCredentials) {
      Serial.println("MQTT credentials missing. Starting provisioning AP...");
      provState = STATE_PROVISIONING_STARTING;
      startProvisioningMode();
    } else {
      provState = STATE_NORMAL;
    }
  } else {
    // TRUE FIRST BOOT / FACTORY RESET.
    // There is no saved Wi-Fi, therefore there is nothing to reconnect to.
    Serial.println("No saved Wi-Fi credentials found.");
    Serial.println("Starting provisioning AP automatically...");
    provState = STATE_PROVISIONING_STARTING;
    startProvisioningMode();
  }
  
  // 3. Set up HTTP routing
  server.on("/", HTTP_GET, handleRoot);
  server.on("/", HTTP_OPTIONS, handleOptions);
  server.on("/start_session", HTTP_POST, handleStartSession);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/start_session", HTTP_OPTIONS, handleOptions);
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/scan", HTTP_OPTIONS, handleOptions);
  server.on("/configure", HTTP_POST, handleConfigure);
  server.on("/configure", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      handleOptions();
    } else {
      sendCORSHeaders();
      server.send(404, "text/plain", "Not found");
    }
  });

  server.begin();
  
  // 4. Initialize NTP for time syncing (MUST happen before TLS)
  initNTP();
  
  // 5. Set up MQTT with TLS Certificate Validation
  certList.append(ISRG_Root_X1);
  espClient.setTrustAnchors(&certList);
  
  // CRITICAL LATENCY FIX: Disable Nagle's Algorithm.
  // This prevents the ESP8266 from buffering small MQTT packets (like ACKs) 
  // over TLS, which can artificially delay them by 200-500ms.
  espClient.setNoDelay(true); 
  
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  
  Serial.println("HTTP server started! Waiting for app connections...\n");
}

void loop() {
  server.handleClient();
  
  // Update Wi-Fi LED on D8
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(WIFI_LED_PIN, HIGH); // Glow when connected
  } else {
    digitalWrite(WIFI_LED_PIN, LOW);  // Off when disconnected
  }

  // Debounced MQTT State Publish
  if (pendingStatePublish && (millis() - lastStatePublish > 250)) {
    pendingStatePublish = false;
    lastStatePublish = millis();
    publishState();
  }

  // AP Disable Logic
  if (shouldDisableAP && millis() > disableAPTime) {
    shouldDisableAP = false;
    WiFi.softAPdisconnect(true);
    Serial.println("Disabled Provisioning Hotspot to force phone internet recovery.");
  }

  static bool bootConnectChecked = false;
  static unsigned long lastWifiRetry = 0;

  // BOOT-TIME WI-FI:
  // This runs only when credentials were actually loaded from EEPROM.
  // First boot/factory reset has bootWifiAttemptActive == false.
  if (bootWifiAttemptActive) {
    
    // Debug print every 1 second
    static unsigned long lastWifiStatusPrint = 0;
    if (millis() - lastWifiStatusPrint > 1000) {
      Serial.print("[WIFI-BOOT] Status code: ");
      Serial.println(WiFi.status());
      lastWifiStatusPrint = millis();
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WIFI-BOOT] Saved Wi-Fi connected successfully.");
      Serial.print("Local IP: ");
      Serial.println(WiFi.localIP());

      bootWifiAttemptActive = false;
      bootConnectChecked = true;
    } else if (millis() - bootWifiAttemptStart >= WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("Saved Wi-Fi connection timed out.");
      Serial.println("Starting provisioning AP because saved Wi-Fi is unavailable.");

      bootWifiAttemptActive = false;
      WiFi.disconnect(false);

      provState = STATE_PROVISIONING_STARTING;
      startProvisioningMode();
    }
  }

  // NORMAL MODE WI-FI RECOVERY:
  // Never run reconnect while provisioning AP mode is active.
  if (provState == STATE_NORMAL &&
      !bootWifiAttemptActive &&
      WiFi.status() != WL_CONNECTED) {

    if (millis() - lastWifiRetry > 30000UL) {
      Serial.println("Wi-Fi connection lost. Reconnecting saved Wi-Fi...");
      WiFi.reconnect();
      lastWifiRetry = millis();
    }
  }

  // --- Secure MQTT Credential Provisioning State Machine ---
  if (WiFi.status() == WL_CONNECTED && mqtt_user == "" && backend_url != "") {
    
    if (provState == STATE_PROVISIONING_SUCCESS) {
      Serial.println("Starting NTP synchronization...");
      initNTP();
      provState = STATE_NTP_SYNCING;
      lastClaimPoll = millis();
      
      // Schedule AP disable in 5 seconds to force phone to drop connection
      // and use cellular data for the final API claim step.
      shouldDisableAP = true;
      disableAPTime = millis() + 5000;
    } 
    else if (provState == STATE_NTP_SYNCING) {
      if (millis() - lastClaimPoll > 1000) {
        lastClaimPoll = millis();
        time_t now = time(nullptr);
        if (now > 100000) {
          Serial.println("\nNTP synchronized.");
          Serial.println("Starting cloud claim...");
          provState = STATE_CLOUD_CLAIMING;
          lastClaimPoll = 0; // force immediate claim
        }
      }
    }
    else if (provState == STATE_CLOUD_CLAIMING) {
      if (millis() - lastClaimPoll > 5000) {
        lastClaimPoll = millis();
        
        String claimUrl = backend_url;
        if (claimUrl.endsWith("/")) {
            claimUrl = claimUrl.substring(0, claimUrl.length() - 1);
        }
        claimUrl += "/api/devices/claim";
        
        Serial.println("\nConnecting to:");
        Serial.println(claimUrl);
        
        HTTPClient http;
        WiFiClientSecure client;
        client.setTrustAnchors(&certList);
        // Timeout in milliseconds (10 seconds)
        client.setTimeout(10000);
        
        http.begin(client, claimUrl);
        http.addHeader("Content-Type", "application/json");
        
        String payload = "{\"mac_address\":\"" + device_mac_str + "\", \"token\":\"" + provisioningToken + "\"}";
        int httpCode = http.POST(payload);
        
        if (httpCode > 0) {
          Serial.print("\nClaim HTTP code: ");
          Serial.println(httpCode);
          
          String resp = http.getString();
          if (httpCode != 200) {
            Serial.print("Response body: ");
            Serial.println(resp);
          }
          
          if (httpCode == 200) {
            JsonDocument doc;
            deserializeJson(doc, resp);
            
            if (doc["success"]) {
              mqtt_user = doc["mqtt_username"].as<String>();
              mqtt_password = doc["mqtt_password"].as<String>();
              saveMqttCredentials(mqtt_user, mqtt_password);
              Serial.println("\nMQTT credentials received.");
              
              provisioningToken = "";
              provState = STATE_MQTT_CONNECTING;
              lastReconnectAttempt = 0;
            }
          }
        } else {
          Serial.printf("\nClaim failed with code: %d\n", httpCode);
          char tlsError[256] = {0};
          client.getLastSSLError(tlsError, sizeof(tlsError));
          if (strlen(tlsError) > 0) {
            Serial.print("TLS error: ");
            Serial.println(tlsError);
          }
        }
        http.end();
      }
    }
    else if (provState == STATE_MQTT_CONNECTING) {
      if (!mqttClient.connected()) {
        if (millis() - lastReconnectAttempt > 5000) {
          lastReconnectAttempt = millis();
          Serial.println("\nConnecting MQTT...");
          if (reconnectMQTT()) {
            Serial.println("\nMQTT connected.");
            Serial.println("\nDevice provisioning complete.");
            Serial.println("Entering NORMAL mode.");
            Serial.println("\nDisabling provisioning AP.");
            
            provState = STATE_NORMAL;
            WiFi.softAPdisconnect(true);
            WiFi.mode(WIFI_STA);
          }
        }
      } else {
         provState = STATE_NORMAL;
         WiFi.softAPdisconnect(true);
         WiFi.mode(WIFI_STA);
      }
    }
  }



  // Handle Physical Button with debounce
  int reading = digitalRead(BUTTON_PIN);
  if (reading == LOW) { // Button is pressed (active low)
    if (!isButtonPressed) {
      isButtonPressed = true;
      buttonPressTime = millis();
    } else if (millis() - buttonPressTime > 10000) {
      factoryReset();
    } else if (millis() - buttonPressTime > 5000) {
      if (provState == STATE_NORMAL) {
        provState = STATE_PROVISIONING_STARTING;
        startProvisioningMode();
      }
    }
  } else {
    isButtonPressed = false;
  }



  // --- Handle Pending Wi-Fi Configuration ---
  // Start the connection asynchronously. Do NOT block the HTTP server while
  // waiting for Wi-Fi; the web app needs /status to observe the transition.
  if (pendingWifiConfig && millis() - pendingWifiConfigTime >= 250) {
    pendingWifiConfig = false;
    wifiConnectStartTime = millis();
    provState = STATE_CONNECTING_WIFI;

    Serial.println("Attempting to connect to Wi-Fi from provisioning config...");
    Serial.print("Target SSID: ");
    Serial.println(pendingSsid);

    // Keep AP+STA alive during the connection attempt so the phone can poll
    // /status and receive a definitive result.
    WiFi.mode(WIFI_AP_STA);
    WiFi.disconnect(false);
    delay(50);
    WiFi.begin(pendingSsid.c_str(), pendingPass.c_str());
  }

  // --- Non-blocking Wi-Fi connection result ---
  if (provState == STATE_CONNECTING_WIFI) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWi-Fi connected successfully.");
      Serial.print("Local IP: ");
      Serial.println(WiFi.localIP());

      // Only persist credentials after actual WL_CONNECTED.
      saveWifiCredentials(pendingSsid, pendingPass);

      provState = STATE_PROVISIONING_SUCCESS;
      wifiSuccessTime = millis();
      lastClaimPoll = 0;

      // IMPORTANT: keep provisioningToken until the backend claim succeeds.
      // The backend uses this token to issue the device's unique MQTT creds.
      Serial.println("Wi-Fi credentials committed. Waiting for cloud/MQTT claim...");
    } else if (millis() - wifiConnectStartTime >= WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("\nWi-Fi connection timed out. Credentials were NOT saved.");
      WiFi.disconnect(false);
      provState = STATE_PROVISION_FAILED;
    }
  }

  // AP shutdown logic removed - it is now handled cleanly when transitioning to STATE_NORMAL after MQTT connect.

  if ((provState == STATE_PROVISIONING_ACTIVE ||
       provState == STATE_CONFIGURING ||
       provState == STATE_CONNECTING_WIFI ||
       provState == STATE_PROVISION_FAILED) &&
      millis() - provisioningStartTime > 600000UL) { // 10 mins timeout
    Serial.println("Provisioning mode timed out (10 mins). Disabling AP.");
    provState = STATE_NORMAL;
    provisioningToken = "";
    pendingWifiConfig = false;
    pendingSsid = "";
    pendingPass = "";
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    if (!bootConnectChecked && provState == STATE_NORMAL) {
      Serial.println("\nSuccessfully connected to saved Wi-Fi on boot.");
      Serial.print("Local IP: ");
      Serial.println(WiFi.localIP());
      bootConnectChecked = true;
    }
    
    if (!mqttClient.connected()) {
      unsigned long now = millis();
      if (now - lastReconnectAttempt > 5000) {
        lastReconnectAttempt = now;
        // Attempt to reconnec
        if (reconnectMQTT()) {
          lastReconnectAttempt = 0;
        }
      }
    } else {
      // Client connected
      mqttClient.loop();
    }
  }
  
  // Yield to the ESP8266 background tasks (WiFi, TCP/IP) to prevent Watchdog Resets
  yield();
}
