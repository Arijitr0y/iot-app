import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useRole } from '../../features/auth/hooks/useRole';
import { Button } from '../ui/button';
import { LogOut, LayoutDashboard, Component, Boxes, Users, Settings } from 'lucide-react';

export const AdminLayout = () => {
  const { user, signOut } = useAuth();
  const { roleData, isAdmin, loadingRole } = useRole();
  const navigate = useNavigate();

  // Basic authentication check
  if (!user) {
    navigate('/admin/login');
    return null;
  }

  // Enforce RBAC
  if (loadingRole) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold text-slate-900 mb-4 text-center">Access Denied</h1>
        <p className="text-gray-600 mb-6 text-center">You do not have permission to access the admin panel.</p>
        <div className="flex gap-4">
          <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
          <Button variant="outline" onClick={() => navigate('/admin/login')}>Login as Admin</Button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Admin Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col min-h-fit md:min-h-screen">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <LayoutDashboard className="h-6 w-6 text-blue-400" />
          <div className="flex flex-col">
            <span className="font-bold text-lg">Admin Portal</span>
            <span className="text-xs text-blue-300 font-mono">{roleData?.role_name}</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {roleData?.manage_categories && (
            <Link to="/admin/categories" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
              <Boxes className="h-5 w-5 text-gray-400" />
              Categories
            </Link>
          )}
          
          {roleData?.manage_device_types && (
            <Link to="/admin/device-types" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
              <Component className="h-5 w-5 text-gray-400" />
              Device Types
            </Link>
          )}

          {roleData?.manage_inventory && (
            <Link to="/admin/inventory" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
              <LayoutDashboard className="h-5 w-5 text-gray-400" />
              Inventory
            </Link>
          )}

          {roleData?.manage_mqtt && (
            <Link to="/admin/mqtt" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
              <Boxes className="h-5 w-5 text-gray-400" />
              MQTT Security
            </Link>
          )}
          
          {roleData?.manage_users && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Access Control</p>
              <Link to="/admin/roles-manager" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
                <Settings className="h-5 w-5 text-gray-400" />
                Manage Roles
              </Link>
              <Link to="/admin/roles" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
                <Users className="h-5 w-5 text-gray-400" />
                Assign Roles
              </Link>
            </div>
          )}

          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-800 transition-colors mt-8">
            <LogOut className="h-5 w-5 text-gray-400" />
            Exit Admin
          </Link>
        </nav>
      </aside>

      {/* Admin Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm h-16 flex items-center justify-end px-6">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>{user.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Logout
            </Button>
          </div>
        </header>
        <div className="p-6 overflow-y-auto h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
