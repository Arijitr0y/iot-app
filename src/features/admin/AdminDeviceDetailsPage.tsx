import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Send, Activity, ShieldAlert, Cpu, RefreshCw, Terminal, Server, List } from 'lucide-react';
import { publishDeviceCommand } from '@/services/mqtt.api';

const TABS = [
  { id: 'overview', label: 'Overview', icon: List },
  { id: 'configuration', label: 'Configuration', icon: Server },
  { id: 'firmware', label: 'Firmware', icon: RefreshCw },
  { id: 'ota_history', label: 'OTA History', icon: RefreshCw },
  { id: 'logs', label: 'Logs', icon: Terminal },
  { id: 'commands', label: 'Remote Commands', icon: Send },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'sensors', label: 'Sensors', icon: Activity },
  { id: 'diagnostics', label: 'Diagnostics', icon: Cpu },
  { id: 'audit', label: 'Audit Logs', icon: ShieldAlert },
];

export const AdminDeviceDetailsPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [activeTab, setActiveTab] = useState('overview');
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Command State
  const [cmdTopic, setCmdTopic] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{\n  "action": "toggle"\n}');

  useEffect(() => {
    const fetchDevice = async () => {
      if (!deviceId) return;
      
      const { data, error } = await supabase
        .from('user_devices')
        .select(`
          *,
          device_types(name)
        `)
        .eq('id', deviceId)
        .single();
        
      if (!error && data) {
        setDevice(data);
        setCmdTopic(`iot/devices/${data.mac_address}/command`);
      }
      setLoading(false);
    };
    
    fetchDevice();
  }, [deviceId]);

  const handleSendCommand = async () => {
    if (!cmdPayload) return;
    try {
      const parsed = JSON.parse(cmdPayload);
      if (!parsed.action) throw new Error("Payload must contain an 'action' field");
      const { action, ...rest } = parsed;
      await publishDeviceCommand(device.id, action, rest);
      alert('Command sent securely via API!');
    } catch (e: any) {
      alert(`Invalid JSON payload or command failed: ${e.message}`);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Loading device details...</div>;
  }

  if (!device) {
    return (
      <div className="p-8 text-center text-red-500">
        <h2>Device not found</h2>
        <Link to="/admin/inventory" className="text-blue-500 hover:underline mt-4 block">Return to Inventory</Link>
      </div>
    );
  }

  const renderOverviewTab = () => {
    const details = [
      { label: 'Device UUID', value: device.id },
      { label: 'Serial Number', value: device.serial_number || 'N/A' },
      { label: 'Product Type', value: device.device_types?.name || 'N/A' },
      { label: 'Hardware Revision', value: device.hardware_revision || 'N/A' },
      { label: 'PCB Revision', value: device.pcb_revision || 'N/A' },
      { label: 'Firmware Version', value: device.firmware || 'N/A' },
      { label: 'Bootloader', value: device.bootloader || 'N/A' },
      { label: 'Flash Size', value: device.flash_size ? `${(device.flash_size / 1024 / 1024).toFixed(2)} MB` : 'N/A' },
      { label: 'Free Flash', value: device.free_flash ? `${(device.free_flash / 1024 / 1024).toFixed(2)} MB` : 'N/A' },
      { label: 'RAM Size', value: device.ram ? `${(device.ram / 1024).toFixed(2)} KB` : 'N/A' },
      { label: 'Free RAM', value: device.free_ram ? `${(device.free_ram / 1024).toFixed(2)} KB` : 'N/A' },
      { label: 'MAC Address', value: device.mac_address || 'N/A' },
      { label: 'Chip ID', value: device.chip_id || 'N/A' },
      { label: 'Last Seen', value: device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never' },
      { label: 'RSSI', value: device.rssi ? `${device.rssi} dBm` : 'N/A' },
      { label: 'WiFi SSID', value: device.wifi_ssid || 'N/A' },
      { label: 'IP Address', value: device.ip_address || 'N/A' },
      { label: 'Timezone', value: device.timezone || 'N/A' },
      { label: 'Uptime', value: device.uptime ? `${Math.floor(device.uptime / 3600)}h ${Math.floor((device.uptime % 3600) / 60)}m` : 'N/A' },
      { label: 'Restart Count', value: device.restart_count || 0 },
      { label: 'Installation Date', value: device.installation_date ? new Date(device.installation_date).toLocaleDateString() : 'N/A' },
      { label: 'Warranty Until', value: device.warranty_until ? new Date(device.warranty_until).toLocaleDateString() : 'N/A' },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {details.map((detail, idx) => (
          <Card key={idx} className="bg-white border shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">{detail.label}</p>
              <p className="text-sm font-semibold text-gray-900 truncate" title={String(detail.value)}>{detail.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderRemoteCommandsTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Send MQTT Command</CardTitle>
        <CardDescription>Publish a custom JSON payload directly to the device's command topic.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">MQTT Topic</label>
          <Input value={cmdTopic} onChange={(e) => setCmdTopic(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">JSON Payload</label>
          <textarea 
            className="w-full h-48 p-3 font-mono text-sm border rounded-md"
            value={cmdPayload}
            onChange={(e) => setCmdPayload(e.target.value)}
          />
        </div>
        <Button onClick={handleSendCommand} className="w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" /> Publish Command
        </Button>
      </CardContent>
    </Card>
  );

  const renderPlaceholder = (title: string) => (
    <Card>
      <CardContent className="p-12 text-center text-gray-500">
        <p>The {title} view is currently empty.</p>
        <p className="text-sm">Data will populate here once the backend services are integrated.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/inventory">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{device.name}</h1>
          <p className="text-gray-500 text-sm font-mono">{device.mac_address} • {device.device_types?.name}</p>
        </div>
        <div className="ml-auto">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase
            ${device.status === 'online' ? 'bg-green-100 text-green-700' : 
              device.status === 'error' ? 'bg-red-100 text-red-700' : 
              'bg-gray-100 text-gray-700'}`}
          >
            {device.status || 'offline'}
          </span>
        </div>
      </div>

      {/* Tabs & Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors
                  ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 min-w-0">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'commands' && renderRemoteCommandsTab()}
          
          {/* Placeholders for others */}
          {activeTab === 'configuration' && renderPlaceholder('Configuration')}
          {activeTab === 'firmware' && renderPlaceholder('Firmware & OTA')}
          {activeTab === 'ota_history' && renderPlaceholder('OTA History')}
          {activeTab === 'logs' && renderPlaceholder('Device Logs')}
          {activeTab === 'health' && renderPlaceholder('Health Metrics')}
          {activeTab === 'sensors' && renderPlaceholder('Sensor Readings')}
          {activeTab === 'diagnostics' && renderPlaceholder('Diagnostics')}
          {activeTab === 'audit' && renderPlaceholder('Audit Logs')}
        </div>
      </div>
    </div>
  );
};
