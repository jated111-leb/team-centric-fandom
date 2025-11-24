import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield } from 'lucide-react';

export function AdminSetupButton() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const setupAdmin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-admin');

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Admin Setup Complete',
          description: `Admin user created: ${data.email}`,
        });
      } else {
        throw new Error(data.error || 'Setup failed');
      }
    } catch (error) {
      console.error('Setup error:', error);
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={setupAdmin}
      disabled={loading}
      variant="outline"
      size="lg"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Setting up admin...
        </>
      ) : (
        <>
          <Shield className="mr-2 h-4 w-4" />
          Setup Admin User
        </>
      )}
    </Button>
  );
}
