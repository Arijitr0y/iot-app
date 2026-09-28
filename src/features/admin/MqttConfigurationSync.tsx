import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ShieldAlert, Loader2, RefreshCw, Server, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export const MqttConfigurationSync = () => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  // Fetch health status
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['mqtt-health'],
    queryFn: async () => {
      try {
        const res = await fetch(import.meta.env.VITE_API_URL + '/health/ready');
        if (!res.ok) throw new Error('Health check failed');
        return await res.json();
      } catch (err) {
        console.error('Health check error', err);
        return { checks: { mqtt: { status: 'error' } } };
      }
    },
    refetchInterval: 30000 // refresh every 30s
  });

  const handleSync = async () => {
    if (!window.confirm("Synchronize MQTT users and ACLs with the MQTT broker?")) {
      return;
    }

    setSyncStatus('syncing');
    setSyncMessage('Syncing with Mosquitto Broker...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/mqtt/sync', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required (401). Please log in again.');
        } else if (res.status === 403) {
          throw new Error('Admin permission required (403). Insufficient privileges to trigger MQTT sync.');
        } else {
          throw new Error(`MQTT sync failed (${res.status}). Please check the server logs.`);
        }
      }

      setSyncStatus('success');
      setSyncMessage('MQTT configuration synchronized successfully.');
      refetchHealth();
      
      setTimeout(() => setSyncStatus('idle'), 5000);
    } catch (e: any) {
      console.error("Backend sync failed", e);
      setSyncStatus('error');
      setSyncMessage(e.message || 'Failed to sync with broker');
      setTimeout(() => setSyncStatus('idle'), 8000);
    }
  };

  const mqttStatus = healthData?.checks?.mqtt?.status || 'unknown';

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Server className="w-5 h-5 text-gray-500" />
          MQTT Configuration
        </CardTitle>
        <CardDescription>
          View broker status and manually trigger configuration sync to MQTT Manager.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg border">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Broker Status</span>
            <div className="flex items-center gap-2">
              {healthLoading ? (
                <span className="text-gray-500 flex items-center text-sm"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</span>
              ) : mqttStatus === 'ok' ? (
                <span className="text-green-700 flex items-center font-medium"><CheckCircle2 className="w-5 h-5 mr-1 text-green-600" /> Connected & Healthy</span>
              ) : (
                <span className="text-red-700 flex items-center font-medium"><ShieldAlert className="w-5 h-5 mr-1 text-red-600" /> Disconnected / Error</span>
              )}
            </div>
          </div>
          
          <Button 
            onClick={handleSync} 
            disabled={syncStatus === 'syncing'}
            className="w-full md:w-auto"
          >
            {syncStatus === 'syncing' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Sync MQTT Configuration</>
            )}
          </Button>
        </div>

        {/* Sync Toast Notification for the explicit component */}
        {syncStatus !== 'idle' && (
          <div className={`mt-4 flex items-center gap-3 px-4 py-3 rounded-lg shadow-sm text-sm font-medium border
            ${syncStatus === 'syncing' ? 'bg-blue-50 text-blue-800 border-blue-200' :
              syncStatus === 'success' ? 'bg-green-50 text-green-800 border-green-200' :
              'bg-red-50 text-red-800 border-red-200'}
          `}>
            {syncStatus === 'syncing' && <span className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></span>}
            {syncStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
            {syncStatus === 'error' && <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />}
            {syncMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
