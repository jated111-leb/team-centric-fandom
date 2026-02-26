export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analytics_cache: {
        Row: {
          computed_at: string
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          id: string
          stat_type: string
          stat_value: Json
        }
        Insert: {
          computed_at?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          stat_type: string
          stat_value: Json
        }
        Update: {
          computed_at?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          stat_type?: string
          stat_value?: Json
        }
        Relationships: []
      }
      competition_translations: {
        Row: {
          arabic_name: string
          competition_code: string
          created_at: string | null
          english_name: string
          id: string
        }
        Insert: {
          arabic_name: string
          competition_code: string
          created_at?: string | null
          english_name: string
          id?: string
        }
        Update: {
          arabic_name?: string
          competition_code?: string
          created_at?: string | null
          english_name?: string
          id?: string
        }
        Relationships: []
      }
      congrats_ledger: {
        Row: {
          braze_dispatch_id: string | null
          created_at: string | null
          id: string
          losing_team: string
          match_id: number
          score_away: number
          score_home: number
          status: string
          winning_team: string
        }
        Insert: {
          braze_dispatch_id?: string | null
          created_at?: string | null
          id?: string
          losing_team: string
          match_id: number
          score_away: number
          score_home: number
          status?: string
          winning_team: string
        }
        Update: {
          braze_dispatch_id?: string | null
          created_at?: string | null
          id?: string
          losing_team?: string
          match_id?: number
          score_away?: number
          score_home?: number
          status?: string
          winning_team?: string
        }
        Relationships: [
          {
            foreignKeyName: "congrats_ledger_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_campaigns: {
        Row: {
          braze_campaign_id: string | null
          braze_dispatch_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          scheduled_at: string | null
          segment_filter: Json | null
          send_id: string | null
          sent_at: string | null
          status: string
          trigger_properties: Json | null
        }
        Insert: {
          braze_campaign_id?: string | null
          braze_dispatch_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          scheduled_at?: string | null
          segment_filter?: Json | null
          send_id?: string | null
          sent_at?: string | null
          status?: string
          trigger_properties?: Json | null
        }
        Update: {
          braze_campaign_id?: string | null
          braze_dispatch_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          segment_filter?: Json | null
          send_id?: string | null
          sent_at?: string | null
          status?: string
          trigger_properties?: Json | null
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          role: string
          session_id: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          enabled: boolean
          flag_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          flag_name: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean
          flag_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      featured_teams: {
        Row: {
          braze_attribute_value: string | null
          created_at: string
          id: string
          team_name: string
          updated_at: string
        }
        Insert: {
          braze_attribute_value?: string | null
          created_at?: string
          id?: string
          team_name: string
          updated_at?: string
        }
        Update: {
          braze_attribute_value?: string | null
          created_at?: string
          id?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_team: string
          away_team_id: number | null
          channel: string | null
          competition: string
          competition_name: string
          congrats_status: string | null
          created_at: string
          home_team: string
          home_team_id: number | null
          id: number
          match_date: string
          match_time: string | null
          matchday: string | null
          priority: string
          priority_reason: string | null
          priority_score: number
          score_away: number | null
          score_home: number | null
          stage: string | null
          status: string
          studio: string | null
          updated_at: string
          utc_date: string
        }
        Insert: {
          away_team: string
          away_team_id?: number | null
          channel?: string | null
          competition: string
          competition_name: string
          congrats_status?: string | null
          created_at?: string
          home_team: string
          home_team_id?: number | null
          id: number
          match_date: string
          match_time?: string | null
          matchday?: string | null
          priority?: string
          priority_reason?: string | null
          priority_score?: number
          score_away?: number | null
          score_home?: number | null
          stage?: string | null
          status?: string
          studio?: string | null
          updated_at?: string
          utc_date: string
        }
        Update: {
          away_team?: string
          away_team_id?: number | null
          channel?: string | null
          competition?: string
          competition_name?: string
          congrats_status?: string | null
          created_at?: string
          home_team?: string
          home_team_id?: number | null
          id?: number
          match_date?: string
          match_time?: string | null
          matchday?: string | null
          priority?: string
          priority_reason?: string | null
          priority_score?: number
          score_away?: number | null
          score_home?: number | null
          stage?: string | null
          status?: string
          studio?: string | null
          updated_at?: string
          utc_date?: string
        }
        Relationships: []
      }
      notification_sends: {
        Row: {
          away_team: string | null
          braze_event_type: string
          braze_schedule_id: string | null
          campaign_id: string | null
          canvas_id: string | null
          canvas_name: string | null
          canvas_step_name: string | null
          competition: string | null
          created_at: string
          event_received_at: string
          external_user_id: string | null
          home_team: string | null
          id: string
          kickoff_utc: string | null
          match_id: number | null
          notification_type: string | null
          raw_payload: Json | null
          sent_at: string
          source_type: string | null
        }
        Insert: {
          away_team?: string | null
          braze_event_type: string
          braze_schedule_id?: string | null
          campaign_id?: string | null
          canvas_id?: string | null
          canvas_name?: string | null
          canvas_step_name?: string | null
          competition?: string | null
          created_at?: string
          event_received_at?: string
          external_user_id?: string | null
          home_team?: string | null
          id?: string
          kickoff_utc?: string | null
          match_id?: number | null
          notification_type?: string | null
          raw_payload?: Json | null
          sent_at: string
          source_type?: string | null
        }
        Update: {
          away_team?: string | null
          braze_event_type?: string
          braze_schedule_id?: string | null
          campaign_id?: string | null
          canvas_id?: string | null
          canvas_name?: string | null
          canvas_step_name?: string | null
          competition?: string | null
          created_at?: string
          event_received_at?: string
          external_user_id?: string | null
          home_team?: string | null
          id?: string
          kickoff_utc?: string | null
          match_id?: number | null
          notification_type?: string | null
          raw_payload?: Json | null
          sent_at?: string
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_sends_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_ledger: {
        Row: {
          braze_schedule_id: string
          created_at: string | null
          dispatch_id: string | null
          id: string
          match_id: number
          send_at_utc: string
          send_id: string | null
          signature: string
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string | null
        }
        Insert: {
          braze_schedule_id: string
          created_at?: string | null
          dispatch_id?: string | null
          id?: string
          match_id: number
          send_at_utc: string
          send_id?: string | null
          signature: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string | null
        }
        Update: {
          braze_schedule_id?: string
          created_at?: string | null
          dispatch_id?: string | null
          id?: string
          match_id?: number
          send_at_utc?: string
          send_id?: string | null
          signature?: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_ledger_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_locks: {
        Row: {
          expires_at: string | null
          lock_name: string
          locked_at: string | null
          locked_by: string | null
        }
        Insert: {
          expires_at?: string | null
          lock_name: string
          locked_at?: string | null
          locked_by?: string | null
        }
        Update: {
          expires_at?: string | null
          lock_name?: string
          locked_at?: string | null
          locked_by?: string | null
        }
        Relationships: []
      }
      scheduler_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          function_name: string
          id: string
          match_id: number | null
          reason: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          function_name: string
          id?: string
          match_id?: number | null
          reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          function_name?: string
          id?: string
          match_id?: number | null
          reason?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          created_at: string | null
          key: string
          value: string
        }
        Insert: {
          created_at?: string | null
          key: string
          value: string
        }
        Update: {
          created_at?: string | null
          key?: string
          value?: string
        }
        Relationships: []
      }
      team_mappings: {
        Row: {
          canonical_name: string
          created_at: string
          id: string
          pattern: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          id?: string
          pattern: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          id?: string
          pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_translations: {
        Row: {
          arabic_name: string
          created_at: string | null
          id: string
          team_name: string
        }
        Insert: {
          arabic_name: string
          created_at?: string | null
          id?: string
          team_name: string
        }
        Update: {
          arabic_name?: string
          created_at?: string | null
          id?: string
          team_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_analytics_summary: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: Json
      }
      get_match_performance: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: Json
      }
      get_notification_details: {
        Args: {
          p_end_date?: string
          p_filter_type?: string
          p_filter_value?: string
          p_page?: number
          p_page_size?: number
          p_start_date?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pg_advisory_unlock: { Args: { key: number }; Returns: boolean }
      pg_try_advisory_lock: { Args: { key: number }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      schedule_status: "pending" | "sent" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      schedule_status: ["pending", "sent", "cancelled"],
    },
  },
} as const
