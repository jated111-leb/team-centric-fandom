import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Shield, Trash2 } from 'lucide-react';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const emailSchema = z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters');

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<AdminUser | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);

      // Get all admin roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) {
        setAdmins([]);
        return;
      }

      // Get user emails from auth.users (we need to use admin API for this)
      // For now, we'll just show the user_id
      const adminsWithEmails: AdminUser[] = roles.map(role => ({
        id: role.id,
        user_id: role.user_id,
        email: 'Loading...', // We'll need to fetch this separately or store it
        created_at: role.created_at,
      }));

      setAdmins(adminsWithEmails);
    } catch (error) {
      console.error('Error fetching admins:', error);
      toast({
        title: 'Error',
        description: 'Failed to load admin users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    setEmailError('');
    try {
      emailSchema.parse(email);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setEmailError(error.errors[0].message);
      }
      return false;
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(newAdminEmail.trim())) {
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-admin', {
        body: { email: newAdminEmail.trim() },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Admin Added',
          description: `${data.email} has been granted admin access`,
        });
        setNewAdminEmail('');
        setEmailError('');
        await fetchAdmins();
      } else {
        throw new Error(data.error || 'Failed to add admin');
      }
    } catch (error) {
      console.error('Add admin error:', error);
      toast({
        title: 'Failed to Add Admin',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteClick = (admin: AdminUser) => {
    setAdminToDelete(admin);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!adminToDelete) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', adminToDelete.id);

      if (error) throw error;

      toast({
        title: 'Admin Removed',
        description: 'Admin privileges have been revoked',
      });

      await fetchAdmins();
    } catch (error) {
      console.error('Delete admin error:', error);
      toast({
        title: 'Failed to Remove Admin',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setAdminToDelete(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewAdminEmail(value);
    if (emailError && value.trim()) {
      validateEmail(value.trim());
    }
  };

  return (
    <>
      <CollapsibleCard
        title={
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin User Management
          </span>
        }
        description="Manage admin access for the application. Only admins can add or remove other admins."
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* Add New Admin Form */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Add New Admin</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={newAdminEmail}
                  onChange={handleInputChange}
                  disabled={adding}
                  className={emailError ? 'border-destructive' : ''}
                />
                {emailError && (
                  <p className="text-sm text-destructive mt-1">{emailError}</p>
                )}
              </div>
              <Button onClick={handleAddAdmin} disabled={adding || !newAdminEmail.trim()}>
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Admin
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If the user doesn't exist, they will be created with admin access. They'll receive an email to set their password.
            </p>
          </div>

          {/* Admins List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Current Admins</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : admins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No admin users found
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-mono text-sm">{admin.user_id}</TableCell>
                        <TableCell>
                          <Badge variant="default">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(admin.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(admin)}
                            disabled={admins.length === 1}
                            title={admins.length === 1 ? 'Cannot remove the last admin' : 'Remove admin access'}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </CollapsibleCard>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke admin privileges for this user. They will no longer be able to access the admin panel or manage other admins.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
