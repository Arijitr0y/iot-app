import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Power, Info } from 'lucide-react';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export const Step2Preparation = ({ onNext, onBack }: Props) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Prepare Your Device</h2>
        <p className="text-gray-500 mt-2">Ensure your device is ready for provisioning.</p>
      </div>

      <div className="space-y-4 max-w-md mx-auto">
        <div className="flex items-start gap-4 p-4 border rounded-lg bg-white">
          <div className="bg-blue-100 p-2 rounded-full mt-1">
            <Power className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-lg">Enter Setup Mode</h3>
            <p className="text-gray-600 text-sm mt-1">
              Ensure the device is powered on. Press and hold the physical button on the device for <strong>5 seconds</strong> until the LED starts blinking rapidly to start the provisioning hotspot.
            </p>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            For security, the setup hotspot will automatically turn off after 5 minutes. If you need to factory reset the device entirely, hold the button for 10 seconds.
          </AlertDescription>
        </Alert>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>It's powered on</Button>
      </div>
    </div>
  );
};
