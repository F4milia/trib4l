export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          id: string
          metadata: Json
          org_id: string | null
          seq: number
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          seq?: never
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          seq?: never
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_profile_id: string
          blocker_profile_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_profile_id?: string
          blocker_profile_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_profile_id_fkey"
            columns: ["blocked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_profile_id_fkey"
            columns: ["blocker_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bricks: {
        Row: {
          assignee: string | null
          build_id: string
          created_at: string
          description: string
          due_at: string | null
          id: string
          org_id: string
          status: Database["public"]["Enums"]["brick_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assignee?: string | null
          build_id: string
          created_at?: string
          description: string
          due_at?: string | null
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["brick_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assignee?: string | null
          build_id?: string
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["brick_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bricks_assignee_org_id_fkey"
            columns: ["assignee", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bricks_build_id_org_id_fkey"
            columns: ["build_id", "org_id"]
            isOneToOne: false
            referencedRelation: "builds"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "bricks_verified_by_org_id_fkey"
            columns: ["verified_by", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      builds: {
        Row: {
          created_at: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["build_status"]
          title: string
          tower_id: string
          type: Database["public"]["Enums"]["build_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["build_status"]
          title: string
          tower_id: string
          type: Database["public"]["Enums"]["build_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["build_status"]
          title?: string
          tower_id?: string
          type?: Database["public"]["Enums"]["build_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builds_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "towers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_tower_id_org_id_fkey"
            columns: ["tower_id", "org_id"]
            isOneToOne: false
            referencedRelation: "towers"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      care_actions: {
        Row: {
          created_at: string
          from_membership_id: string
          id: string
          org_id: string
          target_brick_id: string | null
          target_membership_id: string | null
          type: Database["public"]["Enums"]["care_action_type"]
        }
        Insert: {
          created_at?: string
          from_membership_id: string
          id?: string
          org_id: string
          target_brick_id?: string | null
          target_membership_id?: string | null
          type: Database["public"]["Enums"]["care_action_type"]
        }
        Update: {
          created_at?: string
          from_membership_id?: string
          id?: string
          org_id?: string
          target_brick_id?: string | null
          target_membership_id?: string | null
          type?: Database["public"]["Enums"]["care_action_type"]
        }
        Relationships: [
          {
            foreignKeyName: "care_actions_from_membership_id_org_id_fkey"
            columns: ["from_membership_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "care_actions_target_brick_id_org_id_fkey"
            columns: ["target_brick_id", "org_id"]
            isOneToOne: false
            referencedRelation: "bricks"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "care_actions_target_membership_id_org_id_fkey"
            columns: ["target_membership_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          profile_id: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_profile_id: string
          body: string
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          post_id: string
          required_stage_id: string | null
          search_vector: unknown
          updated_at: string
        }
        Insert: {
          author_profile_id: string
          body: string
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          post_id: string
          required_stage_id?: string | null
          search_vector?: unknown
          updated_at?: string
        }
        Update: {
          author_profile_id?: string
          body?: string
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          post_id?: string
          required_stage_id?: string | null
          search_vector?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          disabled_reason: string | null
          id: string
          org_id: string
          payouts_enabled: boolean
          requirements_due: string[]
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          disabled_reason?: string | null
          id?: string
          org_id: string
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          disabled_reason?: string | null
          id?: string
          org_id?: string
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_read_at: string | null
          membership_id: string
          org_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          membership_id: string
          org_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          membership_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by_membership_id: string | null
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          org_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_membership_id?: string | null
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          org_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_membership_id?: string | null
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          org_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_membership_id_fkey"
            columns: ["created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          key: string
          profile_id: string | null
          request_fingerprint: string
          response_body: Json | null
          response_status: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          key: string
          profile_id?: string | null
          request_fingerprint: string
          response_body?: Json | null
          response_status?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          key?: string
          profile_id?: string | null
          request_fingerprint?: string
          response_body?: Json | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_profile_id: string
          org_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_profile_id: string
          org_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["ledger_event_type"]
          id: string
          org_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["ledger_event_type"]
          id?: string
          org_id: string
          payload: Json
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["ledger_event_type"]
          id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ledger_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_credentials: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          live_stream_id: string
          org_id: string
          stream_key: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          live_stream_id: string
          org_id: string
          stream_key: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          live_stream_id?: string
          org_id?: string
          stream_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_credentials_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_credentials_live_stream_id_fkey"
            columns: ["live_stream_id"]
            isOneToOne: true
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_stream_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_streams: {
        Row: {
          cohort_id: string | null
          created_at: string
          created_by_profile_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          mux_live_stream_id: string | null
          org_id: string
          playback_id: string | null
          required_stage_id: string | null
          status: string
          title: string
          updated_at: string
          video_asset_id: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          mux_live_stream_id?: string | null
          org_id: string
          playback_id?: string | null
          required_stage_id?: string | null
          status?: string
          title: string
          updated_at?: string
          video_asset_id?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          mux_live_stream_id?: string | null
          org_id?: string
          playback_id?: string | null
          required_stage_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          video_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_attendance: {
        Row: {
          cohort_id: string | null
          created_at: string
          id: string
          marked_by_profile_id: string | null
          meetup_id: string
          org_id: string
          profile_id: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          marked_by_profile_id?: string | null
          meetup_id: string
          org_id: string
          profile_id: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          marked_by_profile_id?: string | null
          meetup_id?: string
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_attendance_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendance_marked_by_profile_id_fkey"
            columns: ["marked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendance_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_rsvps: {
        Row: {
          cohort_id: string | null
          created_at: string
          id: string
          meetup_id: string
          org_id: string
          profile_id: string
          status: Database["public"]["Enums"]["meetup_rsvp_status"]
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          meetup_id: string
          org_id: string
          profile_id: string
          status: Database["public"]["Enums"]["meetup_rsvp_status"]
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          id?: string
          meetup_id?: string
          org_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["meetup_rsvp_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_rsvps_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_rsvps_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_rsvps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_series: {
        Row: {
          cohort_id: string | null
          created_at: string
          created_by_profile_id: string | null
          deleted_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          interval_weeks: number
          local_time: string
          meeting_provider: string
          meeting_url: string | null
          next_occurrence_date: string
          org_id: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          interval_weeks?: number
          local_time: string
          meeting_provider: string
          meeting_url?: string | null
          next_occurrence_date: string
          org_id: string
          timezone: string
          title: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          interval_weeks?: number
          local_time?: string
          meeting_provider?: string
          meeting_url?: string | null
          next_occurrence_date?: string
          org_id?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_series_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_series_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_series_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetups: {
        Row: {
          cohort_id: string | null
          created_at: string
          created_by_profile_id: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          meeting_provider: string
          meeting_url: string | null
          org_id: string
          series_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          meeting_provider: string
          meeting_url?: string | null
          org_id: string
          series_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          meeting_provider?: string
          meeting_url?: string | null
          org_id?: string
          series_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetups_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meetup_series"
            referencedColumns: ["id"]
          },
        ]
      }
      member_blocks: {
        Row: {
          blocked_membership_id: string
          blocker_membership_id: string
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          blocked_membership_id: string
          blocker_membership_id: string
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          blocked_membership_id?: string
          blocker_membership_id?: string
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_blocks_blocked_membership_id_fkey"
            columns: ["blocked_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_blocks_blocker_membership_id_fkey"
            columns: ["blocker_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_reports: {
        Row: {
          created_at: string
          id: string
          org_id: string
          reason: string
          reported_membership_id: string
          reporter_membership_id: string
          resolved_at: string | null
          resolved_by_profile_id: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          reason: string
          reported_membership_id: string
          reporter_membership_id: string
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          reason?: string
          reported_membership_id?: string
          reporter_membership_id?: string
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "member_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reported_membership_id_fkey"
            columns: ["reported_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_reporter_membership_id_fkey"
            columns: ["reporter_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_stages: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          profile_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_stages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_pairings: {
        Row: {
          activated_at: string | null
          completed_at: string | null
          created_at: string
          declined_at: string | null
          id: string
          mentee_profile_id: string | null
          mentor_profile_id: string | null
          org_id: string
          proposed_by_profile_id: string | null
          status: Database["public"]["Enums"]["mentor_pairing_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          completed_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          mentee_profile_id?: string | null
          mentor_profile_id?: string | null
          org_id: string
          proposed_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["mentor_pairing_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          completed_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          mentee_profile_id?: string | null
          mentor_profile_id?: string | null
          org_id?: string
          proposed_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["mentor_pairing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_pairings_mentee_profile_id_fkey"
            columns: ["mentee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_pairings_mentor_profile_id_fkey"
            columns: ["mentor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_pairings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_pairings_proposed_by_profile_id_fkey"
            columns: ["proposed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          message_id: string
          mime_type: string
          org_id: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          message_id: string
          mime_type: string
          org_id: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string
          org_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_membership_id: string
          message_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_membership_id: string
          message_id: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_membership_id?: string
          message_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mentions_mentioned_membership_id_fkey"
            columns: ["mentioned_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          membership_id: string
          message_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          membership_id: string
          message_id: string
          org_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          membership_id?: string
          message_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_membership_id: string
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          parent_message_id: string | null
          updated_at: string
        }
        Insert: {
          author_membership_id: string
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          parent_message_id?: string | null
          updated_at?: string
        }
        Update: {
          author_membership_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          parent_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_membership_id_fkey"
            columns: ["author_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_tags: {
        Row: {
          created_at: string
          id: string
          label: string
          org_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          org_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          org_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          enabled: boolean
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enabled: boolean
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_membership_id: string | null
          created_at: string
          id: string
          membership_id: string
          org_id: string
          read_at: string | null
          target_id: string
          target_type: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          membership_id: string
          org_id: string
          read_at?: string | null
          target_id: string
          target_type: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          actor_membership_id?: string | null
          created_at?: string
          id?: string
          membership_id?: string
          org_id?: string
          read_at?: string | null
          target_id?: string
          target_type?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_membership_id_fkey"
            columns: ["actor_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_profile_id: string | null
          created_at: string
          currency: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          total_cents: number
          updated_at?: string
        }
        Update: {
          buyer_profile_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          id: string
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active_tower_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          settings: Json
          slug: string
          table_prompt_time: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active_tower_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
          table_prompt_time?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_tower_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
          table_prompt_time?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_active_tower_fk"
            columns: ["active_tower_id", "id"]
            isOneToOne: false
            referencedRelation: "towers"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      platform_staff: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_profile_id: string
          body: string
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          required_stage_id: string | null
          search_vector: unknown
          updated_at: string
          video_asset_id: string | null
        }
        Insert: {
          author_profile_id: string
          body: string
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          required_stage_id?: string | null
          search_vector?: unknown
          updated_at?: string
          video_asset_id?: string | null
        }
        Update: {
          author_profile_id?: string
          body?: string
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          required_stage_id?: string | null
          search_vector?: unknown
          updated_at?: string
          video_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          price_cents: number
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          price_cents: number
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          price_cents?: number
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          memorialized_at: string | null
          memorialized_by: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          memorialized_at?: string | null
          memorialized_by?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          memorialized_at?: string | null
          memorialized_by?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_memorialized_by_fkey"
            columns: ["memorialized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          expired_at: string | null
          id: string
          last_seen_at: string
          membership_id: string
          org_id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          expired_at?: string | null
          id?: string
          last_seen_at?: string
          membership_id: string
          org_id: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          expired_at?: string | null
          id?: string
          last_seen_at?: string
          membership_id?: string
          org_id?: string
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          cohort_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          org_id: string
          post_id: string | null
          profile_id: string
          reaction_type: string
          required_stage_id: string | null
        }
        Insert: {
          cohort_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          post_id?: string | null
          profile_id: string
          reaction_type?: string
          required_stage_id?: string | null
        }
        Update: {
          cohort_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          post_id?: string | null
          profile_id?: string
          reaction_type?: string
          required_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          org_id: string
          reason: string
          reporter_profile_id: string
          resolved_at: string | null
          resolved_by_profile_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          reason: string
          reporter_profile_id: string
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          reason?: string
          reporter_profile_id?: string
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transitions: {
        Row: {
          created_at: string
          from_stage_id: string | null
          id: string
          org_id: string
          profile_id: string
          to_stage_id: string
          transitioned_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          from_stage_id?: string | null
          id?: string
          org_id: string
          profile_id: string
          to_stage_id: string
          transitioned_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          from_stage_id?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          to_stage_id?: string
          transitioned_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_transitioned_by_profile_id_fkey"
            columns: ["transitioned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          org_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          body: string
          created_at: string
          id: string
          org_id: string | null
          status: Database["public"]["Enums"]["support_request_status"]
          subject: string
          submitted_by_profile_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          org_id?: string | null
          status?: Database["public"]["Enums"]["support_request_status"]
          subject: string
          submitted_by_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          org_id?: string | null
          status?: Database["public"]["Enums"]["support_request_status"]
          subject?: string
          submitted_by_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_submitted_by_profile_id_fkey"
            columns: ["submitted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      table_entries: {
        Row: {
          created_at: string
          deleted_at: string | null
          entry_date: string
          id: string
          member_id: string
          mood_tag_id: string | null
          org_id: string
          prompt_id: string | null
          response_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entry_date: string
          id?: string
          member_id: string
          mood_tag_id?: string | null
          org_id: string
          prompt_id?: string | null
          response_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          member_id?: string
          mood_tag_id?: string | null
          org_id?: string
          prompt_id?: string | null
          response_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_entries_member_id_org_id_fkey"
            columns: ["member_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "table_entries_mood_tag_id_fkey"
            columns: ["mood_tag_id"]
            isOneToOne: false
            referencedRelation: "mood_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_entries_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "table_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      table_prompts: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_prompts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      towers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          org_id: string
          status: Database["public"]["Enums"]["tower_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["tower_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["tower_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "towers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_assets: {
        Row: {
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          moderation_state: string
          mux_asset_id: string | null
          mux_upload_id: string | null
          org_id: string
          playback_id: string | null
          policy: string
          required_stage_id: string | null
          status: string
          updated_at: string
          uploader_profile_id: string | null
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          moderation_state?: string
          mux_asset_id?: string | null
          mux_upload_id?: string | null
          org_id: string
          playback_id?: string | null
          policy?: string
          required_stage_id?: string | null
          status?: string
          updated_at?: string
          uploader_profile_id?: string | null
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          moderation_state?: string
          mux_asset_id?: string | null
          mux_upload_id?: string | null
          org_id?: string
          playback_id?: string | null
          policy?: string
          required_stage_id?: string | null
          status?: string
          updated_at?: string
          uploader_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_assets_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_assets_required_stage_id_fkey"
            columns: ["required_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_assets_uploader_profile_id_fkey"
            columns: ["uploader_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vows: {
        Row: {
          assigned_at: string
          commitment: string
          completed_at: string | null
          created_at: string
          holder_id: string
          id: string
          org_id: string
          renegotiation_reason: string | null
          status: Database["public"]["Enums"]["vow_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          commitment: string
          completed_at?: string | null
          created_at?: string
          holder_id: string
          id?: string
          org_id: string
          renegotiation_reason?: string | null
          status?: Database["public"]["Enums"]["vow_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          commitment?: string
          completed_at?: string | null
          created_at?: string
          holder_id?: string
          id?: string
          org_id?: string
          renegotiation_reason?: string | null
          status?: Database["public"]["Enums"]["vow_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vows_holder_id_org_id_fkey"
            columns: ["holder_id", "org_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "vows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          external_event_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          external_event_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          external_event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { invitation_token: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      am_i_platform_admin: { Args: never; Returns: boolean }
      assign_member_to_cohort: {
        Args: {
          target_cohort_id: string
          target_org_id: string
          target_profile_id: string
        }
        Returns: {
          cohort_id: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cohort_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      audit_safe_uuid: { Args: { p_value: string }; Returns: string }
      can_see_gated_content: {
        Args: {
          check_cohort_id: string
          check_org_id: string
          check_required_stage_id: string
        }
        Returns: boolean
      }
      can_see_org_cohort_content: {
        Args: { check_cohort_id: string; check_org_id: string }
        Returns: boolean
      }
      can_see_video_asset: {
        Args: {
          check_cohort_id: string
          check_moderation_state: string
          check_org_id: string
          check_required_stage_id: string
          check_uploader_profile_id: string
        }
        Returns: boolean
      }
      check_family_storage_quota: {
        Args: { check_org_id: string; incoming_bytes: number }
        Returns: string
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      create_direct_conversation: {
        Args: { check_org_id: string; other_membership_ids: string[] }
        Returns: string
      }
      current_user_email: { Args: never; Returns: string }
      delete_my_account: { Args: never; Returns: boolean }
      designate_mentor: {
        Args: { target_org_id: string; target_profile_id: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      family_storage_bytes: { Args: { check_org_id: string }; Returns: number }
      family_streak: { Args: { p_org_id: string }; Returns: number }
      family_table_day: {
        Args: { p_org_id: string }
        Returns: {
          entry_id: string
          family_date: string
          written: boolean
        }[]
      }
      generate_meetup_occurrences: {
        Args: { occurrence_count?: number; target_series_id: string }
        Returns: {
          cohort_id: string | null
          created_at: string
          created_by_profile_id: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          meeting_provider: string
          meeting_url: string | null
          org_id: string
          series_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meetups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_org_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["membership_role"][]
          check_org_id: string
        }
        Returns: boolean
      }
      is_at_or_past_stage: {
        Args: { check_org_id: string; check_required_stage_id: string }
        Returns: boolean
      }
      is_conversation_creator: {
        Args: { check_conversation_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { check_conversation_id: string }
        Returns: boolean
      }
      is_in_cohort: { Args: { check_cohort_id: string }; Returns: boolean }
      is_org_member: { Args: { check_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_staff: { Args: never; Returns: boolean }
      is_valid_iana_timezone: { Args: { tz: string }; Returns: boolean }
      local_datetime_to_utc: {
        Args: { local_date: string; local_time: string; tz: string }
        Returns: string
      }
      mark_conversation_read: {
        Args: { check_conversation_id: string }
        Returns: string
      }
      mark_notification_read: {
        Args: { check_notification_id: string }
        Returns: undefined
      }
      membership_is_memorialized: {
        Args: { check_membership_id: string }
        Returns: boolean
      }
      memorialize_profile: { Args: { p_profile_id: string }; Returns: boolean }
      message_reaction_counts: {
        Args: { check_message_id: string }
        Returns: {
          emoji: string
          reacted_by_me: boolean
          reaction_count: number
        }[]
      }
      moderate_comment: {
        Args: { reason?: string; target_comment_id: string }
        Returns: {
          author_profile_id: string
          body: string
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          post_id: string
          required_stage_id: string | null
          search_vector: unknown
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_post: {
        Args: { reason?: string; target_post_id: string }
        Returns: {
          author_profile_id: string
          body: string
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          required_stage_id: string | null
          search_vector: unknown
          updated_at: string
          video_asset_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_video_asset: {
        Args: { reason?: string; target_video_asset_id: string }
        Returns: {
          cohort_id: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          moderation_state: string
          mux_asset_id: string | null
          mux_upload_id: string | null
          org_id: string
          playback_id: string | null
          policy: string
          required_stage_id: string | null
          status: string
          updated_at: string
          uploader_profile_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "video_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: unknown
          is_current: boolean
          last_active_at: string
          user_agent: string
        }[]
      }
      next_vow_holder: { Args: { p_org_id: string }; Returns: string }
      notification_preference_enabled: {
        Args: {
          p_channel?: Database["public"]["Enums"]["notification_channel"]
          p_org_id: string
          p_profile_id: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: boolean
      }
      project_storage_bytes: { Args: never; Returns: number }
      retire_table_entry: { Args: { p_entry_id: string }; Returns: boolean }
      revoke_all_my_sessions: { Args: never; Returns: number }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      shares_org_with: { Args: { target_profile_id: string }; Returns: boolean }
      touch_push_subscription: {
        Args: { check_endpoint: string }
        Returns: undefined
      }
      transition_member_stage: {
        Args: {
          target_org_id: string
          target_profile_id: string
          target_stage_id: string
        }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          profile_id: string
          stage_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_stages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unmemorialize_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      unread_message_counts: {
        Args: { check_org_id: string }
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      viewer_blocks_membership: {
        Args: { check_membership_id: string }
        Returns: boolean
      }
    }
    Enums: {
      brick_status:
        | "open"
        | "in_progress"
        | "needs_help"
        | "pending_verification"
        | "done"
      build_status: "open" | "complete"
      build_type: "commerce" | "permanence" | "propagation" | "custom"
      care_action_type: "cover_task" | "offer_bandwidth" | "reminder"
      conversation_kind: "family_channel" | "direct"
      invitation_status: "pending" | "accepted" | "revoked"
      ledger_event_type:
        | "table_entry"
        | "brick_complete"
        | "build_complete"
        | "tower_event"
        | "care_action"
        | "vow_event"
      meetup_rsvp_status: "going" | "maybe" | "not_going"
      membership_role: "member" | "mentor" | "organizer" | "org_owner"
      mentor_pairing_status: "proposed" | "active" | "completed" | "declined"
      notification_channel: "email"
      notification_type: "family_night_digest" | "vow_notification" | "mention"
      order_status: "pending" | "paid" | "canceled" | "refunded"
      product_type: "digital" | "physical" | "ticket" | "cohort_seat"
      report_status: "open" | "escalated" | "resolved"
      report_target_type: "post" | "comment" | "member"
      support_request_status: "open" | "handled"
      tower_status: "active" | "stalled" | "pivoted" | "complete"
      vow_status: "assigned" | "active" | "renegotiation_requested" | "complete"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      brick_status: [
        "open",
        "in_progress",
        "needs_help",
        "pending_verification",
        "done",
      ],
      build_status: ["open", "complete"],
      build_type: ["commerce", "permanence", "propagation", "custom"],
      care_action_type: ["cover_task", "offer_bandwidth", "reminder"],
      conversation_kind: ["family_channel", "direct"],
      invitation_status: ["pending", "accepted", "revoked"],
      ledger_event_type: [
        "table_entry",
        "brick_complete",
        "build_complete",
        "tower_event",
        "care_action",
        "vow_event",
      ],
      meetup_rsvp_status: ["going", "maybe", "not_going"],
      membership_role: ["member", "mentor", "organizer", "org_owner"],
      mentor_pairing_status: ["proposed", "active", "completed", "declined"],
      notification_channel: ["email"],
      notification_type: ["family_night_digest", "vow_notification", "mention"],
      order_status: ["pending", "paid", "canceled", "refunded"],
      product_type: ["digital", "physical", "ticket", "cohort_seat"],
      report_status: ["open", "escalated", "resolved"],
      report_target_type: ["post", "comment", "member"],
      support_request_status: ["open", "handled"],
      tower_status: ["active", "stalled", "pivoted", "complete"],
      vow_status: ["assigned", "active", "renegotiation_requested", "complete"],
    },
  },
} as const

