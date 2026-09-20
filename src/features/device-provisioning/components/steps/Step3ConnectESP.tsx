import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wifi, Loader2 } from 'lucide-react';
import { espService } from '@/services/esp.service';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  onNext: (mac?: string, token?: string) => void;
  onBack: () => void;
  prefix?: string;
}

export const Step3ConnectESP = ({ onNext, onBack, prefix = 'IoT-Setup-' }: Props) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyAndNext = async () => {
    setIsVerifying(true);
    setError(null);
    
    // Note: Browsers cannot read the connected Wi-Fi SSID directly.
    // Instead, we verify connection by pinging the device's IP.
    const result = await espService.checkConnection();
    
    if (!result.connected) {
      setIsVerifying(false);
      setError(`Could not reach the device. Please make sure you are connected to the "${prefix}" Wi-Fi network and try again.`);
      return;
    }

    // Now securely claim the provisioning session
    const sessionResult = await espService.startSession();
    
    setIsVerifying(false);

    if (sessionResult.success && sessionResult.token) {
      onNext(result.mac, sessionResult.token);
    } else {
      setError(sessionResult.error || 'Failed to claim provisioning session. Did you hold the button for 5 seconds?');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Connect to Device</h2>
        <p className="text-gray-500 mt-2">Connect your phone or computer to the device's hotspot.</p>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg text-center space-y-4 max-w-md mx-auto">
        <div className="flex justify-center">
          <Wifi className="w-12 h-12 text-blue-500" />
        </div>
        <p className="text-sm text-gray-600">
          Open your Wi-Fi settings and connect to the network named:
        </p>
        <div className="bg-white px-4 py-3 border rounded-md shadow-sm font-mono text-lg font-bold">
          {prefix}
        </div>
        <p className="text-xs text-gray-500">
          The exact name will vary based on your device. Once connected, return to this screen.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isVerifying}>Back</Button>
        <Button onClick={handleVerifyAndNext} disabled={isVerifying}>
          {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isVerifying ? 'Verifying...' : 'I am connected'}
        </Button>
      </div>
    </div>
  );
};
