import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Key, Plus, Trash2, ShieldAlert, KeyRound } from 'lucide-react';

import { AddServiceAccountModal } from './AddServiceAccountModal';
import { ResetPasswordModal } from './ResetPasswordModal';

export const MqttAclManager = () => {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  
  // Form state for new ACL
  const [newTopic, setNewTopic] = useState('');
  const [newAccess, setNewAccess] = useState('read');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<{id: string, username: string} | null>(null);

  // Sync state for toasts
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const triggerBackendSync = async () => {
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
        let errMessage = `Sync API returned ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.error) errMessage = errData.error;
        } catch (e) {
          // ignore parsing error
        }
        throw new Error(errMessage);
      }

      setSyncStatus('success');
      setSyncMessage('Mosquitto broker successfully reloaded!');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e: any) {
      console.warn("Backend sync failed", e);
      setSyncStatus('error');
      setSyncMessage(e.message || 'Failed to sync with broker');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };

  const { data: users, isLoading: usersLoading, isError: usersError } = useQuery({
    queryKey: ['mqtt-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mqtt_users').select('*').order('username');
      if (error) {
        console.error('MQTT Users fetch error:', error);
        throw error;
      }
      return data;
    },
    retry: false
  });

  const { data: acls, isLoading: aclsLoading } = useQuery({
    queryKey: ['mqtt-acls', selectedUser],
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data, error } = await supabase
        .from('mqtt_acls')
        .select('*')
        .eq('user_id', selectedUser)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUser
  });

  const addAclMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !newTopic) throw new Error('Missing fields');
      const { error } = await supabase
        .from('mqtt_acls')
        .insert({ user_id: selectedUser, topic_pattern: newTopic, access_level: newAccess });
      if (error) throw error;
      await triggerBackendSync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mqtt-acls', selectedUser] });
      setNewTopic('');
      setNewAccess('read');
    }
  });

  const deleteAclMutation = useMutation({
    mutationFn: async (aclId: string) => {
      const { error } = await supabase.from('mqtt_acls').delete().eq('id', aclId);
      if (error) throw error;
      await triggerBackendSync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mqtt-acls', selectedUser] });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('mqtt_users').delete().eq('id', userId);
      if (error) throw error;
      await triggerBackendSync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mqtt-users'] });
      if (selectedUser) setSelectedUser(null);
    }
  });

  if (usersLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading configurations...</div>;

  if (usersError || (users && users.length === 0)) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="p-6 flex items-start gap-4 text-orange-800">
          <ShieldAlert className="w-6 h-6 shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-lg">MQTT ACL Tables Not Found</h3>
            <p className="mt-1 opacity-90">
              The database tables for MQTT users and ACLs have not been created yet or are empty. 
              Please execute the `supabase_mqtt_acls.sql` migration script in your Supabase SQL Editor.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
      {/* Sync Toast Notification */}
      {syncStatus !== 'idle' && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 transform translate-y-0 opacity-100
          ${syncStatus === 'syncing' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
            syncStatus === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            'bg-red-50 text-red-800 border border-red-200'}
        `}>
          {syncStatus === 'syncing' && <span className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0"></span>}
          {syncStatus === 'success' && <Shield className="w-4 h-4 text-green-600 shrink-0" />}
          {syncStatus === 'error' && <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />}
          {syncMessage}
        </div>
      )}

      <AddServiceAccountModal 
        isOpen={isAddUserModalOpen} 
        onClose={() => setIsAddUserModalOpen(false)} 
        onSuccess={triggerBackendSync}
      />

      <ResetPasswordModal
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        user={resetPasswordUser}
        onSuccess={triggerBackendSync}
      />

      {/* Users List */}
      <Card className="md:col-span-1">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="w-5 h-5 text-gray-500" />
              Service Accounts
            </CardTitle>
            <CardDescription>Select an account to view its access rules.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setIsAddUserModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add User
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {users?.map(user => (
              <div
                key={user.id}
                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group
                  ${selectedUser === user.id ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'}
                `}
              >
                <button 
                  className="flex-1 text-left"
                  onClick={() => setSelectedUser(user.id)}
                >
                  <div className="font-medium text-gray-900">{user.username}</div>
                  <div className="text-xs text-gray-500 mt-1">{user.description}</div>
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-slate-500 hover:text-slate-900 hover:bg-slate-200 h-8 w-8 p-0"
                    title="Change Password"
                    onClick={() => setResetPasswordUser({ id: user.id, username: user.username })}
                  >
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                    title="Delete Account"
                    onClick={() => {
                      if (window.confirm(`Delete service account ${user.username}? This will immediately revoke their Mosquitto access.`)) {
                        deleteUserMutation.mutate(user.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ACLs List */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-gray-500" />
            Access Control List (ACL)
          </CardTitle>
          <CardDescription>
            {selectedUser 
              ? `Manage topic permissions for ${users?.find(u => u.id === selectedUser)?.username}` 
              : 'Select a service account to manage its permissions.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedUser ? (
            <div className="space-y-6">
              
              {/* Add New Rule */}
              <div className="bg-slate-50 p-4 rounded-lg border flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Topic Pattern</label>
                  <Input 
                    placeholder="e.g. iot/devices/+/state" 
                    value={newTopic}
                    onChange={e => setNewTopic(e.target.value)}
                    className="bg-white"
                  />
                </div>
                <div className="w-full md:w-40 space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none"
                    value={newAccess}
                    onChange={e => setNewAccess(e.target.value)}
                  >
                    <option value="read">Read Only</option>
                    <option value="write">Write Only</option>
                    <option value="readwrite">Read & Write</option>
                  </select>
                </div>
                <Button 
                  onClick={() => addAclMutation.mutate()} 
                  disabled={!newTopic || addAclMutation.isPending}
                  className="w-full md:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Rule
                </Button>
              </div>

              {/* Rules Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">Topic Pattern</th>
                      <th className="px-4 py-3 font-medium">Access Level</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aclsLoading ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 animate-pulse">Loading rules...</td></tr>
                    ) : acls?.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No ACL rules defined for this user. Mosquitto will deny all access.</td></tr>
                    ) : (
                      acls?.map((acl: any) => (
                        <tr key={acl.id} className="border-b last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono text-slate-700">{acl.topic_pattern}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium uppercase tracking-wider
                              ${acl.access_level === 'read' ? 'bg-blue-100 text-blue-700' :
                                acl.access_level === 'write' ? 'bg-orange-100 text-orange-700' :
                                'bg-purple-100 text-purple-700'
                              }
                            `}>
                              {acl.access_level}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                              onClick={() => {
                                if (window.confirm("Delete this ACL rule? This may immediately break device connectivity.")) {
                                  deleteAclMutation.mutate(acl.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <Shield className="w-12 h-12 mb-4 opacity-20" />
              <p>Select a service account to view and manage its ACL rules.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
