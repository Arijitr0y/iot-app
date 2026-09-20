import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface AddServiceAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AddServiceAccountModal({ isOpen, onClose, onSuccess }: AddServiceAccountModalProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Save to Supabase (Database Source of Truth)
      const { error: insertError } = await supabase
        .from('mqtt_users')
        .insert({
          username,
          password_hash: password, // Storing plaintext temporarily so backend can hash it for Mosquitto
          description
        });

      if (insertError) throw insertError;

      // 2. Trigger Backend Sync (EMQX Style Dynamic Reload)
      await onSuccess();

      queryClient.invalidateQueries({ queryKey: ['mqtt-users'] });
      onClose();
      setUsername('');
      setPassword('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to create service account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Add Service Account</h2>
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
            <label className="text-sm font-medium text-gray-700">Username / Client ID</label>
            <Input 
              required
              placeholder="e.g. new_device_client"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <Input 
              required
              type="password"
              placeholder="Secure password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
            <Input 
              placeholder="What is this account used for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-slate-900 hover:bg-slate-800 text-white">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
