import { create } from 'zustand';
import { Firmware, FirmwareFilters } from '../types/firmware';
import { firmwareService } from '../services/firmwareService';

interface FirmwareState {
  firmwares: any[]; // Extended with product_name
  isLoading: boolean;
  error: string | null;
  filters: FirmwareFilters;
  
  setFilters: (filters: Partial<FirmwareFilters>) => void;
  fetchFirmwares: () => Promise<void>;
  uploadFirmware: (file: File, metadata: Omit<Firmware, 'id' | 'created_at' | 'updated_at' | 'file_url' | 'binary_size'>) => Promise<void>;
  updateStatus: (id: string, status: Firmware['status']) => Promise<void>;
  deleteFirmware: (id: string) => Promise<void>;
}

export const useFirmwareStore = create<FirmwareState>((set, get) => ({
  firmwares: [],
  isLoading: false,
  error: null,
  filters: {
    release_channel: 'all',
    status: 'all',
    search: '',
  },

  setFilters: (newFilters) => {
    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
    get().fetchFirmwares();
  },

  fetchFirmwares: async () => {
    set({ isLoading: true, error: null });
    try {
      const firmwares = await firmwareService.getFirmwares(get().filters);
      set({ firmwares, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  uploadFirmware: async (file, metadata) => {
    set({ isLoading: true, error: null });
    try {
      const file_url = await firmwareService.uploadFirmwareBinary(file);
      const binary_size = file.size;

      await firmwareService.createFirmwareRecord({
        ...metadata,
        file_url,
        binary_size,
      });
      await get().fetchFirmwares();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateStatus: async (id, status) => {
    set({ isLoading: true, error: null });
    try {
      await firmwareService.updateFirmwareStatus(id, status);
      await get().fetchFirmwares();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteFirmware: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await firmwareService.deleteFirmware(id);
      await get().fetchFirmwares();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  }
}));
