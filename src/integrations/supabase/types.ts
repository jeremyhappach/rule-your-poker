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
      chat_messages: {
        Row: {
          created_at: string
          game_id: string
          id: string
          image_url: string | null
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          image_url?: string | null
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          image_url?: string | null
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_stack_emoticons: {
        Row: {
          created_at: string
          emoticon: string
          expires_at: string
          game_id: string
          id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          emoticon: string
          expires_at: string
          game_id: string
          id?: string
          player_id: string
        }
        Update: {
          created_at?: string
          emoticon?: string
          expires_at?: string
          game_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_stack_emoticons_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_stack_emoticons_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_game_names: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_game_names_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dice_roll_audit: {
        Row: {
          created_at: string
          die_index: number
          die_value: number
          game_id: string | null
          id: string
          player_id: string | null
          roll_number: number
          round_id: string | null
        }
        Insert: {
          created_at?: string
          die_index: number
          die_value: number
          game_id?: string | null
          id?: string
          player_id?: string | null
          roll_number: number
          round_id?: string | null
        }
        Update: {
          created_at?: string
          die_index?: number
          die_value?: number
          game_id?: string | null
          id?: string
          player_id?: string | null
          roll_number?: number
          round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dice_roll_audit_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_roll_audit_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dice_roll_audit_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_defaults: {
        Row: {
          allow_bot_dealers: boolean
          ante_amount: number
          bot_decision_delay_seconds: number
          bot_fold_probability: number
          bot_use_hand_strength: boolean
          chucky_cards: number
          chucky_last_card_delay_seconds: number
          chucky_second_to_last_delay_seconds: number
          created_at: string
          decision_timer_seconds: number
          game_type: string
          id: string
          leg_value: number
          legs_to_win: number
          pot_max_enabled: boolean
          pot_max_value: number
          pussy_tax_enabled: boolean
          pussy_tax_value: number
          rabbit_hunt: boolean
          real_money: boolean
          reveal_at_showdown: boolean
          updated_at: string
        }
        Insert: {
          allow_bot_dealers?: boolean
          ante_amount?: number
          bot_decision_delay_seconds?: number
          bot_fold_probability?: number
          bot_use_hand_strength?: boolean
          chucky_cards?: number
          chucky_last_card_delay_seconds?: number
          chucky_second_to_last_delay_seconds?: number
          created_at?: string
          decision_timer_seconds?: number
          game_type: string
          id?: string
          leg_value?: number
          legs_to_win?: number
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          updated_at?: string
        }
        Update: {
          allow_bot_dealers?: boolean
          ante_amount?: number
          bot_decision_delay_seconds?: number
          bot_fold_probability?: number
          bot_use_hand_strength?: boolean
          chucky_cards?: number
          chucky_last_card_delay_seconds?: number
          chucky_second_to_last_delay_seconds?: number
          created_at?: string
          decision_timer_seconds?: number
          game_type?: string
          id?: string
          leg_value?: number
          legs_to_win?: number
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      game_results: {
        Row: {
          created_at: string
          game_id: string
          game_type: string | null
          hand_number: number
          id: string
          is_chopped: boolean
          player_chip_changes: Json
          pot_won: number
          winner_player_id: string | null
          winner_username: string | null
          winning_hand_description: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          game_type?: string | null
          hand_number: number
          id?: string
          is_chopped?: boolean
          player_chip_changes?: Json
          pot_won?: number
          winner_player_id?: string | null
          winner_username?: string | null
          winning_hand_description?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          game_type?: string | null
          hand_number?: number
          id?: string
          is_chopped?: boolean
          player_chip_changes?: Json
          pot_won?: number
          winner_player_id?: string | null
          winner_username?: string | null
          winning_hand_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_winner_player_id_fkey"
            columns: ["winner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          all_decisions_in: boolean | null
          ante_amount: number
          ante_decision_deadline: string | null
          awaiting_next_round: boolean | null
          buck_position: number | null
          buy_in: number
          chucky_cards: number | null
          config_complete: boolean
          config_deadline: string | null
          created_at: string
          current_host: string | null
          current_round: number | null
          dealer_position: number | null
          game_over_at: string | null
          game_type: string | null
          id: string
          is_first_hand: boolean
          is_paused: boolean | null
          last_round_result: string | null
          leg_value: number
          legs_to_win: number
          name: string | null
          next_round_number: number | null
          paused_time_remaining: number | null
          pending_session_end: boolean | null
          pot: number | null
          pot_max_enabled: boolean
          pot_max_value: number
          pussy_tax: number
          pussy_tax_enabled: boolean
          pussy_tax_value: number
          rabbit_hunt: boolean
          real_money: boolean
          reveal_at_showdown: boolean
          session_ended_at: string | null
          status: string
          total_hands: number | null
          updated_at: string
        }
        Insert: {
          all_decisions_in?: boolean | null
          ante_amount?: number
          ante_decision_deadline?: string | null
          awaiting_next_round?: boolean | null
          buck_position?: number | null
          buy_in?: number
          chucky_cards?: number | null
          config_complete?: boolean
          config_deadline?: string | null
          created_at?: string
          current_host?: string | null
          current_round?: number | null
          dealer_position?: number | null
          game_over_at?: string | null
          game_type?: string | null
          id?: string
          is_first_hand?: boolean
          is_paused?: boolean | null
          last_round_result?: string | null
          leg_value?: number
          legs_to_win?: number
          name?: string | null
          next_round_number?: number | null
          paused_time_remaining?: number | null
          pending_session_end?: boolean | null
          pot?: number | null
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          session_ended_at?: string | null
          status?: string
          total_hands?: number | null
          updated_at?: string
        }
        Update: {
          all_decisions_in?: boolean | null
          ante_amount?: number
          ante_decision_deadline?: string | null
          awaiting_next_round?: boolean | null
          buck_position?: number | null
          buy_in?: number
          chucky_cards?: number | null
          config_complete?: boolean
          config_deadline?: string | null
          created_at?: string
          current_host?: string | null
          current_round?: number | null
          dealer_position?: number | null
          game_over_at?: string | null
          game_type?: string | null
          id?: string
          is_first_hand?: boolean
          is_paused?: boolean | null
          last_round_result?: string | null
          leg_value?: number
          legs_to_win?: number
          name?: string | null
          next_round_number?: number | null
          paused_time_remaining?: number | null
          pending_session_end?: boolean | null
          pot?: number | null
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          session_ended_at?: string | null
          status?: string
          total_hands?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      performance_traces: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          metadata: Json | null
          operation: string
          session_id: string
          table_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: string
          metadata?: Json | null
          operation: string
          session_id: string
          table_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          metadata?: Json | null
          operation?: string
          session_id?: string
          table_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          player_id: string
          round_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          player_id: string
          round_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          player_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_actions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_actions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          cards: Json
          created_at: string
          id: string
          player_id: string
          round_id: string
        }
        Insert: {
          cards?: Json
          created_at?: string
          id?: string
          player_id: string
          round_id: string
        }
        Update: {
          cards?: Json
          created_at?: string
          id?: string
          player_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_cards_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_transactions: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          notes: string | null
          profile_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profile_id: string
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profile_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          ante_decision: string | null
          auto_ante: boolean
          auto_fold: boolean
          chips: number
          created_at: string
          current_decision: string | null
          decision_locked: boolean | null
          deck_color_mode: string | null
          game_id: string
          id: string
          is_bot: boolean
          legs: number
          mobile_view: boolean | null
          position: number
          pre_fold: boolean | null
          pre_stay: boolean | null
          sit_out_next_hand: boolean
          sitting_out: boolean
          sitting_out_hands: number
          stand_up_next_hand: boolean
          status: string
          user_id: string
          waiting: boolean
        }
        Insert: {
          ante_decision?: string | null
          auto_ante?: boolean
          auto_fold?: boolean
          chips?: number
          created_at?: string
          current_decision?: string | null
          decision_locked?: boolean | null
          deck_color_mode?: string | null
          game_id: string
          id?: string
          is_bot?: boolean
          legs?: number
          mobile_view?: boolean | null
          position: number
          pre_fold?: boolean | null
          pre_stay?: boolean | null
          sit_out_next_hand?: boolean
          sitting_out?: boolean
          sitting_out_hands?: number
          stand_up_next_hand?: boolean
          status?: string
          user_id: string
          waiting?: boolean
        }
        Update: {
          ante_decision?: string | null
          auto_ante?: boolean
          auto_fold?: boolean
          chips?: number
          created_at?: string
          current_decision?: string | null
          decision_locked?: boolean | null
          deck_color_mode?: string | null
          game_id?: string
          id?: string
          is_bot?: boolean
          legs?: number
          mobile_view?: boolean | null
          position?: number
          pre_fold?: boolean | null
          pre_stay?: boolean | null
          sit_out_next_hand?: boolean
          sitting_out?: boolean
          sitting_out_hands?: number
          stand_up_next_hand?: boolean
          status?: string
          user_id?: string
          waiting?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aggression_level: string
          card_back_design: string
          created_at: string
          deck_color_mode: string
          email: string | null
          id: string
          is_active: boolean
          is_superuser: boolean
          last_seen_at: string | null
          play_sounds: boolean
          table_layout: string
          use_haptic: boolean
          username: string
        }
        Insert: {
          aggression_level?: string
          card_back_design?: string
          created_at?: string
          deck_color_mode?: string
          email?: string | null
          id: string
          is_active?: boolean
          is_superuser?: boolean
          last_seen_at?: string | null
          play_sounds?: boolean
          table_layout?: string
          use_haptic?: boolean
          username: string
        }
        Update: {
          aggression_level?: string
          card_back_design?: string
          created_at?: string
          deck_color_mode?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_superuser?: boolean
          last_seen_at?: string | null
          play_sounds?: boolean
          table_layout?: string
          use_haptic?: boolean
          username?: string
        }
        Relationships: []
      }
      rounds: {
        Row: {
          bet_amount: number | null
          cards_dealt: number
          chucky_active: boolean | null
          chucky_cards: Json | null
          chucky_cards_revealed: number | null
          community_cards: Json | null
          community_cards_revealed: number | null
          created_at: string
          current_turn_position: number | null
          decision_deadline: string | null
          game_id: string
          hand_number: number | null
          horses_state: Json | null
          id: string
          pot: number | null
          round_number: number
          status: string
        }
        Insert: {
          bet_amount?: number | null
          cards_dealt: number
          chucky_active?: boolean | null
          chucky_cards?: Json | null
          chucky_cards_revealed?: number | null
          community_cards?: Json | null
          community_cards_revealed?: number | null
          created_at?: string
          current_turn_position?: number | null
          decision_deadline?: string | null
          game_id: string
          hand_number?: number | null
          horses_state?: Json | null
          id?: string
          pot?: number | null
          round_number: number
          status?: string
        }
        Update: {
          bet_amount?: number | null
          cards_dealt?: number
          chucky_active?: boolean | null
          chucky_cards?: Json | null
          chucky_cards_revealed?: number | null
          community_cards?: Json | null
          community_cards_revealed?: number | null
          created_at?: string
          current_turn_position?: number | null
          decision_deadline?: string | null
          game_id?: string
          hand_number?: number | null
          horses_state?: Json | null
          id?: string
          pot?: number | null
          round_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          game_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          game_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          game_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      session_player_snapshots: {
        Row: {
          chips: number
          created_at: string | null
          game_id: string
          hand_number: number
          id: string
          is_bot: boolean | null
          player_id: string
          user_id: string
          username: string
        }
        Insert: {
          chips: number
          created_at?: string | null
          game_id: string
          hand_number: number
          id?: string
          is_bot?: boolean | null
          player_id: string
          user_id: string
          username: string
        }
        Update: {
          chips?: number
          created_at?: string | null
          game_id?: string
          hand_number?: number
          id?: string
          is_bot?: boolean | null
          player_id?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_player_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      sitting_out_debug_log: {
        Row: {
          additional_context: Json | null
          created_at: string
          field_changed: string
          game_id: string
          id: string
          is_bot: boolean | null
          new_value: boolean | null
          old_value: boolean | null
          player_id: string
          reason: string
          source_location: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          additional_context?: Json | null
          created_at?: string
          field_changed: string
          game_id: string
          id?: string
          is_bot?: boolean | null
          new_value?: boolean | null
          old_value?: boolean | null
          player_id: string
          reason: string
          source_location?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          additional_context?: Json | null
          created_at?: string
          field_changed?: string
          game_id?: string
          id?: string
          is_bot?: boolean | null
          new_value?: boolean | null
          old_value?: boolean | null
          player_id?: string
          reason?: string
          source_location?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      timing_debug_sessions: {
        Row: {
          app_route: string | null
          client_info: Json | null
          created_at: string
          duration_ms: number | null
          end_time: string | null
          events: Json
          id: string
          label: string
          snapshots: Json
          start_time: string
          user_id: string
        }
        Insert: {
          app_route?: string | null
          client_info?: Json | null
          created_at?: string
          duration_ms?: number | null
          end_time?: string | null
          events?: Json
          id?: string
          label?: string
          snapshots?: Json
          start_time: string
          user_id: string
        }
        Update: {
          app_route?: string | null
          client_info?: Json | null
          created_at?: string
          duration_ms?: number | null
          end_time?: string | null
          events?: Json
          id?: string
          label?: string
          snapshots?: Json
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      trace_sessions: {
        Row: {
          avg_duration_ms: number | null
          ended_at: string | null
          game_id: string | null
          id: string
          label: string | null
          slowest_operation_ms: number | null
          started_at: string
          total_operations: number | null
          user_id: string
        }
        Insert: {
          avg_duration_ms?: number | null
          ended_at?: string | null
          game_id?: string | null
          id?: string
          label?: string | null
          slowest_operation_ms?: number | null
          started_at?: string
          total_operations?: number | null
          user_id: string
        }
        Update: {
          avg_duration_ms?: number | null
          ended_at?: string | null
          game_id?: string | null
          id?: string
          label?: string | null
          slowest_operation_ms?: number | null
          started_at?: string
          total_operations?: number | null
          user_id?: string
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_horses_bot_controller: {
        Args: { _round_id: string }
        Returns: Json
      }
      decrement_player_chips: {
        Args: { amount: number; player_ids: string[] }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      horses_advance_turn: {
        Args: { _expected_current_player_id: string; _round_id: string }
        Returns: Json
      }
      horses_set_player_state: {
        Args: { _player_id: string; _round_id: string; _state: Json }
        Returns: Json
      }
      increment_player_chips: {
        Args: { p_amount: number; p_player_id: string }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      user_in_game: { Args: { game_id_param: string }; Returns: boolean }
      user_is_in_game: { Args: { game_id_param: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
