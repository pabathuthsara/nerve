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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      difficulty_offsets: {
        Row: {
          gain_bonus: number
          level: number
          start_bonus: number
          updated_at: string
          user_id: string
        }
        Insert: {
          gain_bonus?: number
          level: number
          start_bonus?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          gain_bonus?: number
          level?: number
          start_bonus?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          onboarding_rep_used_at: string | null
          plan: string
          renews_at: string | null
          reps_day: string
          reps_per_day: number
          reps_used_today: number
          spend_halt_reason: string | null
          spend_halted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          onboarding_rep_used_at?: string | null
          plan?: string
          renews_at?: string | null
          reps_day?: string
          reps_per_day?: number
          reps_used_today?: number
          spend_halt_reason?: string | null
          spend_halted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          onboarding_rep_used_at?: string | null
          plan?: string
          renews_at?: string | null
          reps_day?: string
          reps_per_day?: number
          reps_used_today?: number
          spend_halt_reason?: string | null
          spend_halted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_assignments: {
        Row: {
          accepted_at: string | null
          anxiety_pre: number | null
          assigned_on: string
          challenge_id: string
          created_at: string
          id: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          anxiety_pre?: number | null
          assigned_on: string
          challenge_id: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          anxiety_pre?: number | null
          assigned_on?: string
          challenge_id?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_assignments_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "field_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      field_challenges: {
        Row: {
          brief: string
          created_at: string
          done_when: string
          id: string
          published: boolean
          reviewed_at: string
          reviewed_by: string
          safety_note: string | null
          setting: string
          slug: string
          tier: number
          title: string
          updated_at: string
        }
        Insert: {
          brief: string
          created_at?: string
          done_when: string
          id?: string
          published?: boolean
          reviewed_at?: string
          reviewed_by: string
          safety_note?: string | null
          setting?: string
          slug: string
          tier: number
          title: string
          updated_at?: string
        }
        Update: {
          brief?: string
          created_at?: string
          done_when?: string
          id?: string
          published?: boolean
          reviewed_at?: string
          reviewed_by?: string
          safety_note?: string | null
          setting?: string
          slug?: string
          tier?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      field_logs: {
        Row: {
          anxiety_post: number | null
          anxiety_pre: number | null
          asked: boolean
          assignment_id: string | null
          challenge_id: string | null
          challenge_title: string
          id: string
          logged_at: string
          logged_on: string
          note: string | null
          outcome: string
          tier: number
          user_id: string
        }
        Insert: {
          anxiety_post?: number | null
          anxiety_pre?: number | null
          asked?: boolean
          assignment_id?: string | null
          challenge_id?: string | null
          challenge_title: string
          id?: string
          logged_at?: string
          logged_on: string
          note?: string | null
          outcome: string
          tier: number
          user_id: string
        }
        Update: {
          anxiety_post?: number | null
          anxiety_pre?: number | null
          asked?: boolean
          assignment_id?: string | null
          challenge_id?: string | null
          challenge_title?: string
          id?: string
          logged_at?: string
          logged_on?: string
          note?: string | null
          outcome?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "field_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_logs_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "field_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_setups: {
        Row: {
          company: string | null
          created_at: string
          custom_questions: string[]
          cv_filename: string | null
          cv_path: string | null
          cv_uploaded_at: string | null
          interviewer_slug: string | null
          job_description: string | null
          role_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          custom_questions?: string[]
          cv_filename?: string | null
          cv_path?: string | null
          cv_uploaded_at?: string | null
          interviewer_slug?: string | null
          job_description?: string | null
          role_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          custom_questions?: string[]
          cv_filename?: string | null
          cv_path?: string | null
          cv_uploaded_at?: string | null
          interviewer_slug?: string | null
          job_description?: string | null
          role_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      persona_memory: {
        Row: {
          last_seen_at: string
          persona_id: string
          summary: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          persona_id: string
          summary: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          persona_id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_memory_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          blurb: string | null
          contract: string
          created_at: string
          dials: Json
          exit_conditions: string[]
          hook: string | null
          id: string
          level: number
          name: string
          outcome_weights: Json
          portrait_url: string | null
          published: boolean
          responds_to: string[]
          scene: string
          setting_label: string | null
          setting_short: string | null
          shuts_down_on: string[]
          slug: string
          track: string
          updated_at: string
          voice: Json
        }
        Insert: {
          blurb?: string | null
          contract: string
          created_at?: string
          dials: Json
          exit_conditions?: string[]
          hook?: string | null
          id?: string
          level: number
          name: string
          outcome_weights: Json
          portrait_url?: string | null
          published?: boolean
          responds_to?: string[]
          scene: string
          setting_label?: string | null
          setting_short?: string | null
          shuts_down_on?: string[]
          slug: string
          track?: string
          updated_at?: string
          voice: Json
        }
        Update: {
          blurb?: string | null
          contract?: string
          created_at?: string
          dials?: Json
          exit_conditions?: string[]
          hook?: string | null
          id?: string
          level?: number
          name?: string
          outcome_weights?: Json
          portrait_url?: string | null
          published?: boolean
          responds_to?: string[]
          scene?: string
          setting_label?: string | null
          setting_short?: string | null
          shuts_down_on?: string[]
          slug?: string
          track?: string
          updated_at?: string
          voice?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_track: string
          age_confirmed_at: string | null
          ambience: boolean
          ambience_volume: number
          baseline_score: number | null
          baseline_session_id: string | null
          created_at: string
          current_level: number
          date_of_birth: string | null
          display_name: string | null
          experience: string | null
          focus_area: string | null
          goal: string | null
          id: string
          input_device: string | null
          keep_recordings: boolean
          onboarding_complete: boolean
          output_device: string | null
          patience: number
          rank: string
          timezone: string
          training_wheels: boolean
          ui_flags: Json
          unlocked_tracks: string[]
          updated_at: string
          vad_offset_ms: number
        }
        Insert: {
          active_track?: string
          age_confirmed_at?: string | null
          ambience?: boolean
          ambience_volume?: number
          baseline_score?: number | null
          baseline_session_id?: string | null
          created_at?: string
          current_level?: number
          date_of_birth?: string | null
          display_name?: string | null
          experience?: string | null
          focus_area?: string | null
          goal?: string | null
          id: string
          input_device?: string | null
          keep_recordings?: boolean
          onboarding_complete?: boolean
          output_device?: string | null
          patience?: number
          rank?: string
          timezone?: string
          training_wheels?: boolean
          ui_flags?: Json
          unlocked_tracks?: string[]
          updated_at?: string
          vad_offset_ms?: number
        }
        Update: {
          active_track?: string
          age_confirmed_at?: string | null
          ambience?: boolean
          ambience_volume?: number
          baseline_score?: number | null
          baseline_session_id?: string | null
          created_at?: string
          current_level?: number
          date_of_birth?: string | null
          display_name?: string | null
          experience?: string | null
          focus_area?: string | null
          goal?: string | null
          id?: string
          input_device?: string | null
          keep_recordings?: boolean
          onboarding_complete?: boolean
          output_device?: string | null
          patience?: number
          rank?: string
          timezone?: string
          training_wheels?: boolean
          ui_flags?: Json
          unlocked_tracks?: string[]
          updated_at?: string
          vad_offset_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_baseline_session_id_fkey"
            columns: ["baseline_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          user_id: string
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      safety_events: {
        Row: {
          created_at: string
          detail: Json
          handled_at: string | null
          id: number
          kind: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          handled_at?: string | null
          id?: never
          kind: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          handled_at?: string | null
          id?: never
          kind?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          close: number | null
          composite: number
          composure: number | null
          curiosity: number | null
          deterministic_score: number | null
          evidence: Json
          focus: string[]
          graded_at: string
          listening: number | null
          metric_scores: Json
          metrics: Json
          model_version: string
          opening: number | null
          outcome: string | null
          session_id: string
          signal_reading: number | null
          user_id: string
          voice_provider: string
          went_well: string | null
        }
        Insert: {
          close?: number | null
          composite: number
          composure?: number | null
          curiosity?: number | null
          deterministic_score?: number | null
          evidence?: Json
          focus?: string[]
          graded_at?: string
          listening?: number | null
          metric_scores?: Json
          metrics?: Json
          model_version: string
          opening?: number | null
          outcome?: string | null
          session_id: string
          signal_reading?: number | null
          user_id: string
          voice_provider: string
          went_well?: string | null
        }
        Update: {
          close?: number | null
          composite?: number
          composure?: number | null
          curiosity?: number | null
          deterministic_score?: number | null
          evidence?: Json
          focus?: string[]
          graded_at?: string
          listening?: number | null
          metric_scores?: Json
          metrics?: Json
          model_version?: string
          opening?: number | null
          outcome?: string | null
          session_id?: string
          signal_reading?: number | null
          user_id?: string
          voice_provider?: string
          went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          audio_expires_at: string | null
          audio_path: string | null
          created_at: string
          decision_warmth: number | null
          duration_s: number | null
          ended_at: string | null
          ended_by: string | null
          final_band: string | null
          final_warmth: number | null
          id: string
          model: string
          outcome: string | null
          peak_warmth: number | null
          persona_id: string | null
          persona_slug: string
          pipeline_incidents: Json | null
          provider: string
          start_warmth: number | null
          started_at: string
          user_id: string
          won: boolean | null
        }
        Insert: {
          audio_expires_at?: string | null
          audio_path?: string | null
          created_at?: string
          decision_warmth?: number | null
          duration_s?: number | null
          ended_at?: string | null
          ended_by?: string | null
          final_band?: string | null
          final_warmth?: number | null
          id?: string
          model: string
          outcome?: string | null
          peak_warmth?: number | null
          persona_id?: string | null
          persona_slug: string
          pipeline_incidents?: Json | null
          provider: string
          start_warmth?: number | null
          started_at?: string
          user_id: string
          won?: boolean | null
        }
        Update: {
          audio_expires_at?: string | null
          audio_path?: string | null
          created_at?: string
          decision_warmth?: number | null
          duration_s?: number | null
          ended_at?: string | null
          ended_by?: string | null
          final_band?: string | null
          final_warmth?: number | null
          id?: string
          model?: string
          outcome?: string | null
          peak_warmth?: number | null
          persona_id?: string | null
          persona_slug?: string
          pipeline_incidents?: Json | null
          provider?: string
          start_warmth?: number | null
          started_at?: string
          user_id?: string
          won?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      share_cards: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      streaks: {
        Row: {
          created_at: string
          current: number
          last_active_on: string | null
          longest: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current?: number
          last_active_on?: string | null
          longest?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current?: number
          last_active_on?: string | null
          longest?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          last_event: Json
          plan: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_event?: Json
          plan: string
          provider: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_event?: Json
          plan?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      techniques: {
        Row: {
          body: string
          created_at: string
          drill: string | null
          examples: Json
          id: string
          kind: string
          published: boolean
          setting: string | null
          slug: string
          summary: string
          targets: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          drill?: string | null
          examples?: Json
          id?: string
          kind?: string
          published?: boolean
          setting?: string | null
          slug: string
          summary: string
          targets?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          drill?: string | null
          examples?: Json
          id?: string
          kind?: string
          published?: boolean
          setting?: string | null
          slug?: string
          summary?: string
          targets?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      text_threads: {
        Row: {
          id: string
          persona_slug: string
          started_at: string
          turns: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          persona_slug: string
          started_at?: string
          turns?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          persona_slug?: string
          started_at?: string
          turns?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          created_at: string
          session_id: string
          turns: Json
          user_id: string
          warmth: Json
        }
        Insert: {
          created_at?: string
          session_id: string
          turns?: Json
          user_id: string
          warmth?: Json
        }
        Update: {
          created_at?: string
          session_id?: string
          turns?: Json
          user_id?: string
          warmth?: Json
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      unlocks: {
        Row: {
          announced_at: string | null
          id: number
          kind: string
          ref: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          announced_at?: string | null
          id?: never
          kind: string
          ref: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          announced_at?: string | null
          id?: never
          kind?: string
          ref?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_ledger: {
        Row: {
          cost_cents: number
          created_at: string
          id: number
          model: string
          provider: string
          rate: number
          seconds: number
          session_id: string | null
          user_id: string
        }
        Insert: {
          cost_cents: number
          created_at?: string
          id?: never
          model: string
          provider: string
          rate: number
          seconds: number
          session_id?: string | null
          user_id: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          id?: never
          model?: string
          provider?: string
          rate?: number
          seconds?: number
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          copy: string
          created_at: string
          id: number
          stats: Json
          user_id: string
          week_start: string
        }
        Insert: {
          copy: string
          created_at?: string
          id?: never
          stats?: Json
          user_id: string
          week_start: string
        }
        Update: {
          copy?: string
          created_at?: string
          id?: never
          stats?: Json
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      export_my_data: { Args: never; Returns: Json }
      spend_allowance: {
        Args: {
          p_bucket: string
          p_cap_cents: number
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          reason: string
          retry_after: number
          spent_cents: number
        }[]
      }
      spend_today_cents: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
