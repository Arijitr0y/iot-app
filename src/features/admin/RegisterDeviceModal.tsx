import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RegisterDeviceModal({ isOpen, onClose }: RegisterDeviceModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [deviceTypeId, setDeviceTypeId] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch device types
  const { data: deviceTypes } = useQuery({
    queryKey: ['device-types-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_types').select('id, name');
      if (error) throw error;
      return data;
    },
    enabled: isOpen
  });

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setName('');
      setMacAddress('');
      setDeviceTypeId('');
      setOwnerEmail('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // Find owner by email
      let ownerId = null;
      if (ownerEmail) {
        // In a real app with RLS, you'd probably need an Edge Function or admin API to lookup users by email.
        // For this prototype, we'll assume the admin can just assign it to themselves if they leave it blank,
        // or we try to find a profile with that email.
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', ownerEmail)
          .single();
        
        if (profiles) {
          ownerId = profiles.id;
        } else {
          throw new Error('User not found with that email');
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        ownerId = user?.id;
      }

      if (!ownerId) throw new Error('Could not determine device owner');
      if (!deviceTypeId) throw new Error('Please select a device type');

      const { error: insertError } = await supabase
        .from('user_devices')
        .insert({
          name,
          mac_address: macAddress.toUpperCase().trim(),
          device_type_id: deviceTypeId,
          owner_id: ownerId,
          status: 'offline'
        });

      if (insertError) {
        // Handle unique constraint violation on mac_address
        if (insertError.code === '23505') {
           throw new Error('A device with this MAC address already exists.');
        }
        throw insertError;
      }

      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register device');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Register New Device</h2>
          <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Device Name</label>
            <Input 
              required
              placeholder="e.g. Living Room Relay"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">MAC Address / Device ID</label>
            <Input 
              required
              placeholder="e.g. B6E62D44D6A5"
              value={macAddress}
              onChange={e => setMacAddress(e.target.value)}
              className="uppercase font-mono"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Hardware Type</label>
            <select 
              required
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              value={deviceTypeId}
              onChange={e => setDeviceTypeId(e.target.value)}
            >
              <option value="" disabled>Select a device type</option>
              {deviceTypes?.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Assign to Customer Email (Optional)</label>
            <Input 
              type="email"
              placeholder="Leave blank to assign to yourself"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Register Device
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
