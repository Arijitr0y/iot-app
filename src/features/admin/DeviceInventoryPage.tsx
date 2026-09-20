import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Search, Trash2, ShieldOff, Plus } from 'lucide-react';
import { RegisterDeviceModal } from './RegisterDeviceModal';

const ITEMS_PER_PAGE = 10;

export const DeviceInventoryPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Fetch Devices with Pagination & Search
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-inventory', page, search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('user_devices')
        .select(`
          *,
          device_types(name)
        `, { count: 'exact' });

      // Apply Search (Name, MAC, Serial, Dealer)
      if (search) {
        query = query.or(`name.ilike.%${search}%,mac_address.ilike.%${search}%,serial_number.ilike.%${search}%,dealer.ilike.%${search}%`);
      }

      // Apply Status Filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply Pagination
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      
      const ownerIds = data.map(d => d.owner_id).filter(Boolean);
      let profilesMap: Record<string, string> = {};
      
      if (ownerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', ownerIds);
          
        if (profilesData) {
          profilesData.forEach(p => {
            profilesMap[p.id] = p.email;
          });
        }
      }

      return { 
        devices: data.map(d => ({ ...d, customer_email: profilesMap[d.owner_id] || 'Unknown' })), 
        count: count || 0 
      };
    },
  });

  // Real-time MQTT Status Updates
  useEffect(() => {
    // Listen for Realtime updates
    const channel = supabase.channel('admin_inventory')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_devices' }, (payload) => {
        const updatedRow = payload.new;
        
        queryClient.setQueryData(['admin-inventory', page, search, statusFilter], (oldData: any) => {
          if (!oldData || !oldData.devices) return oldData;
          return {
            ...oldData,
            devices: oldData.devices.map((dev: any) => {
              if (dev.id === updatedRow.id) {
                return {
                  ...dev,
                  status: updatedRow.status || 'offline',
                };
              }
              return dev;
            })
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [page, search, statusFilter, queryClient]);

  const totalPages = data?.count ? Math.ceil(data.count / ITEMS_PER_PAGE) : 0;

  // Bulk Actions
  const updateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[], status: string }) => {
      const { error } = await supabase
        .from('user_devices')
        .update({ status })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      setSelectedDevices([]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('user_devices')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      setSelectedDevices([]);
    }
  });

  const toggleSelectAll = () => {
    if (!data?.devices) return;
    if (selectedDevices.length === data.devices.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(data.devices.map(d => d.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedDevices(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Inventory</h1>
          <p className="text-gray-500">Manage all registered IoT devices across the platform.</p>
        </div>
        <Button onClick={() => setIsRegisterModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Register New Device
        </Button>
      </div>

      <RegisterDeviceModal 
        isOpen={isRegisterModalOpen} 
        onClose={() => setIsRegisterModalOpen(false)} 
      />

      <Card>
        <CardHeader className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between pb-4">
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search MAC, Serial, Name..."
                className="pl-9 bg-white"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0); // Reset page on search
                }}
              />
            </div>
            <select
              className="flex h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="updating">Updating</option>
              <option value="error">Error</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ ids: selectedDevices, status: 'disabled' })} disabled={selectedDevices.length === 0}>
              <ShieldOff className="w-4 h-4 mr-2 text-orange-600" /> Disable Selected
            </Button>
            <Button variant="destructive" size="sm" onClick={() => {
              if (window.confirm("Are you sure you want to delete these devices?")) {
                deleteMutation.mutate(selectedDevices);
              }
            }} disabled={selectedDevices.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete Selected
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-y">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300"
                      checked={(data?.devices?.length ?? 0) > 0 && selectedDevices.length === data?.devices?.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3">Device Name</th>
                  <th className="px-4 py-3">MAC / ID</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Firmware</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">RSSI</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  // Skeleton Rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b bg-white animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-4"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8 ml-auto"></div></td>
                    </tr>
                  ))
                ) : isError ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-red-500">Failed to load inventory.</td></tr>
                ) : data?.devices?.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No devices found.</td></tr>
                ) : (
                  data?.devices?.map((d: any) => (
                    <tr key={d.id} className={`border-b hover:bg-gray-50 ${selectedDevices.includes(d.id) ? 'bg-blue-50/50' : 'bg-white'}`}>
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300"
                          checked={selectedDevices.includes(d.id)}
                          onChange={() => toggleSelect(d.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link to={`/admin/inventory/${d.id}`} className="hover:underline hover:text-blue-600">
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{d.mac_address}</td>
                      <td className="px-4 py-3 text-gray-600">{d.device_types?.name}</td>
                      <td className="px-4 py-3 text-gray-600">{d.firmware || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${d.status === 'online' ? 'bg-green-100 text-green-700' : 
                            d.status === 'error' ? 'bg-red-100 text-red-700' : 
                            d.status === 'updating' ? 'bg-blue-100 text-blue-700' : 
                            d.status === 'disabled' ? 'bg-orange-100 text-orange-700' : 
                            'bg-gray-100 text-gray-700'}`}
                        >
                          {d.status?.toUpperCase() || 'OFFLINE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{d.customer_email}</td>
                      <td className="px-4 py-3 text-gray-600">{d.rssi ? `${d.rssi} dBm` : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => updateStatusMutation.mutate({ ids: [d.id], status: d.status === 'disabled' ? 'offline' : 'disabled' })} title={d.status === 'disabled' ? 'Enable' : 'Disable'}>
                            <ShieldOff className={`w-4 h-4 ${d.status === 'disabled' ? 'text-green-600' : 'text-orange-600'}`} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            if (window.confirm("Are you sure?")) deleteMutation.mutate([d.id]);
                          }} title="Delete">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              Showing <span className="font-medium">{(page * ITEMS_PER_PAGE) + 1}</span> to <span className="font-medium">{Math.min((page + 1) * ITEMS_PER_PAGE, data?.count || 0)}</span> of <span className="font-medium">{data?.count || 0}</span> results
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 0 || isLoading}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page >= totalPages - 1 || isLoading}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
