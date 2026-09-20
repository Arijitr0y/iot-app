import { supabase } from '../lib/supabase';
import { Firmware, FirmwareFilters } from '../types/firmware';

export const firmwareService = {
  async getFirmwares(filters?: FirmwareFilters) {
    let query = supabase
      .from('firmwares')
      .select(`*, device_types (name)`)
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.device_type_id) {
        query = query.eq('device_type_id', filters.device_type_id);
      }
      if (filters.release_channel && filters.release_channel !== 'all') {
        query = query.eq('release_channel', filters.release_channel);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.search) {
        // A simple text search across multiple fields
        query = query.or(`version.ilike.%${filters.search}%,release_notes.ilike.%${filters.search}%,changelog.ilike.%${filters.search}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // map the relation
    return (data || []).map(item => ({
      ...item,
      product_name: item.device_types?.name
    }));
  },

  async uploadFirmwareBinary(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('firmware')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('firmware')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },

  async createFirmwareRecord(firmwareData: Omit<Firmware, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('firmwares')
      .insert([firmwareData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateFirmwareStatus(id: string, status: Firmware['status']) {
    const { data, error } = await supabase
      .from('firmwares')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteFirmware(id: string) {
    const { error } = await supabase
      .from('firmwares')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
