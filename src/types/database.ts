export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          organization_id: string
          previous_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          organization_id: string
          previous_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          organization_id?: string
          previous_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string
          file_name: string
          id: string
          ledger_entry_id: string | null
          lease_id: string | null
          mime_type: string
          organization_id: string
          property_id: string | null
          size_bytes: number
          storage_path: string
          timeline_event_id: string | null
          unit_id: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category: string
          file_name: string
          id?: string
          ledger_entry_id?: string | null
          lease_id?: string | null
          mime_type: string
          organization_id: string
          property_id?: string | null
          size_bytes: number
          storage_path: string
          timeline_event_id?: string | null
          unit_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          file_name?: string
          id?: string
          ledger_entry_id?: string | null
          lease_id?: string | null
          mime_type?: string
          organization_id?: string
          property_id?: string | null
          size_bytes?: number
          storage_path?: string
          timeline_event_id?: string | null
          unit_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_timeline_event_id_fkey"
            columns: ["timeline_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_period_locks: {
        Row: {
          created_at: string
          id: string
          locked_at: string | null
          locked_by: string | null
          organization_id: string
          period_start: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          organization_id: string
          period_start: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          organization_id?: string
          period_start?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_period_locks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number | null
          deposit_currency: Database["public"]["Enums"]["currency_code"] | null
          id: string
          lease_end_date: string
          lease_start_date: string
          monthly_rent_amount: number
          monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          organization_id: string
          property_id: string
          status: string
          tenant_name: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          lease_end_date: string
          lease_start_date: string
          monthly_rent_amount: number
          monthly_rent_currency?: Database["public"]["Enums"]["currency_code"]
          organization_id: string
          property_id: string
          status?: string
          tenant_name: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          lease_end_date?: string
          lease_start_date?: string
          monthly_rent_amount?: number
          monthly_rent_currency?: Database["public"]["Enums"]["currency_code"]
          organization_id?: string
          property_id?: string
          status?: string
          tenant_name?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          category: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          direction: string
          id: string
          organization_id: string
          property_id: string
          transaction_date: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          archived_by?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          direction: string
          id?: string
          organization_id: string
          property_id: string
          transaction_date: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          direction?: string
          id?: string
          organization_id?: string
          property_id?: string
          transaction_date?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          khr_per_usd: number
          name: string
          preferred_currency: Database["public"]["Enums"]["currency_code"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          khr_per_usd?: number
          name: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          khr_per_usd?: number
          name?: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          acquisition_date: string | null
          address: string | null
          archived_at: string | null
          archived_by: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          owner: string | null
          property_type: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acquisition_date?: string | null
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          owner?: string | null
          property_type: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acquisition_date?: string | null
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          owner?: string | null
          property_type?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          cost_amount: number | null
          cost_currency: Database["public"]["Enums"]["currency_code"] | null
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["timeline_event_type"]
          id: string
          lease_id: string | null
          ledger_entry_id: string | null
          organization_id: string
          property_id: string
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          cost_amount?: number | null
          cost_currency?: Database["public"]["Enums"]["currency_code"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["timeline_event_type"]
          id?: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id: string
          property_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          cost_amount?: number | null
          cost_currency?: Database["public"]["Enums"]["currency_code"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["timeline_event_type"]
          id?: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id?: string
          property_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          current_rent_amount: number | null
          current_rent_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          floor: string | null
          id: string
          organization_id: string
          property_id: string
          size_sqm: number | null
          status: string
          unit_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          current_rent_amount?: number | null
          current_rent_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          floor?: string | null
          id?: string
          organization_id: string
          property_id: string
          size_sqm?: number | null
          status?: string
          unit_number: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          current_rent_amount?: number | null
          current_rent_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          floor?: string | null
          id?: string
          organization_id?: string
          property_id?: string
          size_sqm?: number | null
          status?: string
          unit_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_ledger_entry: {
        Args: {
          p_entry_id: string
          p_organization_id: string
        }
        Returns: string
      }
      archive_property: {
        Args: {
          p_organization_id: string
          p_property_id: string
        }
        Returns: string
      }
      archive_unit: {
        Args: {
          p_organization_id: string
          p_unit_id: string
        }
        Returns: string
      }
      archive_timeline_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
        }
        Returns: string
      }
      bootstrap_admin_organization: {
        Args: { organization_name: string }
        Returns: {
          membership_id: string
          organization_id: string
        }[]
      }
      create_property: {
        Args: {
          p_acquisition_date: string | null
          p_address: string | null
          p_code: string
          p_name: string
          p_notes: string | null
          p_organization_id: string
          p_owner: string | null
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      create_unit: {
        Args: {
          p_current_rent_amount: number | null
          p_current_rent_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_floor: string | null
          p_organization_id: string
          p_property_id: string
          p_size_sqm: number | null
          p_status: string
          p_unit_number: string
        }
        Returns: string
      }
      create_timeline_event: {
        Args: {
          p_cost_amount: number | null
          p_cost_currency: Database["public"]["Enums"]["currency_code"] | null
          p_description: string | null
          p_event_date: string
          p_event_type: Database["public"]["Enums"]["timeline_event_type"]
          p_organization_id: string
          p_property_id: string
          p_title: string
          p_unit_id: string | null
        }
        Returns: string
      }
      create_ledger_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string | null
          p_direction: string
          p_organization_id: string
          p_property_id: string
          p_transaction_date: string
          p_unit_id: string | null
        }
        Returns: string
      }
      restore_ledger_entry: {
        Args: {
          p_entry_id: string
          p_organization_id: string
        }
        Returns: string
      }
      restore_property: {
        Args: {
          p_organization_id: string
          p_property_id: string
        }
        Returns: string
      }
      restore_unit: {
        Args: {
          p_organization_id: string
          p_unit_id: string
        }
        Returns: string
      }
      restore_timeline_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
        }
        Returns: string
      }
      set_ledger_period_lock: {
        Args: {
          p_locked: boolean
          p_organization_id: string
          p_period_start: string
          p_reason: string
        }
        Returns: string
      }
      update_ledger_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string | null
          p_direction: string
          p_entry_id: string
          p_organization_id: string
          p_property_id: string
          p_transaction_date: string
          p_unit_id: string | null
        }
        Returns: string
      }
      update_property: {
        Args: {
          p_acquisition_date: string | null
          p_address: string | null
          p_code: string
          p_name: string
          p_notes: string | null
          p_organization_id: string
          p_owner: string | null
          p_property_id: string
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      update_unit: {
        Args: {
          p_current_rent_amount: number | null
          p_current_rent_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_floor: string | null
          p_organization_id: string
          p_property_id: string
          p_size_sqm: number | null
          p_status: string
          p_unit_id: string
          p_unit_number: string
        }
        Returns: string
      }
      update_timeline_event: {
        Args: {
          p_cost_amount: number | null
          p_cost_currency: Database["public"]["Enums"]["currency_code"] | null
          p_description: string | null
          p_event_date: string
          p_event_id: string
          p_event_type: Database["public"]["Enums"]["timeline_event_type"]
          p_organization_id: string
          p_property_id: string
          p_title: string
          p_unit_id: string | null
        }
        Returns: string
      }
    }
    Enums: {
      currency_code: "USD" | "KHR"
      timeline_event_type:
        | "Lease Started"
        | "Lease Ended"
        | "Tenant Move In"
        | "Tenant Move Out"
        | "Rent Increase"
        | "Maintenance"
        | "Repair"
        | "Renovation"
        | "Inspection"
        | "Document Added"
        | "General Note"
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
      currency_code: ["USD", "KHR"],
      timeline_event_type: [
        "Lease Started",
        "Lease Ended",
        "Tenant Move In",
        "Tenant Move Out",
        "Rent Increase",
        "Maintenance",
        "Repair",
        "Renovation",
        "Inspection",
        "Document Added",
        "General Note",
      ],
    },
  },
} as const

