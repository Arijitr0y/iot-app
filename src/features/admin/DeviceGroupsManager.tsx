import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Trash2, FolderSync } from 'lucide-react';

export const DeviceGroupsManager = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    filters: {
      state: '',
      district: '',
      project: '',
      dealer: ''
    }
  });

  const { data: groups, isLoading } = useQuery({
    queryKey: ['device-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_groups')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const createGroup = useMutation({
    mutationFn: async (groupData: any) => {
      // Remove empty filters
      const cleanFilters = Object.fromEntries(
        Object.entries(groupData.filters).filter(([_, v]) => v !== '')
      );
      
      const { error } = await supabase
        .from('device_groups')
        .insert({
          name: groupData.name,
          description: groupData.description,
          filters: cleanFilters
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-groups'] });
      setShowModal(false);
      setNewGroup({ name: '', description: '', filters: { state: '', district: '', project: '', dealer: '' } });
    }
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('device_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-groups'] });
    }
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Groups</h1>
          <p className="text-gray-500">Manage dynamic groups (Smart Folders) to execute bulk operations.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> Create Group
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="text-gray-500 animate-pulse">Loading groups...</div>
        ) : groups?.length === 0 ? (
          <div className="col-span-full text-center p-12 bg-white rounded-lg border text-gray-500">
            <FolderSync className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p>No device groups found. Create one to get started.</p>
          </div>
        ) : (
          groups?.map(group => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <Link to={`/admin/groups/${group.id}`} className="hover:underline text-blue-600">
                    {group.name}
                  </Link>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => {
                    if (window.confirm('Delete this group?')) deleteGroup.mutate(group.id);
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardTitle>
                <CardDescription>{group.description || 'No description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-gray-500 mb-2">Filters:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(group.filters).length === 0 ? (
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">All Devices</span>
                  ) : (
                    Object.entries(group.filters).map(([k, v]) => (
                      <span key={k} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                        {k}: {String(v)}
                      </span>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>Create Smart Group</CardTitle>
              <CardDescription>Devices matching these filters will automatically join the group.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Group Name</label>
                <Input value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} placeholder="e.g. Gujarat Plugs" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Input value={newGroup.description} onChange={e => setNewGroup({...newGroup, description: e.target.value})} />
              </div>
              <div className="pt-2 border-t">
                <h4 className="font-medium text-sm mb-2">Filter Criteria</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">State</label>
                    <Input className="h-8 text-sm" value={newGroup.filters.state} onChange={e => setNewGroup({...newGroup, filters: {...newGroup.filters, state: e.target.value}})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">District</label>
                    <Input className="h-8 text-sm" value={newGroup.filters.district} onChange={e => setNewGroup({...newGroup, filters: {...newGroup.filters, district: e.target.value}})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Project</label>
                    <Input className="h-8 text-sm" value={newGroup.filters.project} onChange={e => setNewGroup({...newGroup, filters: {...newGroup.filters, project: e.target.value}})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dealer</label>
                    <Input className="h-8 text-sm" value={newGroup.filters.dealer} onChange={e => setNewGroup({...newGroup, filters: {...newGroup.filters, dealer: e.target.value}})} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button disabled={!newGroup.name || createGroup.isPending} onClick={() => createGroup.mutate(newGroup)}>
                  Save Group
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
