import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type CommandType = 'restart' | 'factory_reset' | 'restart_mqtt' | 'restart_wifi' | 'sync_time' | 'sync_config' | 'relay_test' | 'sensor_test' | 'led_blink' | 'enable_debug' | 'disable_debug' | 'enter_recovery';

export interface DeviceCommand {
  id: string;
  device_id: string;
  command_type: CommandType;
  payload?: any;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  execution_time_ms?: number;
  retry_count: number;
  max_retries: number;
  error_message?: string;
  created_at: string;
  sent_at?: string;
  acknowledged_at?: string;
  user_devices?: { name: string, mac_address: string };
}

interface CommandState {
  commands: DeviceCommand[];
  isLoading: boolean;
  fetchCommands: (deviceId?: string) => Promise<void>;
  sendCommand: (deviceId: string, commandType: CommandType, maxRetries?: number) => Promise<string>;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [],
  isLoading: false,

  fetchCommands: async (deviceId) => {
    set({ isLoading: true });
    try {
      let query = supabase
        .from('device_commands')
        .select(`*, user_devices(name, mac_address)`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ commands: data || [] });
    } catch (e) {
      console.error(e);
    } finally {
      set({ isLoading: false });
    }
  },

  sendCommand: async (deviceId, commandType, maxRetries = 3) => {
    const { data, error } = await supabase
      .from('device_commands')
      .insert([{
        device_id: deviceId,
        command_type: commandType,
        max_retries: maxRetries
      }])
      .select()
      .single();

    if (error) throw error;
    // We don't necessarily need to fetch all commands again immediately if we rely on realtime,
    // but it's safe to do so.
    await get().fetchCommands(deviceId);
    return data.id;
  }
}));
