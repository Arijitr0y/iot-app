import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { espService, WifiNetwork } from '@/services/esp.service';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  onNext: (ssid: string) => void;
  onBack: () => void;
}

export const Step4ScanNetworks = ({ onNext, onBack }: Props) => {
  const [scanning, setScanning] = useState(true);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchNetworks = async () => {
    setScanning(true);
    setError(null);
    try {
      const results = await espService.scanWifi();
      setNetworks(results);
      if (results.length > 0) {
        setSelectedSsid(results[0].ssid);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan networks. Are you connected to the device?');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Select Wi-Fi Network</h2>
        <p className="text-gray-500 mt-2">Choose the network you want the device to connect to.</p>
      </div>

      <div className="max-w-md mx-auto space-y-4 bg-white p-6 rounded-lg border shadow-sm">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {scanning ? (
          <div className="flex flex-col items-center justify-center h-[120px] text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Scanning for nearby networks...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">Available Networks</label>
            <div className="flex gap-2">
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSsid}
                onChange={(e) => setSelectedSsid(e.target.value)}
                disabled={networks.length === 0}
              >
                {networks.length === 0 ? (
                  <option value="" disabled>No networks found</option>
                ) : (
                  networks.map((net, i) => (
                    <option key={`${net.ssid}-${i}`} value={net.ssid}>
                      {net.ssid} {net.secure ? '🔒' : '🔓'}
                    </option>
                  ))
                )}
              </select>
              <Button variant="outline" size="icon" onClick={fetchNetworks} title="Rescan Networks" type="button">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Provide a manual entry option just in case the network is hidden */}
            <div className="pt-2">
               <label className="block text-xs font-medium text-gray-500 mb-1">Or enter network manually (Hidden SSID):</label>
               <input 
                  type="text" 
                  value={selectedSsid} 
                  onChange={(e) => setSelectedSsid(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  placeholder="Network name"
               />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button 
          onClick={() => onNext(selectedSsid)} 
          disabled={scanning || !selectedSsid.trim()}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
