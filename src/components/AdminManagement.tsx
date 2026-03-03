import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Shield, Trash2, RefreshCw, Clock, CheckCircle2, Mail } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const emailSchema = z.string().email('Invalid email address').max(255, 'Email must be less than 255 characters');

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  invite_status: 'pending' | 'accepted' | 'no_invite';
  last_resent_at: string | null;
  resend_count: number;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
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

      // Get invite data
      const { data: invites } = await supabase
        .from('admin_invites')
        .select('*');

      const inviteMap = new Map(
        (invites || []).map(inv => [inv.user_id, inv])
      );

      const adminsWithStatus: AdminUser[] = roles.map(role => {
        const invite = inviteMap.get(role.user_id);
        return {
          id: role.id,
          user_id: role.user_id,
          email: invite?.email || 'Unknown',
          created_at: role.created_at,
          invite_status: invite ? (invite.status as 'pending' | 'accepted') : 'no_invite',
          last_resent_at: invite?.last_resent_at || null,
          resend_count: invite?.resend_count || 0,
        };
      });

      setAdmins(adminsWithStatus);
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
          title: 'Admin Invited',
          description: `${data.email} has been invited with admin access`,
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

  const handleResendInvite = async (admin: AdminUser) => {
    setResending(admin.id);
    try {
      const { data, error } = await supabase.functions.invoke('add-admin', {
        body: { email: admin.email, action: 'resend' },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Invite Resent',
          description: `A new invite has been sent to ${admin.email}`,
        });
        await fetchAdmins();
      } else {
        throw new Error(data.error || 'Failed to resend invite');
      }
    } catch (error) {
      console.error('Resend invite error:', error);
      toast({
        title: 'Failed to Resend',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setResending(null);
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

  const getStatusBadge = (admin: AdminUser) => {
    switch (admin.invite_status) {
      case 'accepted':
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case 'pending':
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {admin.resend_count > 0
                ? `Resent ${admin.resend_count} time${admin.resend_count > 1 ? 's' : ''}. Last: ${new Date(admin.last_resent_at!).toLocaleDateString()}`
                : 'Awaiting user to set password and log in'
              }
            </TooltipContent>
          </Tooltip>
        );
      default:
        return (
          <Badge variant="outline">
            <Shield className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
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
        description="Invite and manage admin users. Only invited users can access the app."
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* Add New Admin Form */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Invite New Admin</h3>
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
                    Inviting...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Invite Admin
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Public signup is disabled. Only invited users can access the app. They'll receive an email to set their password.
            </p>
          </div>

          {/* Admins List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Admin Users</h3>
              <Button variant="ghost" size="sm" onClick={fetchAdmins} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
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
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Invited</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium text-sm">
                          {admin.email !== 'Unknown' ? admin.email : (
                            <span className="font-mono text-xs text-muted-foreground">{admin.user_id.slice(0, 8)}...</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(admin)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(admin.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {admin.invite_status === 'pending' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResendInvite(admin)}
                                  disabled={resending === admin.id}
                                >
                                  {resending === admin.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Resend invite</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(admin)}
                                disabled={admins.length === 1}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {admins.length === 1 ? 'Cannot remove the last admin' : 'Remove admin access'}
                            </TooltipContent>
                          </Tooltip>
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
              This will revoke admin privileges for {adminToDelete?.email || 'this user'}. They will no longer be able to access the admin panel.
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
