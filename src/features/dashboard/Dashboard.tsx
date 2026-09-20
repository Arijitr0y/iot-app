import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { WelcomeCard } from './components/WelcomeCard';
import { DeviceList, Device } from './components/DeviceList';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Plus, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export const Dashboard = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceError, setDeviceError] = useState<{ id: string, message: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchDevices = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('user_devices')
        .select(`
          id,
          name,
          mac_address,
          relay_state,
          water_level,
          status,
          error_state,
          last_seen,
          device_types (
            name,
            ui_component
          )
        `)
        .eq('owner_id', session.user.id);
      
      if (error) {
        console.error('Error fetching devices:', error);
        return;
      }

      if (isMounted && data) {
        const mappedDevices: Device[] = data.map((d: any) => ({
          id: d.id, // UUID for secure API calls
          mac_address: d.mac_address, // Used for MQTT correlation
          name: d.name,
          type: d.device_types?.name || 'Unknown Type',
          ui_component: d.device_types?.ui_component || 'default',
          status: d.status || 'offline',
          lastSeen: d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Never',
          relay_state: d.relay_state,
          water_level: d.water_level,
          error_state: d.error_state
        }));
        
        setDevices(mappedDevices);
      }
    };

    fetchDevices();

    // Listen for Realtime updates on user_devices
    const channel = supabase.channel('dashboard_devices')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_devices' }, (payload) => {
        const updatedRow = payload.new;
        setDevices(prev => prev.map(d => {
          if (d.id === updatedRow.id) {
            return {
              ...d,
              status: updatedRow.status || 'offline',
              relay_state: updatedRow.relay_state,
              water_level: updatedRow.water_level,
              lastSeen: updatedRow.last_seen ? new Date(updatedRow.last_seen).toLocaleTimeString() : 'Never'
            };
          }
          return d;
        }));
        
        if (updatedRow.error_state) {
          setDeviceError({ id: updatedRow.mac_address || 'Unknown', message: updatedRow.error_state });
          setTimeout(() => setDeviceError(null), 5000);
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <Button asChild>
          <Link to="/provisioning">
            <Plus className="mr-2 h-4 w-4" /> Add Device
          </Link>
        </Button>
      </div>

      {deviceError && (
        <Alert variant="destructive" className="animate-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Device Error ({deviceError.id})</AlertTitle>
          <AlertDescription>{deviceError.message}</AlertDescription>
        </Alert>
      )}

      <WelcomeCard />

      <DeviceList devices={devices} />
    </div>
  );
};
