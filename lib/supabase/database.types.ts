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
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
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
      current_user_email: { Args: never; Returns: string }
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
      is_in_cohort: { Args: { check_cohort_id: string }; Returns: boolean }
      is_org_member: { Args: { check_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_staff: { Args: never; Returns: boolean }
      is_valid_iana_timezone: { Args: { tz: string }; Returns: boolean }
      local_datetime_to_utc: {
        Args: { local_date: string; local_time: string; tz: string }
        Returns: string
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
      shares_org_with: { Args: { target_profile_id: string }; Returns: boolean }
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
    }
    Enums: {
      invitation_status: "pending" | "accepted" | "revoked"
      meetup_rsvp_status: "going" | "maybe" | "not_going"
      membership_role: "member" | "mentor" | "organizer" | "org_owner"
      mentor_pairing_status: "proposed" | "active" | "completed" | "declined"
      order_status: "pending" | "paid" | "canceled" | "refunded"
      product_type: "digital" | "physical" | "ticket" | "cohort_seat"
      report_status: "open" | "escalated" | "resolved"
      report_target_type: "post" | "comment" | "member"
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
      invitation_status: ["pending", "accepted", "revoked"],
      meetup_rsvp_status: ["going", "maybe", "not_going"],
      membership_role: ["member", "mentor", "organizer", "org_owner"],
      mentor_pairing_status: ["proposed", "active", "completed", "declined"],
      order_status: ["pending", "paid", "canceled", "refunded"],
      product_type: ["digital", "physical", "ticket", "cohort_seat"],
      report_status: ["open", "escalated", "resolved"],
      report_target_type: ["post", "comment", "member"],
    },
  },
} as const

