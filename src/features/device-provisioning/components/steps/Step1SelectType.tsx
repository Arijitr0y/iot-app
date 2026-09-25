import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import * as LucideIcons from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface Props {
  onNext: () => void;
  onBack: () => void;
  onSelect: (type: any) => void;
  selectedType: any | null;
}

export const Step1SelectType = ({ onNext, onBack, onSelect, selectedType }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_categories').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: deviceTypes, isLoading: dtLoading } = useQuery({
    queryKey: ['device-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_types').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const activeDevices = deviceTypes?.filter(d => d.category_id === activeCategory) || [];
  const isLoading = catLoading || dtLoading;

  const renderIcon = (iconName: string, className: string) => {
    // @ts-ignore
    const Icon = LucideIcons[iconName] || LucideIcons.HelpCircle;
    return <Icon className={className} />;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500">Loading device types...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h2 className="text-2xl font-bold">Select Device Type</h2>
        <p className="text-gray-500 mt-2">Choose a category and select the device you want to provision.</p>
      </div>

      <div className="flex flex-row gap-4 min-h-[400px]">
        {/* Sidebar Categories */}
        <div className="w-1/3 max-w-[160px] flex flex-col gap-2 border-r border-gray-100 pr-2">
          {categories?.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-3 rounded-lg transition-colors text-left ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {renderIcon(cat.icon, `w-5 h-5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`)}
                <span className="text-sm truncate">{cat.name}</span>
              </button>
            );
          })}
          {categories?.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">No categories configured.</p>
          )}
        </div>

        {/* Device Grid */}
        <div className="flex-1 overflow-y-auto pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeDevices.map((device) => {
              const isSelected = selectedType?.id === device.id;
              return (
                <Card 
                  key={device.id}
                  className={`cursor-pointer transition-all border-2 hover:border-blue-300 ${
                    isSelected ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-transparent shadow-sm'
                  }`}
                  onClick={() => onSelect(device)}
                >
                  <CardHeader className="text-center p-4">
                    <div className={`mx-auto p-3 rounded-full w-fit mb-2 transition-colors ${
                      isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {renderIcon(device.icon, 'w-8 h-8')}
                    </div>
                    <CardTitle className="text-base">{device.name}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2 min-h-[2rem]">
                      {device.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
            
            {activeDevices.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                No devices found in this category.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t mt-8">
        <Button variant="outline" onClick={onBack} className="px-8">
          Back
        </Button>
        <Button onClick={onNext} disabled={!selectedType} className="px-8">
          Continue
        </Button>
      </div>
    </div>
  );
};
