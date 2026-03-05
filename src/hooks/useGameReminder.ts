import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useGameReminder(matchId: string) {
  const [isReminded, setIsReminded] = useState(false);

  const mutation = useMutation({
    mutationFn: async (externalUserId: string) => {
      const { data, error } = await supabase.functions.invoke('set-game-reminder', {
        body: { match_id: matchId, external_user_id: externalUserId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => setIsReminded(true),
  });

  return { isReminded, setReminder: mutation };
}
