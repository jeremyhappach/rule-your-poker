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
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
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
      game_defaults: {
        Row: {
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
          updated_at: string
        }
        Insert: {
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
          updated_at?: string
        }
        Update: {
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
          updated_at?: string
        }
        Relationships: []
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
          session_ended_at?: string | null
          status?: string
          total_hands?: number | null
          updated_at?: string
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
      players: {
        Row: {
          ante_decision: string | null
          auto_ante: boolean
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
          card_back_design: string
          created_at: string
          deck_color_mode: string
          id: string
          is_active: boolean
          is_superuser: boolean
          table_layout: string
          username: string
        }
        Insert: {
          card_back_design?: string
          created_at?: string
          deck_color_mode?: string
          id: string
          is_active?: boolean
          is_superuser?: boolean
          table_layout?: string
          username: string
        }
        Update: {
          card_back_design?: string
          created_at?: string
          deck_color_mode?: string
          id?: string
          is_active?: boolean
          is_superuser?: boolean
          table_layout?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_in_game: { Args: { game_id_param: string }; Returns: boolean }
      user_is_in_game: { Args: { game_id_param: string }; Returns: boolean }
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
