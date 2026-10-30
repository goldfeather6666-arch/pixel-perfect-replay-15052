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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_sessions: {
        Row: {
          base_branch: string
          created_at: string
          credential_id: string | null
          id: string
          messages: Json
          mode: string
          model: string
          pending: Json
          repo: string
          sandbox_id: string | null
          summarized_count: number
          summary: string | null
          title: string
          updated_at: string
          usage: Json
          user_id: string
          work_branch: string
        }
        Insert: {
          base_branch: string
          created_at?: string
          credential_id?: string | null
          id?: string
          messages?: Json
          mode?: string
          model?: string
          pending?: Json
          repo: string
          sandbox_id?: string | null
          summarized_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
          usage?: Json
          user_id?: string
          work_branch: string
        }
        Update: {
          base_branch?: string
          created_at?: string
          credential_id?: string | null
          id?: string
          messages?: Json
          mode?: string
          model?: string
          pending?: Json
          repo?: string
          sandbox_id?: string | null
          summarized_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
          usage?: Json
          user_id?: string
          work_branch?: string
        }
        Relationships: []
      }
      mcp_action_requests: {
        Row: {
          arguments: Json
          connection_id: string
          created_at: string
          expires_at: string
          id: string
          input_schema: Json
          result: string | null
          server_name: string
          server_url: string
          session_id: string
          state: string
          tool_name: string
          transport_mode: string
          user_id: string
        }
        Insert: {
          arguments: Json
          connection_id: string
          created_at?: string
          expires_at?: string
          id?: string
          input_schema: Json
          result?: string | null
          server_name: string
          server_url: string
          session_id: string
          state?: string
          tool_name: string
          transport_mode: string
          user_id: string
        }
        Update: {
          arguments?: Json
          connection_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          input_schema?: Json
          result?: string | null
          server_name?: string
          server_url?: string
          session_id?: string
          state?: string
          tool_name?: string
          transport_mode?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_action_requests_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_action_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          allow_actions: boolean
          auth_mode: string
          ciphertext: string | null
          created_at: string
          enabled: boolean
          id: string
          iv: string | null
          name: string
          oauth_status: string
          state: string
          tool_names: Json
          transport: string
          transport_mode: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          allow_actions?: boolean
          auth_mode?: string
          ciphertext?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          iv?: string | null
          name: string
          oauth_status?: string
          state?: string
          tool_names?: Json
          transport?: string
          transport_mode?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          allow_actions?: boolean
          auth_mode?: string
          ciphertext?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          iv?: string | null
          name?: string
          oauth_status?: string
          state?: string
          tool_names?: Json
          transport?: string
          transport_mode?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_oauth_credentials: {
        Row: {
          ciphertext: string
          connection_id: string
          flow_claimed: boolean
          flow_digest: string | null
          flow_expires_at: string | null
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          connection_id: string
          flow_claimed?: boolean
          flow_digest?: string | null
          flow_expires_at?: string | null
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          connection_id?: string
          flow_claimed?: boolean
          flow_digest?: string | null
          flow_expires_at?: string | null
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials: {
        Row: {
          base_url: string | null
          ciphertext: string
          created_at: string
          custom_models: string[]
          extra_body: Json | null
          id: string
          iv: string
          label: string
          last4: string
          provider: string
          user_id: string
        }
        Insert: {
          base_url?: string | null
          ciphertext: string
          created_at?: string
          custom_models?: string[]
          extra_body?: Json | null
          id?: string
          iv: string
          label?: string
          last4: string
          provider: string
          user_id?: string
        }
        Update: {
          base_url?: string | null
          ciphertext?: string
          created_at?: string
          custom_models?: string[]
          extra_body?: Json | null
          id?: string
          iv?: string
          label?: string
          last4?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          instructions: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          instructions: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          instructions?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
