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
      accounting_accounts: {
        Row: {
          account_type: string
          archived_at: string | null
          archived_by: string | null
          book_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_control_account: boolean
          name: string
          normal_balance: string
          organization_id: string
          system_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_type: string
          archived_at?: string | null
          archived_by?: string | null
          book_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          name: string
          normal_balance: string
          organization_id: string
          system_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_type?: string
          archived_at?: string | null
          archived_by?: string | null
          book_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          name?: string
          normal_balance?: string
          organization_id?: string
          system_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_accounts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "accounting_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_books: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          book_type: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          book_type: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          book_type?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_entries: {
        Row: {
          book_id: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          entry_date: string
          id: string
          legacy_ledger_entry_id: string | null
          organization_id: string
          payload_hash: string
          posted_at: string
          posted_by: string | null
          posting_key: string
          reference: string | null
          reversal_of_id: string | null
          reversed_by_id: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          entry_date: string
          id?: string
          legacy_ledger_entry_id?: string | null
          organization_id: string
          payload_hash: string
          posted_at?: string
          posted_by?: string | null
          posting_key: string
          reference?: string | null
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          entry_date?: string
          id?: string
          legacy_ledger_entry_id?: string | null
          organization_id?: string
          payload_hash?: string
          posted_at?: string
          posted_by?: string | null
          posting_key?: string
          reference?: string | null
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "accounting_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_legacy_ledger_entry_id_fkey"
            columns: ["legacy_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_entries_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string | null
          id: string
          journal_entry_id: string
          lease_id: string | null
          line_number: number
          organization_id: string
          owner_person_id: string | null
          property_id: string | null
          tenant_person_id: string | null
          unit_id: string | null
          vendor_person_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          lease_id?: string | null
          line_number: number
          organization_id: string
          owner_person_id?: string | null
          property_id?: string | null
          tenant_person_id?: string | null
          unit_id?: string | null
          vendor_person_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          lease_id?: string | null
          line_number?: number
          organization_id?: string
          owner_person_id?: string | null
          property_id?: string | null
          tenant_person_id?: string | null
          unit_id?: string | null
          vendor_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_tenant_person_id_fkey"
            columns: ["tenant_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_journal_lines_vendor_person_id_fkey"
            columns: ["vendor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          book_id: string
          created_at: string
          created_by: string | null
          id: string
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          organization_id: string
          period_start: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          book_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          organization_id: string
          period_start: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          book_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          organization_id?: string
          period_start?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "accounting_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_request_fk"
            columns: ["tenant_request_id"]
            isOneToOne: false
            referencedRelation: "tenant_requests"
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
      finance_expense_items: {
        Row: {
          amount: number
          archived_at: string | null
          archived_by: string | null
          category: string
          company_loss_amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          due_date: string | null
          economic_scope: string
          expense_type: string
          id: string
          invoice_date: string
          ledger_entry_id: string | null
          organization_id: string
          owner_bill_status: string
          owner_reimbursable_amount: number
          owner_reimbursed_amount: number
          paid_date: string | null
          property_id: string
          reference: string | null
          status: string
          task_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_label: string
          vendor_person_id: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          archived_by?: string | null
          category: string
          company_loss_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          due_date?: string | null
          economic_scope?: string
          expense_type?: string
          id?: string
          invoice_date: string
          ledger_entry_id?: string | null
          organization_id: string
          owner_bill_status?: string
          owner_reimbursable_amount?: number
          owner_reimbursed_amount?: number
          paid_date?: string | null
          property_id: string
          reference?: string | null
          status?: string
          task_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_label: string
          vendor_person_id?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          company_loss_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          due_date?: string | null
          economic_scope?: string
          expense_type?: string
          id?: string
          invoice_date?: string
          ledger_entry_id?: string | null
          organization_id?: string
          owner_bill_status?: string
          owner_reimbursable_amount?: number
          owner_reimbursed_amount?: number
          paid_date?: string | null
          property_id?: string
          reference?: string | null
          status?: string
          task_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_label?: string
          vendor_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expense_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_items_vendor_person_id_fkey"
            columns: ["vendor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_income_items: {
        Row: {
          amount_due: number
          amount_received: number
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          due_date: string
          id: string
          income_type: string
          lease_id: string | null
          ledger_entry_id: string | null
          organization_id: string
          payer_label: string
          payer_person_id: string | null
          property_id: string
          received_date: string | null
          reference: string | null
          status: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_due: number
          amount_received?: number
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          due_date: string
          id?: string
          income_type?: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id: string
          payer_label: string
          payer_person_id?: string | null
          property_id: string
          received_date?: string | null
          reference?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_due?: number
          amount_received?: number
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          due_date?: string
          id?: string
          income_type?: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id?: string
          payer_label?: string
          payer_person_id?: string | null
          property_id?: string
          received_date?: string | null
          reference?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_income_items_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_income_items_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_income_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_income_items_payer_person_fk"
            columns: ["organization_id", "payer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_income_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_income_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expense_item_id: string
          id: string
          organization_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          expense_item_id: string
          id?: string
          organization_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_item_id?: string
          id?: string
          organization_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payment_allocations_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_org_expense_item_fkey"
            columns: ["organization_id", "expense_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_org_payment_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "finance_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "finance_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          organization_id: string
          paid_date: string
          payee_label: string
          property_id: string
          reference: string | null
          reversal_of_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id: string
          paid_date: string
          payee_label: string
          property_id: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id?: string
          paid_date?: string
          payee_label?: string
          property_id?: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payments_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "finance_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payments_scope_reversal_fkey"
            columns: [
              "organization_id",
              "property_id",
              "currency",
              "reversal_of_id",
            ]
            isOneToOne: false
            referencedRelation: "finance_payments"
            referencedColumns: [
              "organization_id",
              "property_id",
              "currency",
              "id",
            ]
          },
        ]
      }
      finance_receipt_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          income_item_id: string
          organization_id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          income_item_id: string
          organization_id: string
          receipt_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          income_item_id?: string
          organization_id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_receipt_allocations_income_item_id_fkey"
            columns: ["income_item_id"]
            isOneToOne: false
            referencedRelation: "finance_income_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_org_income_item_fkey"
            columns: ["organization_id", "income_item_id"]
            isOneToOne: false
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_org_receipt_fkey"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "finance_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "finance_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          organization_id: string
          payer_label: string
          property_id: string
          received_date: string
          reference: string | null
          reversal_of_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id: string
          payer_label: string
          property_id: string
          received_date: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id?: string
          payer_label?: string
          property_id?: string
          received_date?: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_receipts_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipts_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "finance_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipts_scope_reversal_fkey"
            columns: [
              "organization_id",
              "property_id",
              "currency",
              "reversal_of_id",
            ]
            isOneToOne: false
            referencedRelation: "finance_receipts"
            referencedColumns: [
              "organization_id",
              "property_id",
              "currency",
              "id",
            ]
          },
        ]
      }
      import_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          headers: Json
          id: string
          import_type: string
          mapping: Json
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          headers?: Json
          id?: string
          import_type: string
          mapping?: Json
          name?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          headers?: Json
          id?: string
          import_type?: string
          mapping?: Json
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          action_label: string
          created_at: string
          error_message: string | null
          id: string
          import_run_id: string
          issues: Json
          normalized_data: Json
          organization_id: string
          raw_data: Json
          result_action: string | null
          result_unit_id: string | null
          row_status: string
          source_row_number: number
          updated_at: string
        }
        Insert: {
          action_label: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_run_id: string
          issues?: Json
          normalized_data?: Json
          organization_id: string
          raw_data?: Json
          result_action?: string | null
          result_unit_id?: string | null
          row_status: string
          source_row_number: number
          updated_at?: string
        }
        Update: {
          action_label?: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_run_id?: string
          issues?: Json
          normalized_data?: Json
          organization_id?: string
          raw_data?: Json
          result_action?: string | null
          result_unit_id?: string | null
          row_status?: string
          source_row_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_result_unit_id_fkey"
            columns: ["result_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by: string | null
          created_count: number
          error_message: string | null
          error_rows: number
          failed_count: number
          headers: Json
          id: string
          import_type: string
          mapping: Json
          organization_id: string
          ready_rows: number
          skipped_count: number
          source_file_name: string
          source_file_size: number
          source_mime_type: string | null
          status: string
          total_rows: number
          updated_at: string
          updated_by: string | null
          updated_count: number
          warning_rows: number
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_message?: string | null
          error_rows?: number
          failed_count?: number
          headers?: Json
          id?: string
          import_type: string
          mapping?: Json
          organization_id: string
          ready_rows?: number
          skipped_count?: number
          source_file_name: string
          source_file_size?: number
          source_mime_type?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          updated_count?: number
          warning_rows?: number
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_message?: string | null
          error_rows?: number
          failed_count?: number
          headers?: Json
          id?: string
          import_type?: string
          mapping?: Json
          organization_id?: string
          ready_rows?: number
          skipped_count?: number
          source_file_name?: string
          source_file_size?: number
          source_mime_type?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_by?: string | null
          updated_count?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_deposit_events: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          event_date: string
          event_type: string
          id: string
          lease_deposit_id: string
          organization_id: string
          property_id: string
          reference: string | null
          reversal_of_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          event_date: string
          event_type: string
          id?: string
          lease_deposit_id: string
          organization_id: string
          property_id: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          event_date?: string
          event_type?: string
          id?: string
          lease_deposit_id?: string
          organization_id?: string
          property_id?: string
          reference?: string | null
          reversal_of_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_deposit_events_lease_deposit_id_fkey"
            columns: ["lease_deposit_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_deposit_events_org_deposit_fkey"
            columns: ["organization_id", "lease_deposit_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_deposit_events_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_deposit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_deposit_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_deposit_events_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: true
            referencedRelation: "lease_deposit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_deposit_events_scope_reversal_fkey"
            columns: [
              "organization_id",
              "property_id",
              "currency",
              "reversal_of_id",
            ]
            isOneToOne: false
            referencedRelation: "lease_deposit_events"
            referencedColumns: [
              "organization_id",
              "property_id",
              "currency",
              "id",
            ]
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
          accounting_journal_entry_id: string | null
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
          source_id: string | null
          source_type: string
          transaction_date: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_journal_entry_id?: string | null
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
          source_id?: string | null
          source_type?: string
          transaction_date: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_journal_entry_id?: string | null
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
          source_id?: string | null
          source_type?: string
          transaction_date?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_accounting_journal_entry_id_fkey"
            columns: ["accounting_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["id"]
          },
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
      organization_branches: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          branch_id: string | null
          created_at: string
          delivery_error: string | null
          delivery_method: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string | null
          last_sent_at: string | null
          organization_id: string
          person_id: string | null
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          delivery_error?: string | null
          delivery_method?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_sent_at?: string | null
          organization_id: string
          person_id?: string | null
          revoked_at?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          delivery_error?: string | null
          delivery_method?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_sent_at?: string | null
          organization_id?: string
          person_id?: string | null
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_branch_organization_fk"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_person_organization_fk"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          organization_id: string
          person_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          person_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          person_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_branch_fk"
            columns: ["organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "organization_branches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_person_fk"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_teams: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          manager_person_id: string | null
          name: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          manager_person_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          manager_person_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_teams_branch_fk"
            columns: ["organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "organization_branches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_teams_manager_person_fk"
            columns: ["organization_id", "manager_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_teams_organization_id_fkey"
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
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          khr_per_usd?: number
          name: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          khr_per_usd?: number
          name?: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
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
      petty_cash_accounts: {
        Row: {
          account_number: string
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          custodian_person_id: string | null
          float_amount: number
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          custodian_person_id?: string | null
          float_amount?: number
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          custodian_person_id?: string | null
          float_amount?: number
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_accounts_custodian_person_id_fkey"
            columns: ["custodian_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_entries: {
        Row: {
          account_id: string
          archived_at: string | null
          archived_by: string | null
          category: string
          clear_date: string | null
          company_loss_amount: number
          counterparty_person_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          economic_scope: string
          entry_kind: string
          id: string
          in_amount: number
          invoice_date: string
          ledger_entry_id: string | null
          organization_id: string
          out_amount: number
          owner_bill_status: string
          owner_reimbursable_amount: number
          owner_reimbursed_amount: number
          period_id: string
          property_id: string | null
          receipt_reference: string | null
          remark: string | null
          status: string
          supplier: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          archived_by?: string | null
          category: string
          clear_date?: string | null
          company_loss_amount?: number
          counterparty_person_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          economic_scope?: string
          entry_kind?: string
          id?: string
          in_amount?: number
          invoice_date: string
          ledger_entry_id?: string | null
          organization_id: string
          out_amount?: number
          owner_bill_status?: string
          owner_reimbursable_amount?: number
          owner_reimbursed_amount?: number
          period_id: string
          property_id?: string | null
          receipt_reference?: string | null
          remark?: string | null
          status?: string
          supplier?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          clear_date?: string | null
          company_loss_amount?: number
          counterparty_person_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          economic_scope?: string
          entry_kind?: string
          id?: string
          in_amount?: number
          invoice_date?: string
          ledger_entry_id?: string | null
          organization_id?: string
          out_amount?: number
          owner_bill_status?: string
          owner_reimbursable_amount?: number
          owner_reimbursed_amount?: number
          period_id?: string
          property_id?: string | null
          receipt_reference?: string | null
          remark?: string | null
          status?: string
          supplier?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_counterparty_person_id_fkey"
            columns: ["counterparty_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_entries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_periods: {
        Row: {
          account_id: string
          advance_amount: number
          counted_cash_amount: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opening_balance_amount: number
          organization_id: string
          period_start: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          advance_amount?: number
          counted_cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opening_balance_amount?: number
          organization_id: string
          period_start: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          advance_amount?: number
          counted_cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opening_balance_amount?: number
          organization_id?: string
          period_start?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_periods_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "petty_cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      public_interest_requests: {
        Row: {
          company_name: string
          full_name: string
          id: string
          message: string | null
          portfolio_size: string | null
          request_type: string
          status: string
          submission_date: string
          submitted_at: string
          updated_at: string
          work_email: string
        }
        Insert: {
          company_name: string
          full_name: string
          id?: string
          message?: string | null
          portfolio_size?: string | null
          request_type: string
          status?: string
          submission_date?: string
          submitted_at?: string
          updated_at?: string
          work_email: string
        }
        Update: {
          company_name?: string
          full_name?: string
          id?: string
          message?: string | null
          portfolio_size?: string | null
          request_type?: string
          status?: string
          submission_date?: string
          submitted_at?: string
          updated_at?: string
          work_email?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_cost_amount: number | null
          actual_cost_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          archived_at: string | null
          archived_by: string | null
          assignee_person_id: string | null
          blocked_reason: string | null
          branch_id: string | null
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
          assignee_person_id?: string | null
          blocked_reason?: string | null
          branch_id?: string | null
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
          assignee_person_id?: string | null
          blocked_reason?: string | null
          branch_id?: string | null
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
            foreignKeyName: "tasks_assignee_person_fk"
            columns: ["organization_id", "assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tasks_branch_fk"
            columns: ["organization_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "organization_branches"
            referencedColumns: ["organization_id", "id"]
          },
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
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_request_fk"
            columns: ["tenant_request_id"]
            isOneToOne: false
            referencedRelation: "tenant_requests"
            referencedColumns: ["id"]
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
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_vendor_person_fk"
            columns: ["vendor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
            foreignKeyName: "tenant_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_requests_requested_by_person_id_fkey"
            columns: ["requested_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
      accept_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      archive_asset_photo: {
        Args: { p_organization_id: string; p_photo_id: string }
        Returns: string
      }
      archive_document: {
        Args: { p_document_id: string; p_organization_id: string }
        Returns: string
      }
      archive_lease: {
        Args: { p_lease_id: string; p_organization_id: string }
        Returns: string
      }
      archive_ledger_entry: {
        Args: { p_entry_id: string; p_organization_id: string }
        Returns: string
      }
      archive_maintenance_task: {
        Args: { p_organization_id: string; p_task_id: string }
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
      assign_maintenance_task: {
        Args: {
          p_assignee_person_id: string
          p_branch_id: string
          p_organization_id: string
          p_task_id: string
        }
        Returns: string
      }
      commit_generic_import_run: {
        Args: { p_import_run_id: string; p_organization_id: string }
        Returns: Json
      }
      commit_unit_import_run: {
        Args: { p_import_run_id: string; p_organization_id: string }
        Returns: Json
      }
      create_asset_photo: {
        Args: {
          p_caption?: string
          p_file_name: string
          p_is_cover?: boolean
          p_mime_type: string
          p_organization_id: string
          p_property_id: string
          p_size_bytes: number
          p_storage_path: string
          p_taken_at?: string
          p_unit_id: string
        }
        Returns: string
      }
      create_document: {
        Args: {
          p_activity_action?: string
          p_activity_entity_id?: string
          p_activity_entity_type?: string
          p_activity_new_values?: Json
          p_category: string
          p_file_name: string
          p_lease_id?: string
          p_ledger_entry_id?: string
          p_mime_type: string
          p_organization_id: string
          p_property_id: string
          p_size_bytes: number
          p_storage_path: string
          p_task_id?: string
          p_tenant_request_id?: string
          p_timeline_event_id?: string
          p_unit_id?: string
        }
        Returns: string
      }
      create_finance_expense_item: {
        Args: {
          p_amount: number
          p_category: string
          p_company_loss_amount?: number
          p_description: string
          p_due_date: string
          p_economic_scope?: string
          p_expense_type: string
          p_invoice_date: string
          p_organization_id: string
          p_owner_bill_status?: string
          p_owner_reimbursable_amount?: number
          p_owner_reimbursed_amount?: number
          p_property_id: string
          p_reference: string
          p_task_id: string
          p_unit_id: string
          p_vendor_label: string
          p_vendor_person_id: string
        }
        Returns: string
      }
      create_finance_income_item: {
        Args: {
          p_amount_due: number
          p_amount_received: number
          p_description: string
          p_due_date: string
          p_income_type: string
          p_lease_id: string
          p_organization_id: string
          p_payer_label: string
          p_payer_person_id?: string
          p_property_id: string
          p_received_date: string
          p_reference: string
          p_unit_id: string
        }
        Returns: string
      }
      create_lease: {
        Args: {
          p_deposit_amount: number
          p_deposit_currency: Database["public"]["Enums"]["currency_code"]
          p_lease_end_date: string
          p_lease_start_date: string
          p_monthly_rent_amount: number
          p_monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_organization_id: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_status: string
          p_unit_id: string
        }
        Returns: string
      }
      create_ledger_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_direction: string
          p_organization_id: string
          p_property_id: string
          p_transaction_date: string
          p_unit_id: string
        }
        Returns: string
      }
      create_maintenance_task: {
        Args: {
          p_assignee_person_id?: string
          p_branch_id?: string
          p_category: string
          p_checklist: Json
          p_cost_estimate_amount: number
          p_cost_estimate_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_due_date: string
          p_due_time: string
          p_organization_id: string
          p_priority: string
          p_property_id: string
          p_recurrence_frequency: string
          p_reminder_date: string
          p_reminder_time: string
          p_status: string
          p_title: string
          p_unit_id: string
          p_vendor_person_id: string
        }
        Returns: string
      }
      create_organization_branch: {
        Args: {
          p_address: string
          p_code: string
          p_name: string
          p_organization_id: string
        }
        Returns: string
      }
      create_organization_invitation: {
        Args: {
          p_branch_id: string
          p_email: string
          p_organization_id: string
          p_person_id: string
          p_role: string
        }
        Returns: string
      }
      create_organization_team: {
        Args: {
          p_branch_id: string
          p_manager_person_id: string
          p_name: string
          p_organization_id: string
        }
        Returns: string
      }
      create_person: {
        Args: {
          p_display_name: string
          p_legal_name: string
          p_notes: string
          p_organization_id: string
          p_party_type: string
          p_primary_email: string
          p_primary_phone: string
          p_roles: string[]
          p_tax_identifier: string
        }
        Returns: string
      }
      create_petty_cash_account: {
        Args: {
          p_account_number: string
          p_custodian_person_id?: string
          p_float_amount: number
          p_name: string
          p_organization_id: string
        }
        Returns: string
      }
      create_petty_cash_entry: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category: string
          p_clear_date: string
          p_company_loss_amount?: number
          p_counterparty_person_id?: string
          p_description: string
          p_economic_scope?: string
          p_entry_kind: string
          p_invoice_date: string
          p_organization_id: string
          p_owner_bill_status?: string
          p_owner_reimbursable_amount?: number
          p_owner_reimbursed_amount?: number
          p_period_id: string
          p_property_id: string
          p_receipt_reference?: string
          p_remark?: string
          p_status: string
          p_supplier: string
          p_unit_id: string
        }
        Returns: string
      }
      create_property: {
        Args: {
          p_acquisition_date: string
          p_address: string
          p_code: string
          p_name: string
          p_notes: string
          p_organization_id: string
          p_owner: string
          p_owner_person_id?: string
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      create_timeline_event: {
        Args: {
          p_cost_amount: number
          p_cost_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_event_date: string
          p_event_type: Database["public"]["Enums"]["timeline_event_type"]
          p_organization_id: string
          p_property_id: string
          p_title: string
          p_unit_id: string
        }
        Returns: string
      }
      create_unit: {
        Args: {
          p_current_rent_amount: number
          p_current_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_floor: string
          p_organization_id: string
          p_property_id: string
          p_size_sqm: number
          p_status: string
          p_unit_number: string
        }
        Returns: string
      }
      execute_assigned_maintenance_task: {
        Args: {
          p_action: string
          p_blocked_reason?: string
          p_checklist_completed?: boolean
          p_checklist_item_id?: string
          p_organization_id: string
          p_task_id: string
        }
        Returns: string
      }
      execute_coordinated_maintenance_task: {
        Args: {
          p_action: string
          p_note?: string
          p_organization_id: string
          p_task_id: string
        }
        Returns: string
      }
      generate_monthly_rent_income_items: {
        Args: { p_month?: string; p_organization_id: string }
        Returns: number
      }
      get_finance_expense_scoped_summary: {
        Args: {
          p_expense_type?: string
          p_invoice_before: string
          p_invoice_from: string
          p_organization_id: string
          p_property_id?: string
          p_query?: string
          p_status?: string
          p_today: string
          p_unit_id?: string
        }
        Returns: {
          approved_count: number
          draft_count: number
          overdue_count: number
          posted_total: number
          unposted_total: number
        }[]
      }
      get_finance_expense_workflow_summary: {
        Args: {
          p_invoice_before: string
          p_invoice_from: string
          p_organization_id: string
          p_property_id: string
          p_query: string
          p_status: string
          p_today: string
          p_unit_id: string
        }
        Returns: {
          approved_count: number
          draft_count: number
          overdue_count: number
          posted_total: number
          unposted_total: number
        }[]
      }
      get_finance_income_workflow_summary: {
        Args: {
          p_due_before: string
          p_due_from: string
          p_organization_id: string
          p_property_id: string
          p_query: string
          p_status: string
          p_today: string
          p_unit_id: string
        }
        Returns: {
          open_count: number
          overdue_count: number
          receivable_total: number
          received_total: number
          unposted_count: number
        }[]
      }
      get_finance_payment_drilldown: {
        Args: {
          p_expense_type?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_paid_before: string
          p_paid_from: string
          p_property_id?: string
          p_query?: string
          p_status?: string
          p_unit_id?: string
        }
        Returns: {
          allocation_amount: number
          expense: Json
          paid_date: string
          payment_id: string
          payment_reference: string
          reversal_of_id: string
          scoped_amount: number
          total_count: number
        }[]
      }
      get_maintenance_execution_members: {
        Args: { p_organization_id: string }
        Returns: {
          branch_id: string
          person_id: string
        }[]
      }
      get_maintenance_vendor_options: {
        Args: { p_organization_id: string }
        Returns: {
          id: string
          label: string
        }[]
      }
      get_organization_access_members: {
        Args: { p_organization_id: string }
        Returns: {
          branch_id: string
          email: string
          id: string
          person_id: string
          role: string
          user_id: string
        }[]
      }
      get_organization_invitation_for_acceptance: {
        Args: { p_invitation_id: string }
        Returns: {
          expires_at: string
          invitation_id: string
          invitation_status: string
          invited_role: string
          organization_name: string
          password_required: boolean
          scope_name: string
          staff_name: string
        }[]
      }
      mark_organization_invitation_delivery_failed: {
        Args: { p_error: string; p_invitation_id: string }
        Returns: string
      }
      mark_organization_invitation_sent: {
        Args: {
          p_auth_user_id: string
          p_delivery_method: string
          p_invitation_id: string
        }
        Returns: string
      }
      open_next_petty_cash_period: {
        Args: {
          p_account_id: string
          p_advance_amount?: number
          p_organization_id: string
          p_period_id: string
        }
        Returns: string
      }
      post_accounting_journal: {
        Args: {
          p_book_id: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_entry_date: string
          p_lines: Json
          p_organization_id: string
          p_posting_key: string
          p_reference: string
          p_source_id: string
          p_source_type: string
        }
        Returns: string
      }
      post_finance_expense_item: {
        Args: {
          p_expense_item_id: string
          p_organization_id: string
          p_paid_date?: string
        }
        Returns: string
      }
      post_finance_income_item: {
        Args: { p_income_item_id: string; p_organization_id: string }
        Returns: string
      }
      post_petty_cash_entry: {
        Args: { p_entry_id: string; p_organization_id: string }
        Returns: string
      }
      provision_client_workspace: {
        Args: { p_admin_email: string; p_name: string; p_slug: string }
        Returns: {
          invitation_id: string
          invitation_status: string
          invited_email: string
          organization_id: string
          organization_name: string
          workspace_slug: string
        }[]
      }
      record_finance_income_payment: {
        Args: {
          p_amount_received: number
          p_income_item_id: string
          p_organization_id: string
          p_received_date: string
          p_reference: string
        }
        Returns: undefined
      }
      record_finance_payment: {
        Args: {
          p_amount: number
          p_expense_item_id: string
          p_organization_id: string
          p_paid_date: string
          p_reference?: string
        }
        Returns: string
      }
      record_finance_receipt: {
        Args: {
          p_amount: number
          p_income_item_id: string
          p_organization_id: string
          p_received_date: string
          p_reference?: string
        }
        Returns: string
      }
      record_lease_deposit_event: {
        Args: {
          p_amount: number
          p_event_date: string
          p_event_type: string
          p_lease_deposit_id: string
          p_organization_id: string
          p_reference?: string
        }
        Returns: string
      }
      refresh_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          email: string
          invitation_id: string
        }[]
      }
      remove_organization_member_access: {
        Args: { p_member_id: string; p_organization_id: string }
        Returns: string
      }
      restore_document: {
        Args: { p_document_id: string; p_organization_id: string }
        Returns: string
      }
      restore_lease: {
        Args: { p_lease_id: string; p_organization_id: string }
        Returns: string
      }
      restore_ledger_entry: {
        Args: { p_entry_id: string; p_organization_id: string }
        Returns: string
      }
      restore_maintenance_task: {
        Args: { p_organization_id: string; p_task_id: string }
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
      reverse_accounting_journal: {
        Args: {
          p_journal_id: string
          p_organization_id: string
          p_reason: string
          p_reversal_date: string
        }
        Returns: string
      }
      reverse_finance_payment: {
        Args: {
          p_organization_id: string
          p_payment_id: string
          p_reference?: string
          p_reversal_date: string
        }
        Returns: string
      }
      reverse_finance_receipt: {
        Args: {
          p_organization_id: string
          p_receipt_id: string
          p_reference?: string
          p_reversal_date: string
        }
        Returns: string
      }
      reverse_lease_deposit_event: {
        Args: {
          p_event_date: string
          p_event_id: string
          p_organization_id: string
          p_reference?: string
        }
        Returns: string
      }
      review_maintenance_task_completion: {
        Args: {
          p_action: string
          p_organization_id: string
          p_review_note?: string
          p_task_id: string
        }
        Returns: string
      }
      revoke_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      set_accounting_period_lock: {
        Args: {
          p_book_id: string
          p_locked: boolean
          p_organization_id: string
          p_period_start: string
          p_reason: string
        }
        Returns: undefined
      }
      set_asset_photo_cover: {
        Args: { p_organization_id: string; p_photo_id: string }
        Returns: string
      }
      set_finance_expense_status: {
        Args: {
          p_expense_item_id: string
          p_organization_id: string
          p_status: string
        }
        Returns: undefined
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
          p_file_name?: string
          p_lease_id?: string
          p_mime_type?: string
          p_organization_id: string
          p_property_id: string
          p_size_bytes?: number
          p_storage_path?: string
          p_task_id?: string
          p_unit_id?: string
        }
        Returns: string
      }
      update_lease: {
        Args: {
          p_deposit_amount: number
          p_deposit_currency: Database["public"]["Enums"]["currency_code"]
          p_lease_end_date: string
          p_lease_id: string
          p_lease_start_date: string
          p_monthly_rent_amount: number
          p_monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_organization_id: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_status: string
          p_unit_id: string
        }
        Returns: string
      }
      update_ledger_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_direction: string
          p_entry_id: string
          p_organization_id: string
          p_property_id: string
          p_transaction_date: string
          p_unit_id: string
        }
        Returns: string
      }
      update_maintenance_task: {
        Args: {
          p_actual_cost_amount: number
          p_actual_cost_currency: Database["public"]["Enums"]["currency_code"]
          p_assignee_person_id?: string
          p_branch_id?: string
          p_category: string
          p_checklist: Json
          p_cost_estimate_amount: number
          p_cost_estimate_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_due_date: string
          p_due_time: string
          p_link_actual_cost_to_ledger: boolean
          p_organization_id: string
          p_priority: string
          p_property_id: string
          p_recurrence_frequency: string
          p_reminder_date: string
          p_reminder_time: string
          p_status: string
          p_task_id: string
          p_title: string
          p_unit_id: string
          p_vendor_person_id: string
        }
        Returns: string
      }
      update_organization_member_access: {
        Args: {
          p_branch_id: string
          p_member_id: string
          p_organization_id: string
          p_person_id: string
          p_role: string
        }
        Returns: string
      }
      update_person: {
        Args: {
          p_display_name: string
          p_legal_name: string
          p_notes: string
          p_organization_id: string
          p_party_type: string
          p_person_id: string
          p_primary_email: string
          p_primary_phone: string
          p_roles: string[]
          p_tax_identifier: string
        }
        Returns: string
      }
      update_petty_cash_entry: {
        Args: {
          p_amount: number
          p_category: string
          p_clear_date: string
          p_company_loss_amount?: number
          p_counterparty_person_id?: string
          p_description: string
          p_economic_scope?: string
          p_entry_id: string
          p_entry_kind: string
          p_invoice_date: string
          p_organization_id: string
          p_owner_bill_status?: string
          p_owner_reimbursable_amount?: number
          p_owner_reimbursed_amount?: number
          p_property_id: string
          p_receipt_reference?: string
          p_remark?: string
          p_status: string
          p_supplier: string
          p_unit_id: string
        }
        Returns: Json
      }
      update_property: {
        Args: {
          p_acquisition_date: string
          p_address: string
          p_code: string
          p_name: string
          p_notes: string
          p_organization_id: string
          p_owner: string
          p_owner_person_id?: string
          p_property_id: string
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      update_timeline_event: {
        Args: {
          p_cost_amount: number
          p_cost_currency: Database["public"]["Enums"]["currency_code"]
          p_description: string
          p_event_date: string
          p_event_id: string
          p_event_type: Database["public"]["Enums"]["timeline_event_type"]
          p_organization_id: string
          p_property_id: string
          p_title: string
          p_unit_id: string
        }
        Returns: string
      }
      update_unit: {
        Args: {
          p_current_rent_amount: number
          p_current_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_floor: string
          p_organization_id: string
          p_property_id: string
          p_size_sqm: number
          p_status: string
          p_unit_id: string
          p_unit_number: string
        }
        Returns: string
      }
      void_finance_income_item: {
        Args: { p_income_item_id: string; p_organization_id: string }
        Returns: undefined
      }
      void_petty_cash_entry: {
        Args: {
          p_entry_id: string
          p_organization_id: string
          p_reason: string
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
