import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface Rollout {
  id: string;
  name: string;
  firmware_id: string;
  target_type: 'single_device' | 'group' | 'customer' | 'product';
  target_id: string;
  percentage: number;
  schedule_type: 'immediate' | 'delayed' | 'night_only';
  schedule_time?: string;
  status: 'scheduled' | 'active' | 'paused' | 'stopped' | 'completed' | 'rolled_back';
  max_retries: number;
  failure_threshold_percent: number;
  created_at: string;
  firmwares?: { version: string };
}

interface RolloutState {
  rollouts: Rollout[];
  isLoading: boolean;
  fetchRollouts: () => Promise<void>;
  createRollout: (rollout: Omit<Rollout, 'id' | 'created_at' | 'status'>) => Promise<string>;
  updateStatus: (id: string, status: Rollout['status']) => Promise<void>;
}

export const useRolloutStore = create<RolloutState>((set, get) => ({
  rollouts: [],
  isLoading: false,

  fetchRollouts: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('ota_rollouts')
        .select(`*, firmwares(version)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ rollouts: data || [] });
    } catch (e) {
      console.error(e);
    } finally {
      set({ isLoading: false });
    }
  },

  createRollout: async (rollout) => {
    const { data, error } = await supabase
      .from('ota_rollouts')
      .insert([rollout])
      .select()
      .single();

    if (error) throw error;
    await get().fetchRollouts();
    return data.id;
  },

  updateStatus: async (id, status) => {
    const { error } = await supabase
      .from('ota_rollouts')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    await get().fetchRollouts();
  }
}));
