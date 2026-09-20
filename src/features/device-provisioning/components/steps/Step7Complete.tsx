import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export const Step7Complete = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 text-center max-w-md mx-auto py-8">
      <div className="flex justify-center mb-6">
        <CheckCircle2 className="h-20 w-20 text-green-500" />
      </div>
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Provisioning Complete!</h2>
        <p className="text-gray-500 mt-4">
          Your device has been successfully connected to your network and registered with your account. It will now appear on your dashboard.
        </p>
      </div>

      <div className="pt-8">
        <Button className="w-full" onClick={() => {
          sessionStorage.removeItem('provisioning_currentStep');
          sessionStorage.removeItem('provisioning_selectedType');
          sessionStorage.removeItem('provisioning_targetSsid');
          sessionStorage.removeItem('provisioning_targetPassword');
          sessionStorage.removeItem('provisioning_deviceMac');
          sessionStorage.removeItem('provisioning_sessionToken');
          sessionStorage.removeItem('provisioning_step6_sent');
          navigate('/');
        }}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};
