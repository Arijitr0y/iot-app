import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Power, ArrowLeft, Activity, WifiOff } from 'lucide-react';
import { publishDeviceCommand } from '@/services/mqtt.api';
import { supabase } from '@/lib/supabase';

export const DeviceDetailsPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  const [device, setDevice] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isOn, setIsOn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchDevice = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !deviceId) return;

      const { data, error } = await supabase
        .from('user_devices')
        .select(`*, device_types(name, icon)`)
        .eq('mac_address', deviceId)
        .eq('owner_id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching device:', error);
      } else if (isMounted && data) {
        setDevice(data);
        setIsOn(data.relay_state || false);
      }
      if (isMounted) setLoading(false);
    };

    fetchDevice();

    if (deviceId) {
      const channel = supabase.channel('device_details')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_devices', filter: `mac_address=eq.${deviceId}` }, (payload) => {
          const updatedRow = payload.new;
          if (updatedRow.status) setIsOnline(updatedRow.status === 'online');
          if (updatedRow.relay_state !== undefined) setIsOn(updatedRow.relay_state);
        })
        .subscribe();
        
      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
      };
    }
  }, [deviceId]);

  const toggleDevice = () => {
    if (!device) return;
    const newAction = isOn ? 'off' : 'on';
    publishDeviceCommand(device.id, newAction).catch(console.error);
    
    // Optimistic UI update
    setIsOn(!isOn);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading device details...</div>;
  }

  if (!device) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">Device not found</h2>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">{device.name}</h1>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg bg-white/60 backdrop-blur-md">
        <div className={`h-2 w-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg text-gray-600 font-medium flex items-center gap-2">
              Status
            </CardTitle>
            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {isOnline ? <Activity className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          
          <button
            onClick={toggleDevice}
            disabled={!isOnline}
            className={`
              relative group flex items-center justify-center w-40 h-40 rounded-full shadow-2xl transition-all duration-300
              ${!isOnline ? 'bg-gray-100 opacity-50 cursor-not-allowed' : 
                isOn ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/50' : 'bg-white hover:bg-gray-50'}
            `}
          >
            <div className={`
              absolute inset-2 rounded-full border-2 border-transparent transition-all duration-300
              ${isOnline && isOn ? 'border-white/20 scale-95' : 'group-hover:scale-95'}
            `} />
            <Power className={`w-16 h-16 transition-colors duration-300 ${
              !isOnline ? 'text-gray-400' :
              isOn ? 'text-white' : 'text-gray-400 group-hover:text-blue-500'
            }`} />
          </button>

          <p className="mt-8 text-lg font-medium text-gray-600">
            {!isOnline ? 'Device is offline' : isOn ? 'Device is ON' : 'Device is OFF'}
          </p>

        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-sm bg-white/40 backdrop-blur-md">
        <CardContent className="p-4 space-y-2 text-sm text-gray-600">
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Device Type</span>
            <span className="font-medium">{device.device_types?.name || 'Smart Relay'}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">MAC Address</span>
            <span className="font-medium font-mono">{device.mac_address}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-500">Room</span>
            <span className="font-medium">{device.room || 'Unassigned'}</span>
          </div>
        </CardContent>
      </Card>

      <div className="pt-4 pb-8 flex justify-center">
        <Button 
          variant="destructive" 
          className="w-full sm:w-auto"
          onClick={async () => {
            if (window.confirm("Are you sure you want to remove this device? It will be disconnected from your account.")) {
              const { error } = await supabase
                .from('user_devices')
                .delete()
                .eq('mac_address', deviceId);
                
              if (error) {
                console.error("Failed to delete device", error);
                alert("Failed to remove device.");
              } else {
                navigate('/');
              }
            }
          }}
        >
          Remove Device
        </Button>
      </div>
    </div>
  );
};
