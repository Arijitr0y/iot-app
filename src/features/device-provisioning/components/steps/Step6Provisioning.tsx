import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { espService } from '@/services/esp.service';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';

interface Props {
  ssid: string;
  password?: string;
  deviceMac?: string;
  deviceTypeId?: string;
  sessionToken?: string;
  onComplete: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

export const Step6Provisioning = ({ ssid, password = '', deviceMac, deviceTypeId, sessionToken, onComplete, onRetry, onCancel }: Props) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startProvisioning = async () => {
      try {
        const hasSentCredentials = sessionStorage.getItem('provisioning_step6_sent') === 'true';

        if (!hasSentCredentials) {
          setProgress(20);
          setStatus('Sending credentials to device...');
          
          // This makes the POST /configure request to the ESP8266
          const backendUrl = import.meta.env.VITE_API_URL;
          const result = await espService.configureWifi(ssid, password, sessionToken || '', backendUrl);
          
          if (!isMounted) return;
          
          if (!result.success) {
            throw new Error(result.message || 'Failed to configure device');
          }
          
          sessionStorage.setItem('provisioning_step6_sent', 'true');
        }

        setProgress(60);
        setStatus('Device received credentials! Connecting to Wi-Fi...');
        
        // At this point, the ESP8266 is connecting to the Wi-Fi.
        // It will then shut down its hotspot. When it does, the phone should
        // automatically reconnect to the home Wi-Fi and regain internet.
        await new Promise(r => setTimeout(r, 4000));
        
        if (!isMounted) return;
        setProgress(70);
        setStatus('Waiting for internet connection to restore...');
        
        // Poll until the phone regains internet access
        while (!navigator.onLine) {
          await new Promise(r => setTimeout(r, 1000));
          if (!isMounted) return;
        }

        // Give it an extra few seconds to make sure network is fully settled
        await new Promise(r => setTimeout(r, 3000));
        
        if (!isMounted) return;
        setProgress(85);
        setStatus('Registering device to your account...');
        
        if (!deviceMac) {
          throw new Error('Device MAC address is missing. Please restart provisioning.');
        }
        if (!deviceTypeId) {
          throw new Error('Device Type is missing. Please restart provisioning.');
        }
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('You must be logged in to register a device. Please log in first.');
        }

        // We need to retry the Supabase insert because the phone might still be 
        // switching from the ESP's AP back to the home internet.
        let insertError = null;
        let success = false;
        
        for (let attempt = 1; attempt <= 15; attempt++) {
          try {
            const { data, error } = await supabase.from('user_devices').upsert({
              owner_id: session.user.id,
              device_type_id: deviceTypeId,
              name: `Smart Relay (${deviceMac.substring(deviceMac.length - 4)})`,
              mac_address: deviceMac,
              relay_state: false
            }, { onConflict: 'mac_address' }).select();

            if (error) {
              // If it's a Supabase API error (not a network error), we shouldn't retry
              if (error.message && !error.message.toLowerCase().includes('fetch')) {
                insertError = error;
                break; 
              }
              throw error; // Throw so we catch and retry
            }
            
            if (!data || data.length === 0) {
              insertError = new Error('This device is already registered to another account. Please contact support or delete it from the original account.');
              break;
            }
            
            success = true;
            break; // Success!
            
          } catch (err: any) {
            console.log(`Supabase insert attempt ${attempt} failed, retrying... (Waiting for internet)`);
            if (!isMounted) return;
            setStatus(`Waiting for internet connection... (Attempt ${attempt}/15)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!success) {
          console.error('Failed to register device in Supabase:', insertError);
          throw new Error(`Failed to save device to your account: ${insertError ? insertError.message : 'No internet connection'}`);
        }

        if (!isMounted) return;
        setProgress(95);
        setStatus('Securely provisioning device credentials...');

        // Now call the backend to setup the provisioning claim
        const backendUrl = import.meta.env.VITE_API_URL;
        let claimRes;
        try {
          claimRes = await fetch(`${backendUrl}/api/devices/provision_setup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ mac_address: deviceMac, session_token: sessionToken })
          });
        } catch (fetchErr: any) {
          throw new Error(`Failed to contact backend (${backendUrl}): ${fetchErr.message}. This is likely a CORS error or your mobile network is blocking the domain. Try using Wi-Fi instead of cellular data.`);
        }

        if (!claimRes.ok) {
          let errText = 'Unknown error';
          try { errText = await claimRes.text(); } catch(e) {}
          throw new Error(`Failed to setup device provisioning claim. Server says: ${claimRes.status} ${errText}`);
        }
        
        if (!isMounted) return;
        setProgress(100);
        setStatus('Setup complete!');
        onComplete();
        
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'An error occurred during provisioning.');
        setStatus('Provisioning failed.');
      }
    };

    startProvisioning();

    return () => {
      isMounted = false;
    };
  }, [ssid, password, onComplete]);

  return (
    <div className="space-y-8 text-center max-w-md mx-auto py-8">
      <div>
        <h2 className="text-2xl font-bold">Provisioning Device</h2>
        <p className="text-gray-500 mt-2">Please keep this window open.</p>
      </div>

      <div className="space-y-4">
        {error ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button variant="outline" className="w-full" onClick={() => {
              sessionStorage.removeItem('provisioning_step6_sent');
              onRetry();
            }}>
              Retry Network Selection
            </Button>
            <Button variant="ghost" className="w-full text-gray-500" onClick={onCancel}>
              Cancel Setup
            </Button>
          </div>
        ) : (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
            <Progress value={progress} className="w-full h-3" />
            <p className="text-sm font-medium text-gray-700 animate-pulse">{status}</p>
            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
