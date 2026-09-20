import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Edit, Loader2 } from 'lucide-react';

export const CategoriesManager = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', icon: 'Box' });

  // Fetch Categories
  const { data: categories, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('device_categories').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (newCategory: { name: string; icon: string }) => {
      const { error } = await supabase.from('device_categories').insert([newCategory]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      resetForm();
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (updated: { id: string; name: string; icon: string }) => {
      const { error } = await supabase.from('device_categories').update({ name: updated.name, icon: updated.icon }).eq('id', updated.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      resetForm();
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('device_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', icon: 'Box' });
    setIsEditing(false);
    setCurrentId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && currentId) {
      updateMutation.mutate({ id: currentId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (category: any) => {
    setIsEditing(true);
    setCurrentId(category.id);
    setFormData({ name: category.name, icon: category.icon });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Categories</h1>
          <p className="text-gray-500">Manage the high-level categories (e.g. Electricals, Sensors).</p>
        </div>
      </div>

      {(createMutation.error || updateMutation.error || deleteMutation.error) && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          <p className="font-bold">Error saving category:</p>
          <p className="text-sm">
            {createMutation.error?.message || updateMutation.error?.message || deleteMutation.error?.message}
          </p>
          <p className="text-sm mt-2 text-gray-700">
            *Hint: If you see a Row Level Security (RLS) violation, it means you need to enable INSERT/UPDATE/DELETE policies in your Supabase SQL editor for this table.*
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? 'Edit Category' : 'Add New Category'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="e.g. Sensors" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lucide Icon Name</Label>
                  <Input 
                    required 
                    value={formData.icon} 
                    onChange={e => setFormData({ ...formData, icon: e.target.value })} 
                    placeholder="e.g. Thermometer" 
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isEditing ? 'Update' : 'Create'}
                  </Button>
                  {isEditing && (
                    <Button type="button" variant="outline" onClick={resetForm} className="w-full">Cancel</Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Icon Name</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={3} className="px-6 py-4 text-center">Loading...</td></tr>
                  )}
                  {categories?.map((cat) => (
                    <tr key={cat.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{cat.name}</td>
                      <td className="px-6 py-4 text-gray-500">{cat.icon}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                          <Edit className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(cat.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {categories?.length === 0 && !isLoading && (
                    <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No categories found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
