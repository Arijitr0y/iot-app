import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { NotFoundPage } from '@/components/layout/NotFoundPage';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Dashboard } from '../features/dashboard/Dashboard';
import { DeviceProvisioning } from '../features/device-provisioning/DeviceProvisioning';
import { LoginPage } from '../features/auth/LoginPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AdminLoginPage } from '../features/auth/AdminLoginPage';
import { SmartPage } from '../features/smart/SmartPage';
import { MePage } from '../features/me/MePage';
import { ProfileSettingsPage } from '../features/me/ProfileSettingsPage';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CategoriesManager } from '../features/admin/CategoriesManager';
import { DeviceTypesManager } from '../features/admin/DeviceTypesManager';
import { DeviceDetailsPage } from '../features/dashboard/DeviceDetailsPage';
import { DeviceInventoryPage } from '../features/admin/DeviceInventoryPage';
import { AdminDeviceDetailsPage } from '../features/admin/AdminDeviceDetailsPage';
import { DeviceGroupsManager } from '../features/admin/DeviceGroupsManager';
import { GroupDetailsPage } from '../features/admin/GroupDetailsPage';
import { AdminMqttManagerPage } from '../features/admin/AdminMqttManagerPage';
import { UserRolesManager } from '../features/admin/UserRolesManager';
import { RolesManager } from '../features/admin/RolesManager';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignUpPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    errorElement: <NotFoundPage />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: 'provisioning',
            element: <DeviceProvisioning />,
          },
          {
            path: 'device/:deviceId',
            element: <DeviceDetailsPage />,
          },
          {
            path: 'smart',
            element: <SmartPage />,
          },
          {
            path: 'me',
            element: <MePage />,
          },
          {
            path: 'me/profile',
            element: <ProfileSettingsPage />,
          },
        ],
      },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          {
            path: 'categories',
            element: <CategoriesManager />,
          },
          {
            path: 'device-types',
            element: <DeviceTypesManager />,
          },
          {
            path: 'inventory',
            element: <DeviceInventoryPage />,
          },
          {
            path: 'inventory/:deviceId',
            element: <AdminDeviceDetailsPage />,
          },
          {
            path: 'groups',
            element: <DeviceGroupsManager />,
          },
          {
            path: 'groups/:groupId',
            element: <GroupDetailsPage />,
          },
          {
            path: 'mqtt',
            element: <AdminMqttManagerPage />,
          },
          {
            path: 'roles-manager',
            element: <RolesManager />,
          },
          {
            path: 'roles',
            element: <UserRolesManager />,
          }
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
