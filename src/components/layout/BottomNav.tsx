import { NavLink } from 'react-router-dom';
import { Home, Lightbulb, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export const BottomNav = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t bg-white pb-safe sm:hidden">
      <NavLink
        to="/"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center justify-center w-full h-full space-y-1',
            isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
          )
        }
      >
        <Home className="w-6 h-6" />
        <span className="text-[10px] font-medium">Home</span>
      </NavLink>
      
      <NavLink
        to="/smart"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center justify-center w-full h-full space-y-1',
            isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
          )
        }
      >
        <Lightbulb className="w-6 h-6" />
        <span className="text-[10px] font-medium">Smart</span>
      </NavLink>

      <NavLink
        to="/me"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center justify-center w-full h-full space-y-1',
            isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
          )
        }
      >
        <User className="w-6 h-6" />
        <span className="text-[10px] font-medium">Me</span>
      </NavLink>
    </div>
  );
};
