import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Role {
  id: string;
  name: string;
}

interface UserData {
  user_id: string;
  email: string;
  role_id: string;
  role_name: string;
}

export function UserRolesManager() {
  const { session, user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomers, setShowCustomers] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pending Changes State
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});

  // Password Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  // Create User State
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{type: 'error'|'success', text: string} | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase.from('roles').select('id, name').order('name');
      if (rolesError) throw rolesError;
      setRoles(rolesData || []);

      // Fetch all users
      const { data: usersData, error: usersError } = await supabase.from('admin_user_roles').select('*').order('email');
      if (usersError) throw usersError;
      setUsers(usersData || []);
      
    } catch (err: any) {
      setErrorMsg('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDropdownChange = (userId: string, newRoleId: string) => {
    setPendingRoles(prev => ({
      ...prev,
      [userId]: newRoleId
    }));
  };

  const handleInitiateSave = (userId: string) => {
    setActionUserId(userId);
    setAdminPassword('');
    setPasswordModalOpen(true);
  };

  const handleVerifyAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionUserId || !adminPassword || !user?.email) return;

    try {
      setVerifying(true);
      
      // 1. Verify Super Admin Password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: adminPassword
      });

      if (authError) {
        throw new Error('Incorrect admin password.');
      }

      // 2. Password correct, proceed with role update
      const newRoleId = pendingRoles[actionUserId];
      
      const { error: dbError } = await supabase
        .from('user_roles')
        .upsert({ user_id: actionUserId, role_id: newRoleId });

      if (dbError) throw dbError;
      
      // 3. Update local state
      const assignedRole = roles.find(r => r.id === newRoleId);
      setUsers(users.map(u => u.user_id === actionUserId ? {
        ...u,
        role_id: newRoleId,
        role_name: assignedRole?.name || 'Unknown'
      } : u));
      
      // 4. Clear pending state and close modal
      const updatedPending = { ...pendingRoles };
      delete updatedPending[actionUserId];
      setPendingRoles(updatedPending);
      
      setPasswordModalOpen(false);
      alert('Role updated successfully!');
      
    } catch (err: any) {
      alert('Failed to update role: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you absolutely sure you want to PERMANENTLY DELETE the user ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(import.meta.env.VITE_API_URL + `/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      // Remove from list
      setUsers(users.filter(u => u.user_id !== userId));
      alert('User deleted successfully.');
    } catch (err: any) {
      alert('Failed to delete user: ' + err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;

    try {
      setCreating(true);
      setCreateMsg(null);
      
      const response = await fetch(import.meta.env.VITE_API_URL + '/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role_id: newRole || undefined
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setCreateMsg({ type: 'success', text: `User ${newEmail} created successfully!` });
      setNewEmail('');
      setNewPassword('');
      setNewRole('');
      
      fetchData(); // Refresh the list
      
    } catch (err: any) {
      setCreateMsg({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(u => {
    // Search filter
    const matchesSearch = u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.role_name?.toLowerCase().includes(searchQuery.toLowerCase());
    // Customer filter
    const isCustomer = u.role_name === 'Customer';
    const matchesCustomerFilter = showCustomers ? true : !isCustomer;

    return matchesSearch && matchesCustomerFilter;
  });

  if (loading && users.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Password Verification Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Super Admin Verification Required</h3>
            <p className="text-sm text-gray-500 mb-6">
              Please enter your own password to authorize this role assignment.
            </p>
            <form onSubmit={handleVerifyAndSave} className="space-y-4">
              <Input
                type="password"
                placeholder="Enter your admin password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                required
                autoFocus
              />
              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setPasswordModalOpen(false)}
                  disabled={verifying}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={verifying || !adminPassword}>
                  {verifying ? 'Verifying...' : 'Confirm & Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assign User Roles</h1>
          <p className="text-slate-500">Manage access levels and roles for all users in the system.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)} variant="outline">
            {showCreate ? 'Cancel Creation' : 'Create New User'}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader className="bg-blue-50/50 pb-4">
            <CardTitle className="text-blue-800">Create User Directly</CardTitle>
            <CardDescription>
              Create an account without email confirmation. Perfect for setting up new staff.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {createMsg && (
              <div className={`p-3 mb-4 rounded-md text-sm ${createMsg.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {createMsg.text}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="staff@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Temporary Password</label>
                  <Input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="Min 6 characters" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Role (Optional)</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="">Default (Customer)</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={creating || !newEmail || !newPassword} className="w-full sm:w-auto">
                {creating ? 'Creating...' : 'Create & Assign'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {errorMsg && (
        <div className="bg-red-50 text-red-500 p-4 rounded-md">
          {errorMsg}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <CardTitle>User Directory</CardTitle>
              <CardDescription>View and manage registered users.</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  checked={showCustomers}
                  onChange={(e) => setShowCustomers(e.target.checked)}
                />
                <span className="text-sm text-gray-700 whitespace-nowrap">Show Customers</span>
              </label>
              <Input 
                placeholder="Search by email..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-[200px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">Assigned Role</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                      No users match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isPending = pendingRoles[u.user_id] !== undefined && pendingRoles[u.user_id] !== u.role_id;
                    const currentValue = pendingRoles[u.user_id] !== undefined ? pendingRoles[u.user_id] : (u.role_id || '');
                    
                    return (
                      <tr key={u.user_id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {u.email}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <select
                              className="flex h-9 w-full max-w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={currentValue}
                              onChange={(e) => handleDropdownChange(u.user_id, e.target.value)}
                            >
                              <option value="" disabled>Select a role...</option>
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            
                            {isPending && (
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 h-9"
                                onClick={() => handleInitiateSave(u.user_id)}
                              >
                                Save
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteUser(u.user_id, u.email)}
                          >
                            Delete Account
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


