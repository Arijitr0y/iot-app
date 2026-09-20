import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, Edit, Loader2, UploadCloud, X } from 'lucide-react';

const FirmwareModal = ({ deviceType, onClose }: { deviceType: any, onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: firmwares, isLoading } = useQuery({
    queryKey: ['admin-firmwares', deviceType.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('firmwares')
        .select('*')
        .eq('device_type_id', deviceType.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const deleteFirmware = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('firmwares').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-firmwares', deviceType.id] });
    }
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !version) return;

    setIsUploading(true);
    try {
      const filePath = `${deviceType.id}/${version}-${file.name}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('firmware')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('firmware')
        .getPublicUrl(filePath);

      // Insert release record
      const { error: dbError } = await supabase
        .from('firmwares')
        .insert({
          device_type_id: deviceType.id,
          version,
          file_url: publicUrl,
          binary_size: file.size,
          sha256: 'pending_hash' // Should be calculated client-side in a future update
        });

      if (dbError) throw dbError;

      // Publish the retained auto-update message to all devices of this type
      // NOTE: Direct MQTT publishing is disabled. OTA is handled securely via the Rollout Engine.
      // const topic = `iot/ota/${deviceType.setup_wifi_prefix}`;
      // await publishMqttMessage(topic, { v: version, url: publicUrl }, { retain: true });

      setVersion('');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-firmwares', deviceType.id] });
    } catch (error) {
      console.error('Upload failed', error);
      alert('Upload failed: ' + (error as any).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Manage Firmware: {deviceType.name}</CardTitle>
            <CardDescription>Upload new OTA binaries for this device type.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleUpload} className="space-y-4 p-4 border rounded-lg bg-gray-50">
            <h3 className="font-medium">Upload New Release</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Version (e.g. 1.0.1)</Label>
                <Input required value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0.1" />
              </div>
              <div className="space-y-2">
                <Label>Binary File (.bin)</Label>
                <Input required type="file" accept=".bin" onChange={e => setFile(e.target.files?.[0] || null)} className="bg-white" />
              </div>
            </div>
            <Button type="submit" disabled={isUploading || !file || !version}>
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
              Upload Firmware
            </Button>
          </form>

          <div>
            <h3 className="font-medium mb-3">Release History</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-2">Version</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-center">Loading...</td></tr>
                  ) : firmwares?.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-500">No firmware uploaded yet.</td></tr>
                  ) : (
                    firmwares?.map((fw: any) => (
                      <tr key={fw.id} className="border-b bg-white">
                        <td className="px-4 py-3 font-medium">{fw.version}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(fw.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => deleteFirmware.mutate(fw.id)} disabled={deleteFirmware.isPending}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const DeviceTypesManager = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', icon: 'Cpu', category_id: '', setup_wifi_prefix: 'IoT-Setup-', ui_component: 'default' });
  const [firmwareDevice, setFirmwareDevice] = useState<any | null>(null);

  // Fetch Categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_categories').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch Device Types
  const { data: deviceTypes, isLoading } = useQuery({
    queryKey: ['admin-device-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_types').select('*, device_categories(name)').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (newType: any) => {
      const { error } = await supabase.from('device_types').insert([newType]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-device-types'] });
      resetForm();
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (updated: any) => {
      const { id, ...rest } = updated;
      const { error } = await supabase.from('device_types').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-device-types'] });
      resetForm();
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('device_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-device-types'] });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', description: '', icon: 'Cpu', category_id: categories?.[0]?.id || '', setup_wifi_prefix: 'IoT-Setup-', ui_component: 'default' });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && currentId) {
      updateMutation.mutate({ id: currentId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (type: any) => {
    setIsEditing(true);
    setCurrentId(type.id);
    setFormData({ name: type.name, description: type.description || '', icon: type.icon, category_id: type.category_id, setup_wifi_prefix: type.setup_wifi_prefix || 'IoT-Setup-', ui_component: type.ui_component || 'default' });
  };

  return (
    <div className="space-y-6 relative">
      {firmwareDevice && <FirmwareModal deviceType={firmwareDevice} onClose={() => setFirmwareDevice(null)} />}
      
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Types</h1>
          <p className="text-gray-500">Manage specific devices under each category (e.g. Smart Plug, DHT11).</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? 'Edit Device Type' : 'Add Device Type'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.category_id}
                    onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                    required
                  >
                    <option value="" disabled>Select a category</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Device Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="e.g. Smart Plug" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                    placeholder="e.g. Wi-Fi outlet" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lucide Icon</Label>
                  <Input 
                    required 
                    value={formData.icon} 
                    onChange={e => setFormData({ ...formData, icon: e.target.value })} 
                    placeholder="e.g. Plug" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Setup Wi-Fi Prefix</Label>
                  <Input 
                    required 
                    value={formData.setup_wifi_prefix} 
                    onChange={e => setFormData({ ...formData, setup_wifi_prefix: e.target.value })} 
                    placeholder="e.g. IoT-Setup-" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>UI Component</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                    value={formData.ui_component}
                    onChange={e => setFormData({ ...formData, ui_component: e.target.value })}
                  >
                    <option value="default">Default (ON/OFF Toggle)</option>
                    <option value="water_tank">Water Tank (Animated)</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isEditing ? 'Update' : 'Create'}
                  </Button>
                  {isEditing && (
                    <Button type="button" variant="outline" onClick={resetForm} className="w-full">Cancel</Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Desc</th>
                    <th className="px-6 py-3">Icon</th>
                    <th className="px-6 py-3">UI Component</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={5} className="px-6 py-4 text-center">Loading...</td></tr>
                  )}
                  {deviceTypes?.map((dt) => (
                    <tr key={dt.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{dt.device_categories?.name}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{dt.name}</td>
                      <td className="px-6 py-4 text-gray-500">{dt.description}</td>
                      <td className="px-6 py-4 text-gray-500">{dt.icon}</td>
                      <td className="px-6 py-4 text-gray-500">{dt.ui_component || 'default'}</td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setFirmwareDevice(dt)}>
                          <UploadCloud className="w-4 h-4 mr-2" /> Firmware
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(dt)}>
                          <Edit className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(dt.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {deviceTypes?.length === 0 && !isLoading && (
                    <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">No device types found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
