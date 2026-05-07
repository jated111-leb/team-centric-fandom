import { AdminManagement } from '@/components/AdminManagement';

export default function WcUsers() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Admin users</h1>
        <p className="text-muted-foreground text-sm">Invite and manage dashboard administrators</p>
      </div>
      <AdminManagement />
    </div>
  );
}
