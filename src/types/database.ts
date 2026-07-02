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
      asset_photos: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          caption: string | null
          file_name: string
          id: string
          is_cover: boolean
          mime_type: string
          organization_id: string
          property_id: string
          size_bytes: number
          sort_order: number
          storage_path: string
          taken_at: string | null
          unit_id: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          caption?: string | null
          file_name: string
          id?: string
          is_cover?: boolean
          mime_type: string
          organization_id: string
          property_id: string
          size_bytes: number
          sort_order?: number
          storage_path: string
          taken_at?: string | null
          unit_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          caption?: string | null
          file_name?: string
          id?: string
          is_cover?: boolean
          mime_type?: string
          organization_id?: string
          property_id?: string
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          taken_at?: string | null
          unit_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_photos_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          lease_id: string | null
          ledger_entry_id: string | null
          mime_type: string
          organization_id: string
          property_id: string | null
          size_bytes: number
          storage_path: string
          task_id: string | null
          tenant_request_id: string | null
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
          lease_id?: string | null
          ledger_entry_id?: string | null
          mime_type: string
          organization_id: string
          property_id?: string | null
          size_bytes: number
          storage_path: string
          task_id?: string | null
          tenant_request_id?: string | null
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
          lease_id?: string | null
          ledger_entry_id?: string | null
          mime_type?: string
          organization_id?: string
          property_id?: string | null
          size_bytes?: number
          storage_path?: string
          task_id?: string | null
          tenant_request_id?: string | null
          timeline_event_id?: string | null
          unit_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
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
            foreignKeyName: "documents_task_fk"
            columns: ["organization_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_tenant_request_fk"
            columns: ["organization_id", "tenant_request_id"]
            isOneToOne: false
            referencedRelation: "tenant_requests"
            referencedColumns: ["organization_id", "id"]
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
      tenant_requests: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organization_id: string
          priority: string
          property_id: string
          request_type: string
          requested_at: string
          requested_by_person_id: string | null
          status: string
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id: string
          priority?: string
          property_id: string
          request_type?: string
          requested_at?: string
          requested_by_person_id?: string | null
          status?: string
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          priority?: string
          property_id?: string
          request_type?: string
          requested_at?: string
          requested_by_person_id?: string | null
          status?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_requests_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_requests_requested_by_person_fk"
            columns: ["organization_id", "requested_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_requests_unit_fk"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_cost_amount: number | null
          actual_cost_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          archived_at: string | null
          archived_by: string | null
          category: string
          checklist: Json
          completed_at: string | null
          cost_estimate_amount: number | null
          cost_estimate_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          ledger_entry_id: string | null
          organization_id: string
          priority: string
          property_id: string
          recurrence_frequency: string
          reminder_date: string | null
          reminder_time: string | null
          status: string
          tenant_request_id: string
          timeline_event_id: string | null
          title: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_person_id: string | null
        }
        Insert: {
          actual_cost_amount?: number | null
          actual_cost_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          checklist?: Json
          completed_at?: string | null
          cost_estimate_amount?: number | null
          cost_estimate_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          ledger_entry_id?: string | null
          organization_id: string
          priority?: string
          property_id: string
          recurrence_frequency?: string
          reminder_date?: string | null
          reminder_time?: string | null
          status?: string
          tenant_request_id: string
          timeline_event_id?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_person_id?: string | null
        }
        Update: {
          actual_cost_amount?: number | null
          actual_cost_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          checklist?: Json
          completed_at?: string | null
          cost_estimate_amount?: number | null
          cost_estimate_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          ledger_entry_id?: string | null
          organization_id?: string
          priority?: string
          property_id?: string
          recurrence_frequency?: string
          reminder_date?: string | null
          reminder_time?: string | null
          status?: string
          tenant_request_id?: string
          timeline_event_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tasks_request_fk"
            columns: ["organization_id", "tenant_request_id"]
            isOneToOne: false
            referencedRelation: "tenant_requests"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tasks_timeline_event_id_fkey"
            columns: ["timeline_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_unit_fk"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tasks_vendor_person_fk"
            columns: ["organization_id", "vendor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_deposits: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deposit_type: string
          id: string
          lease_id: string
          notes: string | null
          organization_id: string
          received_on: string | null
          returned_on: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deposit_type?: string
          id?: string
          lease_id: string
          notes?: string | null
          organization_id: string
          received_on?: string | null
          returned_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deposit_type?: string
          id?: string
          lease_id?: string
          notes?: string | null
          organization_id?: string
          received_on?: string | null
          returned_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_deposits_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_deposits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_occupancies: {
        Row: {
          actual_move_in_date: string | null
          actual_move_out_date: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          lease_id: string
          notice_date: string | null
          organization_id: string
          property_id: string
          scheduled_move_in_date: string | null
          scheduled_move_out_date: string | null
          status: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_move_in_date?: string | null
          actual_move_out_date?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lease_id: string
          notice_date?: string | null
          organization_id: string
          property_id: string
          scheduled_move_in_date?: string | null
          scheduled_move_out_date?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_move_in_date?: string | null
          actual_move_out_date?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lease_id?: string
          notice_date?: string | null
          organization_id?: string
          property_id?: string
          scheduled_move_in_date?: string | null
          scheduled_move_out_date?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_occupancies_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_occupancies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_occupancies_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_occupancies_unit_fk"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_parties: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          ended_on: string | null
          id: string
          is_primary: boolean
          lease_id: string
          organization_id: string
          party_role: string
          person_id: string
          started_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          lease_id: string
          organization_id: string
          party_role: string
          person_id: string
          started_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          lease_id?: string
          organization_id?: string
          party_role?: string
          person_id?: string
          started_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_parties_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_parties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_parties_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_terms: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          lease_id: string
          notice_date: string | null
          organization_id: string
          payment_frequency: string
          rent_amount: number
          rent_currency: Database["public"]["Enums"]["currency_code"]
          rent_due_day: number | null
          start_date: string
          status: string
          term_sequence: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          lease_id: string
          notice_date?: string | null
          organization_id: string
          payment_frequency?: string
          rent_amount: number
          rent_currency: Database["public"]["Enums"]["currency_code"]
          rent_due_day?: number | null
          start_date: string
          status?: string
          term_sequence: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          lease_id?: string
          notice_date?: string | null
          organization_id?: string
          payment_frequency?: string
          rent_amount?: number
          rent_currency?: Database["public"]["Enums"]["currency_code"]
          rent_due_day?: number | null
          start_date?: string
          status?: string
          term_sequence?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_terms_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_terms_organization_id_fkey"
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
          primary_tenant_person_id: string | null
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
          primary_tenant_person_id?: string | null
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
          primary_tenant_person_id?: string | null
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
            foreignKeyName: "leases_primary_tenant_person_fk"
            columns: ["organization_id", "primary_tenant_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
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
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          legal_name: string | null
          notes: string | null
          organization_id: string
          party_type: string
          primary_email: string | null
          primary_phone: string | null
          tax_identifier: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          legal_name?: string | null
          notes?: string | null
          organization_id: string
          party_type?: string
          primary_email?: string | null
          primary_phone?: string | null
          tax_identifier?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          legal_name?: string | null
          notes?: string | null
          organization_id?: string
          party_type?: string
          primary_email?: string | null
          primary_phone?: string | null
          tax_identifier?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      person_contacts: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          contact_name: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          notes: string | null
          organization_id: string
          person_id: string
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          organization_id: string
          person_id: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          organization_id?: string
          person_id?: string
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_contacts_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      person_roles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          person_id: string
          role: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          person_id: string
          role: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          person_id?: string
          role?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
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
      property_owners: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          ended_on: string | null
          id: string
          is_primary: boolean
          organization_id: string
          ownership_label: string | null
          ownership_percent: number | null
          person_id: string
          property_id: string
          started_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          organization_id: string
          ownership_label?: string | null
          ownership_percent?: number | null
          person_id: string
          property_id: string
          started_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          organization_id?: string
          ownership_label?: string | null
          ownership_percent?: number | null
          person_id?: string
          property_id?: string
          started_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "property_owners_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
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
      vendor_profiles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          person_id: string
          preferred: boolean
          service_area: string | null
          service_category: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          person_id: string
          preferred?: boolean
          service_area?: string | null
          service_category?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          person_id?: string
          preferred?: boolean
          service_area?: string | null
          service_category?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_profiles_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_ledger_entry: {
        Args: { p_entry_id: string; p_organization_id: string }
        Returns: string
      }
      archive_lease: {
        Args: { p_lease_id: string; p_organization_id: string }
        Returns: string
      }
      archive_maintenance_task: {
        Args: { p_organization_id: string; p_task_id: string }
        Returns: string
      }
      archive_document: {
        Args: { p_document_id: string; p_organization_id: string }
        Returns: string
      }
      archive_asset_photo: {
        Args: { p_organization_id: string; p_photo_id: string }
        Returns: string
      }
      archive_person: {
        Args: { p_organization_id: string; p_person_id: string }
        Returns: string
      }
      archive_property: {
        Args: { p_organization_id: string; p_property_id: string }
        Returns: string
      }
      archive_timeline_event: {
        Args: { p_event_id: string; p_organization_id: string }
        Returns: string
      }
      archive_unit: {
        Args: { p_organization_id: string; p_unit_id: string }
        Returns: string
      }
      bootstrap_admin_organization: {
        Args: { organization_name: string }
        Returns: {
          membership_id: string
          organization_id: string
        }[]
      }
      create_asset_photo: {
        Args: {
          p_caption?: string | null
          p_file_name: string
          p_is_cover?: boolean
          p_mime_type: string
          p_organization_id: string
          p_property_id: string
          p_size_bytes: number
          p_storage_path: string
          p_taken_at?: string | null
          p_unit_id?: string | null
        }
        Returns: string
      }
      create_document: {
        Args: {
          p_activity_action?: string
          p_activity_entity_id?: string | null
          p_activity_entity_type?: string
          p_activity_new_values?: Json
          p_category: string
          p_file_name: string
          p_lease_id?: string | null
          p_ledger_entry_id?: string | null
          p_mime_type: string
          p_organization_id: string
          p_property_id: string
          p_size_bytes: number
          p_storage_path: string
          p_task_id?: string | null
          p_tenant_request_id?: string | null
          p_timeline_event_id?: string | null
          p_unit_id?: string | null
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
      create_lease: {
        Args: {
          p_deposit_amount: number | null
          p_deposit_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_lease_end_date: string
          p_lease_start_date: string
          p_monthly_rent_amount: number
          p_monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_organization_id: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_status: string
          p_unit_id: string | null
        }
        Returns: string
      }
      create_maintenance_task: {
        Args: {
          p_category: string
          p_checklist: Json
          p_cost_estimate_amount: number | null
          p_cost_estimate_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_description: string | null
          p_due_date: string | null
          p_due_time: string | null
          p_organization_id: string
          p_priority: string
          p_property_id: string
          p_recurrence_frequency: string
          p_reminder_date: string | null
          p_reminder_time: string | null
          p_status: string
          p_title: string
          p_unit_id: string | null
          p_vendor_person_id: string | null
        }
        Returns: string
      }
      create_person: {
        Args: {
          p_display_name: string
          p_legal_name: string | null
          p_notes: string | null
          p_organization_id: string
          p_party_type: string
          p_primary_email: string | null
          p_primary_phone: string | null
          p_roles: string[]
          p_tax_identifier: string | null
        }
        Returns: string
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
          p_owner_person_id?: string | null
          p_property_type: string
          p_status: string
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
      restore_ledger_entry: {
        Args: { p_entry_id: string; p_organization_id: string }
        Returns: string
      }
      restore_lease: {
        Args: { p_lease_id: string; p_organization_id: string }
        Returns: string
      }
      restore_maintenance_task: {
        Args: { p_organization_id: string; p_task_id: string }
        Returns: string
      }
      restore_document: {
        Args: { p_document_id: string; p_organization_id: string }
        Returns: string
      }
      restore_person: {
        Args: { p_organization_id: string; p_person_id: string }
        Returns: string
      }
      restore_property: {
        Args: { p_organization_id: string; p_property_id: string }
        Returns: string
      }
      restore_timeline_event: {
        Args: { p_event_id: string; p_organization_id: string }
        Returns: string
      }
      restore_unit: {
        Args: { p_organization_id: string; p_unit_id: string }
        Returns: string
      }
      set_asset_photo_cover: {
        Args: { p_organization_id: string; p_photo_id: string }
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
      update_document: {
        Args: {
          p_category: string
          p_document_id: string
          p_file_name?: string | null
          p_lease_id?: string | null
          p_mime_type?: string | null
          p_organization_id: string
          p_property_id: string
          p_size_bytes?: number | null
          p_storage_path?: string | null
          p_task_id?: string | null
          p_unit_id?: string | null
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
      update_lease: {
        Args: {
          p_deposit_amount: number | null
          p_deposit_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_lease_end_date: string
          p_lease_id: string
          p_lease_start_date: string
          p_monthly_rent_amount: number
          p_monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_organization_id: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_status: string
          p_unit_id: string | null
        }
        Returns: string
      }
      update_maintenance_task: {
        Args: {
          p_actual_cost_amount: number | null
          p_actual_cost_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_category: string
          p_checklist: Json
          p_cost_estimate_amount: number | null
          p_cost_estimate_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          p_description: string | null
          p_due_date: string | null
          p_due_time: string | null
          p_link_actual_cost_to_ledger: boolean
          p_organization_id: string
          p_priority: string
          p_property_id: string
          p_recurrence_frequency: string
          p_reminder_date: string | null
          p_reminder_time: string | null
          p_status: string
          p_task_id: string
          p_title: string
          p_unit_id: string | null
          p_vendor_person_id: string | null
        }
        Returns: string
      }
      update_person: {
        Args: {
          p_display_name: string
          p_legal_name: string | null
          p_notes: string | null
          p_organization_id: string
          p_party_type: string
          p_person_id: string
          p_primary_email: string | null
          p_primary_phone: string | null
          p_roles: string[]
          p_tax_identifier: string | null
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
          p_owner_person_id?: string | null
          p_property_id: string
          p_property_type: string
          p_status: string
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
    }
    Enums: {
      currency_code: "USD"
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
      currency_code: ["USD"],
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
