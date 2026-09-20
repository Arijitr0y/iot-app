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

#define FIRMWARE_VERSION "1.0.0"

// --- EEPROM Configuration ---
const int EEPROM_MAGIC_ADDR = 0;
const int EEPROM_SSID_ADDR = 1;
const int EEPROM_PASS_ADDR = 33;
const int EEPROM_MQTT_USER_ADDR = 130;
const int EEPROM_MQTT_PASS_ADDR = 165;
const byte EEPROM_MAGIC_BYTE = 0xAA;

const int EEPROM_SCHEDULES_ADDR = 100;
const int MAX_SCHEDULES = 5;

struct Schedule {
  uint8_t active; // 0 or 1
  uint8_t action; // 0=off, 1=on
  uint8_t hour;
  uint8_t minute;
  uint8_t days;   // bitmask, bit 0=Sun, 1=Mon, ..., 6=Sat
};

Schedule schedules[MAX_SCHEDULES];

void saveSchedules() {
  for (int i = 0; i < MAX_SCHEDULES; i++) {
    int addr = EEPROM_SCHEDULES_ADDR + (i * sizeof(Schedule));
    EEPROM.put(addr, schedules[i]);
  }
  EEPROM.commit();
  Serial.println("Schedules saved to EEPROM.");
}

void loadSchedules() {
  for (int i = 0; i < MAX_SCHEDULES; i++) {
    int addr = EEPROM_SCHEDULES_ADDR + (i * sizeof(Schedule));
    EEPROM.get(addr, schedules[i]);
    // Safety check for uninitialized EEPROM
    if (schedules[i].active != 0 && schedules[i].active != 1) {
      schedules[i].active = 0;
    }
  }
  Serial.println("Schedules loaded from EEPROM.");
}

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
  if (EEPROM.read(EEPROM_MAGIC_ADDR) != EEPROM_MAGIC_BYTE) {
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
const char* AP_SSID_PREFIX = "Motor Plug"; 
const char* AP_PASS = ""; // Leave empty for an open hotspot

// --- MQTT Configuration (Mosquitto on GCP) ---
const char* mqtt_server = "mqtt.arijitroy.dpdns.org"; 
const int mqtt_port = 8883; // 8883 for TLS
// IMPORTANT: Set these to the unique credentials created for this specific device in Mosquitto
String mqtt_user = "";
String mqtt_password = "";
String backend_url = "";
unsigned long lastClaimPoll = 0;

// --- Hardware Pins ---
// GPIO2 is the onboard LED on most ESP8266 boards (NodeMCU, Wemos D1 Mini).
// Note: It is usually active LOW (LOW = ON, HIGH = OFF)
const int RELAY_PIN = 2; // GPIO2 / D4
const int BUTTON_PIN = 0; // GPIO0 / D3

// Water Tank Sensor Pins
// Note: Since we are using internal pull-ups (INPUT_PULLUP), the Common wire MUST be connected to GND, not 3V3.
const int PIN_LVL_25 = 5;  // D1 (GPIO5)
const int PIN_LVL_50 = 4;  // D2 (GPIO4)
const int PIN_LVL_75 = 14; // D5 (GPIO14)
const int PIN_LVL_100 = 12; // D6 (GPIO12)

// Global State
bool relayState = false;
bool debugMode = false;
int currentWaterLevel = 0; // 0, 25, 50, 75, 100
unsigned long lastWaterCheck = 0;
unsigned long lastReconnectAttempt = 0;
bool shouldDisableAP = false;
unsigned long disableAPTime = 0;

// Pending Wi-Fi configuration from Web App
bool pendingWifiConfig = false;
String pendingSsid = "";
String pendingPass = "";
unsigned long pendingWifiConfigTime = 0;

// Provisioning Security State
enum ProvisioningState {
  STATE_NORMAL,
  STATE_PROVISIONING_STARTING,
  STATE_PROVISIONING_ACTIVE,
  STATE_CONFIGURING,
  STATE_CONNECTING_WIFI,
  STATE_PROVISIONING_SUCCESS,
  STATE_PROVISION_FAILED
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
  if (provState != STATE_NORMAL) return;
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
  String topic = "iot/devices/" + device_mac_str + "/state";
  JsonDocument doc;
  doc["id"] = device_mac_str;
  doc["status"] = "online";
  doc["state"] = relayState ? "on" : "off";
  doc["water_level"] = currentWaterLevel;
  
  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topic.c_str(), buffer, true); // Retained message
  Serial.print("Published state: ");
  Serial.println(buffer);
}

// Toggle Relay and publish state
void setRelayState(bool state) {
  relayState = state;
  // GPIO2 is active LOW on ESP8266
  digitalWrite(RELAY_PIN, relayState ? LOW : HIGH);
  publishState();
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
        if (currentWaterLevel == 100) {
          Serial.println("Cannot turn ON: Water is already HIGH!");
          
          JsonDocument errDoc;
          errDoc["id"] = device_mac_str;
          errDoc["error"] = "Cannot turn ON pump: Water tank is already full!";
          char errBuf[128];
          serializeJson(errDoc, errBuf);
          String errTopic = "iot/devices/" + device_mac_str + "/error";
          mqttClient.publish(errTopic.c_str(), errBuf);
          
          if (cmd_id) sendCommandAck(cmd_id, "failed_water_high");
        } else {
          setRelayState(true);
          if (cmd_id) sendCommandAck(cmd_id);
        }
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
      } else if (strcmp(action, "ota") == 0) {
        const char* version = doc["v"];
        const char* url = doc["url"];
        
        if (version && url) {
          if (strcmp(FIRMWARE_VERSION, version) != 0) {
            Serial.print("Targeted OTA requested to version: ");
            Serial.println(version);
            
            // Publish acknowledgement that we are starting OTA
            JsonDocument ackDoc;
            ackDoc["id"] = device_mac_str;
            ackDoc["state"] = relayState ? "on" : "off";
            ackDoc["status"] = "updating";
            char ackBuffer[128];
            serializeJson(ackDoc, ackBuffer);
            mqttClient.publish(mqtt_topic_state.c_str(), ackBuffer, true);
            
            delay(500); // Give MQTT time to publish
            mqttClient.disconnect();
            
            ESPhttpUpdate.setLedPin(RELAY_PIN, LOW); 
            t_httpUpdate_return ret = ESPhttpUpdate.update(espClient, url);
            
            switch (ret) {
              case HTTP_UPDATE_FAILED:
                Serial.printf("HTTP_UPDATE_FAILED Error (%d): %s\n", ESPhttpUpdate.getLastError(), ESPhttpUpdate.getLastErrorString().c_str());
                // Will reboot or reconnect normally on next loop if failed
                break;
              case HTTP_UPDATE_NO_UPDATES:
                Serial.println("HTTP_UPDATE_NO_UPDATES");
                break;
              case HTTP_UPDATE_OK:
                Serial.println("HTTP_UPDATE_OK");
                break;
            }
          } else {
             Serial.println("Targeted OTA ignored, already on this version.");
          }
        }
      }
    }
    
    if (doc.containsKey("debug")) {
      debugMode = doc["debug"];
      Serial.print("Debug mode set to: ");
      Serial.println(debugMode ? "true" : "false");
    }
    
    if (doc.containsKey("config")) {
      Serial.println("Received configuration update:");
      serializeJsonPretty(doc["config"], Serial);
      // In a real application, save to EEPROM or apply config here
    }

    // Publish new state back
    publishState();
  } else if (String(topic) == mqtt_topic_schedules) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
      Serial.print("deserializeJson() failed for schedules: ");
      Serial.println(error.c_str());
      return;
    }

    // Clear existing active flags
    for (int i = 0; i < MAX_SCHEDULES; i++) {
      schedules[i].active = 0;
    }

    JsonArray arr = doc.as<JsonArray>();
    int count = 0;
    for (JsonVariant v : arr) {
      if (count >= MAX_SCHEDULES) break;
      JsonObject obj = v.as<JsonObject>();
      
      schedules[count].active = 1;
      schedules[count].action = obj["a"] | 0;
      schedules[count].hour = obj["h"] | 0;
      schedules[count].minute = obj["m"] | 0;
      
      uint8_t daysMask = 0;
      JsonArray daysArr = obj["d"].as<JsonArray>();
      for (JsonVariant d : daysArr) {
        int dayInt = d.as<int>();
        if (dayInt >= 0 && dayInt <= 6) {
          daysMask |= (1 << dayInt);
        }
      }
      schedules[count].days = daysMask;
      count++;
    }
    
    saveSchedules();
    Serial.print("Saved ");
    Serial.print(count);
    Serial.println(" active schedules to EEPROM");
  } else if (String(topic) == mqtt_topic_ota) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
      Serial.println("OTA JSON error");
      return;
    }
    
    const char* version = doc["v"];
    const char* url = doc["url"];
    
    if (version && url) {
      if (strcmp(FIRMWARE_VERSION, version) != 0) {
        Serial.print("New firmware detected: ");
        Serial.println(version);
        Serial.print("Downloading from: ");
        Serial.println(url);
        
        // Disable MQTT to avoid conflicts during OTA
        mqttClient.disconnect();
        
        ESPhttpUpdate.setLedPin(RELAY_PIN, LOW); // optional
        t_httpUpdate_return ret = ESPhttpUpdate.update(espClient, url);
        
        switch (ret) {
          case HTTP_UPDATE_FAILED:
            Serial.printf("HTTP_UPDATE_FAILED Error (%d): %s\n", ESPhttpUpdate.getLastError(), ESPhttpUpdate.getLastErrorString().c_str());
            break;
          case HTTP_UPDATE_NO_UPDATES:
            Serial.println("HTTP_UPDATE_NO_UPDATES");
            break;
          case HTTP_UPDATE_OK:
            Serial.println("HTTP_UPDATE_OK");
            break;
        }
      } else {
        Serial.println("Firmware is up to date, ignoring OTA.");
      }
    }
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
  
  if (provState != STATE_CONFIGURING) {
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
  delay(1000);
  
  // Setup Hardware Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  // Configure water sensor pins as input with internal pull-ups
  // Since ESP8266 only has pull-ups, the common wire must be GND!
  pinMode(PIN_LVL_25, INPUT_PULLUP);
  pinMode(PIN_LVL_50, INPUT_PULLUP);
  pinMode(PIN_LVL_75, INPUT_PULLUP);
  pinMode(PIN_LVL_100, INPUT_PULLUP);

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
  
  // Load schedules into memory
  loadSchedules();
  
  String savedSsid, savedPassword;
  if (loadWifiCredentials(savedSsid, savedPassword)) {
    loadMqttCredentials(mqtt_user, mqtt_password);
    Serial.println("Loaded Wi-Fi credentials from EEPROM.");
    Serial.print("Attempting to connect to: ");
    Serial.println(savedSsid);
    WiFi.mode(WIFI_STA); // AP is OFF by default if configured
    WiFi.begin(savedSsid.c_str(), savedPassword.c_str());
  } else {
    Serial.println("No saved Wi-Fi credentials found in EEPROM. Waiting for physical button press to enter Provisioning Mode...");
    WiFi.mode(WIFI_STA);
  }
  
  // 3. Set up HTTP routing
  server.on("/", HTTP_GET, handleRoot);
  server.on("/", HTTP_OPTIONS, handleOptions);
  server.on("/start_session", HTTP_POST, handleStartSession);
  server.on("/start_session", HTTP_OPTIONS, handleOptions);
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/scan", HTTP_OPTIONS, handleOptions);
  server.on("/configure", HTTP_POST, handleConfigure);
  server.on("/configure", HTTP_OPTIONS, handleOptions); 
  
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
  certList.append(GTS_Root_R1);
  espClient.setTrustAnchors(&certList);
  
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  
  Serial.println("HTTP server started! Waiting for app connections...\n");
}

void loop() {
  server.handleClient();
  
  static bool bootConnectChecked = false;
  static unsigned long lastWifiRetry = 0;
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry > 30000) {
      Serial.println("WiFi connection lost. Reconnecting...");
      WiFi.reconnect();
      lastWifiRetry = millis();
    }
  }



  // --- Secure MQTT Credential Provisioning ---
  if (WiFi.status() == WL_CONNECTED && mqtt_user == "" && backend_url != "" && provState != STATE_NORMAL) {
    if (millis() - lastClaimPoll > 5000) {
      lastClaimPoll = millis();
      Serial.println("Polling backend for MQTT credentials...");
      
      HTTPClient http;
      WiFiClientSecure client;
      client.setTrustAnchors(&certList); // Validate server certificate
      
      http.begin(client, backend_url + "/api/devices/claim");
      http.addHeader("Content-Type", "application/json");
      
      String payload = "{\"mac_address\":\"" + device_mac_str + "\", \"token\":\"" + provisioningToken + "\"}";
      int httpCode = http.POST(payload);
      
      if (httpCode == 200) {
        String resp = http.getString();
        JsonDocument doc;
        deserializeJson(doc, resp);
        
        if (doc["success"]) {
          mqtt_user = doc["mqtt_username"].as<String>();
          mqtt_password = doc["mqtt_password"].as<String>();
          saveMqttCredentials(mqtt_user, mqtt_password);
          Serial.println("✅ Successfully claimed secure MQTT credentials!");
          
          // Clear sensitive token
          provisioningToken = "";
        }
      } else {
        Serial.printf("Claim failed with code: %d\n", httpCode);
      }
      http.end();
    }
  }

  // --- Water Level Sensing Logic ---
  if (millis() - lastWaterCheck > 1000) {
    lastWaterCheck = millis();
    
    // Since we use INPUT_PULLUP and GND as common, submerged = LOW
    bool l25 = digitalRead(PIN_LVL_25) == LOW;
    bool l50 = digitalRead(PIN_LVL_50) == LOW;
    bool l75 = digitalRead(PIN_LVL_75) == LOW;
    bool l100 = digitalRead(PIN_LVL_100) == LOW;
    
    bool isValid = true;
    int newLevel = 0;

    if (l100) {
      if (!l75 || !l50 || !l25) isValid = false;
      else newLevel = 100;
    } else if (l75) {
      if (!l50 || !l25) isValid = false;
      else newLevel = 75;
    } else if (l50) {
      if (!l25) isValid = false;
      else newLevel = 50;
    } else if (l25) {
      newLevel = 25;
    } else {
      newLevel = 0;
    }

    if (isValid) {
      bool levelChanged = (newLevel != currentWaterLevel);
      currentWaterLevel = newLevel;

      // Automatic Motor Control
      if (currentWaterLevel == 100 && relayState == true) {
        Serial.println("Water HIGH: Auto stopping motor.");
        setRelayState(false);
      } else if (currentWaterLevel == 0 && relayState == false) {
        Serial.println("Water LOW: Auto starting motor.");
        setRelayState(true);
      }

      if (levelChanged) {
        publishState();
      }
    } else {
      // Don't print constantly to avoid spamming the serial monitor, but we ignore the read
      // Serial.println("Invalid sensor state (e.g. D2 is HIGH but D1 is LOW). Ignoring.");
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

  // --- Run Schedules ---
  static unsigned long lastScheduleCheck = 0;
  static int lastTriggeredMinute = -1; 
  
  if (millis() - lastScheduleCheck > 1000) {
    lastScheduleCheck = millis();
    
    time_t now = time(nullptr);
    struct tm* timeinfo = localtime(&now);
    
    // Only run schedules if NTP is synced (year > 2020)
    if (timeinfo->tm_year > (2020 - 1900)) {
      int currentHour = timeinfo->tm_hour;
      int currentMinute = timeinfo->tm_min;
      int currentDay = timeinfo->tm_wday; // 0=Sun, 1=Mon, ..., 6=Sat
      
      if (currentMinute != lastTriggeredMinute) {
        bool triggered = false;
        for (int i = 0; i < MAX_SCHEDULES; i++) {
          if (schedules[i].active == 1) {
            if (schedules[i].hour == currentHour && schedules[i].minute == currentMinute) {
              if (schedules[i].days & (1 << currentDay)) {
                Serial.print("Executing schedule! Turning relay ");
                Serial.println(schedules[i].action == 1 ? "ON" : "OFF");
                setRelayState(schedules[i].action == 1);
                triggered = true;
                break; 
              }
            }
          }
        }
        if (triggered) {
          lastTriggeredMinute = currentMinute;
        } else if (lastTriggeredMinute != -1 && currentMinute != lastTriggeredMinute) {
          lastTriggeredMinute = -1;
        }
      }
    }
  }

  // --- Handle Pending Config ---
  if (pendingWifiConfig && millis() - pendingWifiConfigTime > 1500) {
    pendingWifiConfig = false;
    Serial.println("Attempting to connect to Wi-Fi from pending config...");
    WiFi.begin(pendingSsid.c_str(), pendingPass.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n✅ Successfully connected to Wi-Fi!");
      saveWifiCredentials(pendingSsid, pendingPass);
      provState = STATE_PROVISIONING_SUCCESS;
      provisioningToken = "";
      shouldDisableAP = true;
      disableAPTime = millis();
    } else {
      Serial.println("\n❌ Failed to connect to Wi-Fi. AP will remain active.");
      provState = STATE_CONFIGURING; // revert back to configuring to allow retry
    }
    
    pendingSsid = "";
    pendingPass = "";
  }
  
  if (shouldDisableAP && millis() - disableAPTime > 2000) {
    Serial.println("Disabling AP mode to allow client to reconnect to home internet...");
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    shouldDisableAP = false;
    provState = STATE_NORMAL;
    bootConnectChecked = true; // Mark as checked so we don't do it again below
  }
  
  if (provState != STATE_NORMAL && millis() - provisioningStartTime > 300000) { // 5 mins timeout
    Serial.println("Provisioning mode timed out (5 mins). Disabling AP.");
    provState = STATE_NORMAL;
    provisioningToken = "";
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    if (!bootConnectChecked) {
      Serial.println("\n✅ Successfully auto-connected to saved Wi-Fi on boot!");
      Serial.print("Local IP: ");
      Serial.println(WiFi.localIP());
      Serial.println("Disabling AP mode...");
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
      bootConnectChecked = true;
    }
    
    if (!mqttClient.connected()) {
      unsigned long now = millis();
      if (now - lastReconnectAttempt > 5000) {
        lastReconnectAttempt = now;
        // Attempt to reconnect
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
