import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRole(userId: string | undefined) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setRole(null); setLoading(false); return; }
    setLoading(true);
    supabase.from('user_roles').select('role').eq('user_id', userId).then(({ data }) => {
      const roles = (data ?? []).map((r: any) => r.role);
      setRole(roles.includes('admin') ? 'admin' : roles[0] ?? 'admin');
      setLoading(false);
    });
  }, [userId]);

  return { role, isPanelOnly: role === 'panel_anticipos', loading };
}
