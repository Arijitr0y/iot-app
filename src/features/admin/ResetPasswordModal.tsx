import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; username: string } | null;
  onSuccess: () => Promise<void>;
}

export function ResetPasswordModal({ isOpen, onClose, user, onSuccess }: ResetPasswordModalProps) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // 1. Save new password to Supabase
      const { error: updateError } = await supabase
        .from('mqtt_users')
        .update({ password_hash: password })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 2. Trigger Backend Sync
      await onSuccess();

      queryClient.invalidateQueries({ queryKey: ['mqtt-users'] });
      onClose();
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Reset Password</h2>
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
          
          <div className="bg-slate-50 p-3 rounded border text-sm text-slate-600 mb-4">
            Resetting the password for <strong className="text-slate-900">{user.username}</strong>. 
            Any active devices using the old password may disconnect.
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">New Password</label>
            <Input 
              required
              type="password"
              placeholder="Enter new secure password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-slate-900 hover:bg-slate-800 text-white">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
