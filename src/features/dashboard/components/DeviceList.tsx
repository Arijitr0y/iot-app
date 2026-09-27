import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, WifiOff, Power } from 'lucide-react';
import { publishDeviceCommand } from '@/services/mqtt.api';
import { WaterTank } from './WaterTank';

export interface Device {
  id: string; // The UUID
  mac_address: string; // The MAC address for MQTT correlation
  name: string;
  type: string;
  ui_component?: string;
  status: 'online' | 'offline';
  lastSeen: string;
  relay_state?: boolean;
  water_level?: number;
}

interface DeviceListProps {
  devices: Device[];
}

const DeviceRow = ({ device }: { device: Device }) => {
  const [isOn, setIsOn] = useState(device.relay_state || false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const targetStateRef = useRef<boolean>(device.relay_state || false);
  
  const isOnline = device.status === 'online';
  const waterLevel = device.water_level || 0;

  useEffect(() => {
    // Pause WebSockets: Only sync from database if the user is not actively clicking
    if (!debounceTimer.current) {
      setIsOn(device.relay_state || false);
      targetStateRef.current = device.relay_state || false;
    }
  }, [device.relay_state]);

  const toggleDevice = () => {
    // Calculate from Ref: completely bypasses React asynchronous state batching
    const nextState = !targetStateRef.current;
    
    // Immediately update both the Ref and the React state
    targetStateRef.current = nextState;
    setIsOn(nextState);

    // Network Debouncing: Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Start a new 400ms countdown
    debounceTimer.current = setTimeout(async () => {
      try {
        const action = nextState ? 'on' : 'off';
        await publishDeviceCommand(device.id, action);
      } catch (error) {
        console.error('Failed to send command:', error);
        // Error Reversion: Snap back to truth
        setIsOn(device.relay_state || false);
        targetStateRef.current = device.relay_state || false;
      } finally {
        // Cleanup: Release the lock so database updates can sync again
        debounceTimer.current = null;
      }
    }, 400);
  };

  const navigate = useNavigate();

  if (device.ui_component === 'water_tank') {
    return (
      <div className="py-6 border-b last:border-b-0 cursor-pointer" onClick={() => navigate(`/device/${device.id}`)}>
        <WaterTank 
          level={waterLevel} 
          isMotorOn={isOn} 
          onToggleMotor={(e) => { e?.stopPropagation(); toggleDevice(); }} 
          deviceName={device.name} 
        />
      </div>
    );
  }

  return (
    <div 
      className="py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 px-4 -mx-4 rounded-xl transition-colors"
      onClick={() => navigate(`/device/${device.id}`)}
    >
      <div>
        <p className="font-medium">{device.name}</p>
        <p className="text-sm text-gray-500">{device.type} ({device.id})</p>
      </div>
      <div className="flex items-center gap-4">
        {isOnline && (
          <Button 
            variant={isOn ? 'default' : 'outline'}
            className={isOn ? 'bg-green-600 hover:bg-green-700' : ''}
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              toggleDevice();
            }}
          >
            <Power className="w-4 h-4 mr-2" />
            {isOn ? 'ON' : 'OFF'}
          </Button>
        )}
        <Badge 
          variant={isOnline ? 'default' : 'secondary'}
          className={isOnline ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-800 hover:bg-gray-100'}
        >
          {isOnline ? (
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
        </Badge>
      </div>
    </div>
  );
};

export const DeviceList = ({ devices }: DeviceListProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Devices</CardTitle>
        <CardDescription>
          A list of all devices provisioned to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No devices found. Add a device to get started.
          </div>
        ) : (
          <div className="divide-y">
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
