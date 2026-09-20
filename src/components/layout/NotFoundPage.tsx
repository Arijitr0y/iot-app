import { useNavigate, useRouteError } from 'react-router-dom';
import { Button } from '../ui/button';
import { AlertTriangle, Home, ArrowLeft } from 'lucide-react';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const error = useRouteError() as any;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100 transition-all hover:shadow-2xl">
        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 relative">
          <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-20"></div>
          <AlertTriangle className="h-12 w-12 text-red-500 relative z-10" />
        </div>
        
        <h1 className="text-7xl font-extrabold text-slate-900 mb-2 tracking-tight">404</h1>
        <h2 className="text-2xl font-semibold text-slate-800 mb-4">Page Not Found</h2>
        
        <p className="text-slate-500 mb-8 leading-relaxed">
          {error?.statusText || error?.message || "Oops! The page you're looking for doesn't exist, has been removed, or is temporarily unavailable."}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button 
            variant="outline" 
            className="w-full sm:w-auto flex items-center justify-center gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button 
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white"
            onClick={() => navigate('/')}
          >
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};
