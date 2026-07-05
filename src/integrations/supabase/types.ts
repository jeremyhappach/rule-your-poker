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
      chat_message_delivery_trace: {
        Row: {
          authoritative_row_at: string | null
          correlation_id: string | null
          created_at: string
          db_insert_failure_at: string | null
          db_insert_start_at: string | null
          db_insert_success_at: string | null
          dealer_game_id: string | null
          delivery_status: string | null
          failure_reason: string | null
          game_id: string | null
          id: string
          is_voice: boolean
          message_id: string
          optimistic_created_at: string | null
          payload: Json | null
          realtime_broadcast_at: string | null
          recipient_ack_source: string | null
          recipient_client_instance_id: string
          recipient_device_label: string | null
          recipient_dom_mount_at: string | null
          recipient_icon_pulse_at: string | null
          recipient_panel_selector_at: string | null
          recipient_persistent_unread_at: string | null
          recipient_read_at: string | null
          recipient_realtime_receipt_at: string | null
          recipient_store_admission_at: string | null
          recipient_tab_session_id: string | null
          recipient_unread_evaluated_at: string | null
          recipient_user_id: string | null
          render_status: string | null
          send_intent_at: string | null
          sender_client_instance_id: string | null
          sender_device_label: string | null
          sender_tab_session_id: string | null
          sender_user_id: string | null
          session_id: string | null
          source_type: string | null
          table_id: string | null
          unread_status: string | null
          updated_at: string
          voice_operation_id: string | null
        }
        Insert: {
          authoritative_row_at?: string | null
          correlation_id?: string | null
          created_at?: string
          db_insert_failure_at?: string | null
          db_insert_start_at?: string | null
          db_insert_success_at?: string | null
          dealer_game_id?: string | null
          delivery_status?: string | null
          failure_reason?: string | null
          game_id?: string | null
          id?: string
          is_voice?: boolean
          message_id: string
          optimistic_created_at?: string | null
          payload?: Json | null
          realtime_broadcast_at?: string | null
          recipient_ack_source?: string | null
          recipient_client_instance_id: string
          recipient_device_label?: string | null
          recipient_dom_mount_at?: string | null
          recipient_icon_pulse_at?: string | null
          recipient_panel_selector_at?: string | null
          recipient_persistent_unread_at?: string | null
          recipient_read_at?: string | null
          recipient_realtime_receipt_at?: string | null
          recipient_store_admission_at?: string | null
          recipient_tab_session_id?: string | null
          recipient_unread_evaluated_at?: string | null
          recipient_user_id?: string | null
          render_status?: string | null
          send_intent_at?: string | null
          sender_client_instance_id?: string | null
          sender_device_label?: string | null
          sender_tab_session_id?: string | null
          sender_user_id?: string | null
          session_id?: string | null
          source_type?: string | null
          table_id?: string | null
          unread_status?: string | null
          updated_at?: string
          voice_operation_id?: string | null
        }
        Update: {
          authoritative_row_at?: string | null
          correlation_id?: string | null
          created_at?: string
          db_insert_failure_at?: string | null
          db_insert_start_at?: string | null
          db_insert_success_at?: string | null
          dealer_game_id?: string | null
          delivery_status?: string | null
          failure_reason?: string | null
          game_id?: string | null
          id?: string
          is_voice?: boolean
          message_id?: string
          optimistic_created_at?: string | null
          payload?: Json | null
          realtime_broadcast_at?: string | null
          recipient_ack_source?: string | null
          recipient_client_instance_id?: string
          recipient_device_label?: string | null
          recipient_dom_mount_at?: string | null
          recipient_icon_pulse_at?: string | null
          recipient_panel_selector_at?: string | null
          recipient_persistent_unread_at?: string | null
          recipient_read_at?: string | null
          recipient_realtime_receipt_at?: string | null
          recipient_store_admission_at?: string | null
          recipient_tab_session_id?: string | null
          recipient_unread_evaluated_at?: string | null
          recipient_user_id?: string | null
          render_status?: string | null
          send_intent_at?: string | null
          sender_client_instance_id?: string | null
          sender_device_label?: string | null
          sender_tab_session_id?: string | null
          sender_user_id?: string | null
          session_id?: string | null
          source_type?: string | null
          table_id?: string | null
          unread_status?: string | null
          updated_at?: string
          voice_operation_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          chat_operation_id: string | null
          created_at: string
          game_id: string
          id: string
          image_url: string | null
          message: string
          user_id: string
        }
        Insert: {
          chat_operation_id?: string | null
          created_at?: string
          game_id: string
          id?: string
          image_url?: string | null
          message: string
          user_id: string
        }
        Update: {
          chat_operation_id?: string | null
          created_at?: string
          game_id?: string
          id?: string
          image_url?: string | null
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_operation_id_fkey"
            columns: ["chat_operation_id"]
            isOneToOne: false
            referencedRelation: "chat_send_operations"
            referencedColumns: ["operation_id"]
          },
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
      chat_operation_reports: {
        Row: {
          created_at: string
          finalized_at: string
          game_id: string
          id: string
          operation_id: string
          report_json: Json
          report_text: string
          sender_user_id: string | null
          session_id: string
          terminal_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string
          game_id: string
          id?: string
          operation_id: string
          report_json?: Json
          report_text: string
          sender_user_id?: string | null
          session_id: string
          terminal_status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string
          game_id?: string
          id?: string
          operation_id?: string
          report_json?: Json
          report_text?: string
          sender_user_id?: string | null
          session_id?: string
          terminal_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_operation_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_operation_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "chat_send_operations"
            referencedColumns: ["operation_id"]
          },
        ]
      }
      chat_send_operations: {
        Row: {
          active_game_component: string | null
          active_tab: string | null
          boundary_events: Json
          canonical_shell_game_id: string | null
          completed_at: string | null
          created_at: string
          current_turn_player_id: string | null
          dealer_game_id: string | null
          game_controller_present: boolean | null
          game_id: string
          game_type_source: string | null
          id: string
          last_peer_heartbeat_at: string | null
          last_sender_event_at: string | null
          last_sender_heartbeat_at: string | null
          local_turn_eligible: boolean | null
          message_id: string | null
          message_preview: string | null
          operation_game_id: string | null
          operation_id: string
          operation_type: string
          optimistic_message_id: string | null
          origin_surface: string | null
          peer_milestones: Json
          raw_game_type: string | null
          recovery_correlations: Json
          report_status: string
          resolved_game_type: string | null
          route: string
          route_game_id: string | null
          sender_client_instance_id: string | null
          sender_milestones: Json
          sender_tab_session_id: string | null
          sender_user_id: string | null
          session_id: string
          shell_phase: string | null
          source_kind: string
          started_at: string
          status: string
          tab_attention_snapshots: Json
          tab_bar_render_key: string | null
          terminal_reason: string | null
          terminal_status: string | null
          updated_at: string
          violations: Json
          waiting_table_component: string | null
        }
        Insert: {
          active_game_component?: string | null
          active_tab?: string | null
          boundary_events?: Json
          canonical_shell_game_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_turn_player_id?: string | null
          dealer_game_id?: string | null
          game_controller_present?: boolean | null
          game_id: string
          game_type_source?: string | null
          id?: string
          last_peer_heartbeat_at?: string | null
          last_sender_event_at?: string | null
          last_sender_heartbeat_at?: string | null
          local_turn_eligible?: boolean | null
          message_id?: string | null
          message_preview?: string | null
          operation_game_id?: string | null
          operation_id: string
          operation_type?: string
          optimistic_message_id?: string | null
          origin_surface?: string | null
          peer_milestones?: Json
          raw_game_type?: string | null
          recovery_correlations?: Json
          report_status?: string
          resolved_game_type?: string | null
          route: string
          route_game_id?: string | null
          sender_client_instance_id?: string | null
          sender_milestones?: Json
          sender_tab_session_id?: string | null
          sender_user_id?: string | null
          session_id: string
          shell_phase?: string | null
          source_kind?: string
          started_at?: string
          status?: string
          tab_attention_snapshots?: Json
          tab_bar_render_key?: string | null
          terminal_reason?: string | null
          terminal_status?: string | null
          updated_at?: string
          violations?: Json
          waiting_table_component?: string | null
        }
        Update: {
          active_game_component?: string | null
          active_tab?: string | null
          boundary_events?: Json
          canonical_shell_game_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_turn_player_id?: string | null
          dealer_game_id?: string | null
          game_controller_present?: boolean | null
          game_id?: string
          game_type_source?: string | null
          id?: string
          last_peer_heartbeat_at?: string | null
          last_sender_event_at?: string | null
          last_sender_heartbeat_at?: string | null
          local_turn_eligible?: boolean | null
          message_id?: string | null
          message_preview?: string | null
          operation_game_id?: string | null
          operation_id?: string
          operation_type?: string
          optimistic_message_id?: string | null
          origin_surface?: string | null
          peer_milestones?: Json
          raw_game_type?: string | null
          recovery_correlations?: Json
          report_status?: string
          resolved_game_type?: string | null
          route?: string
          route_game_id?: string | null
          sender_client_instance_id?: string | null
          sender_milestones?: Json
          sender_tab_session_id?: string | null
          sender_user_id?: string | null
          session_id?: string
          shell_phase?: string | null
          source_kind?: string
          started_at?: string
          status?: string
          tab_attention_snapshots?: Json
          tab_bar_render_key?: string | null
          terminal_reason?: string | null
          terminal_status?: string | null
          updated_at?: string
          violations?: Json
          waiting_table_component?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_send_operations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
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
      client_runtime_event_outbox: {
        Row: {
          attempts: number
          client_instance_id: string
          correlation_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          error_name: string | null
          event_family: string
          event_name: string
          event_row: Json
          failed_at: string | null
          id: string
          severity: string | null
          status: string
          tab_session_id: string | null
          transport: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_instance_id: string
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          error_name?: string | null
          event_family: string
          event_name: string
          event_row: Json
          failed_at?: string | null
          id?: string
          severity?: string | null
          status?: string
          tab_session_id?: string | null
          transport?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_instance_id?: string
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          error_name?: string | null
          event_family?: string
          event_name?: string
          event_row?: Json
          failed_at?: string | null
          id?: string
          severity?: string | null
          status?: string
          tab_session_id?: string | null
          transport?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_runtime_events: {
        Row: {
          active_tab: string | null
          client_instance_id: string
          correlation_id: string | null
          created_at: string
          dealer_game_id: string | null
          error_message: string | null
          error_name: string | null
          error_stack: string | null
          event_family: string
          event_name: string
          game_id: string | null
          game_status: string | null
          game_type: string | null
          id: string
          is_committed_active_session: boolean | null
          message_id: string | null
          occurred_at_client: string | null
          occurred_at_server: string
          online_state: boolean | null
          payload: Json | null
          route: string | null
          session_id: string | null
          severity: string
          tab_session_id: string | null
          table_id: string | null
          user_id: string | null
          visibility_state: string | null
          voice_operation_id: string | null
        }
        Insert: {
          active_tab?: string | null
          client_instance_id: string
          correlation_id?: string | null
          created_at?: string
          dealer_game_id?: string | null
          error_message?: string | null
          error_name?: string | null
          error_stack?: string | null
          event_family: string
          event_name: string
          game_id?: string | null
          game_status?: string | null
          game_type?: string | null
          id?: string
          is_committed_active_session?: boolean | null
          message_id?: string | null
          occurred_at_client?: string | null
          occurred_at_server?: string
          online_state?: boolean | null
          payload?: Json | null
          route?: string | null
          session_id?: string | null
          severity?: string
          tab_session_id?: string | null
          table_id?: string | null
          user_id?: string | null
          visibility_state?: string | null
          voice_operation_id?: string | null
        }
        Update: {
          active_tab?: string | null
          client_instance_id?: string
          correlation_id?: string | null
          created_at?: string
          dealer_game_id?: string | null
          error_message?: string | null
          error_name?: string | null
          error_stack?: string | null
          event_family?: string
          event_name?: string
          game_id?: string | null
          game_status?: string | null
          game_type?: string | null
          id?: string
          is_committed_active_session?: boolean | null
          message_id?: string | null
          occurred_at_client?: string | null
          occurred_at_server?: string
          online_state?: boolean | null
          payload?: Json | null
          route?: string | null
          session_id?: string | null
          severity?: string
          tab_session_id?: string | null
          table_id?: string | null
          user_id?: string | null
          visibility_state?: string | null
          voice_operation_id?: string | null
        }
        Relationships: []
      }
      client_runtime_incident_reports: {
        Row: {
          acknowledged_at: string | null
          auth_findings: Json | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          data_completeness: Json | null
          event_count: number
          first_event: Json | null
          id: string
          incident_row_id: string | null
          last_capsule_event: Json | null
          last_confirmed_local_event: Json | null
          last_generated_reason: string | null
          last_incident_patch: Json | null
          last_instance_heartbeat: Json | null
          last_outbox_result: Json | null
          last_server_event: Json | null
          lifecycle_findings: Json | null
          missing_boundaries: Json | null
          narrative: string | null
          network_findings: Json | null
          original_client_instance_id: string | null
          original_origin: string | null
          original_route: string | null
          original_tab_session_id: string | null
          outbox_count: number
          outcome: Json | null
          recovery_client_instance_id: string | null
          recovery_origin: string | null
          recovery_route: string | null
          recovery_status: Json | null
          recovery_tab_session_id: string | null
          report_status: string
          route_findings: Json | null
          session_findings: Json | null
          timeline: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          auth_findings?: Json | null
          completed_at?: string | null
          correlation_id: string
          created_at?: string
          data_completeness?: Json | null
          event_count?: number
          first_event?: Json | null
          id?: string
          incident_row_id?: string | null
          last_capsule_event?: Json | null
          last_confirmed_local_event?: Json | null
          last_generated_reason?: string | null
          last_incident_patch?: Json | null
          last_instance_heartbeat?: Json | null
          last_outbox_result?: Json | null
          last_server_event?: Json | null
          lifecycle_findings?: Json | null
          missing_boundaries?: Json | null
          narrative?: string | null
          network_findings?: Json | null
          original_client_instance_id?: string | null
          original_origin?: string | null
          original_route?: string | null
          original_tab_session_id?: string | null
          outbox_count?: number
          outcome?: Json | null
          recovery_client_instance_id?: string | null
          recovery_origin?: string | null
          recovery_route?: string | null
          recovery_status?: Json | null
          recovery_tab_session_id?: string | null
          report_status?: string
          route_findings?: Json | null
          session_findings?: Json | null
          timeline?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          auth_findings?: Json | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          data_completeness?: Json | null
          event_count?: number
          first_event?: Json | null
          id?: string
          incident_row_id?: string | null
          last_capsule_event?: Json | null
          last_confirmed_local_event?: Json | null
          last_generated_reason?: string | null
          last_incident_patch?: Json | null
          last_instance_heartbeat?: Json | null
          last_outbox_result?: Json | null
          last_server_event?: Json | null
          lifecycle_findings?: Json | null
          missing_boundaries?: Json | null
          narrative?: string | null
          network_findings?: Json | null
          original_client_instance_id?: string | null
          original_origin?: string | null
          original_route?: string | null
          original_tab_session_id?: string | null
          outbox_count?: number
          outcome?: Json | null
          recovery_client_instance_id?: string | null
          recovery_origin?: string | null
          recovery_route?: string | null
          recovery_status?: Json | null
          recovery_tab_session_id?: string | null
          report_status?: string
          route_findings?: Json | null
          session_findings?: Json | null
          timeline?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      client_runtime_incidents: {
        Row: {
          app_build_id: string | null
          app_publish_version: string | null
          breadcrumb_event_ids: Json | null
          client_instance_id: string | null
          correlation_id: string | null
          created_at: string
          dealer_game_id: string | null
          detected_at: string
          event_sequence: number
          game_id: string | null
          id: string
          incident_type: string
          kind: string | null
          last_error_message: string | null
          last_error_name: string | null
          last_event_at: string | null
          last_lifecycle_event: string | null
          last_local_capsule_sequence: number | null
          last_route: string | null
          last_visibility_state: string | null
          last_voice_phase: string | null
          message_id: string | null
          network_lost_observed: boolean | null
          origin: string | null
          payload: Json | null
          recovered_from_local_capsule: boolean | null
          recovery_upload_completed_at: string | null
          resolved_at: string | null
          root_cause_status: string | null
          route: string | null
          session_id: string | null
          severity: string
          started_at: string | null
          status: string
          summary: string | null
          tab_session_id: string | null
          table_id: string | null
          updated_at: string
          user_id: string | null
          voice_operation_id: string | null
        }
        Insert: {
          app_build_id?: string | null
          app_publish_version?: string | null
          breadcrumb_event_ids?: Json | null
          client_instance_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dealer_game_id?: string | null
          detected_at?: string
          event_sequence?: number
          game_id?: string | null
          id?: string
          incident_type: string
          kind?: string | null
          last_error_message?: string | null
          last_error_name?: string | null
          last_event_at?: string | null
          last_lifecycle_event?: string | null
          last_local_capsule_sequence?: number | null
          last_route?: string | null
          last_visibility_state?: string | null
          last_voice_phase?: string | null
          message_id?: string | null
          network_lost_observed?: boolean | null
          origin?: string | null
          payload?: Json | null
          recovered_from_local_capsule?: boolean | null
          recovery_upload_completed_at?: string | null
          resolved_at?: string | null
          root_cause_status?: string | null
          route?: string | null
          session_id?: string | null
          severity?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          tab_session_id?: string | null
          table_id?: string | null
          updated_at?: string
          user_id?: string | null
          voice_operation_id?: string | null
        }
        Update: {
          app_build_id?: string | null
          app_publish_version?: string | null
          breadcrumb_event_ids?: Json | null
          client_instance_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dealer_game_id?: string | null
          detected_at?: string
          event_sequence?: number
          game_id?: string | null
          id?: string
          incident_type?: string
          kind?: string | null
          last_error_message?: string | null
          last_error_name?: string | null
          last_event_at?: string | null
          last_lifecycle_event?: string | null
          last_local_capsule_sequence?: number | null
          last_route?: string | null
          last_visibility_state?: string | null
          last_voice_phase?: string | null
          message_id?: string | null
          network_lost_observed?: boolean | null
          origin?: string | null
          payload?: Json | null
          recovered_from_local_capsule?: boolean | null
          recovery_upload_completed_at?: string | null
          resolved_at?: string | null
          root_cause_status?: string | null
          route?: string | null
          session_id?: string | null
          severity?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          tab_session_id?: string | null
          table_id?: string | null
          updated_at?: string
          user_id?: string | null
          voice_operation_id?: string | null
        }
        Relationships: []
      }
      client_runtime_instances: {
        Row: {
          active_incident_id: string | null
          app_build_id: string | null
          app_publish_version: string | null
          browser: string | null
          browser_version: string | null
          client_instance_id: string
          created_at: string
          device_label: string | null
          device_type: string | null
          display_name: string | null
          document_was_discarded: boolean | null
          id: string
          last_committed_session_id: string | null
          last_dealer_game_id: string | null
          last_game_id: string | null
          last_known_chat_tab_state: string | null
          last_lifecycle_event: string | null
          last_online_state: boolean | null
          last_route: string | null
          last_seen_at: string
          last_table_id: string | null
          last_visibility_state: string | null
          origin: string | null
          os: string | null
          os_version: string | null
          tab_session_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          active_incident_id?: string | null
          app_build_id?: string | null
          app_publish_version?: string | null
          browser?: string | null
          browser_version?: string | null
          client_instance_id: string
          created_at?: string
          device_label?: string | null
          device_type?: string | null
          display_name?: string | null
          document_was_discarded?: boolean | null
          id?: string
          last_committed_session_id?: string | null
          last_dealer_game_id?: string | null
          last_game_id?: string | null
          last_known_chat_tab_state?: string | null
          last_lifecycle_event?: string | null
          last_online_state?: boolean | null
          last_route?: string | null
          last_seen_at?: string
          last_table_id?: string | null
          last_visibility_state?: string | null
          origin?: string | null
          os?: string | null
          os_version?: string | null
          tab_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          active_incident_id?: string | null
          app_build_id?: string | null
          app_publish_version?: string | null
          browser?: string | null
          browser_version?: string | null
          client_instance_id?: string
          created_at?: string
          device_label?: string | null
          device_type?: string | null
          display_name?: string | null
          document_was_discarded?: boolean | null
          id?: string
          last_committed_session_id?: string | null
          last_dealer_game_id?: string | null
          last_game_id?: string | null
          last_known_chat_tab_state?: string | null
          last_lifecycle_event?: string | null
          last_online_state?: boolean | null
          last_route?: string | null
          last_seen_at?: string
          last_table_id?: string | null
          last_visibility_state?: string | null
          origin?: string | null
          os?: string | null
          os_version?: string | null
          tab_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cribbage_events: {
        Row: {
          card_played: Json | null
          cards_involved: Json
          cards_on_table: Json | null
          created_at: string
          dealer_game_id: string | null
          event_subtype: string
          event_type: string
          hand_number: number
          id: string
          player_id: string
          points: number
          round_id: string
          running_count: number | null
          scores_after: Json
          sequence_number: number
        }
        Insert: {
          card_played?: Json | null
          cards_involved?: Json
          cards_on_table?: Json | null
          created_at?: string
          dealer_game_id?: string | null
          event_subtype?: string
          event_type: string
          hand_number?: number
          id?: string
          player_id: string
          points?: number
          round_id: string
          running_count?: number | null
          scores_after?: Json
          sequence_number?: number
        }
        Update: {
          card_played?: Json | null
          cards_involved?: Json
          cards_on_table?: Json | null
          created_at?: string
          dealer_game_id?: string | null
          event_subtype?: string
          event_type?: string
          hand_number?: number
          id?: string
          player_id?: string
          points?: number
          round_id?: string
          running_count?: number | null
          scores_after?: Json
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cribbage_events_dealer_game_id_fkey"
            columns: ["dealer_game_id"]
            isOneToOne: false
            referencedRelation: "dealer_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cribbage_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      cribbage_hand_archive: {
        Row: {
          archived_at: string
          crib: Json | null
          cribbage_state: Json
          cut_card: Json | null
          dealer_game_id: string
          dealer_player_id: string | null
          dealt_hands: Json
          game_id: string
          hand_counts: Json
          hand_number: number
          id: string
          peg_scores: Json
          round_id: string | null
        }
        Insert: {
          archived_at?: string
          crib?: Json | null
          cribbage_state: Json
          cut_card?: Json | null
          dealer_game_id: string
          dealer_player_id?: string | null
          dealt_hands?: Json
          game_id: string
          hand_counts?: Json
          hand_number: number
          id?: string
          peg_scores?: Json
          round_id?: string | null
        }
        Update: {
          archived_at?: string
          crib?: Json | null
          cribbage_state?: Json
          cut_card?: Json | null
          dealer_game_id?: string
          dealer_player_id?: string | null
          dealt_hands?: Json
          game_id?: string
          hand_counts?: Json
          hand_number?: number
          id?: string
          peg_scores?: Json
          round_id?: string | null
        }
        Relationships: []
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
      dealer_games: {
        Row: {
          config: Json
          created_at: string
          dealer_user_id: string
          game_type: string
          id: string
          session_id: string
          started_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dealer_user_id: string
          game_type: string
          id?: string
          session_id: string
          started_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dealer_user_id?: string
          game_type?: string
          id?: string
          session_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_games_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_events: {
        Row: {
          client_role: string | null
          created_at: string
          event_type: string
          game_id: string | null
          id: string
          payload: Json
          round_id: string | null
          user_id: string | null
        }
        Insert: {
          client_role?: string | null
          created_at?: string
          event_type: string
          game_id?: string | null
          id?: string
          payload?: Json
          round_id?: string | null
          user_id?: string | null
        }
        Update: {
          client_role?: string | null
          created_at?: string
          event_type?: string
          game_id?: string | null
          id?: string
          payload?: Json
          round_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      debug_sync_events: {
        Row: {
          created_at: string
          event_name: string
          event_type: string
          game_id: string
          game_type: string
          hand_number: number
          id: string
          payload: Json
          round_id: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          event_name: string
          event_type: string
          game_id: string
          game_type: string
          hand_number?: number
          id?: string
          payload?: Json
          round_id?: string | null
          severity?: string
        }
        Update: {
          created_at?: string
          event_name?: string
          event_type?: string
          game_id?: string
          game_type?: string
          hand_number?: number
          id?: string
          payload?: Json
          round_id?: string | null
          severity?: string
        }
        Relationships: []
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
      dice_trace_samples: {
        Row: {
          cache_key: string | null
          container_h: number | null
          container_w: number | null
          created_at: string
          die_index: number
          die_is_held: boolean
          die_is_held_in_layout: boolean | null
          die_value: number | null
          extra: Json
          frame_seq: number
          h: number | null
          id: number
          is_animating_fly_in: boolean | null
          is_observer: boolean | null
          is_rolling: boolean | null
          roll_key: string | null
          session_id: string
          t_ms: number
          w: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          cache_key?: string | null
          container_h?: number | null
          container_w?: number | null
          created_at?: string
          die_index: number
          die_is_held: boolean
          die_is_held_in_layout?: boolean | null
          die_value?: number | null
          extra?: Json
          frame_seq: number
          h?: number | null
          id?: number
          is_animating_fly_in?: boolean | null
          is_observer?: boolean | null
          is_rolling?: boolean | null
          roll_key?: string | null
          session_id: string
          t_ms: number
          w?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          cache_key?: string | null
          container_h?: number | null
          container_w?: number | null
          created_at?: string
          die_index?: number
          die_is_held?: boolean
          die_is_held_in_layout?: boolean | null
          die_value?: number | null
          extra?: Json
          frame_seq?: number
          h?: number | null
          id?: number
          is_animating_fly_in?: boolean | null
          is_observer?: boolean | null
          is_rolling?: boolean | null
          roll_key?: string | null
          session_id?: string
          t_ms?: number
          w?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dice_trace_samples_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dice_trace_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dice_trace_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          game_id: string | null
          id: string
          label: string | null
          round_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          game_id?: string | null
          id?: string
          label?: string | null
          round_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          game_id?: string | null
          id?: string
          label?: string | null
          round_id?: string | null
          user_id?: string
        }
        Relationships: []
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
          debug_harness: string
          decision_timer_seconds: number
          double_skunk_enabled: boolean
          double_skunk_threshold: number
          game_type: string
          gin_bonus: number
          id: string
          leg_value: number
          legs_to_win: number
          per_point_value: number
          points_to_win: number
          pot_max_enabled: boolean
          pot_max_value: number
          pussy_tax_enabled: boolean
          pussy_tax_value: number
          rabbit_hunt: boolean
          real_money: boolean
          reveal_at_showdown: boolean
          skunk_enabled: boolean
          skunk_threshold: number
          timeout_action: string
          timeout_enforcement_enabled: boolean
          undercut_bonus: number
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
          debug_harness?: string
          decision_timer_seconds?: number
          double_skunk_enabled?: boolean
          double_skunk_threshold?: number
          game_type: string
          gin_bonus?: number
          id?: string
          leg_value?: number
          legs_to_win?: number
          per_point_value?: number
          points_to_win?: number
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          skunk_enabled?: boolean
          skunk_threshold?: number
          timeout_action?: string
          timeout_enforcement_enabled?: boolean
          undercut_bonus?: number
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
          debug_harness?: string
          decision_timer_seconds?: number
          double_skunk_enabled?: boolean
          double_skunk_threshold?: number
          game_type?: string
          gin_bonus?: number
          id?: string
          leg_value?: number
          legs_to_win?: number
          per_point_value?: number
          points_to_win?: number
          pot_max_enabled?: boolean
          pot_max_value?: number
          pussy_tax_enabled?: boolean
          pussy_tax_value?: number
          rabbit_hunt?: boolean
          real_money?: boolean
          reveal_at_showdown?: boolean
          skunk_enabled?: boolean
          skunk_threshold?: number
          timeout_action?: string
          timeout_enforcement_enabled?: boolean
          undercut_bonus?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_results: {
        Row: {
          created_at: string
          dealer_game_id: string | null
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
          dealer_game_id?: string | null
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
          dealer_game_id?: string | null
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
            foreignKeyName: "fk_game_results_dealer_game"
            columns: ["dealer_game_id"]
            isOneToOne: false
            referencedRelation: "dealer_games"
            referencedColumns: ["id"]
          },
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
      game_state_debug_log: {
        Row: {
          all_decisions_in: boolean | null
          auto_fold: boolean | null
          created_at: string
          current_round: number | null
          deadline_expired: boolean | null
          dealer_game_id: string | null
          decision_locked: boolean | null
          details: Json | null
          event_type: string
          game_id: string
          game_status: string | null
          id: string
          player_decision: string | null
          player_id: string | null
          round_id: string | null
          round_status: string | null
          source_location: string | null
          total_hands: number | null
        }
        Insert: {
          all_decisions_in?: boolean | null
          auto_fold?: boolean | null
          created_at?: string
          current_round?: number | null
          deadline_expired?: boolean | null
          dealer_game_id?: string | null
          decision_locked?: boolean | null
          details?: Json | null
          event_type: string
          game_id: string
          game_status?: string | null
          id?: string
          player_decision?: string | null
          player_id?: string | null
          round_id?: string | null
          round_status?: string | null
          source_location?: string | null
          total_hands?: number | null
        }
        Update: {
          all_decisions_in?: boolean | null
          auto_fold?: boolean | null
          created_at?: string
          current_round?: number | null
          deadline_expired?: boolean | null
          dealer_game_id?: string | null
          decision_locked?: boolean | null
          details?: Json | null
          event_type?: string
          game_id?: string
          game_status?: string | null
          id?: string
          player_decision?: string | null
          player_id?: string | null
          round_id?: string | null
          round_status?: string | null
          source_location?: string | null
          total_hands?: number | null
        }
        Relationships: []
      }
      games: {
        Row: {
          all_decisions_in: boolean | null
          all_decisions_in_round_id: string | null
          ante_amount: number
          ante_decision_deadline: string | null
          ante_decision_timer_seconds: number
          awaiting_next_round: boolean | null
          buck_position: number | null
          buck_transfer_presentation: Json | null
          buy_in: number
          chucky_cards: number | null
          config_complete: boolean
          config_deadline: string | null
          created_at: string
          current_game_uuid: string | null
          current_host: string | null
          current_round: number | null
          dealer_position: number | null
          dealer_selection_state: Json | null
          double_skunk_enabled: boolean | null
          double_skunk_threshold: number | null
          game_over_at: string | null
          game_setup_timer_seconds: number
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
          points_to_win: number | null
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
          skunk_enabled: boolean | null
          skunk_threshold: number | null
          status: string
          timeout_action: string | null
          timeout_enforcement_enabled: boolean | null
          total_hands: number | null
          updated_at: string
        }
        Insert: {
          all_decisions_in?: boolean | null
          all_decisions_in_round_id?: string | null
          ante_amount?: number
          ante_decision_deadline?: string | null
          ante_decision_timer_seconds?: number
          awaiting_next_round?: boolean | null
          buck_position?: number | null
          buck_transfer_presentation?: Json | null
          buy_in?: number
          chucky_cards?: number | null
          config_complete?: boolean
          config_deadline?: string | null
          created_at?: string
          current_game_uuid?: string | null
          current_host?: string | null
          current_round?: number | null
          dealer_position?: number | null
          dealer_selection_state?: Json | null
          double_skunk_enabled?: boolean | null
          double_skunk_threshold?: number | null
          game_over_at?: string | null
          game_setup_timer_seconds?: number
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
          points_to_win?: number | null
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
          skunk_enabled?: boolean | null
          skunk_threshold?: number | null
          status?: string
          timeout_action?: string | null
          timeout_enforcement_enabled?: boolean | null
          total_hands?: number | null
          updated_at?: string
        }
        Update: {
          all_decisions_in?: boolean | null
          all_decisions_in_round_id?: string | null
          ante_amount?: number
          ante_decision_deadline?: string | null
          ante_decision_timer_seconds?: number
          awaiting_next_round?: boolean | null
          buck_position?: number | null
          buck_transfer_presentation?: Json | null
          buy_in?: number
          chucky_cards?: number | null
          config_complete?: boolean
          config_deadline?: string | null
          created_at?: string
          current_game_uuid?: string | null
          current_host?: string | null
          current_round?: number | null
          dealer_position?: number | null
          dealer_selection_state?: Json | null
          double_skunk_enabled?: boolean | null
          double_skunk_threshold?: number | null
          game_over_at?: string | null
          game_setup_timer_seconds?: number
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
          points_to_win?: number | null
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
          skunk_enabled?: boolean | null
          skunk_threshold?: number | null
          status?: string
          timeout_action?: string | null
          timeout_enforcement_enabled?: boolean | null
          total_hands?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      geometry_overrides: {
        Row: {
          anchor_origin: string | null
          anchor_x: number | null
          anchor_y: number | null
          artifact_id: string
          aspect_ratio: number | null
          created_at: string
          game: string
          height_pct: number | null
          size_mode: string
          updated_at: string
          updated_by: string | null
          width_pct: number | null
        }
        Insert: {
          anchor_origin?: string | null
          anchor_x?: number | null
          anchor_y?: number | null
          artifact_id: string
          aspect_ratio?: number | null
          created_at?: string
          game: string
          height_pct?: number | null
          size_mode?: string
          updated_at?: string
          updated_by?: string | null
          width_pct?: number | null
        }
        Update: {
          anchor_origin?: string | null
          anchor_x?: number | null
          anchor_y?: number | null
          artifact_id?: string
          aspect_ratio?: number | null
          created_at?: string
          game?: string
          height_pct?: number | null
          size_mode?: string
          updated_at?: string
          updated_by?: string | null
          width_pct?: number | null
        }
        Relationships: []
      }
      insert_audit_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          operation: string
          record_id: string
          success: boolean
          table_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          operation?: string
          record_id: string
          success?: boolean
          table_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          operation?: string
          record_id?: string
          success?: boolean
          table_name?: string
        }
        Relationships: []
      }
      network_sim_events: {
        Row: {
          actual_delivery_ts: string | null
          created_at: string
          delay_ms: number | null
          event_type: string
          game_id: string | null
          hand_number: number | null
          id: string
          original_receive_ts: string | null
          round_id: string | null
          sim_mode: string
          source: string | null
          summary: Json
          user_id: string
        }
        Insert: {
          actual_delivery_ts?: string | null
          created_at?: string
          delay_ms?: number | null
          event_type: string
          game_id?: string | null
          hand_number?: number | null
          id?: string
          original_receive_ts?: string | null
          round_id?: string | null
          sim_mode: string
          source?: string | null
          summary?: Json
          user_id: string
        }
        Update: {
          actual_delivery_ts?: string | null
          created_at?: string
          delay_ms?: number | null
          event_type?: string
          game_id?: string | null
          hand_number?: number | null
          id?: string
          original_receive_ts?: string | null
          round_id?: string | null
          sim_mode?: string
          source?: string | null
          summary?: Json
          user_id?: string
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
          hand_context_id: string | null
          id: string
          is_public: boolean
          player_id: string
          round_id: string
          source_version: number
          visible_to_user_ids: string[] | null
        }
        Insert: {
          cards?: Json
          created_at?: string
          hand_context_id?: string | null
          id?: string
          is_public?: boolean
          player_id: string
          round_id: string
          source_version?: number
          visible_to_user_ids?: string[] | null
        }
        Update: {
          cards?: Json
          created_at?: string
          hand_context_id?: string | null
          id?: string
          is_public?: boolean
          player_id?: string
          round_id?: string
          source_version?: number
          visible_to_user_ids?: string[] | null
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
          auto_ante_runback: boolean
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
          auto_ante_runback?: boolean
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
          auto_ante_runback?: boolean
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
          mute_dealer_chat: boolean
          network_sim_logging: boolean
          network_sim_mode: string
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
          mute_dealer_chat?: boolean
          network_sim_logging?: boolean
          network_sim_mode?: string
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
          mute_dealer_chat?: boolean
          network_sim_logging?: boolean
          network_sim_mode?: string
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
          cribbage_state: Json | null
          current_turn_position: number | null
          dealer_game_id: string | null
          decision_deadline: string | null
          game_id: string
          gin_rummy_state: Json | null
          hand_number: number | null
          horses_state: Json | null
          id: string
          pending_turn_position: number | null
          pot: number | null
          predecessor_round_id: string | null
          presentation_fallback_at: string | null
          presentation_generation: number
          round_number: number
          status: string
          yahtzee_state: Json | null
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
          cribbage_state?: Json | null
          current_turn_position?: number | null
          dealer_game_id?: string | null
          decision_deadline?: string | null
          game_id: string
          gin_rummy_state?: Json | null
          hand_number?: number | null
          horses_state?: Json | null
          id?: string
          pending_turn_position?: number | null
          pot?: number | null
          predecessor_round_id?: string | null
          presentation_fallback_at?: string | null
          presentation_generation?: number
          round_number: number
          status?: string
          yahtzee_state?: Json | null
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
          cribbage_state?: Json | null
          current_turn_position?: number | null
          dealer_game_id?: string | null
          decision_deadline?: string | null
          game_id?: string
          gin_rummy_state?: Json | null
          hand_number?: number | null
          horses_state?: Json | null
          id?: string
          pending_turn_position?: number | null
          pot?: number | null
          predecessor_round_id?: string | null
          presentation_fallback_at?: string | null
          presentation_generation?: number
          round_number?: number
          status?: string
          yahtzee_state?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_dealer_game_id_fkey"
            columns: ["dealer_game_id"]
            isOneToOne: false
            referencedRelation: "dealer_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_predecessor_round_id_fkey"
            columns: ["predecessor_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
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
      visual_bug_reports: {
        Row: {
          active_tab: string | null
          bug_label: string
          bug_type: string
          build_meta: Json
          created_at: string
          current_turn_player_id: string | null
          dealer_game_id: string | null
          extra_context: Json
          game_id: string
          hand_number: number | null
          id: string
          note: string | null
          phase: string | null
          platform_info: Json
          reporter_user_id: string
          round_id: string | null
          viewer_player_id: string | null
        }
        Insert: {
          active_tab?: string | null
          bug_label: string
          bug_type: string
          build_meta?: Json
          created_at?: string
          current_turn_player_id?: string | null
          dealer_game_id?: string | null
          extra_context?: Json
          game_id: string
          hand_number?: number | null
          id?: string
          note?: string | null
          phase?: string | null
          platform_info?: Json
          reporter_user_id: string
          round_id?: string | null
          viewer_player_id?: string | null
        }
        Update: {
          active_tab?: string | null
          bug_label?: string
          bug_type?: string
          build_meta?: Json
          created_at?: string
          current_turn_player_id?: string | null
          dealer_game_id?: string | null
          extra_context?: Json
          game_id?: string
          hand_number?: number | null
          id?: string
          note?: string | null
          phase?: string | null
          platform_info?: Json
          reporter_user_id?: string
          round_id?: string | null
          viewer_player_id?: string | null
        }
        Relationships: []
      }
      voice_operation_events: {
        Row: {
          actor_player_id: string | null
          actor_user_id: string | null
          byte_count: number | null
          created_at: string
          duration_ms: number | null
          error_category: string | null
          error_message: string | null
          id: string
          metadata: Json
          occurred_at: string
          origin: string
          phase: string
          status_code: number | null
          voice_operation_id: string
        }
        Insert: {
          actor_player_id?: string | null
          actor_user_id?: string | null
          byte_count?: number | null
          created_at?: string
          duration_ms?: number | null
          error_category?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          origin: string
          phase: string
          status_code?: number | null
          voice_operation_id: string
        }
        Update: {
          actor_player_id?: string | null
          actor_user_id?: string | null
          byte_count?: number | null
          created_at?: string
          duration_ms?: number | null
          error_category?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          origin?: string
          phase?: string
          status_code?: number | null
          voice_operation_id?: string
        }
        Relationships: []
      }
      voice_operation_incidents: {
        Row: {
          client_heartbeat_last_at: string | null
          client_last_phase: string | null
          client_last_phase_at: string | null
          completed_at: string | null
          created_at: string
          dealer_game_id: string | null
          edge_function_error_category: string | null
          edge_function_error_message: string | null
          edge_function_last_phase: string | null
          edge_function_last_phase_at: string | null
          edge_function_status_code: number | null
          game_id: string | null
          id: string
          origin_instance_id: string | null
          origin_route: string | null
          origin_surface: string | null
          origin_tab_id: string | null
          peer_heartbeat_last_at: string | null
          peer_witness_status: string
          presence_outcome: string | null
          report_status: string
          sender_player_id: string | null
          sender_user_id: string | null
          server_last_phase: string | null
          server_last_phase_at: string | null
          session_id: string | null
          started_at: string
          terminal_reason: string | null
          terminal_status: string | null
          updated_at: string
          voice_operation_id: string
        }
        Insert: {
          client_heartbeat_last_at?: string | null
          client_last_phase?: string | null
          client_last_phase_at?: string | null
          completed_at?: string | null
          created_at?: string
          dealer_game_id?: string | null
          edge_function_error_category?: string | null
          edge_function_error_message?: string | null
          edge_function_last_phase?: string | null
          edge_function_last_phase_at?: string | null
          edge_function_status_code?: number | null
          game_id?: string | null
          id?: string
          origin_instance_id?: string | null
          origin_route?: string | null
          origin_surface?: string | null
          origin_tab_id?: string | null
          peer_heartbeat_last_at?: string | null
          peer_witness_status?: string
          presence_outcome?: string | null
          report_status?: string
          sender_player_id?: string | null
          sender_user_id?: string | null
          server_last_phase?: string | null
          server_last_phase_at?: string | null
          session_id?: string | null
          started_at?: string
          terminal_reason?: string | null
          terminal_status?: string | null
          updated_at?: string
          voice_operation_id: string
        }
        Update: {
          client_heartbeat_last_at?: string | null
          client_last_phase?: string | null
          client_last_phase_at?: string | null
          completed_at?: string | null
          created_at?: string
          dealer_game_id?: string | null
          edge_function_error_category?: string | null
          edge_function_error_message?: string | null
          edge_function_last_phase?: string | null
          edge_function_last_phase_at?: string | null
          edge_function_status_code?: number | null
          game_id?: string | null
          id?: string
          origin_instance_id?: string | null
          origin_route?: string | null
          origin_surface?: string | null
          origin_tab_id?: string | null
          peer_heartbeat_last_at?: string | null
          peer_witness_status?: string
          presence_outcome?: string | null
          report_status?: string
          sender_player_id?: string | null
          sender_user_id?: string | null
          server_last_phase?: string | null
          server_last_phase_at?: string | null
          session_id?: string | null
          started_at?: string
          terminal_reason?: string | null
          terminal_status?: string | null
          updated_at?: string
          voice_operation_id?: string
        }
        Relationships: []
      }
      voice_operation_reports: {
        Row: {
          created_at: string
          finalized_at: string
          game_id: string | null
          id: string
          report_json: Json
          report_text: string
          sender_user_id: string | null
          terminal_status: string
          updated_at: string
          voice_operation_id: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string
          game_id?: string | null
          id?: string
          report_json?: Json
          report_text: string
          sender_user_id?: string | null
          terminal_status: string
          updated_at?: string
          voice_operation_id: string
        }
        Update: {
          created_at?: string
          finalized_at?: string
          game_id?: string | null
          id?: string
          report_json?: Json
          report_text?: string
          sender_user_id?: string | null
          terminal_status?: string
          updated_at?: string
          voice_operation_id?: string
        }
        Relationships: []
      }
      voice_peer_witness_events: {
        Row: {
          created_at: string
          event_type: string
          game_id: string | null
          id: string
          metadata: Json
          observed_at: string
          peer_player_id: string | null
          peer_user_id: string
          voice_operation_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          game_id?: string | null
          id?: string
          metadata?: Json
          observed_at?: string
          peer_player_id?: string | null
          peer_user_id: string
          voice_operation_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          game_id?: string | null
          id?: string
          metadata?: Json
          observed_at?: string
          peer_player_id?: string | null
          peer_user_id?: string
          voice_operation_id?: string
        }
        Relationships: []
      }
      voice_presence_heartbeats: {
        Row: {
          active_voice_operation_id: string | null
          created_at: string
          game_id: string | null
          id: string
          last_heartbeat_at: string
          route: string | null
          session_id: string | null
          status: string
          tab_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_voice_operation_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          last_heartbeat_at?: string
          route?: string | null
          session_id?: string | null
          status?: string
          tab_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_voice_operation_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          last_heartbeat_at?: string
          route?: string | null
          session_id?: string | null
          status?: string
          tab_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_holm_round_after_deal_presentation: {
        Args: {
          _from_fallback?: boolean
          _hand_context_id: string
          _presentation_generation: number
          _round_id: string
        }
        Returns: Json
      }
      chat_operation_append_boundary_event: {
        Args: {
          _metadata?: Json
          _name: string
          _operation_id: string
          _role: string
        }
        Returns: undefined
      }
      chat_operation_append_peer_milestone: {
        Args: {
          _message_id?: string
          _metadata?: Json
          _operation_id: string
          _phase: string
          _snapshots?: Json
        }
        Returns: {
          active_game_component: string | null
          active_tab: string | null
          boundary_events: Json
          canonical_shell_game_id: string | null
          completed_at: string | null
          created_at: string
          current_turn_player_id: string | null
          dealer_game_id: string | null
          game_controller_present: boolean | null
          game_id: string
          game_type_source: string | null
          id: string
          last_peer_heartbeat_at: string | null
          last_sender_event_at: string | null
          last_sender_heartbeat_at: string | null
          local_turn_eligible: boolean | null
          message_id: string | null
          message_preview: string | null
          operation_game_id: string | null
          operation_id: string
          operation_type: string
          optimistic_message_id: string | null
          origin_surface: string | null
          peer_milestones: Json
          raw_game_type: string | null
          recovery_correlations: Json
          report_status: string
          resolved_game_type: string | null
          route: string
          route_game_id: string | null
          sender_client_instance_id: string | null
          sender_milestones: Json
          sender_tab_session_id: string | null
          sender_user_id: string | null
          session_id: string
          shell_phase: string | null
          source_kind: string
          started_at: string
          status: string
          tab_attention_snapshots: Json
          tab_bar_render_key: string | null
          terminal_reason: string | null
          terminal_status: string | null
          updated_at: string
          violations: Json
          waiting_table_component: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chat_send_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_operation_append_recovery_correlation: {
        Args: { _metadata?: Json; _operation_id: string }
        Returns: undefined
      }
      chat_operation_append_sender_milestone: {
        Args: {
          _message_id?: string
          _metadata?: Json
          _operation_id: string
          _optimistic_message_id?: string
          _phase: string
        }
        Returns: {
          active_game_component: string | null
          active_tab: string | null
          boundary_events: Json
          canonical_shell_game_id: string | null
          completed_at: string | null
          created_at: string
          current_turn_player_id: string | null
          dealer_game_id: string | null
          game_controller_present: boolean | null
          game_id: string
          game_type_source: string | null
          id: string
          last_peer_heartbeat_at: string | null
          last_sender_event_at: string | null
          last_sender_heartbeat_at: string | null
          local_turn_eligible: boolean | null
          message_id: string | null
          message_preview: string | null
          operation_game_id: string | null
          operation_id: string
          operation_type: string
          optimistic_message_id: string | null
          origin_surface: string | null
          peer_milestones: Json
          raw_game_type: string | null
          recovery_correlations: Json
          report_status: string
          resolved_game_type: string | null
          route: string
          route_game_id: string | null
          sender_client_instance_id: string | null
          sender_milestones: Json
          sender_tab_session_id: string | null
          sender_user_id: string | null
          session_id: string
          shell_phase: string | null
          source_kind: string
          started_at: string
          status: string
          tab_attention_snapshots: Json
          tab_bar_render_key: string | null
          terminal_reason: string | null
          terminal_status: string | null
          updated_at: string
          violations: Json
          waiting_table_component: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chat_send_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_operation_append_violation: {
        Args: { _metadata?: Json; _name: string; _operation_id: string }
        Returns: {
          active_game_component: string | null
          active_tab: string | null
          boundary_events: Json
          canonical_shell_game_id: string | null
          completed_at: string | null
          created_at: string
          current_turn_player_id: string | null
          dealer_game_id: string | null
          game_controller_present: boolean | null
          game_id: string
          game_type_source: string | null
          id: string
          last_peer_heartbeat_at: string | null
          last_sender_event_at: string | null
          last_sender_heartbeat_at: string | null
          local_turn_eligible: boolean | null
          message_id: string | null
          message_preview: string | null
          operation_game_id: string | null
          operation_id: string
          operation_type: string
          optimistic_message_id: string | null
          origin_surface: string | null
          peer_milestones: Json
          raw_game_type: string | null
          recovery_correlations: Json
          report_status: string
          resolved_game_type: string | null
          route: string
          route_game_id: string | null
          sender_client_instance_id: string | null
          sender_milestones: Json
          sender_tab_session_id: string | null
          sender_user_id: string | null
          session_id: string
          shell_phase: string | null
          source_kind: string
          started_at: string
          status: string
          tab_attention_snapshots: Json
          tab_bar_render_key: string | null
          terminal_reason: string | null
          terminal_status: string | null
          updated_at: string
          violations: Json
          waiting_table_component: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chat_send_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_operation_peer_heartbeat: {
        Args: { _metadata?: Json; _operation_id: string }
        Returns: undefined
      }
      chat_operation_read_sender_presence: {
        Args: { _operation_id: string }
        Returns: {
          last_peer_heartbeat_at: string
          last_sender_event_at: string
          last_sender_heartbeat_at: string
          now_at: string
          status: string
          terminal_status: string
        }[]
      }
      chat_operation_sender_heartbeat: {
        Args: { _metadata?: Json; _operation_id: string }
        Returns: undefined
      }
      claim_horses_bot_controller: {
        Args: { _round_id: string }
        Returns: Json
      }
      cribbage_apply_discard: {
        Args: { _card_indices: number[]; _player_id: string; _round_id: string }
        Returns: Json
      }
      cribbage_create_next_hand: {
        Args: {
          _cribbage_state: Json
          _player_cards: Json
          _predecessor_round_id: string
        }
        Returns: Json
      }
      decrement_player_chips: {
        Args: { amount: number; player_ids: string[] }
        Returns: undefined
      }
      finalize_chat_send_operation: {
        Args: {
          _extra_snapshots?: Json
          _operation_id: string
          _terminal_reason?: string
          _terminal_status?: string
        }
        Returns: Json
      }
      finalize_voice_operations: { Args: never; Returns: number }
      handle_config_deadline_timeout: {
        Args: { _game_id: string }
        Returns: Json
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
      start_holm_initial_hand: {
        Args: { _game_id: string; _skip_ante_collection?: boolean }
        Returns: Json
      }
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
