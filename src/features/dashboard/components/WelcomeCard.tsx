import { useAuth } from '../../../features/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const WelcomeCard = () => {
  const { user } = useAuth();
  
  // Extract name from email or use a default
  const displayName = user?.email?.split('@')[0] || 'User';

  return (
    <Card className="bg-gradient-to-r from-blue-600 to-blue-400 text-white shadow-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Welcome back, {displayName}!</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-blue-50 opacity-90">
          Your IoT dashboard is running smoothly. Check the status of your devices below.
        </p>
      </CardContent>
    </Card>
  );
};
