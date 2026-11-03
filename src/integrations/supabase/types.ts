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
      agent_error_logs: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          retryable: boolean
          run_id: string | null
          service: string
          session_id: string
          trace_id: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          retryable?: boolean
          run_id?: string | null
          service: string
          session_id: string
          trace_id?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          retryable?: boolean
          run_id?: string | null
          service?: string
          session_id?: string
          trace_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_error_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          created_at: string
          payload: Json
          run_id: string
          seq: number
          session_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          payload?: Json
          run_id: string
          seq: number
          session_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          payload?: Json
          run_id?: string
          seq?: number
          session_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_transitions: {
        Row: {
          actor: string
          created_at: string
          from_stage: string
          id: number
          reason: string
          run_id: string
          to_stage: string
          user_id: string
        }
        Insert: {
          actor?: string
          created_at?: string
          from_stage: string
          id?: number
          reason?: string
          run_id: string
          to_stage: string
          user_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          from_stage?: string
          id?: number
          reason?: string
          run_id?: string
          to_stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_transitions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          autonomy: string
          ended_at: string | null
          id: string
          metrics: Json
          model: string
          next_seq: number
          objective: string
          outcome: string | null
          provider: string
          session_id: string
          stage: string
          started_at: string
          trace_id: string
          user_id: string
        }
        Insert: {
          autonomy?: string
          ended_at?: string | null
          id?: string
          metrics?: Json
          model?: string
          next_seq?: number
          objective?: string
          outcome?: string | null
          provider?: string
          session_id: string
          stage?: string
          started_at?: string
          trace_id?: string
          user_id: string
        }
        Update: {
          autonomy?: string
          ended_at?: string | null
          id?: string
          metrics?: Json
          model?: string
          next_seq?: number
          objective?: string
          outcome?: string | null
          provider?: string
          session_id?: string
          stage?: string
          started_at?: string
          trace_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          accounts: Json
          applied_migrations: string[]
          base_branch: string
          coding_credential_id: string | null
          coding_model: string | null
          created_at: string
          credential_id: string | null
          execution_id: string | null
          fallback_model: string | null
          id: string
          keeper_id: string | null
          messages: Json
          mode: string
          model: string
          pending: Json
          reasoning_profile: string
          repo: string
          reviewer_credential_id: string | null
          reviewer_model: string | null
          running: boolean
          sandbox_id: string | null
          stop_requested: boolean
          summarized_count: number
          summary: string | null
          supabase_ref: string | null
          title: string
          updated_at: string
          usage: Json
          user_id: string
          vercel_project_id: string | null
          work_branch: string
        }
        Insert: {
          accounts?: Json
          applied_migrations?: string[]
          base_branch: string
          coding_credential_id?: string | null
          coding_model?: string | null
          created_at?: string
          credential_id?: string | null
          execution_id?: string | null
          fallback_model?: string | null
          id?: string
          keeper_id?: string | null
          messages?: Json
          mode?: string
          model?: string
          pending?: Json
          reasoning_profile?: string
          repo: string
          reviewer_credential_id?: string | null
          reviewer_model?: string | null
          running?: boolean
          sandbox_id?: string | null
          stop_requested?: boolean
          summarized_count?: number
          summary?: string | null
          supabase_ref?: string | null
          title?: string
          updated_at?: string
          usage?: Json
          user_id?: string
          vercel_project_id?: string | null
          work_branch: string
        }
        Update: {
          accounts?: Json
          applied_migrations?: string[]
          base_branch?: string
          coding_credential_id?: string | null
          coding_model?: string | null
          created_at?: string
          credential_id?: string | null
          execution_id?: string | null
          fallback_model?: string | null
          id?: string
          keeper_id?: string | null
          messages?: Json
          mode?: string
          model?: string
          pending?: Json
          reasoning_profile?: string
          repo?: string
          reviewer_credential_id?: string | null
          reviewer_model?: string | null
          running?: boolean
          sandbox_id?: string | null
          stop_requested?: boolean
          summarized_count?: number
          summary?: string | null
          supabase_ref?: string | null
          title?: string
          updated_at?: string
          usage?: Json
          user_id?: string
          vercel_project_id?: string | null
          work_branch?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          session_id: string | null
          target: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          session_id?: string | null
          target?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          session_id?: string | null
          target?: string | null
          user_id?: string
        }
        Relationships: []
      }
      change_provenance: {
        Row: {
          action: string
          created_at: string
          id: string
          path: string
          prompt: string
          run_id: string | null
          session_id: string
          tool: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          path: string
          prompt?: string
          run_id?: string | null
          session_id: string
          tool?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          path?: string
          prompt?: string
          run_id?: string | null
          session_id?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      deploy_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          redirect_uri: string
          state_digest: string
          user_id: string
          verifier: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          provider: string
          redirect_uri: string
          state_digest: string
          user_id: string
          verifier: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          redirect_uri?: string
          state_digest?: string
          user_id?: string
          verifier?: string
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
          tool_cache: Json | null
          tool_cache_at: string | null
          tool_cache_url: string | null
          tool_names: Json
          tool_policies: Json
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
          tool_cache?: Json | null
          tool_cache_at?: string | null
          tool_cache_url?: string | null
          tool_names?: Json
          tool_policies?: Json
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
          tool_cache?: Json | null
          tool_cache_at?: string | null
          tool_cache_url?: string | null
          tool_names?: Json
          tool_policies?: Json
          transport?: string
          transport_mode?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_execution_logs: {
        Row: {
          created_at: string
          decision: string
          duration_ms: number | null
          id: string
          ok: boolean | null
          run_id: string | null
          server_name: string
          session_id: string
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          duration_ms?: number | null
          id?: string
          ok?: boolean | null
          run_id?: string | null
          server_name: string
          session_id: string
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          duration_ms?: number | null
          id?: string
          ok?: boolean | null
          run_id?: string | null
          server_name?: string
          session_id?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_execution_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
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
      owner_runners: {
        Row: {
          capacity: Json
          ciphertext: string
          created_at: string
          endpoint: string
          id: string
          iv: string
          key_id: string
          label: string
          last_seen: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capacity?: Json
          ciphertext: string
          created_at?: string
          endpoint: string
          id?: string
          iv: string
          key_id: string
          label?: string
          last_seen?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capacity?: Json
          ciphertext?: string
          created_at?: string
          endpoint?: string
          id?: string
          iv?: string
          key_id?: string
          label?: string
          last_seen?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      preview_secrets: {
        Row: {
          ciphertext: string
          iv: string
          preview_id: string
          updated_at: string
          upstream_host: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          iv: string
          preview_id: string
          updated_at?: string
          upstream_host: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          iv?: string
          preview_id?: string
          updated_at?: string
          upstream_host?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_secrets_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: true
            referencedRelation: "preview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_sessions: {
        Row: {
          branch_name: string
          browser_errors: Json
          command: string
          created_at: string
          expires_at: string
          framework: string
          id: string
          last_health_check_at: string | null
          port: number
          preview_url: string
          process: Json
          project_id: string
          run_id: string | null
          sandbox_id: string
          share_until: string | null
          status: string
          token_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_name: string
          browser_errors?: Json
          command?: string
          created_at?: string
          expires_at?: string
          framework?: string
          id?: string
          last_health_check_at?: string | null
          port: number
          preview_url?: string
          process?: Json
          project_id: string
          run_id?: string | null
          sandbox_id: string
          share_until?: string | null
          status?: string
          token_version?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          branch_name?: string
          browser_errors?: Json
          command?: string
          created_at?: string
          expires_at?: string
          framework?: string
          id?: string
          last_health_check_at?: string | null
          port?: number
          preview_url?: string
          process?: Json
          project_id?: string
          run_id?: string | null
          sandbox_id?: string
          share_until?: string | null
          status?: string
          token_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memories: {
        Row: {
          category: string
          confidence: number
          content: string
          created_at: string
          expires_at: string | null
          id: string
          repo: string
          sensitivity: string
          session_id: string | null
          source: string
          source_ref: string | null
          status: string
          supersedes: string | null
          updated_at: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          category: string
          confidence?: number
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          repo: string
          sensitivity?: string
          session_id?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          supersedes?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Update: {
          category?: string
          confidence?: number
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          repo?: string
          sensitivity?: string
          session_id?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          supersedes?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      provider_credentials: {
        Row: {
          auth_method: string
          base_url: string | null
          ciphertext: string
          created_at: string
          custom_models: string[]
          expires_at: string | null
          extra_body: Json | null
          id: string
          iv: string
          label: string
          last4: string
          provider: string
          refresh_ciphertext: string | null
          refresh_iv: string | null
          user_id: string
        }
        Insert: {
          auth_method?: string
          base_url?: string | null
          ciphertext: string
          created_at?: string
          custom_models?: string[]
          expires_at?: string | null
          extra_body?: Json | null
          id?: string
          iv: string
          label?: string
          last4: string
          provider: string
          refresh_ciphertext?: string | null
          refresh_iv?: string | null
          user_id?: string
        }
        Update: {
          auth_method?: string
          base_url?: string | null
          ciphertext?: string
          created_at?: string
          custom_models?: string[]
          expires_at?: string | null
          extra_body?: Json | null
          id?: string
          iv?: string
          label?: string
          last4?: string
          provider?: string
          refresh_ciphertext?: string | null
          refresh_iv?: string | null
          user_id?: string
        }
        Relationships: []
      }
      repo_memory: {
        Row: {
          id: string
          notes: string
          repo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string
          repo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string
          repo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      repo_symbol_index: {
        Row: {
          content_hash: string
          imports: Json
          path: string
          repo: string
          symbols: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          content_hash: string
          imports?: Json
          path: string
          repo: string
          symbols?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          content_hash?: string
          imports?: Json
          path?: string
          repo?: string
          symbols?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      run_resume_secrets: {
        Row: {
          attempts: number
          ciphertext: string
          iv: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          ciphertext: string
          iv: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          ciphertext?: string
          iv?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_resume_secrets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_interjections: {
        Row: {
          consumed_at: string | null
          content: string
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          content: string
          created_at?: string
          id?: string
          session_id: string
          user_id?: string
        }
        Update: {
          consumed_at?: string | null
          content?: string
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_interjections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_executions: {
        Row: {
          created_at: string
          id: string
          reason: string
          run_id: string
          skill_name: string
          status: string
          user_id: string
          version_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string
          run_id: string
          skill_name: string
          status: string
          user_id: string
          version_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          run_id?: string
          skill_name?: string
          status?: string
          user_id?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_executions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_revisions: {
        Row: {
          created_at: string
          id: string
          instructions: string
          name: string
          registry: Json
          skill_id: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions: string
          name: string
          registry: Json
          skill_id: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          name?: string
          registry?: Json
          skill_id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_revisions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          instructions: string
          name: string
          registry: Json
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          instructions: string
          name: string
          registry?: Json
          source?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          instructions?: string
          name?: string
          registry?: Json
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      task_deployment_settings: {
        Row: {
          ciphertext: string
          iv: string
          project_ref: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          iv: string
          project_ref: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          iv?: string
          project_ref?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_deployment_settings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_domain_setups: {
        Row: {
          approved_at: string
          database_account_id: string | null
          database_ref: string | null
          domain: string
          id: string
          state: string
          sync_error: string | null
          task_id: string
          updated_at: string
          user_id: string
          vercel_account_id: string
          vercel_project_id: string
        }
        Insert: {
          approved_at?: string
          database_account_id?: string | null
          database_ref?: string | null
          domain: string
          id?: string
          state?: string
          sync_error?: string | null
          task_id: string
          updated_at?: string
          user_id: string
          vercel_account_id: string
          vercel_project_id: string
        }
        Update: {
          approved_at?: string
          database_account_id?: string | null
          database_ref?: string | null
          domain?: string
          id?: string
          state?: string
          sync_error?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
          vercel_account_id?: string
          vercel_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_domain_setups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_questions: {
        Row: {
          allow_custom_answer: boolean
          allow_skip: boolean
          answer: Json | null
          answer_key: string | null
          answered_at: string | null
          created_at: string
          description: string
          id: string
          options: Json
          position: number
          recommendation_reason: string
          recommended_option_ids: string[]
          required: boolean
          run_id: string | null
          safe_default: string | null
          session_id: string
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          allow_custom_answer?: boolean
          allow_skip?: boolean
          answer?: Json | null
          answer_key?: string | null
          answered_at?: string | null
          created_at?: string
          description?: string
          id?: string
          options?: Json
          position?: number
          recommendation_reason?: string
          recommended_option_ids?: string[]
          required?: boolean
          run_id?: string | null
          safe_default?: string | null
          session_id: string
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          allow_custom_answer?: boolean
          allow_skip?: boolean
          answer?: Json | null
          answer_key?: string | null
          answered_at?: string | null
          created_at?: string
          description?: string
          id?: string
          options?: Json
          position?: number
          recommendation_reason?: string
          recommended_option_ids?: string[]
          required?: boolean
          run_id?: string | null
          safe_default?: string | null
          session_id?: string
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_secret_requests: {
        Row: {
          ciphertext: string | null
          created_at: string
          id: string
          iv: string | null
          name: string
          purpose: string
          source_url: string
          state: string
          targets: string[]
          task_id: string
          updated_at: string
          user_id: string
          vercel_account_id: string
          vercel_project_id: string
        }
        Insert: {
          ciphertext?: string | null
          created_at?: string
          id?: string
          iv?: string | null
          name: string
          purpose: string
          source_url: string
          state?: string
          targets?: string[]
          task_id: string
          updated_at?: string
          user_id: string
          vercel_account_id: string
          vercel_project_id: string
        }
        Update: {
          ciphertext?: string | null
          created_at?: string
          id?: string
          iv?: string | null
          name?: string
          purpose?: string
          source_url?: string
          state?: string
          targets?: string[]
          task_id?: string
          updated_at?: string
          user_id?: string
          vercel_account_id?: string
          vercel_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_secret_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_specifications: {
        Row: {
          created_at: string
          id: string
          run_id: string | null
          session_id: string
          spec: Json
          task_class: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          run_id?: string | null
          session_id: string
          spec: Json
          task_class: string
          user_id: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          run_id?: string | null
          session_id?: string
          spec?: Json
          task_class?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_specifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_suggestions: {
        Row: {
          complexity: string
          created_at: string
          decided_at: string | null
          description: string
          estimated_impact: string
          expected_benefit: string[]
          id: string
          rationale: string
          recommended_approach: string
          requested_approach: string
          risk: string
          run_id: string | null
          session_id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          complexity: string
          created_at?: string
          decided_at?: string | null
          description?: string
          estimated_impact: string
          expected_benefit?: string[]
          id?: string
          rationale?: string
          recommended_approach: string
          requested_approach?: string
          risk?: string
          run_id?: string | null
          session_id: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          complexity?: string
          created_at?: string
          decided_at?: string | null
          description?: string
          estimated_impact?: string
          expected_benefit?: string[]
          id?: string
          rationale?: string
          recommended_approach?: string
          requested_approach?: string
          risk?: string
          run_id?: string | null
          session_id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_suggestions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      answer_task_question: {
        Args: { _answer: Json; _key: string; _question: string; _skip: boolean }
        Returns: Json
      }
      consume_session_interjections: {
        Args: { _session: string }
        Returns: {
          content: string
          created_at: string
        }[]
      }
      decide_task_suggestion: {
        Args: { _decision: string; _suggestion: string }
        Returns: Json
      }
      engine_event: {
        Args: { _payload: Json; _run: string; _type: string }
        Returns: number
      }
      engine_record: {
        Args: { _kind: string; _row: Json; _run: string }
        Returns: undefined
      }
      engine_stage_allowed: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      engine_start_run: {
        Args: {
          _autonomy: string
          _model: string
          _objective: string
          _provider: string
          _session: string
        }
        Returns: {
          autonomy: string
          ended_at: string | null
          id: string
          metrics: Json
          model: string
          next_seq: number
          objective: string
          outcome: string | null
          provider: string
          session_id: string
          stage: string
          started_at: string
          trace_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      engine_transition: {
        Args: { _reason: string; _run: string; _to: string }
        Returns: boolean
      }
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
