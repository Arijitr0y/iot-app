import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Role {
  id: string;
  name: string;
  access_level: 'admin_panel' | 'web_dashboard';
  description: string;
  manage_categories: boolean;
  manage_device_types: boolean;
  manage_inventory: boolean;
  manage_mqtt: boolean;
  manage_users: boolean;
}

export function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [accessLevel, setAccessLevel] = useState<'admin_panel' | 'web_dashboard'>('web_dashboard');
  const [description, setDescription] = useState('');
  
  // Permissions state
  const [perms, setPerms] = useState({
    manage_categories: false,
    manage_device_types: false,
    manage_inventory: false,
    manage_mqtt: false,
    manage_users: false,
  });

  const [saving, setSaving] = useState(false);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('created_at');

      if (error) throw error;
      setRoles(data || []);
    } catch (err: any) {
      setErrorMsg('Failed to load roles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const resetForm = () => {
    setEditingRoleId(null);
    setRoleName('');
    setDescription('');
    setAccessLevel('web_dashboard');
    setPerms({
      manage_categories: false,
      manage_device_types: false,
      manage_inventory: false,
      manage_mqtt: false,
      manage_users: false,
    });
  };

  const handleEditRole = (role: Role) => {
    if (role.name === 'Super Admin' || role.name === 'Customer') {
      alert('Default roles cannot be edited directly.');
      return;
    }
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setAccessLevel(role.access_level);
    setDescription(role.description || '');
    setPerms({
      manage_categories: !!role.manage_categories,
      manage_device_types: !!role.manage_device_types,
      manage_inventory: !!role.manage_inventory,
      manage_mqtt: !!role.manage_mqtt,
      manage_users: !!role.manage_users,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    try {
      setSaving(true);
      setErrorMsg(null);

      const roleData = {
        name: roleName, 
        access_level: accessLevel, 
        description: description,
        ...perms
      };

      if (editingRoleId) {
        // Update existing
        const { error } = await supabase
          .from('roles')
          .update(roleData)
          .eq('id', editingRoleId);
        if (error) throw error;
        alert('Role updated successfully!');
      } else {
        // Create new
        const { error } = await supabase
          .from('roles')
          .insert([roleData]);
        if (error) throw error;
        alert('Role created successfully!');
      }

      resetForm();
      fetchRoles();
    } catch (err: any) {
      alert('Failed to save role: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (roleName === 'Super Admin' || roleName === 'Customer') {
      alert('Cannot delete default roles.');
      return;
    }
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? Users with this role might lose access.`)) return;

    try {
      const { error } = await supabase.from('roles').delete().eq('id', roleId);
      if (error) throw error;
      fetchRoles();
    } catch (err: any) {
      alert('Failed to delete role: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles Management</h1>
          <p className="text-slate-500">Create, edit, and define custom roles for your application.</p>
        </div>
        <Button onClick={fetchRoles} variant="outline" disabled={loading}>
          Refresh
        </Button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-500 p-4 rounded-md">
          {errorMsg}
        </div>
      )}

      {/* Create/Edit Role Form */}
      <Card className={editingRoleId ? "border-blue-300 shadow-md" : ""}>
        <CardHeader className={editingRoleId ? "bg-blue-50/50" : ""}>
          <CardTitle>{editingRoleId ? 'Edit Role' : 'Create New Role'}</CardTitle>
          <CardDescription>
            {editingRoleId 
              ? 'Modify permissions and access levels for this role.' 
              : 'Define a new role and its access level.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSaveRole} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Role Name</label>
                <Input 
                  placeholder="e.g. Support Staff" 
                  value={roleName} 
                  onChange={e => setRoleName(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Access Level</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={accessLevel}
                  onChange={e => setAccessLevel(e.target.value as any)}
                >
                  <option value="web_dashboard">Web Dashboard (Customer Side)</option>
                  <option value="admin_panel">Admin Panel (Staff Side)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input 
                placeholder="Briefly describe what this role is for..." 
                value={description} 
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {accessLevel === 'admin_panel' && (
              <div className="space-y-3 pt-4 border-t">
                <label className="text-sm font-bold">Admin Panel Permissions</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.keys(perms).map((key) => (
                    <label key={key} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        checked={(perms as any)[key]}
                        onChange={(e) => setPerms({...perms, [key]: e.target.checked})}
                      />
                      <span className="text-sm text-gray-700">
                        {key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-2">
              <Button type="submit" disabled={saving || !roleName}>
                {saving ? 'Saving...' : (editingRoleId ? 'Update Role' : 'Create Role')}
              </Button>
              {editingRoleId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Roles List */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3">Role Name</th>
                  <th className="px-6 py-3">Access Level</th>
                  <th className="px-6 py-3">Permissions</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.id} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {r.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        r.access_level === 'admin_panel' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {r.access_level === 'admin_panel' ? 'ADMIN PANEL' : 'WEB DASHBOARD'}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate">
                      {r.access_level === 'admin_panel' ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(perms).filter(k => (r as any)[k]).map(k => (
                            <span key={k} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded">
                              {k.replace('manage_', '')}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {r.description || 'No description'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(r.name !== 'Super Admin' && r.name !== 'Customer') && (
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleEditRole(r)}
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteRole(r.id, r.name)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


