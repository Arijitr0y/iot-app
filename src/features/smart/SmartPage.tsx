import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Clock, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { publishDeviceSchedules } from '@/services/mqtt.api';

interface Schedule {
  id: string;
  device_id: string;
  device_name?: string;
  action: 'on' | 'off';
  time: string;
  days: string[];
  active: boolean;
}

export const SmartPage = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [userDevices, setUserDevices] = useState<{ id: string; name: string; mac_address: string }[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newTime, setNewTime] = useState('12:00');
  const [newAction, setNewAction] = useState<'on' | 'off'>('on');
  const [newDays, setNewDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch Devices
    const { data: devicesData } = await supabase
      .from('user_devices')
      .select('id, mac_address, name')
      .eq('owner_id', session.user.id);
    
    if (devicesData) {
      setUserDevices(devicesData);
      if (devicesData.length > 0 && !newDeviceId) {
        setNewDeviceId(devicesData[0].id);
      }
    }

    // Fetch Schedules
    const { data: schedulesData } = await supabase
      .from('device_schedules')
      .select('*, user_devices!inner(name)')
      .order('created_at', { ascending: false });

    if (schedulesData) {
      setSchedules(schedulesData.map((s: any) => ({
        id: s.id,
        device_id: s.device_id,
        device_name: s.user_devices.name,
        action: s.action,
        time: s.time,
        days: s.days,
        active: s.active,
      })));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const syncSchedulesToDevice = async (deviceId: string) => {
    const device = userDevices.find((d) => d.id === deviceId);
    if (!device) return;

    const { data: deviceSchedules } = await supabase
      .from('device_schedules')
      .select('*')
      .eq('device_id', deviceId)
      .eq('active', true);

    if (!deviceSchedules) return;

    const dayMap: { [key: string]: number } = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };

    const payload = deviceSchedules.map((s: any) => ({
      a: s.action === 'on' ? 1 : 0,
      h: parseInt(s.time.split(':')[0], 10),
      m: parseInt(s.time.split(':')[1], 10),
      d: s.days.map((d: string) => dayMap[d])
    }));

    await publishDeviceSchedules(device.id, payload);
  };

  const toggleDay = (day: string) => {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId) return;

    const { error } = await supabase.from('device_schedules').insert({
      device_id: newDeviceId,
      action: newAction,
      time: newTime,
      days: newDays,
      active: true,
    });

    if (!error) {
      await fetchData();
      await syncSchedulesToDevice(newDeviceId);
      setIsModalOpen(false);
    } else {
      console.error('Failed to create schedule:', error);
    }
  };

  const toggleActive = async (schedule: Schedule) => {
    const newActiveState = !schedule.active;
    const { error } = await supabase
      .from('device_schedules')
      .update({ active: newActiveState })
      .eq('id', schedule.id);

    if (!error) {
      await fetchData();
      await syncSchedulesToDevice(schedule.device_id);
    }
  };

  const deleteSchedule = async (schedule: Schedule) => {
    const { error } = await supabase
      .from('device_schedules')
      .delete()
      .eq('id', schedule.id);

    if (!error) {
      await fetchData();
      await syncSchedulesToDevice(schedule.device_id);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Scenes</h1>
          <p className="text-gray-500">Automate your devices with schedules.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed rounded-lg border-gray-200">
          <Clock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No schedules</h3>
          <p className="text-gray-500 mb-4">You haven't created any schedules yet.</p>
          <Button variant="outline" onClick={() => setIsModalOpen(true)}>Create your first schedule</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="relative overflow-hidden group">
              <div
                className={`absolute top-0 left-0 w-1 h-full ${
                  schedule.active ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
              <CardHeader className="flex flex-row items-start justify-between pb-2 pl-6">
                <div>
                  <CardTitle className="text-lg">{schedule.time}</CardTitle>
                  <CardDescription>{schedule.days.join(', ')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => deleteSchedule(schedule)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    className={`w-10 h-6 rounded-full transition-colors ${
                      schedule.active ? 'bg-blue-600' : 'bg-gray-300'
                    } flex items-center px-1`}
                    onClick={() => toggleActive(schedule)}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        schedule.active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pl-6">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{schedule.device_name}</span>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      schedule.action === 'on'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    Turn {schedule.action.toUpperCase()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md animate-in fade-in zoom-in-95">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Create Schedule</CardTitle>
                <CardDescription>Set an automatic on/off timer.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <Label>Device</Label>
                  <select
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {userDevices.length === 0 && (
                      <option value="" disabled>No devices found</option>
                    )}
                    {userDevices.map(device => (
                      <option key={device.id} value={device.id}>{device.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                    className="text-lg p-4"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Action</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={newAction === 'on' ? 'default' : 'outline'}
                      className={newAction === 'on' ? 'bg-green-600 hover:bg-green-700 w-full' : 'w-full'}
                      onClick={() => setNewAction('on')}
                    >
                      Turn ON
                    </Button>
                    <Button
                      type="button"
                      variant={newAction === 'off' ? 'default' : 'outline'}
                      className={newAction === 'off' ? 'bg-red-600 hover:bg-red-700 w-full' : 'w-full'}
                      onClick={() => setNewAction('off')}
                    >
                      Turn OFF
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Repeat Days</Label>
                  <div className="flex justify-between gap-1">
                    {daysOfWeek.map((day) => {
                      const isSelected = newDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`w-10 h-10 rounded-full text-xs font-semibold transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {day.substring(0, 1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 flex gap-2">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="w-full">
                    Save Schedule
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
