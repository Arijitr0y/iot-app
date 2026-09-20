import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface UserRoleData {
  role_name: string;
  access_level: 'admin_panel' | 'web_dashboard';
  manage_categories: boolean;
  manage_device_types: boolean;
  manage_inventory: boolean;
  manage_mqtt: boolean;
  manage_users: boolean;
}

export function useRole() {
  const { user } = useAuth();
  const [roleData, setRoleData] = useState<UserRoleData | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchRole() {
      if (!user) {
        if (isMounted) {
          setRoleData(null);
          setLoadingRole(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('admin_user_roles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching role:', error);
          if (isMounted) setRoleData(null);
        } else {
          if (isMounted) {
            setRoleData({
              role_name: data?.role_name || 'Customer',
              access_level: data?.access_level || 'web_dashboard',
              manage_categories: !!data?.manage_categories,
              manage_device_types: !!data?.manage_device_types,
              manage_inventory: !!data?.manage_inventory,
              manage_mqtt: !!data?.manage_mqtt,
              manage_users: !!data?.manage_users,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch role', err);
        if (isMounted) setRoleData(null);
      } finally {
        if (isMounted) setLoadingRole(false);
      }
    }

    fetchRole();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const isAdmin = roleData?.access_level === 'admin_panel';

  return { roleData, loadingRole, isAdmin };
}


