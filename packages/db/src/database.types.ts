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
      support_tickets: {
        Row: { id: string; user_id: string; title: string; description: string; status: string; created_at: string }
        Insert: { id?: string; user_id: string; title: string; description: string; status?: string; created_at?: string }
        Update: { id?: string; user_id?: string; title?: string; description?: string; status?: string; created_at?: string }
        Relationships: []
      }
      delivery_log: {
        Row: { id: string; channel: string; blast_id: string | null; notification_id: string | null;
               status: string; attempt: number; sent_count: number; failed_count: number;
               error: string | null; created_at: string }
        Insert: { id?: string; channel: string; blast_id?: string | null; notification_id?: string | null;
                  status: string; attempt?: number; sent_count?: number; failed_count?: number;
                  error?: string | null; created_at?: string }
        Update: { id?: string; channel?: string; blast_id?: string | null; notification_id?: string | null;
                  status?: string; attempt?: number; sent_count?: number; failed_count?: number;
                  error?: string | null; created_at?: string }
        Relationships: []
      }
      push_tokens: {
        Row: { user_id: string; expo_token: string; platform: string; updated_at: string }
        Insert: { user_id: string; expo_token: string; platform: string; updated_at?: string }
        Update: { user_id?: string; expo_token?: string; platform?: string; updated_at?: string }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blast_templates: {
        Row: {
          id: string
          title: string
          description: string
          image_path: string
          category: string | null
          is_default: boolean
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description: string
          image_path: string
          category?: string | null
          is_default?: boolean
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          image_path?: string
          category?: string | null
          is_default?: boolean
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      event_blasts: {
        Row: {
          id: string
          event_id: string
          sender_id: string
          source_template_id: string | null
          title: string
          description: string
          image_path: string | null
          channels: string[]
          send_to: string
          sent_to_count: number
          sent_at: string
        }
        Insert: {
          id?: string
          event_id: string
          sender_id: string
          source_template_id?: string | null
          title: string
          description: string
          image_path?: string | null
          channels: string[]
          send_to?: string
          sent_to_count?: number
          sent_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          sender_id?: string
          source_template_id?: string | null
          title?: string
          description?: string
          image_path?: string | null
          channels?: string[]
          send_to?: string
          sent_to_count?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_blasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_blasts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_blasts_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "blast_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: { user_id: string; notifications_push: boolean; notifications_whatsapp: boolean; notifications_email: boolean; updated_at: string }
        Insert: { user_id: string; notifications_push?: boolean; notifications_whatsapp?: boolean; notifications_email?: boolean; updated_at?: string }
        Update: { user_id?: string; notifications_push?: boolean; notifications_whatsapp?: boolean; notifications_email?: boolean; updated_at?: string }
        Relationships: []
      }
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string }
        Insert: { follower_id: string; followee_id: string; created_at?: string }
        Update: { follower_id?: string; followee_id?: string; created_at?: string }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          actor_id: string | null
          event_id: string | null
          group_id: string | null
          community_id: string | null
          ref_id: string | null
          actor_name: string | null
          entity_name: string | null
          read_at: string | null
          cta_done: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          actor_id?: string | null
          event_id?: string | null
          group_id?: string | null
          community_id?: string | null
          ref_id?: string | null
          actor_name?: string | null
          entity_name?: string | null
          read_at?: string | null
          cta_done?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          actor_id?: string | null
          event_id?: string | null
          group_id?: string | null
          community_id?: string | null
          ref_id?: string | null
          actor_name?: string | null
          entity_name?: string | null
          read_at?: string | null
          cta_done?: boolean
          created_at?: string
        }
        Relationships: []
      }
      blocks: {
        Row: { id: string; blocker_id: string; blocked_id: string; created_at: string }
        Insert: { id?: string; blocker_id: string; blocked_id: string; created_at?: string }
        Update: { id?: string; blocker_id?: string; blocked_id?: string; created_at?: string }
        Relationships: []
      }
      reports: {
        Row: { id: string; reporter_id: string; reported_user_id: string; reason: string; description: string | null; status: string; created_at: string }
        Insert: { id?: string; reporter_id: string; reported_user_id: string; reason: string; description?: string | null; status?: string; created_at?: string }
        Update: { id?: string; reporter_id?: string; reported_user_id?: string; reason?: string; description?: string | null; status?: string; created_at?: string }
        Relationships: []
      }
      communities: {
        Row: {
          archived_at: string | null
          cancellation_rules_enabled: boolean
          cancellation_rules_text: string | null
          cover_image_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          privacy: string
          tenant_id: string
          thumbnail_path: string | null
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cancellation_rules_enabled?: boolean
          cancellation_rules_text?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          privacy?: string
          tenant_id: string
          thumbnail_path?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cancellation_rules_enabled?: boolean
          cancellation_rules_text?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          privacy?: string
          tenant_id?: string
          thumbnail_path?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_invitations: {
        Row: {
          accepted_at: string | null
          community_id: string
          created_at: string
          declined_at: string | null
          group_ids: string[]
          id: string
          invitee_id: string
          inviter_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          community_id: string
          created_at?: string
          declined_at?: string | null
          group_ids?: string[]
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          community_id?: string
          created_at?: string
          declined_at?: string | null
          group_ids?: string[]
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_invitations_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_join_requests: {
        Row: {
          community_id: string
          created_at: string
          id: string
          responded_at: string | null
          responded_by: string | null
          rules_acknowledged: boolean
          status: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          rules_acknowledged?: boolean
          status?: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          rules_acknowledged?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_join_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_join_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          created_at: string
          id: string
          role: string
          rules_accepted_at: string | null
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          role?: string
          rules_accepted_at?: string | null
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          role?: string
          rules_accepted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_permissions: {
        Row: {
          approve_join_requests: boolean
          community_id: string
          create_events: boolean
          create_groups: boolean
          create_posts: boolean
          invite_members: boolean
          updated_at: string
        }
        Insert: {
          approve_join_requests?: boolean
          community_id: string
          create_events?: boolean
          create_groups?: boolean
          create_posts?: boolean
          invite_members?: boolean
          updated_at?: string
        }
        Update: {
          approve_join_requests?: boolean
          community_id?: string
          create_events?: boolean
          create_groups?: boolean
          create_posts?: boolean
          invite_members?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_permissions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          body: string | null
          community_id: string
          created_at: string
          id: string
          image_path: string | null
          kind: string
          result_event_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string | null
          community_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          result_event_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          community_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          result_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_result_event_id_fkey"
            columns: ["result_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reviews: {
        Row: {
          body: string | null
          community_id: string
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          community_id: string
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          community_id?: string
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reviews_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_subscriptions: {
        Row: {
          community_id: string
          created_at: string
          current_period_end: string | null
          dimension: Database["public"]["Enums"]["plan_dimension"]
          id: string
          plan_id: string
          provider: Database["public"]["Enums"]["subscription_provider"]
          provider_ref: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          current_period_end?: string | null
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          id?: string
          plan_id: string
          provider?: Database["public"]["Enums"]["subscription_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          current_period_end?: string | null
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          id?: string
          plan_id?: string
          provider?: Database["public"]["Enums"]["subscription_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_subscriptions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_subscriptions_dimension_plan_id_fkey"
            columns: ["dimension", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["dimension", "plan_id"]
          },
        ]
      }
      courts: {
        Row: {
          id: string
          name: string
          sort_order: number
          venue_id: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          venue_id: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          event_id: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_activity_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_courts: {
        Row: {
          court_id: string
          event_id: string
          id: string
        }
        Insert: {
          court_id: string
          event_id: string
          id?: string
        }
        Update: {
          court_id?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_courts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          event_id: string
          id: string
          invited_at: string
          invited_by: string
          invitee_email: string | null
          invitee_id: string | null
          invitee_name: string | null
          invitee_phone: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          event_id: string
          id?: string
          invited_at?: string
          invited_by: string
          invitee_email?: string | null
          invitee_id?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          event_id?: string
          id?: string
          invited_at?: string
          invited_by?: string
          invitee_email?: string | null
          invitee_id?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_matches: {
        Row: {
          court_id: string | null
          court_number: number
          created_at: string
          event_id: string
          id: string
          match_number: number
          round_id: string
          side_a_score: number | null
          side_b_score: number | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          court_id?: string | null
          court_number: number
          created_at?: string
          event_id: string
          id?: string
          match_number: number
          round_id: string
          side_a_score?: number | null
          side_b_score?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          court_id?: string | null
          court_number?: number
          created_at?: string
          event_id?: string
          id?: string
          match_number?: number
          round_id?: string
          side_a_score?: number | null
          side_b_score?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "event_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_matches_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          confirmed_at: string | null
          event_id: string
          guest_gender: string | null
          guest_name: string | null
          has_paid: boolean
          id: string
          invited_by: string | null
          is_standby: boolean
          joined_at: string
          paid_at: string | null
          status: string
          user_id: string | null
          waiting_list_position: number | null
        }
        Insert: {
          confirmed_at?: string | null
          event_id: string
          guest_gender?: string | null
          guest_name?: string | null
          has_paid?: boolean
          id?: string
          invited_by?: string | null
          is_standby?: boolean
          joined_at?: string
          paid_at?: string | null
          status?: string
          user_id?: string | null
          waiting_list_position?: number | null
        }
        Update: {
          confirmed_at?: string | null
          event_id?: string
          guest_gender?: string | null
          guest_name?: string | null
          has_paid?: boolean
          id?: string
          invited_by?: string | null
          is_standby?: boolean
          joined_at?: string
          paid_at?: string | null
          status?: string
          user_id?: string | null
          waiting_list_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rounds: {
        Row: {
          created_at: string
          event_id: string
          generated_at: string | null
          id: string
          round_number: number
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          generated_at?: string | null
          id?: string
          round_number: number
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          generated_at?: string | null
          id?: string
          round_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          day_of_week: number
          deleted_at: string | null
          duration_minutes: number
          group_id: string
          id: string
          invite_lead_days: number
          is_active: boolean
          organizer_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          deleted_at?: string | null
          duration_minutes: number
          group_id: string
          id?: string
          invite_lead_days: number
          is_active?: boolean
          organizer_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          deleted_at?: string | null
          duration_minutes?: number
          group_id?: string
          id?: string
          invite_lead_days?: number
          is_active?: boolean
          organizer_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_series_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_teams: {
        Row: {
          event_id: string
          id: string
          is_confirmed: boolean
          player_a_id: string | null
          player_b_id: string | null
          team_name: string | null
          team_number: number
        }
        Insert: {
          event_id: string
          id?: string
          is_confirmed?: boolean
          player_a_id?: string | null
          player_b_id?: string | null
          team_name?: string | null
          team_number: number
        }
        Update: {
          event_id?: string
          id?: string
          is_confirmed?: boolean
          player_a_id?: string | null
          player_b_id?: string | null
          team_name?: string | null
          team_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_teams_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_teams_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_timer: {
        Row: {
          duration_seconds: number
          event_id: string
          paused_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          duration_seconds?: number
          event_id: string
          paused_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          duration_seconds?: number
          event_id?: string
          paused_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_timer_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_standby: boolean
          counts_for_ranking: boolean
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          entrance_fee_amount: number | null
          entrance_fee_enabled: boolean
          entrance_fee_mba_number: string | null
          entrance_fee_method: string | null
          event_type: string
          finish_message: string | null
          finished_early: boolean
          group_id: string | null
          has_location: boolean
          id: string
          is_private: boolean
          location_point: string | null
          location_text: string | null
          manual_location_address: string | null
          manual_location_name: string | null
          name: string
          num_courts: number
          organizer_id: string
          organizer_role: string
          players_submit_results: boolean
          published_at: string | null
          scoring_mode: string
          scoring_value: number | null
          series_id: string | null
          specification: string
          standby_spots: number | null
          starts_at: string
          status: string
          thumbnail_path: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          allow_standby?: boolean
          counts_for_ranking?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          entrance_fee_amount?: number | null
          entrance_fee_enabled?: boolean
          entrance_fee_mba_number?: string | null
          entrance_fee_method?: string | null
          event_type: string
          finish_message?: string | null
          finished_early?: boolean
          group_id?: string | null
          has_location?: boolean
          id?: string
          is_private?: boolean
          location_point?: string | null
          location_text?: string | null
          manual_location_address?: string | null
          manual_location_name?: string | null
          name: string
          num_courts: number
          organizer_id: string
          organizer_role: string
          players_submit_results?: boolean
          published_at?: string | null
          scoring_mode: string
          scoring_value?: number | null
          series_id?: string | null
          specification: string
          standby_spots?: number | null
          starts_at: string
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          allow_standby?: boolean
          counts_for_ranking?: boolean
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          entrance_fee_amount?: number | null
          entrance_fee_enabled?: boolean
          entrance_fee_mba_number?: string | null
          entrance_fee_method?: string | null
          event_type?: string
          finish_message?: string | null
          finished_early?: boolean
          group_id?: string | null
          has_location?: boolean
          id?: string
          is_private?: boolean
          location_point?: string | null
          location_text?: string | null
          manual_location_address?: string | null
          manual_location_name?: string | null
          name?: string
          num_courts?: number
          organizer_id?: string
          organizer_role?: string
          players_submit_results?: boolean
          published_at?: string | null
          scoring_mode?: string
          scoring_value?: number | null
          series_id?: string | null
          specification?: string
          standby_spots?: number | null
          starts_at?: string
          status?: string
          thumbnail_path?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      group_event_results: {
        Row: {
          created_at: string
          event_id: string
          final_placement: number
          group_season_id: string
          id: string
          ranking_points: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          final_placement: number
          group_season_id: string
          id?: string
          ranking_points: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          final_placement?: number
          group_season_id?: string
          id?: string
          ranking_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_event_results_group_season_id_fkey"
            columns: ["group_season_id"]
            isOneToOne: false
            referencedRelation: "group_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_event_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_seasons: {
        Row: {
          created_at: string
          ended_at: string | null
          group_id: string
          id: string
          season_number: number
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          group_id: string
          id?: string
          season_number: number
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          group_id?: string
          id?: string
          season_number?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_seasons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived_at: string | null
          archived_with_community: boolean
          community_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_general: boolean
          is_private: boolean
          name: string
          thumbnail_path: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_with_community?: boolean
          community_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_general?: boolean
          is_private?: boolean
          name: string
          thumbnail_path?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_with_community?: boolean
          community_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_general?: boolean
          is_private?: boolean
          name?: string
          thumbnail_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          id: string
          match_id: string
          participant_id: string
          side: string
        }
        Insert: {
          id?: string
          match_id: string
          participant_id: string
          side: string
        }
        Update: {
          id?: string
          match_id?: string
          participant_id?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "event_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_requests: {
        Row: {
          created_at: string
          event_id: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          dimension: Database["public"]["Enums"]["plan_dimension"]
          feature_key: string
          mvp: boolean
          plan_id: string
        }
        Insert: {
          dimension: Database["public"]["Enums"]["plan_dimension"]
          feature_key: string
          mvp?: boolean
          plan_id: string
        }
        Update: {
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          feature_key?: string
          mvp?: boolean
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_dimension_plan_id_fkey"
            columns: ["dimension", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["dimension", "plan_id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          dimension: Database["public"]["Enums"]["plan_dimension"]
          limit_key: string
          mvp: boolean
          plan_id: string
          value: number | null
        }
        Insert: {
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          limit_key: string
          mvp?: boolean
          plan_id: string
          value?: number | null
        }
        Update: {
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          limit_key?: string
          mvp?: boolean
          plan_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_dimension_plan_id_fkey"
            columns: ["dimension", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["dimension", "plan_id"]
          },
        ]
      }
      plans: {
        Row: {
          currency: string
          dimension: Database["public"]["Enums"]["plan_dimension"]
          is_default: boolean
          mvp: boolean
          name: string
          plan_id: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          currency?: string
          dimension: Database["public"]["Enums"]["plan_dimension"]
          is_default?: boolean
          mvp?: boolean
          name: string
          plan_id: string
          price_cents?: number
          sort_order?: number
        }
        Update: {
          currency?: string
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          is_default?: boolean
          mvp?: boolean
          name?: string
          plan_id?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          court_side: string | null
          notifications_prompted_at: string | null
          created_at: string
          date_of_birth: string | null
          description: string | null
          dominant_hand: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          locale: string
          location_point: unknown
          location_text: string | null
          onboarded_at: string | null
          phone: string | null
          preferred_time: string | null
          terms_accepted_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          court_side?: string | null
          notifications_prompted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          dominant_hand?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id: string
          locale?: string
          location_point?: unknown
          location_text?: string | null
          onboarded_at?: string | null
          phone?: string | null
          preferred_time?: string | null
          terms_accepted_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          court_side?: string | null
          notifications_prompted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          dominant_hand?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          locale?: string
          location_point?: unknown
          location_text?: string | null
          onboarded_at?: string | null
          phone?: string | null
          preferred_time?: string | null
          terms_accepted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      round_rest: {
        Row: {
          id: string
          participant_id: string
          round_id: string
        }
        Insert: {
          id?: string
          participant_id: string
          round_id: string
        }
        Update: {
          id?: string
          participant_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_rest_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_rest_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "event_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          dimension: Database["public"]["Enums"]["plan_dimension"]
          id: string
          plan_id: string
          provider: Database["public"]["Enums"]["subscription_provider"]
          provider_ref: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          id?: string
          plan_id: string
          provider?: Database["public"]["Enums"]["subscription_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          dimension?: Database["public"]["Enums"]["plan_dimension"]
          id?: string
          plan_id?: string
          provider?: Database["public"]["Enums"]["subscription_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_dimension_plan_id_fkey"
            columns: ["dimension", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["dimension", "plan_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tenants: {
        Row: {
          country: string
          created_at: string
          id: string
          is_personal: boolean
          name: string
          owner_id: string | null
          type: string
        }
        Insert: {
          country: string
          created_at?: string
          id?: string
          is_personal?: boolean
          name: string
          owner_id?: string | null
          type: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_default_community: {
        Row: {
          community_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          community_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          community_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_default_community_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_default_community_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "auth_providers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          community_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          rating: number | null
        }
        Insert: {
          address?: string | null
          community_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          rating?: number | null
        }
        Update: {
          address?: string | null
          community_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      auth_providers: {
        Row: {
          has_apple: boolean | null
          has_email: boolean | null
          has_google: boolean | null
          has_password: boolean | null
          has_phone: boolean | null
          user_id: string | null
        }
        Insert: {
          has_apple?: never
          has_email?: never
          has_google?: never
          has_password?: never
          has_phone?: never
          user_id?: string | null
        }
        Update: {
          has_apple?: never
          has_email?: never
          has_google?: never
          has_password?: never
          has_phone?: never
          user_id?: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _build_fours_arrangement: { Args: { p_ordered: string[] }; Returns: Json }
      _persist_round_matches: {
        Args: { p_arrangement: Json; p_event_id: string; p_round_id: string }
        Returns: undefined
      }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_event_invitation: { Args: { p_event_id: string }; Returns: string }
      accept_group_invitation: {
        Args: { p_ack?: boolean; p_group_id: string }
        Returns: undefined
      }
      accept_invitation: {
        Args: { p_ack?: boolean; p_invitation_id: string }
        Returns: undefined
      }
      accept_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      accept_partner_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      account_has_feature: {
        Args: { key: string; u: string }
        Returns: boolean
      }
      account_plan: { Args: { u: string }; Returns: string }
      account_plan_of_caller: { Args: never; Returns: string }
      add_manual_participant: {
        Args: { p_event_id: string; p_gender?: string; p_name: string }
        Returns: string
      }
      add_member_to_community: {
        Args: { p_ack?: boolean; p_community: string; p_user: string }
        Returns: undefined
      }
      cancel_join_request: {
        Args: { p_community_id: string }
        Returns: undefined
      }
      decline_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      record_community_entry: {
        Args: { p_ack?: boolean; p_community: string; p_user: string }
        Returns: undefined
      }
      rules_ack_required: {
        Args: { c: string; p_ack: boolean }
        Returns: boolean
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      archive_community: {
        Args: { p_archive: boolean; p_community_id: string }
        Returns: number
      }
      archive_group: { Args: { p_group_id: string }; Returns: undefined }
      auth_methods_for: {
        Args: { p_identifier: string }
        Returns: {
          has_apple: boolean
          has_email: boolean
          has_google: boolean
          has_password: boolean
          has_phone: boolean
          email_masked: string | null
          phone_masked: string | null
        }[]
      }
      auth_tenant_ids: { Args: never; Returns: string[] }
      can_create_community: { Args: never; Returns: boolean }
      can_create_event: { Args: { p_group_id: string }; Returns: boolean }
      can_create_group: { Args: { p_community_id: string }; Returns: boolean }
      can_create_post: { Args: { c: string }; Returns: boolean }
      can_customize_blast: { Args: { p_event_id: string }; Returns: boolean }
      can_review_community: { Args: { p_community_id: string }; Returns: boolean }
      cancel_event: { Args: { p_event_id: string; p_scope?: string }; Returns: undefined }
      chat_channel_spec: {
        Args: { p_kind: string; p_id: string }
        Returns: { name: string; member_ids: string[] }[]
      }
      choose_partner: {
        Args: { p_event_id: string; p_partner_user: string }
        Returns: undefined
      }
      claim_waitlist_spot: { Args: { p_event_id: string }; Returns: string }
      community_has_feature: {
        Args: { c: string; key: string }
        Returns: boolean
      }
      community_is_public: { Args: { c: string }; Returns: boolean }
      community_member_count: { Args: { c: string }; Returns: number }
      community_limit: { Args: { c: string; key: string }; Returns: number }
      community_limit_for_plan: { Args: { p_plan: string; p_key: string }; Returns: number }
      community_plan: { Args: { c: string }; Returns: string }
      set_account_plan: { Args: { p_plan: string }; Returns: string }
      set_community_plan: { Args: { p_community_id: string; p_plan: string }; Returns: string }
      create_community_with_personal_tenant: {
        Args: {
          p_cancellation_rules_enabled?: boolean
          p_cancellation_rules_text?: string
          p_country: string
          p_cover_image_path?: string
          p_description?: string
          p_location?: string
          p_name: string
          p_privacy?: string
          p_thumbnail_path?: string
          p_type: string
        }
        Returns: string
      }
      create_event: { Args: { p_payload: Json }; Returns: string }
      create_group: {
        Args: {
          p_community_id: string
          p_description?: string
          p_is_private?: boolean
          p_name: string
          p_thumbnail_path?: string
        }
        Returns: string
      }
      decline_event_invitation: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      decline_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      decline_partner_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      duplicate_event: {
        Args: { p_event_id: string; p_overrides: Json }
        Returns: string
      }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      event_capacity: { Args: { e: string }; Returns: number }
      event_group_community: { Args: { e: string }; Returns: string }
      event_is_visible: { Args: { e: string; u: string }; Returns: boolean }
      event_result_summary: {
        Args: { p_event_id: string }
        Returns: { rank: number; name: string; points: number }[]
      }
      post_event_result: { Args: { p_event_id: string }; Returns: string }
      materialize_occurrence: { Args: { p_after_event_id: string }; Returns: string }
      mask_email: { Args: { p_email: string }; Returns: string }
      mask_phone: { Args: { p_phone: string }; Returns: string }
      may_approve_requests: { Args: { c: string }; Returns: boolean }
      may_create_event: { Args: { c: string }; Returns: boolean }
      may_create_group: { Args: { c: string }; Returns: boolean }
      set_event_timer: {
        Args: { p_event_id: string; p_action: string }
        Returns: undefined
      }
      explore_communities: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          archived_at: string | null
          cancellation_rules_enabled: boolean
          cancellation_rules_text: string | null
          cover_image_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          privacy: string
          tenant_id: string
          thumbnail_path: string | null
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      explore_events: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: { event: Database['public']['Tables']['events']['Row']; distance_m: number | null }[]
      }
      explore_groups: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          archived_at: string | null
          community_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_general: boolean
          is_private: boolean
          name: string
          thumbnail_path: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      explore_players: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          avatar_url: string
          court_side: string
          dominant_hand: string
          full_name: string
          id: string
          shared_count: number
        }[]
      }
      my_events: {
        Args: { p_filter?: string; p_limit?: number; p_offset?: number }
        Returns: {
          allow_standby: boolean
          counts_for_ranking: boolean
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          entrance_fee_amount: number | null
          entrance_fee_enabled: boolean
          entrance_fee_mba_number: string | null
          entrance_fee_method: string | null
          event_type: string
          finish_message: string | null
          finished_early: boolean
          group_id: string | null
          has_location: boolean
          id: string
          is_private: boolean
          location_point: string | null
          location_text: string | null
          manual_location_address: string | null
          manual_location_name: string | null
          name: string
          num_courts: number
          organizer_id: string
          organizer_role: string
          players_submit_results: boolean
          published_at: string | null
          scoring_mode: string
          scoring_value: number | null
          series_id: string | null
          specification: string
          standby_spots: number | null
          starts_at: string
          status: string
          thumbnail_path: string | null
          updated_at: string
          venue_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_groups: {
        Args: Record<PropertyKey, never>
        Returns: {
          group_id: string
          name: string
          community_id: string
          community_name: string
          member_count: number
          is_managing: boolean
        }[]
      }
      add_group_admins: {
        Args: { p_group_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      get_player_profile: {
        Args: { p_target: string }
        Returns: {
          id: string
          full_name: string
          avatar_url: string | null
          dominant_hand: string | null
          court_side: string | null
          location_text: string | null
          description: string | null
          preferred_time: string | null
          played_matches: number
          best_position: number | null
          followers_count: number
          following_count: number
          is_following: boolean
          is_followed_by: boolean
        }[]
      }
      list_following: {
        Args: { p_user: string; p_search?: string | null; p_limit?: number; p_offset?: number }
        Returns: { id: string; full_name: string; avatar_url: string | null }[]
      }
      list_followers: {
        Args: { p_user: string; p_search?: string | null; p_limit?: number; p_offset?: number }
        Returns: { id: string; full_name: string; avatar_url: string | null }[]
      }
      log_event_activity: {
        Args: { p_event_id: string; p_action: string; p_detail?: Json }
        Returns: undefined
      }
      block_user: { Args: { p_target: string }; Returns: undefined }
      unblock_user: { Args: { p_target: string }; Returns: undefined }
      send_event_blast: {
        Args: {
          p_event_id: string
          p_source_template_id: string | null
          p_title: string
          p_description: string
          p_image_path: string | null
          p_channels: string[]
        }
        Returns: { blast_id: string; sent_to_count: number }[]
      }
      event_roster_csv: {
        Args: { p_event_id: string }
        Returns: string
      }
      blast_email_recipients: {
        Args: { p_blast_id: string }
        Returns: { email: string }[]
      }
      finish_event: {
        Args: {
          p_counts_override?: boolean
          p_event_id: string
          p_finish_message?: string
        }
        Returns: undefined
      }
      set_my_location: {
        Args: { p_lat: number | null; p_lng: number | null; p_text: string | null }
        Returns: undefined
      }
      generate_next_round: { Args: { p_event_id: string }; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      group_community_id: { Args: { g: string }; Returns: string }
      incoming_partner_requests: {
        Args: Record<PropertyKey, never>
        Returns: {
          kind: string
          request_id: string
          entity_id: string
          entity_name: string
          requester_id: string
          requester_name: string | null
          requester_avatar: string | null
          created_at: string
        }[]
      }
      invite_to_community: {
        Args: {
          p_community_id: string
          p_group_ids?: string[]
          p_invitee_ids: string[]
        }
        Returns: undefined
      }
      invite_to_event: {
        Args: { p_event_id: string; p_invitees: Json }
        Returns: undefined
      }
      invite_to_group: {
        Args: { p_group_id: string; p_invitee_id: string }
        Returns: undefined
      }
      is_community_admin: { Args: { c: string }; Returns: boolean }
      is_community_member: { Args: { c: string }; Returns: boolean }
      is_event_invitee: { Args: { e: string; u: string }; Returns: boolean }
      is_event_organizer: { Args: { e: string; u: string }; Returns: boolean }
      is_event_participant: { Args: { e: string; u: string }; Returns: boolean }
      is_group_admin: { Args: { g: string; u: string }; Returns: boolean }
      is_group_member: { Args: { g: string }; Returns: boolean }
      join_community: {
        Args: { p_ack?: boolean; p_community_id: string }
        Returns: string
      }
      join_event: { Args: { p_event_id: string }; Returns: string }
      join_group: { Args: { p_ack?: boolean; p_group_id: string }; Returns: undefined }
      leave_community: { Args: { p_community_id: string }; Returns: undefined }
      leave_event: { Args: { p_event_id: string }; Returns: undefined }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      leave_waiting_list: { Args: { p_event_id: string }; Returns: undefined }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_all_paid: { Args: { p_event_id: string }; Returns: undefined }
      mark_paid: {
        Args: { p_paid: boolean; p_participant_id: string }
        Returns: undefined
      }
      organizer_assign_to_team: {
        Args: {
          p_event_id: string
          p_participant_id: string
          p_team_number: number
          p_slot: string
        }
        Returns: undefined
      }
      organizer_mark_confirmed: {
        Args: { p_participant_id: string }
        Returns: undefined
      }
      organizer_remove_from_team: {
        Args: { p_event_id: string; p_participant_id: string }
        Returns: undefined
      }
      organizer_remove_participant: {
        Args: { p_mode: string; p_participant_id: string }
        Returns: undefined
      }
      organizer_switch_players: {
        Args: { p_a: string; p_b: string; p_event_id: string }
        Returns: undefined
      }
      partner_request_summary: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      persist_round: { Args: { p_payload: Json }; Returns: string }
      placement_points: { Args: { p: number }; Returns: number }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      remove_member: {
        Args: { p_community_id: string; p_user_id: string }
        Returns: undefined
      }
      register_push_token: {
        Args: { p_expo_token: string; p_platform: string }
        Returns: undefined
      }
      request_partner: {
        Args: { p_event_id: string; p_targets: string[] }
        Returns: undefined
      }
      retry_blast: { Args: { p_blast_id: string }; Returns: undefined }
      set_event_ranking: {
        Args: { p_enabled: boolean; p_event_id: string }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      search_venues: {
        Args: { p_query: string }
        Returns: { id: string; name: string; address: string | null }[]
      }
      social_email_conflict: { Args: Record<PropertyKey, never>; Returns: boolean }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      standings: {
        Args: { p_event_id: string }
        Returns: {
          draws: number
          entity_id: string
          is_team: boolean
          losses: number
          points: number
          rank: number
          wins: number
        }[]
      }
      start_event: {
        Args: { p_event_id: string; p_rounds?: Json }
        Returns: undefined
      }
      start_new_season: { Args: { p_group_id: string }; Returns: number }
      submit_score: {
        Args: {
          p_match_id: string
          p_not_played?: boolean
          p_side_a: number
          p_side_b: number
        }
        Returns: undefined
      }
      unarchive_group: { Args: { p_group_id: string }; Returns: undefined }
      unlockrows: { Args: { "": string }; Returns: number }
      update_event: { Args: { p_event_id: string; p_payload: Json }; Returns: undefined }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_community_review: {
        Args: { p_community_id: string; p_rating: number; p_body: string | null }
        Returns: undefined
      }
    }
    Enums: {
      plan_dimension: "account" | "community"
      subscription_provider: "stripe" | "revenuecat" | "manual"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      tenant_role:
        | "member"
        | "coach"
        | "staff"
        | "community_owner"
        | "club_owner"
        | "super_admin"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      plan_dimension: ["account", "community"],
      subscription_provider: ["stripe", "revenuecat", "manual"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      tenant_role: [
        "member",
        "coach",
        "staff",
        "community_owner",
        "club_owner",
        "super_admin",
      ],
    },
  },
} as const

