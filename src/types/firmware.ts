export type ReleaseChannel = 'stable' | 'beta' | 'alpha';
export type FirmwareStatus = 'Draft' | 'Testing' | 'Released' | 'Deprecated' | 'Archived';

export interface Firmware {
  id: string;
  device_type_id: string;
  version: string;
  hardware_revision?: string;
  release_channel: ReleaseChannel;
  binary_size: number;
  sha256: string;
  digital_signature?: string;
  release_notes?: string;
  changelog?: string;
  known_issues?: string;
  min_supported_version?: string;
  status: FirmwareStatus;
  file_url: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
}

export interface FirmwareFilters {
  search?: string;
  device_type_id?: string;
  release_channel?: ReleaseChannel | 'all';
  status?: FirmwareStatus | 'all';
}
