import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  ssid: string;
  onNext: (password: string) => void;
  onBack: () => void;
}

export const Step5EnterPassword = ({ ssid, onNext, onBack }: Props) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(password);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Enter Wi-Fi Password</h2>
        <p className="text-gray-500 mt-2">Connecting device to <strong>{ssid}</strong></p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto border p-6 rounded-lg bg-white">
        <div className="space-y-2 relative">
          <Label htmlFor="wifi-password">Password for {ssid}</Label>
          <div className="relative">
            <Input
              id="wifi-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        
        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack}>Back</Button>
          <Button type="submit">Provision Device</Button>
        </div>
      </form>
    </div>
  );
};
