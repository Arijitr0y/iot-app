import { supabase } from '@/lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const publishDeviceCommand = async (deviceId: string, action: string, payload?: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('User not authenticated. Cannot dispatch device command.');
  }

  const response = await fetch(`${API_URL}/api/devices/${deviceId}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to dispatch command');
  }

  return data;
};

export const publishDeviceSchedules = async (deviceId: string, schedules: any) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('User not authenticated. Cannot sync schedules.');
  }

  const response = await fetch(`${API_URL}/api/devices/${deviceId}/schedules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(schedules)
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to sync schedules');
  }

  return data;
};
