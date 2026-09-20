import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { 
  UserCircle, 
  Home, 
  Settings, 
  HelpCircle, 
  MonitorSmartphone, 
  LogOut, 
  ChevronRight
} from 'lucide-react';

export const MePage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const menuItems = [
    {
      icon: Home,
      title: 'Home Management',
      onClick: () => console.log('Navigate to Home Management'),
    },
    {
      icon: MonitorSmartphone,
      title: 'Third-Party Voice Services',
      subtitle: 'Google Home, Alexa',
      onClick: () => console.log('Navigate to Voice Services'),
    },
    {
      icon: Settings,
      title: 'Profile Settings',
      onClick: () => navigate('/me/profile'),
    },
    {
      icon: HelpCircle,
      title: 'Help Center',
      onClick: () => console.log('Navigate to Help Center'),
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-4 py-4 px-2">
        <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
          <UserCircle className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {user?.email?.split('@')[0] || 'User'}
          </h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-0 divide-y">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={index}
                  onClick={item.onClick}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-xs text-gray-500 mt-0.5">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-between p-4 hover:bg-red-50 text-red-600 transition-colors text-left rounded-xl"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <LogOut className="h-5 w-5" />
                </div>
                <div className="font-medium">Sign Out</div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
