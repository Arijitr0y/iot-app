// ESP8266 Local HTTP Provisioning Service

export interface WifiNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
}

// Default IP for ESP8266/ESP32 in AP mode
const ESP_IP = '192.168.4.1';

export const espService = {
  /**
   * Pings the ESP to verify we are connected to its hotspot.
   * Note: Web browsers cannot read the OS Wi-Fi SSID for security reasons.
   * This is the standard way to verify connection in web apps.
   */
  async checkConnection(): Promise<{ connected: boolean; mac?: string; token?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`http://${ESP_IP}/`, {
        method: 'GET',
        signal: controller.signal,
        // We removed mode: 'no-cors' because the ESP now sends proper CORS headers
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return { connected: true, mac: data.mac };
      }
      return { connected: false };
    } catch (error) {
      return { connected: false };
    }
  },

  /**
   * Securely claims the provisioning session and retrieves the session token.
   * This must be called after connection is verified and before configuring Wi-Fi.
   */
  async startSession(): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const response = await fetch(`http://${ESP_IP}/start_session`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to start secure session' };
      }

      return { success: true, token: data.token };
    } catch (error: any) {
      console.error('Failed to start session on ESP:', error);
      return { success: false, error: 'Could not communicate with the device to start session.' };
    }
  },

  /**
   * Scans for available WiFi networks around the ESP.
   */
  async scanWifi(): Promise<WifiNetwork[]> {
    try {
      const response = await fetch(`http://${ESP_IP}/scan`, {
        method: 'GET',
        // Optional timeout mechanism can be added here with AbortController
      });
      
      if (!response.ok) {
        throw new Error(`ESP returned ${response.status}`);
      }

      const data = await response.json();
      return data.networks || [];
    } catch (error) {
      console.error('Failed to scan WiFi on ESP:', error);
      // For development/demo without an actual ESP, throw or return mock data.
      // We will throw so the UI can handle the error, but during dev, we might mock it.
      throw new Error('Could not connect to the device. Please ensure you are connected to the ESP Hotspot.');
    }
  },

  /**
   * Sends the SSID and Password to the ESP to connect to the home network.
   */
  async configureWifi(ssid: string, password: string, token: string, backend_url: string):Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`http://${ESP_IP}/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ssid, password, token, backend_url }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || `ESP configuration failed with status ${response.status}`);
      }

      return { success: true, message: data.message || 'Configured' };
    } catch (error: any) {
      console.error('Failed to configure ESP:', error);
      throw new Error(error.message || 'Failed to send configuration to the device. Are you still connected to its hotspot?');
    }
  }
};
