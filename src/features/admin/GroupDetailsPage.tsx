import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, Send, ShieldAlert, Cpu } from 'lucide-react';
import { publishDeviceCommand } from '@/services/mqtt.api';
import { Input } from '@/components/ui/input';

export const GroupDetailsPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  
  const [configPayload, setConfigPayload] = useState('{\n  "interval": 60\n}');
  const [otaUrl, setOtaUrl] = useState('');
  const [otaVersion, setOtaVersion] = useState('');

  // Fetch Group Definition
  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: ['device-group', groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const { data, error } = await supabase.from('device_groups').select('*').eq('id', groupId).single();
      if (error) throw error;
      return data;
    }
  });

  // Fetch Matching Devices based on Filters
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['group-devices', groupId, group?.filters],
    enabled: !!group,
    queryFn: async () => {
      let query = supabase.from('user_devices').select('*');
      
      // Dynamically apply filters
      if (group?.filters) {
        Object.entries(group.filters).forEach(([key, value]) => {
          if (value) {
            query = query.eq(key, value);
          }
        });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  const commandToAll = (action: string, payload?: any) => {
    if (!devices || devices.length === 0) return;
    
    devices.forEach((device: any) => {
      publishDeviceCommand(device.id, action, payload).catch(console.error);
    });
  };

  const handleBulkRestart = () => {
    if (window.confirm(`Restart ${devices?.length} devices?`)) {
      commandToAll('restart');
      alert('Restart commands broadcasted!');
    }
  };

  const handleBulkDebug = (enable: boolean) => {
    if (window.confirm(`${enable ? 'Enable' : 'Disable'} debug on ${devices?.length} devices?`)) {
      commandToAll(enable ? 'enable_debug' : 'disable_debug');
      alert(`Debug ${enable ? 'enabled' : 'disabled'} commands broadcasted!`);
    }
  };

  const handleBulkConfig = () => {
    try {
      const parsed = JSON.parse(configPayload);
      if (window.confirm(`Send config to ${devices?.length} devices?`)) {
        commandToAll('sync_config', parsed);
        alert('Config updates broadcasted!');
      }
    } catch (e) {
      alert('Invalid JSON in config payload');
    }
  };

  const handleBulkOta = () => {
    if (!otaVersion || !otaUrl) {
      alert('Please provide both version and URL');
      return;
    }
    if (window.confirm(`Push OTA Update v${otaVersion} to ${devices?.length} devices?`)) {
      // NOTE: Direct MQTT publishing is disabled. OTA is handled securely via the Rollout Engine.
      // publishToAll({ v: otaVersion, url: otaUrl }, true, 'ota');
      alert('OTA direct publish disabled. Please use the OTA Rollout Engine.');
    }
  };

  if (groupLoading) return <div className="p-8 text-center animate-pulse">Loading group...</div>;
  if (!group) return <div className="p-8 text-center text-red-500">Group not found</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/admin/groups">
          <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
          <p className="text-gray-500 text-sm">{group.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Device List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Matching Devices ({devices?.length || 0})</CardTitle>
              <CardDescription>These devices match the dynamic group filters.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Device Name</th>
                      <th className="px-4 py-3">MAC</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devicesLoading ? (
                      <tr><td colSpan={4} className="p-4 text-center">Loading devices...</td></tr>
                    ) : devices?.length === 0 ? (
                      <tr><td colSpan={4} className="p-4 text-center text-gray-500">No devices match these filters.</td></tr>
                    ) : (
                      devices?.map((d: any) => (
                        <tr key={d.id} className="border-b bg-white hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">
                            <Link to={`/admin/inventory/${d.id}`} className="hover:underline hover:text-blue-600">
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{d.mac_address}</td>
                          <td className="px-4 py-3">{d.state || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium
                              ${d.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                              {d.status || 'offline'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Bulk Operations */}
        <div className="space-y-4">
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-orange-900 flex items-center gap-2">
                <Cpu className="w-5 h-5" /> Quick Bulk Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline" onClick={handleBulkRestart}>
                <RefreshCw className="w-4 h-4 mr-2" /> Remote Restart All
              </Button>
              <div className="flex gap-2">
                <Button className="w-full" variant="outline" onClick={() => handleBulkDebug(true)}>
                  <ShieldAlert className="w-4 h-4 mr-2 text-blue-600" /> Enable Debug
                </Button>
                <Button className="w-full" variant="outline" onClick={() => handleBulkDebug(false)}>
                  Disable Debug
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5" /> Configuration Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea 
                className="w-full h-32 p-2 font-mono text-xs border rounded-md"
                value={configPayload}
                onChange={e => setConfigPayload(e.target.value)}
              />
              <Button className="w-full" onClick={handleBulkConfig}>Push Config to All</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Push OTA Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Version (e.g. 1.0.2)" value={otaVersion} onChange={e => setOtaVersion(e.target.value)} />
              <Input placeholder="Firmware Binary URL" value={otaUrl} onChange={e => setOtaUrl(e.target.value)} />
              <Button variant="destructive" onClick={handleBulkOta} className="w-full">Broadcast OTA Command</Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};
