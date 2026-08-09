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
            foreignKeyName: "asset_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          content_sha256: string | null
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
          content_sha256?: string | null
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
          content_sha256?: string | null
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
            referencedRelation: "current_leases"
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
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
      expense_customer_adjustments: {
        Row: {
          adjustment_date: string
          amount: number
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          organization_id: string
          owner_invoice_id: string | null
          property_id: string
          reason: string
          responsibility: string
          responsibility_id: string
          submission_id: string
          tenant_income_item_id: string | null
          tenant_invoice_id: string | null
        }
        Insert: {
          adjustment_date: string
          amount: number
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id: string
          owner_invoice_id?: string | null
          property_id: string
          reason: string
          responsibility: string
          responsibility_id: string
          submission_id: string
          tenant_income_item_id?: string | null
          tenant_invoice_id?: string | null
        }
        Update: {
          adjustment_date?: string
          amount?: number
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          organization_id?: string
          owner_invoice_id?: string | null
          property_id?: string
          reason?: string
          responsibility?: string
          responsibility_id?: string
          submission_id?: string
          tenant_income_item_id?: string | null
          tenant_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_customer_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_owner_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_owner_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_responsibility_fkey"
            columns: ["organization_id", "responsibility_id"]
            isOneToOne: false
            referencedRelation: "ips_expense_responsibilities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_submission_fkey"
            columns: ["organization_id", "submission_id"]
            isOneToOne: true
            referencedRelation: "expense_submissions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_tenant_income_fkey"
            columns: ["organization_id", "tenant_income_item_id"]
            isOneToOne: false
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_tenant_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_customer_adjustments_tenant_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      expense_submissions: {
        Row: {
          adjusts_submission_id: string | null
          approved_finance_expense_item_id: string | null
          approved_ledger_entry_id: string | null
          approved_payment_allocation_id: string | null
          approved_payment_id: string | null
          approved_responsibility_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_category: string
          customer_total_amount: number | null
          expense_date: string
          id: string
          idempotency_key: string
          internal_cost_amount: number
          internal_markup_amount: number
          organization_id: string
          previously_approved_amount: number | null
          property_id: string
          reconciliation_source_id: string | null
          recorded_total_amount: number | null
          reference: string | null
          request_payload_hash: string
          responsibility: string
          reversal_ledger_entry_id: string | null
          reversal_payment_allocation_id: string | null
          reversal_payment_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_type: string
          status: string
          submitted_at: string
          submitted_by: string
          supporting_document_id: string | null
          tenant_invoice_id: string | null
          unit_id: string | null
          updated_at: string
          vendor_label: string
          vendor_person_id: string | null
        }
        Insert: {
          adjusts_submission_id?: string | null
          approved_finance_expense_item_id?: string | null
          approved_ledger_entry_id?: string | null
          approved_payment_allocation_id?: string | null
          approved_payment_id?: string | null
          approved_responsibility_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_category: string
          customer_total_amount?: number | null
          expense_date: string
          id?: string
          idempotency_key: string
          internal_cost_amount: number
          internal_markup_amount?: number
          organization_id: string
          previously_approved_amount?: number | null
          property_id: string
          reconciliation_source_id?: string | null
          recorded_total_amount?: number | null
          reference?: string | null
          request_payload_hash: string
          responsibility: string
          reversal_ledger_entry_id?: string | null
          reversal_payment_allocation_id?: string | null
          reversal_payment_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          submitted_at?: string
          submitted_by: string
          supporting_document_id?: string | null
          tenant_invoice_id?: string | null
          unit_id?: string | null
          updated_at?: string
          vendor_label: string
          vendor_person_id?: string | null
        }
        Update: {
          adjusts_submission_id?: string | null
          approved_finance_expense_item_id?: string | null
          approved_ledger_entry_id?: string | null
          approved_payment_allocation_id?: string | null
          approved_payment_id?: string | null
          approved_responsibility_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_category?: string
          customer_total_amount?: number | null
          expense_date?: string
          id?: string
          idempotency_key?: string
          internal_cost_amount?: number
          internal_markup_amount?: number
          organization_id?: string
          previously_approved_amount?: number | null
          property_id?: string
          reconciliation_source_id?: string | null
          recorded_total_amount?: number | null
          reference?: string | null
          request_payload_hash?: string
          responsibility?: string
          reversal_ledger_entry_id?: string | null
          reversal_payment_allocation_id?: string | null
          reversal_payment_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          supporting_document_id?: string | null
          tenant_invoice_id?: string | null
          unit_id?: string | null
          updated_at?: string
          vendor_label?: string
          vendor_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_submissions_adjusts_submission_fkey"
            columns: ["organization_id", "adjusts_submission_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_document_fkey"
            columns: ["supporting_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_expense_fkey"
            columns: ["organization_id", "approved_finance_expense_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_fkey"
            columns: ["approved_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_payment_allocation_fkey"
            columns: ["organization_id", "approved_payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_allocations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_payment_fkey"
            columns: ["organization_id", "approved_payment_id"]
            isOneToOne: false
            referencedRelation: "finance_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "expense_submissions_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_responsibility_fkey"
            columns: ["organization_id", "approved_responsibility_id"]
            isOneToOne: false
            referencedRelation: "ips_expense_responsibilities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_reversal_allocation_fkey"
            columns: ["organization_id", "reversal_payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_allocations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_reversal_ledger_fkey"
            columns: ["reversal_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_reversal_payment_fkey"
            columns: ["organization_id", "reversal_payment_id"]
            isOneToOne: false
            referencedRelation: "finance_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_source_task_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_tenant_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_tenant_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_unit_fkey"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "expense_submissions_vendor_fkey"
            columns: ["organization_id", "vendor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
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
            foreignKeyName: "finance_expense_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          rent_billing_period_start: string | null
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
          rent_billing_period_start?: string | null
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
          rent_billing_period_start?: string | null
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
            referencedRelation: "current_leases"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "finance_income_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          currency: Database["public"]["Enums"]["currency_code"]
          economic_scope_snapshot: string
          expense_item_id: string
          expense_type_snapshot: string
          id: string
          ledger_entry_id: string | null
          organization_id: string
          paid_date: string
          payment_id: string
          property_id: string
          reconciliation_source_id: string
          reversal_of_allocation_id: string | null
          settlement_contract_version: string
          signed_amount: number
          unit_id: string | null
          vendor_person_id_snapshot: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          economic_scope_snapshot: string
          expense_item_id: string
          expense_type_snapshot: string
          id?: string
          ledger_entry_id?: string | null
          organization_id: string
          paid_date: string
          payment_id: string
          property_id: string
          reconciliation_source_id: string
          reversal_of_allocation_id?: string | null
          settlement_contract_version: string
          signed_amount: number
          unit_id?: string | null
          vendor_person_id_snapshot?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          economic_scope_snapshot?: string
          expense_item_id?: string
          expense_type_snapshot?: string
          id?: string
          ledger_entry_id?: string | null
          organization_id?: string
          paid_date?: string
          payment_id?: string
          property_id?: string
          reconciliation_source_id?: string
          reversal_of_allocation_id?: string | null
          settlement_contract_version?: string
          signed_amount?: number
          unit_id?: string | null
          vendor_person_id_snapshot?: string | null
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
            foreignKeyName: "finance_payment_allocations_ledger_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
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
            foreignKeyName: "finance_payment_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_org_unit_fkey"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          {
            foreignKeyName: "finance_payment_allocations_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_allocation_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_allocations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_payment_allocations_vendor_fkey"
            columns: ["organization_id", "vendor_person_id_snapshot"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
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
          reconciliation_source_id: string | null
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
          reconciliation_source_id?: string | null
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
          reconciliation_source_id?: string | null
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
            foreignKeyName: "finance_payments_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "finance_payments_org_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
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
            foreignKeyName: "finance_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          calculation_material_hash: string | null
          charge_occurrence_id: string | null
          classification_evidence_hash: string | null
          classification_evidence_kind: string | null
          classification_evidence_version: number | null
          committed_at: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          economic_class: string | null
          external_reference: string | null
          id: string
          income_item_id: string
          income_type_snapshot: string | null
          invoice_header_id: string | null
          invoice_line_id: string | null
          invoice_version_id: string | null
          lease_id: string | null
          lease_term_id_snapshot: string | null
          lease_term_version_snapshot: number | null
          ledger_entry_id: string | null
          obligation_type: string | null
          organization_id: string
          outstanding_balance_after: number | null
          payer_label_snapshot: string | null
          payer_person_id_snapshot: string | null
          property_id: string
          receipt_id: string
          received_date: string
          reconciliation_source_id: string
          relationship_evidence_hash: string | null
          reversal_of_allocation_id: string | null
          settlement_activation_version: number | null
          settlement_basis: string | null
          settlement_contract_version: string
          settlement_sequence: number | null
          signed_amount: number
          source_discriminator: string | null
          unit_id: string | null
        }
        Insert: {
          amount: number
          calculation_material_hash?: string | null
          charge_occurrence_id?: string | null
          classification_evidence_hash?: string | null
          classification_evidence_kind?: string | null
          classification_evidence_version?: number | null
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          economic_class?: string | null
          external_reference?: string | null
          id?: string
          income_item_id: string
          income_type_snapshot?: string | null
          invoice_header_id?: string | null
          invoice_line_id?: string | null
          invoice_version_id?: string | null
          lease_id?: string | null
          lease_term_id_snapshot?: string | null
          lease_term_version_snapshot?: number | null
          ledger_entry_id?: string | null
          obligation_type?: string | null
          organization_id: string
          outstanding_balance_after?: number | null
          payer_label_snapshot?: string | null
          payer_person_id_snapshot?: string | null
          property_id: string
          receipt_id: string
          received_date: string
          reconciliation_source_id: string
          relationship_evidence_hash?: string | null
          reversal_of_allocation_id?: string | null
          settlement_activation_version?: number | null
          settlement_basis?: string | null
          settlement_contract_version: string
          settlement_sequence?: number | null
          signed_amount: number
          source_discriminator?: string | null
          unit_id?: string | null
        }
        Update: {
          amount?: number
          calculation_material_hash?: string | null
          charge_occurrence_id?: string | null
          classification_evidence_hash?: string | null
          classification_evidence_kind?: string | null
          classification_evidence_version?: number | null
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          economic_class?: string | null
          external_reference?: string | null
          id?: string
          income_item_id?: string
          income_type_snapshot?: string | null
          invoice_header_id?: string | null
          invoice_line_id?: string | null
          invoice_version_id?: string | null
          lease_id?: string | null
          lease_term_id_snapshot?: string | null
          lease_term_version_snapshot?: number | null
          ledger_entry_id?: string | null
          obligation_type?: string | null
          organization_id?: string
          outstanding_balance_after?: number | null
          payer_label_snapshot?: string | null
          payer_person_id_snapshot?: string | null
          property_id?: string
          receipt_id?: string
          received_date?: string
          reconciliation_source_id?: string
          relationship_evidence_hash?: string | null
          reversal_of_allocation_id?: string | null
          settlement_activation_version?: number | null
          settlement_basis?: string | null
          settlement_contract_version?: string
          settlement_sequence?: number | null
          signed_amount?: number
          source_discriminator?: string | null
          unit_id?: string | null
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
            foreignKeyName: "finance_receipt_allocations_ledger_entry_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
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
            foreignKeyName: "finance_receipt_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_org_receipt_fkey"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "finance_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "finance_receipt_allocations_org_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
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
          {
            foreignKeyName: "finance_receipt_allocations_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_allocation_id"]
            isOneToOne: false
            referencedRelation: "finance_receipt_allocations"
            referencedColumns: ["organization_id", "id"]
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
          reconciliation_source_id: string | null
          reference: string | null
          reversal_of_id: string | null
          settlement_contract_version: string
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
          reconciliation_source_id?: string | null
          reference?: string | null
          reversal_of_id?: string | null
          settlement_contract_version: string
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
          reconciliation_source_id?: string | null
          reference?: string | null
          reversal_of_id?: string | null
          settlement_contract_version?: string
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
            foreignKeyName: "finance_receipts_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "finance_receipts_org_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
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
            foreignKeyName: "finance_receipts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
      financial_month_locks: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          locked_at: string
          locked_by: string
          month_start: string
          organization_id: string
          reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          locked_at?: string
          locked_by: string
          month_start: string
          organization_id: string
          reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          locked_at?: string
          locked_by?: string
          month_start?: string
          organization_id?: string
          reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_month_locks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reconciliation_sources: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          display_name: string
          id: string
          masked_reference: string | null
          organization_id: string
          property_id: string | null
          scope_kind: string
          source_kind: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          display_name: string
          id?: string
          masked_reference?: string | null
          organization_id: string
          property_id?: string | null
          scope_kind: string
          source_kind: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          display_name?: string
          id?: string
          masked_reference?: string | null
          organization_id?: string
          property_id?: string | null
          scope_kind?: string
          source_kind?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_reconciliation_sources_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_reconciliation_sources_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "financial_reconciliation_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          result_lease_id: string | null
          result_lease_occupancy_id: string | null
          result_lease_party_id: string | null
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
          result_lease_id?: string | null
          result_lease_occupancy_id?: string | null
          result_lease_party_id?: string | null
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
          result_lease_id?: string | null
          result_lease_occupancy_id?: string | null
          result_lease_party_id?: string | null
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
            foreignKeyName: "import_rows_organization_id_import_run_id_fkey"
            columns: ["organization_id", "import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "import_rows_result_lease_occupancy_org_fk"
            columns: ["organization_id", "result_lease_occupancy_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "import_rows_result_lease_org_fk"
            columns: ["organization_id", "result_lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "import_rows_result_lease_org_fk"
            columns: ["organization_id", "result_lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "import_rows_result_lease_party_org_fk"
            columns: ["organization_id", "result_lease_party_id"]
            isOneToOne: false
            referencedRelation: "lease_parties"
            referencedColumns: ["organization_id", "id"]
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
          snapshot_hash: string | null
          source_claim_hash: string | null
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
          snapshot_hash?: string | null
          source_claim_hash?: string | null
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
          snapshot_hash?: string | null
          source_claim_hash?: string | null
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
      ips_expense_responsibilities: {
        Row: {
          created_at: string
          created_by: string | null
          customer_category: string
          customer_label: string
          customer_total_amount: number
          finance_expense_item_id: string
          held_cash_amount: number
          id: string
          idempotency_key: string
          internal_cost_amount: number
          internal_markup_amount: number
          ips_advance_amount: number
          organization_id: string
          owner_invoice_line_id: string | null
          property_id: string
          responsibility: string
          responsible_person_id: string
          supporting_document_id: string | null
          tenant_invoice_line_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_category: string
          customer_label: string
          customer_total_amount: number
          finance_expense_item_id: string
          held_cash_amount?: number
          id?: string
          idempotency_key: string
          internal_cost_amount: number
          internal_markup_amount?: number
          ips_advance_amount?: number
          organization_id: string
          owner_invoice_line_id?: string | null
          property_id: string
          responsibility: string
          responsible_person_id: string
          supporting_document_id?: string | null
          tenant_invoice_line_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_category?: string
          customer_label?: string
          customer_total_amount?: number
          finance_expense_item_id?: string
          held_cash_amount?: number
          id?: string
          idempotency_key?: string
          internal_cost_amount?: number
          internal_markup_amount?: number
          ips_advance_amount?: number
          organization_id?: string
          owner_invoice_line_id?: string | null
          property_id?: string
          responsibility?: string
          responsible_person_id?: string
          supporting_document_id?: string | null
          tenant_invoice_line_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ips_expense_responsibilities_expense_fkey"
            columns: ["organization_id", "finance_expense_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expense_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_owner_line_fkey"
            columns: ["organization_id", "owner_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_person_fkey"
            columns: ["organization_id", "responsible_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_supporting_document_id_fkey"
            columns: ["supporting_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_tenant_line_fkey"
            columns: ["organization_id", "tenant_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_line_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ips_expense_responsibilities_tenant_line_fkey"
            columns: ["organization_id", "tenant_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_billing_terms: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          billing_recipient_kind: string
          billing_recipient_person_id: string
          charge_management_fee_when_active: boolean
          collection_route: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_range: unknown
          effective_to: string
          final_period_prorated_amount: number | null
          first_period_prorated_amount: number | null
          full_management_fee_during_proration: boolean
          id: string
          lease_id: string
          management_fee_mode: string
          management_fee_value: number
          organization_id: string
          property_id: string
          superseded_at: string | null
          superseded_by: string | null
          supersedes_billing_term_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          billing_recipient_kind: string
          billing_recipient_person_id: string
          charge_management_fee_when_active?: boolean
          collection_route: string
          confirmed_at?: string
          confirmed_by: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_range?: unknown
          effective_to: string
          final_period_prorated_amount?: number | null
          first_period_prorated_amount?: number | null
          full_management_fee_during_proration?: boolean
          id?: string
          lease_id: string
          management_fee_mode: string
          management_fee_value: number
          organization_id: string
          property_id: string
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_billing_term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          billing_recipient_kind?: string
          billing_recipient_person_id?: string
          charge_management_fee_when_active?: boolean
          collection_route?: string
          confirmed_at?: string
          confirmed_by?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_range?: unknown
          effective_to?: string
          final_period_prorated_amount?: number | null
          first_period_prorated_amount?: number | null
          full_management_fee_during_proration?: boolean
          id?: string
          lease_id?: string
          management_fee_mode?: string
          management_fee_value?: number
          organization_id?: string
          property_id?: string
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_billing_term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_billing_terms_billing_recipient_fkey"
            columns: ["organization_id", "billing_recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_billing_terms_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_billing_terms_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_billing_terms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_billing_terms_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_billing_terms_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "lease_billing_terms_supersedes_fkey"
            columns: [
              "organization_id",
              "lease_id",
              "supersedes_billing_term_id",
            ]
            isOneToOne: false
            referencedRelation: "lease_billing_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
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
          ledger_entry_id: string | null
          organization_id: string
          property_id: string
          reconciliation_source_id: string | null
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
          ledger_entry_id?: string | null
          organization_id: string
          property_id: string
          reconciliation_source_id?: string | null
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
          ledger_entry_id?: string | null
          organization_id?: string
          property_id?: string
          reconciliation_source_id?: string | null
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
            foreignKeyName: "lease_deposit_events_ledger_entry_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
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
            foreignKeyName: "lease_deposit_events_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "lease_deposit_events_org_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
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
            foreignKeyName: "lease_deposit_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
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
          actual_effective_range: unknown
          actual_move_in_confidence: string
          actual_move_in_date: string | null
          actual_move_in_kind: string
          actual_move_out_confidence: string
          actual_move_out_date: string | null
          actual_move_out_kind: string
          archived_at: string | null
          archived_by: string | null
          business_lifecycle: string
          correction_reason: string | null
          correction_request_id: string | null
          created_at: string
          created_by: string | null
          evidence_reason: string
          evidence_recorded_at: string
          evidence_recorded_by: string | null
          evidence_state: string
          id: string
          lease_id: string
          notice_confidence: string
          notice_date: string | null
          notice_kind: string
          organization_id: string
          property_id: string
          protected_occupancy_range: unknown
          record_source: string
          scheduled_effective_range: unknown
          scheduled_move_in_confidence: string
          scheduled_move_in_date: string | null
          scheduled_move_in_kind: string
          scheduled_move_out_confidence: string
          scheduled_move_out_date: string | null
          scheduled_move_out_kind: string
          source_import_row_id: string | null
          status: string
          superseded_by_lease_occupancy_id: string | null
          supersedes_lease_occupancy_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_effective_range?: unknown
          actual_move_in_confidence?: string
          actual_move_in_date?: string | null
          actual_move_in_kind?: string
          actual_move_out_confidence?: string
          actual_move_out_date?: string | null
          actual_move_out_kind?: string
          archived_at?: string | null
          archived_by?: string | null
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_reason?: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          lease_id: string
          notice_confidence?: string
          notice_date?: string | null
          notice_kind?: string
          organization_id: string
          property_id: string
          protected_occupancy_range?: unknown
          record_source?: string
          scheduled_effective_range?: unknown
          scheduled_move_in_confidence?: string
          scheduled_move_in_date?: string | null
          scheduled_move_in_kind?: string
          scheduled_move_out_confidence?: string
          scheduled_move_out_date?: string | null
          scheduled_move_out_kind?: string
          source_import_row_id?: string | null
          status?: string
          superseded_by_lease_occupancy_id?: string | null
          supersedes_lease_occupancy_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_effective_range?: unknown
          actual_move_in_confidence?: string
          actual_move_in_date?: string | null
          actual_move_in_kind?: string
          actual_move_out_confidence?: string
          actual_move_out_date?: string | null
          actual_move_out_kind?: string
          archived_at?: string | null
          archived_by?: string | null
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_reason?: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          lease_id?: string
          notice_confidence?: string
          notice_date?: string | null
          notice_kind?: string
          organization_id?: string
          property_id?: string
          protected_occupancy_range?: unknown
          record_source?: string
          scheduled_effective_range?: unknown
          scheduled_move_in_confidence?: string
          scheduled_move_in_date?: string | null
          scheduled_move_in_kind?: string
          scheduled_move_out_confidence?: string
          scheduled_move_out_date?: string | null
          scheduled_move_out_kind?: string
          source_import_row_id?: string | null
          status?: string
          superseded_by_lease_occupancy_id?: string | null
          supersedes_lease_occupancy_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_occupancies_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
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
            foreignKeyName: "lease_occupancies_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "lease_occupancies_source_import_row_fk"
            columns: ["organization_id", "source_import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_occupancies_superseded_by_fk"
            columns: ["organization_id", "superseded_by_lease_occupancy_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_occupancies_supersedes_fk"
            columns: ["organization_id", "supersedes_lease_occupancy_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancies"
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
      lease_occupancy_participants: {
        Row: {
          business_lifecycle: string
          correction_reason: string | null
          correction_request_id: string | null
          created_at: string
          created_by: string | null
          effective_range: unknown
          ended_on: string | null
          ended_on_confidence: string
          ended_on_kind: string
          evidence_reason: string
          evidence_recorded_at: string
          evidence_recorded_by: string | null
          evidence_state: string
          id: string
          lease_occupancy_id: string
          lease_party_id: string
          organization_id: string
          record_source: string
          source_import_row_id: string | null
          started_on: string | null
          started_on_confidence: string
          started_on_kind: string
          superseded_by_participant_id: string | null
          supersedes_participant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
          ended_on?: string | null
          ended_on_confidence?: string
          ended_on_kind?: string
          evidence_reason: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          lease_occupancy_id: string
          lease_party_id: string
          organization_id: string
          record_source: string
          source_import_row_id?: string | null
          started_on?: string | null
          started_on_confidence?: string
          started_on_kind?: string
          superseded_by_participant_id?: string | null
          supersedes_participant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
          ended_on?: string | null
          ended_on_confidence?: string
          ended_on_kind?: string
          evidence_reason?: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          lease_occupancy_id?: string
          lease_party_id?: string
          organization_id?: string
          record_source?: string
          source_import_row_id?: string | null
          started_on?: string | null
          started_on_confidence?: string
          started_on_kind?: string
          superseded_by_participant_id?: string | null
          supersedes_participant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_occupancy_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_participants_occupancy_fk"
            columns: ["organization_id", "lease_occupancy_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_participants_party_fk"
            columns: ["organization_id", "lease_party_id"]
            isOneToOne: false
            referencedRelation: "lease_parties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_participants_source_import_row_fk"
            columns: ["organization_id", "source_import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_participants_superseded_by_fk"
            columns: ["organization_id", "superseded_by_participant_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancy_participants"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_participants_supersedes_fk"
            columns: ["organization_id", "supersedes_participant_id"]
            isOneToOne: false
            referencedRelation: "lease_occupancy_participants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_parties: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          business_lifecycle: string
          correction_reason: string | null
          correction_request_id: string | null
          created_at: string
          created_by: string | null
          effective_range: unknown
          ended_on: string | null
          ended_on_confidence: string
          ended_on_kind: string
          evidence_reason: string
          evidence_recorded_at: string
          evidence_recorded_by: string | null
          evidence_state: string
          id: string
          is_primary: boolean
          lease_id: string
          organization_id: string
          party_role: string
          person_id: string
          record_source: string
          source_import_row_id: string | null
          started_on: string | null
          started_on_confidence: string
          started_on_kind: string
          superseded_by_lease_party_id: string | null
          supersedes_lease_party_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
          ended_on?: string | null
          ended_on_confidence?: string
          ended_on_kind?: string
          evidence_reason?: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          is_primary?: boolean
          lease_id: string
          organization_id: string
          party_role: string
          person_id: string
          record_source?: string
          source_import_row_id?: string | null
          started_on?: string | null
          started_on_confidence?: string
          started_on_kind?: string
          superseded_by_lease_party_id?: string | null
          supersedes_lease_party_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          business_lifecycle?: string
          correction_reason?: string | null
          correction_request_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
          ended_on?: string | null
          ended_on_confidence?: string
          ended_on_kind?: string
          evidence_reason?: string
          evidence_recorded_at?: string
          evidence_recorded_by?: string | null
          evidence_state?: string
          id?: string
          is_primary?: boolean
          lease_id?: string
          organization_id?: string
          party_role?: string
          person_id?: string
          record_source?: string
          source_import_row_id?: string | null
          started_on?: string | null
          started_on_confidence?: string
          started_on_kind?: string
          superseded_by_lease_party_id?: string | null
          supersedes_lease_party_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_parties_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
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
          {
            foreignKeyName: "lease_parties_source_import_row_fk"
            columns: ["organization_id", "source_import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_parties_superseded_by_fk"
            columns: ["organization_id", "superseded_by_lease_party_id"]
            isOneToOne: false
            referencedRelation: "lease_parties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "lease_parties_supersedes_fk"
            columns: ["organization_id", "supersedes_lease_party_id"]
            isOneToOne: false
            referencedRelation: "lease_parties"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      lease_terms: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          authority_kind: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          effective_range: unknown
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
          supersedes_term_id: string | null
          term_sequence: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          authority_kind?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
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
          supersedes_term_id?: string | null
          term_sequence: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          authority_kind?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_range?: unknown
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
          supersedes_term_id?: string | null
          term_sequence?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_terms_lease_fk"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
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
          {
            foreignKeyName: "lease_terms_supersedes_term_fk"
            columns: ["organization_id", "lease_id", "supersedes_term_id"]
            isOneToOne: false
            referencedRelation: "lease_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
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
          organization_id: string
          primary_tenant_person_id: string
          property_id: string
          status: string
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
          organization_id: string
          primary_tenant_person_id: string
          property_id: string
          status?: string
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
          organization_id?: string
          primary_tenant_person_id?: string
          property_id?: string
          status?: string
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
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          reversal_of_ledger_entry_id: string | null
          source_id: string | null
          source_type: string
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
          reversal_of_ledger_entry_id?: string | null
          source_id?: string | null
          source_type?: string
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
          reversal_of_ledger_entry_id?: string | null
          source_id?: string | null
          source_type?: string
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
            foreignKeyName: "ledger_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "ledger_entries_reversal_of_ledger_entry_fkey"
            columns: ["reversal_of_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
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
      management_fee_occurrences: {
        Row: {
          amount: number
          billing_term_id: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          fee_date: string
          fee_mode: string
          fee_value: number
          id: string
          lease_id: string
          organization_id: string
          property_id: string
          settlement_status: string
          tenant_invoice_id: string
        }
        Insert: {
          amount: number
          billing_term_id: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_date: string
          fee_mode: string
          fee_value: number
          id?: string
          lease_id: string
          organization_id: string
          property_id: string
          settlement_status?: string
          tenant_invoice_id: string
        }
        Update: {
          amount?: number
          billing_term_id?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_date?: string
          fee_mode?: string
          fee_value?: number
          id?: string
          lease_id?: string
          organization_id?: string
          property_id?: string
          settlement_status?: string
          tenant_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_fee_occurrences_billing_term_fkey"
            columns: ["organization_id", "lease_id", "billing_term_id"]
            isOneToOne: false
            referencedRelation: "lease_billing_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: true
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_invoice_fkey"
            columns: ["organization_id", "tenant_invoice_id"]
            isOneToOne: true
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "management_fee_occurrences_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
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
          accent_preset: string
          accent_seed: string | null
          created_at: string
          id: string
          khr_per_usd: number
          name: string
          preferred_currency: Database["public"]["Enums"]["currency_code"]
          slug: string
          theme_mode: string
          updated_at: string
        }
        Insert: {
          accent_preset?: string
          accent_seed?: string | null
          created_at?: string
          id?: string
          khr_per_usd?: number
          name: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
          slug: string
          theme_mode?: string
          updated_at?: string
        }
        Update: {
          accent_preset?: string
          accent_seed?: string | null
          created_at?: string
          id?: string
          khr_per_usd?: number
          name?: string
          preferred_currency?: Database["public"]["Enums"]["currency_code"]
          slug?: string
          theme_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      owner_charge_cash_allocations: {
        Row: {
          allocation_date: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          owner_invoice_line_id: string
          property_id: string
          reversal_of_id: string | null
        }
        Insert: {
          allocation_date: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          owner_invoice_line_id: string
          property_id: string
          reversal_of_id?: string | null
        }
        Update: {
          allocation_date?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          owner_invoice_line_id?: string
          property_id?: string
          reversal_of_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_charge_cash_allocations_line_fkey"
            columns: ["organization_id", "owner_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_charge_cash_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_charge_cash_allocations_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_charge_cash_allocations_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "owner_charge_cash_allocations_reversal_fkey"
            columns: ["organization_id", "reversal_of_id"]
            isOneToOne: false
            referencedRelation: "owner_charge_cash_allocations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      owner_collection_confirmation_allocations: {
        Row: {
          allocation_order: number
          amount: number
          confirmation_id: string
          confirmed_date: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          id: string
          income_item_id: string
          income_type_snapshot: string | null
          invoice_id: string
          invoice_line_id: string
          lease_id: string | null
          ledger_entry_id: string | null
          organization_id: string
          owner_person_id_snapshot: string | null
          property_id: string | null
          reversal_of_allocation_id: string | null
          settlement_contract_version: string | null
          signed_amount: number | null
          tenant_person_id_snapshot: string | null
          unit_id: string | null
        }
        Insert: {
          allocation_order: number
          amount: number
          confirmation_id: string
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          income_item_id: string
          income_type_snapshot?: string | null
          invoice_id: string
          invoice_line_id: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id: string
          owner_person_id_snapshot?: string | null
          property_id?: string | null
          reversal_of_allocation_id?: string | null
          settlement_contract_version?: string | null
          signed_amount?: number | null
          tenant_person_id_snapshot?: string | null
          unit_id?: string | null
        }
        Update: {
          allocation_order?: number
          amount?: number
          confirmation_id?: string
          confirmed_date?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          id?: string
          income_item_id?: string
          income_type_snapshot?: string | null
          invoice_id?: string
          invoice_line_id?: string
          lease_id?: string | null
          ledger_entry_id?: string | null
          organization_id?: string
          owner_person_id_snapshot?: string | null
          property_id?: string | null
          reversal_of_allocation_id?: string | null
          settlement_contract_version?: string | null
          signed_amount?: number | null
          tenant_person_id_snapshot?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_collection_allocations_ledger_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_org_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_org_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_org_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_org_unit_fkey"
            columns: ["organization_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_owner_fkey"
            columns: ["organization_id", "owner_person_id_snapshot"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_allocation_id"]
            isOneToOne: false
            referencedRelation: "owner_collection_confirmation_allocations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_allocations_tenant_fkey"
            columns: ["organization_id", "tenant_person_id_snapshot"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_confirmation_fkey"
            columns: ["organization_id", "confirmation_id"]
            isOneToOne: false
            referencedRelation: "owner_collection_confirmations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_income_fkey"
            columns: ["organization_id", "income_item_id"]
            isOneToOne: false
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_line_fkey"
            columns: ["organization_id", "invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_line_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_line_fkey"
            columns: ["organization_id", "invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmation_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_collection_confirmations: {
        Row: {
          amount: number
          confirmation_number: string
          confirmed_date: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          invoice_id: string
          organization_id: string
          owner_person_id: string
          reference: string | null
          reversal_of_id: string | null
          reversal_reason: string | null
        }
        Insert: {
          amount: number
          confirmation_number: string
          confirmed_date: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          invoice_id: string
          organization_id: string
          owner_person_id: string
          reference?: string | null
          reversal_of_id?: string | null
          reversal_reason?: string | null
        }
        Update: {
          amount?: number
          confirmation_number?: string
          confirmed_date?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          invoice_id?: string
          organization_id?: string
          owner_person_id?: string
          reference?: string | null
          reversal_of_id?: string | null
          reversal_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_collection_confirmations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_collection_confirmations_owner_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_collection_confirmations_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_id"]
            isOneToOne: false
            referencedRelation: "owner_collection_confirmations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      owner_invoice_lines: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_label: string
          description: string | null
          id: string
          invoice_id: string
          organization_id: string
          property_id: string
          sort_order: number
          source_id: string
          source_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_label: string
          description?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          property_id: string
          sort_order: number
          source_id: string
          source_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_label?: string
          description?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          property_id?: string
          sort_order?: number
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_invoice_lines_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoice_lines_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      owner_invoices: {
        Row: {
          billing_period_start: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string
          id: string
          idempotency_key: string | null
          invoice_number: string
          issue_date: string
          lifecycle: string
          organization_id: string
          owner_person_id: string
          property_id: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          billing_period_start: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date: string
          id?: string
          idempotency_key?: string | null
          invoice_number: string
          issue_date: string
          lifecycle?: string
          organization_id: string
          owner_person_id: string
          property_id: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          billing_period_start?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string
          id?: string
          idempotency_key?: string | null
          invoice_number?: string
          issue_date?: string
          lifecycle?: string
          organization_id?: string
          owner_person_id?: string
          property_id?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_invoices_owner_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      owner_opening_balance_entries: {
        Row: {
          component: Database["public"]["Enums"]["owner_balance_component"]
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          effective_date: string
          entry_kind: string
          id: string
          organization_id: string
          owner_person_id: string
          ownership_percent_snapshot: number
          ownership_roster_hash: string
          property_id: string
          property_owner_id: string
          request_id: string
          reversal_of_entry_id: string | null
          signed_amount: number
        }
        Insert: {
          component: Database["public"]["Enums"]["owner_balance_component"]
          created_at?: string
          created_by: string
          currency: Database["public"]["Enums"]["currency_code"]
          effective_date: string
          entry_kind: string
          id?: string
          organization_id: string
          owner_person_id: string
          ownership_percent_snapshot: number
          ownership_roster_hash: string
          property_id: string
          property_owner_id: string
          request_id: string
          reversal_of_entry_id?: string | null
          signed_amount: number
        }
        Update: {
          component?: Database["public"]["Enums"]["owner_balance_component"]
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_date?: string
          entry_kind?: string
          id?: string
          organization_id?: string
          owner_person_id?: string
          ownership_percent_snapshot?: number
          ownership_roster_hash?: string
          property_id?: string
          property_owner_id?: string
          request_id?: string
          reversal_of_entry_id?: string | null
          signed_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_opening_balance_entries_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_owner_person_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_property_owner_fkey"
            columns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "property_owner_id",
            ]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: [
              "organization_id",
              "property_id",
              "person_id",
              "id",
            ]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_request_fkey"
            columns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "request_id",
            ]
            isOneToOne: false
            referencedRelation: "owner_opening_balance_requests"
            referencedColumns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "id",
            ]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_reversal_target_fkey"
            columns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "reversal_of_entry_id",
            ]
            isOneToOne: false
            referencedRelation: "owner_opening_balance_entries"
            referencedColumns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "id",
            ]
          },
        ]
      }
      owner_opening_balance_requests: {
        Row: {
          component: Database["public"]["Enums"]["owner_balance_component"]
          correction_of_entry_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          effective_date: string
          evidence_sha256: string
          id: string
          organization_id: string
          owner_person_id: string
          ownership_percent_snapshot: number
          ownership_roster_hash: string
          payload_hash: string
          property_id: string
          property_owner_id: string
          proposed_amount: number
          reason: string
          request_kind: string
          resubmission_of_request_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_reference: string | null
          status: string
          submitted_at: string
          submitted_by: string
          supporting_document_id: string | null
        }
        Insert: {
          component: Database["public"]["Enums"]["owner_balance_component"]
          correction_of_entry_id?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          effective_date: string
          evidence_sha256: string
          id?: string
          organization_id: string
          owner_person_id: string
          ownership_percent_snapshot: number
          ownership_roster_hash: string
          payload_hash: string
          property_id: string
          property_owner_id: string
          proposed_amount: number
          reason: string
          request_kind: string
          resubmission_of_request_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_reference?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          supporting_document_id?: string | null
        }
        Update: {
          component?: Database["public"]["Enums"]["owner_balance_component"]
          correction_of_entry_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          effective_date?: string
          evidence_sha256?: string
          id?: string
          organization_id?: string
          owner_person_id?: string
          ownership_percent_snapshot?: number
          ownership_roster_hash?: string
          payload_hash?: string
          property_id?: string
          property_owner_id?: string
          proposed_amount?: number
          reason?: string
          request_kind?: string
          resubmission_of_request_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_reference?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          supporting_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_opening_balance_requests_correction_target_fkey"
            columns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "correction_of_entry_id",
            ]
            isOneToOne: false
            referencedRelation: "owner_opening_balance_entries"
            referencedColumns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "currency",
              "effective_date",
              "component",
              "id",
            ]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_document_fkey"
            columns: ["supporting_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_owner_person_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_property_owner_fkey"
            columns: [
              "organization_id",
              "property_id",
              "owner_person_id",
              "property_owner_id",
            ]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: [
              "organization_id",
              "property_id",
              "person_id",
              "id",
            ]
          },
          {
            foreignKeyName: "owner_opening_balance_requests_resubmission_fkey"
            columns: ["organization_id", "resubmission_of_request_id"]
            isOneToOne: false
            referencedRelation: "owner_opening_balance_requests"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      owner_payment_allocations: {
        Row: {
          allocation_order: number
          amount: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          owner_invoice_id: string
          owner_invoice_line_id: string
          owner_payment_id: string
        }
        Insert: {
          allocation_order: number
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          owner_invoice_id: string
          owner_invoice_line_id: string
          owner_payment_id: string
        }
        Update: {
          allocation_order?: number
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          owner_invoice_id?: string
          owner_invoice_line_id?: string
          owner_payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_payment_allocations_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payment_allocations_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payment_allocations_line_fkey"
            columns: ["organization_id", "owner_invoice_line_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_payment_allocations_payment_fkey"
            columns: ["organization_id", "owner_payment_id"]
            isOneToOne: false
            referencedRelation: "owner_payments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      owner_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          idempotency_key: string
          ledger_entry_id: string | null
          organization_id: string
          owner_invoice_id: string
          owner_person_id: string
          payment_number: string
          property_id: string
          received_date: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          idempotency_key: string
          ledger_entry_id?: string | null
          organization_id: string
          owner_invoice_id: string
          owner_person_id: string
          payment_number: string
          property_id: string
          received_date: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          idempotency_key?: string
          ledger_entry_id?: string | null
          organization_id?: string
          owner_invoice_id?: string
          owner_person_id?: string
          payment_number?: string
          property_id?: string
          received_date?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_payments_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payments_invoice_fkey"
            columns: ["organization_id", "owner_invoice_id"]
            isOneToOne: false
            referencedRelation: "owner_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payments_ledger_entry_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_payments_owner_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payments_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_payments_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
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
          reconciliation_source_id: string | null
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
          reconciliation_source_id?: string | null
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
          reconciliation_source_id?: string | null
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
            foreignKeyName: "petty_cash_entries_org_reconciliation_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
            referencedColumns: ["organization_id", "id"]
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
            foreignKeyName: "petty_cash_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          effective_range: unknown
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
          effective_range?: unknown
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
          effective_range?: unknown
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
          {
            foreignKeyName: "property_owners_property_fk"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      property_withdrawals: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          idempotency_key: string
          ledger_entry_id: string | null
          organization_id: string
          owner_person_id: string
          property_id: string
          reference: string | null
          withdrawal_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          idempotency_key: string
          ledger_entry_id?: string | null
          organization_id: string
          owner_person_id: string
          property_id: string
          reference?: string | null
          withdrawal_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          idempotency_key?: string
          ledger_entry_id?: string | null
          organization_id?: string
          owner_person_id?: string
          property_id?: string
          reference?: string | null
          withdrawal_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_withdrawals_ledger_entry_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_withdrawals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_withdrawals_owner_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "property_withdrawals_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "property_withdrawals_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
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
      rent_generation_exceptions: {
        Row: {
          attempt_count: number
          billing_period_start: string
          created_at: string
          error_code: string
          first_attempt_at: string
          generation_source: string
          id: string
          last_attempt_at: string
          last_attempted_by: string | null
          lease_id: string
          organization_id: string
          property_id: string
          resolved_at: string | null
          resolved_invoice_id: string | null
          safe_message: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          billing_period_start: string
          created_at?: string
          error_code: string
          first_attempt_at?: string
          generation_source: string
          id?: string
          last_attempt_at?: string
          last_attempted_by?: string | null
          lease_id: string
          organization_id: string
          property_id: string
          resolved_at?: string | null
          resolved_invoice_id?: string | null
          safe_message: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          billing_period_start?: string
          created_at?: string
          error_code?: string
          first_attempt_at?: string
          generation_source?: string
          id?: string
          last_attempt_at?: string
          last_attempted_by?: string | null
          lease_id?: string
          organization_id?: string
          property_id?: string
          resolved_at?: string | null
          resolved_invoice_id?: string | null
          safe_message?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_generation_exceptions_invoice_fkey"
            columns: ["organization_id", "resolved_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_invoice_fkey"
            columns: ["organization_id", "resolved_invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rent_generation_exceptions_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      rent_policy_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          concessions_support_state: string | null
          created_at: string
          created_by: string | null
          due_day_source: string | null
          effective_from: string
          id: string
          lease_end_proration_rule: string | null
          lease_start_proration_rule: string | null
          lifecycle: string
          mid_period_rent_change_rule: string | null
          notice_period_charging_rule: string | null
          organization_id: string
          policy_default_due_day: number | null
          rent_calculation_timezone: string | null
          rent_free_support_state: string | null
          retired_at: string | null
          retired_by: string | null
          short_month_due_day_rule: string | null
          superseded_at: string | null
          superseded_by: string | null
          supersedes_policy_id: string | null
          supported_frequencies: string[] | null
          updated_at: string
          updated_by: string | null
          version_number: number
          waivers_support_state: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          concessions_support_state?: string | null
          created_at?: string
          created_by?: string | null
          due_day_source?: string | null
          effective_from: string
          id?: string
          lease_end_proration_rule?: string | null
          lease_start_proration_rule?: string | null
          lifecycle?: string
          mid_period_rent_change_rule?: string | null
          notice_period_charging_rule?: string | null
          organization_id: string
          policy_default_due_day?: number | null
          rent_calculation_timezone?: string | null
          rent_free_support_state?: string | null
          retired_at?: string | null
          retired_by?: string | null
          short_month_due_day_rule?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_policy_id?: string | null
          supported_frequencies?: string[] | null
          updated_at?: string
          updated_by?: string | null
          version_number: number
          waivers_support_state?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          concessions_support_state?: string | null
          created_at?: string
          created_by?: string | null
          due_day_source?: string | null
          effective_from?: string
          id?: string
          lease_end_proration_rule?: string | null
          lease_start_proration_rule?: string | null
          lifecycle?: string
          mid_period_rent_change_rule?: string | null
          notice_period_charging_rule?: string | null
          organization_id?: string
          policy_default_due_day?: number | null
          rent_calculation_timezone?: string | null
          rent_free_support_state?: string | null
          retired_at?: string | null
          retired_by?: string | null
          short_month_due_day_rule?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_policy_id?: string | null
          supported_frequencies?: string[] | null
          updated_at?: string
          updated_by?: string | null
          version_number?: number
          waivers_support_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_policy_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_policy_versions_supersedes_fk"
            columns: ["organization_id", "supersedes_policy_id"]
            isOneToOne: false
            referencedRelation: "rent_policy_versions"
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
          actual_cost_date: string | null
          actual_cost_document_id: string | null
          actual_cost_reference: string | null
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
          actual_cost_date?: string | null
          actual_cost_document_id?: string | null
          actual_cost_reference?: string | null
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
          actual_cost_date?: string | null
          actual_cost_document_id?: string | null
          actual_cost_reference?: string | null
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
            foreignKeyName: "tasks_actual_cost_document_fkey"
            columns: ["actual_cost_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "tasks_property_fk"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
      tenant_invoice_lines: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_label: string
          description: string | null
          id: string
          income_item_id: string
          internal_cost_amount: number | null
          internal_markup_amount: number
          invoice_id: string
          line_type: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_label: string
          description?: string | null
          id?: string
          income_item_id: string
          internal_cost_amount?: number | null
          internal_markup_amount?: number
          invoice_id: string
          line_type: string
          organization_id: string
          sort_order: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_label?: string
          description?: string | null
          id?: string
          income_item_id?: string
          internal_cost_amount?: number | null
          internal_markup_amount?: number
          invoice_id?: string
          line_type?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoice_lines_income_fkey"
            columns: ["organization_id", "income_item_id"]
            isOneToOne: true
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invoice_payment_allocations: {
        Row: {
          allocation_order: number
          amount: number
          created_at: string
          created_by: string | null
          finance_receipt_id: string
          id: string
          income_item_id: string
          invoice_id: string
          invoice_line_id: string
          organization_id: string
          payment_id: string
          reversal_of_allocation_id: string | null
          signed_amount: number | null
        }
        Insert: {
          allocation_order: number
          amount: number
          created_at?: string
          created_by?: string | null
          finance_receipt_id: string
          id?: string
          income_item_id: string
          invoice_id: string
          invoice_line_id: string
          organization_id: string
          payment_id: string
          reversal_of_allocation_id?: string | null
          signed_amount?: number | null
        }
        Update: {
          allocation_order?: number
          amount?: number
          created_at?: string
          created_by?: string | null
          finance_receipt_id?: string
          id?: string
          income_item_id?: string
          invoice_id?: string
          invoice_line_id?: string
          organization_id?: string
          payment_id?: string
          reversal_of_allocation_id?: string | null
          signed_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoice_payment_allocations_income_fkey"
            columns: ["organization_id", "income_item_id"]
            isOneToOne: false
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_line_fkey"
            columns: ["organization_id", "invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_line_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_line_fkey"
            columns: ["organization_id", "invoice_line_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_lines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_payment_fkey"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_receipt_fkey"
            columns: ["organization_id", "finance_receipt_id"]
            isOneToOne: false
            referencedRelation: "finance_receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payment_allocations_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_allocation_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_payment_allocations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      tenant_invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          invoice_id: string
          organization_id: string
          receipt_number: string
          received_date: string
          reconciliation_source_id: string
          reference: string | null
          reversal_of_id: string | null
          reversal_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          invoice_id: string
          organization_id: string
          receipt_number: string
          received_date: string
          reconciliation_source_id: string
          reference?: string | null
          reversal_of_id?: string | null
          reversal_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          invoice_id?: string
          organization_id?: string
          receipt_number?: string
          received_date?: string
          reconciliation_source_id?: string
          reference?: string | null
          reversal_of_id?: string | null
          reversal_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoice_payments_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payments_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invoice_payments_reversal_scope_fkey"
            columns: ["organization_id", "reversal_of_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_payments_source_fkey"
            columns: ["organization_id", "reconciliation_source_id"]
            isOneToOne: false
            referencedRelation: "financial_reconciliation_sources"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      tenant_invoices: {
        Row: {
          base_rent_amount: number | null
          billing_period_end: string
          billing_period_start: string
          billing_term_id: string
          collection_route: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          due_date: string
          generated_at: string | null
          generation_source: string | null
          id: string
          invoice_number: string
          is_prorated: boolean | null
          issue_date: string
          lease_id: string
          lease_term_id: string | null
          lifecycle: string
          management_fee_amount: number | null
          management_fee_mode: string | null
          management_fee_value: number | null
          occupant_labels: string[]
          organization_id: string
          property_id: string
          recipient_kind: string
          recipient_label: string
          recipient_person_id: string
          rent_policy_version_id: string | null
          total_amount: number
          unit_id: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          base_rent_amount?: number | null
          billing_period_end: string
          billing_period_start: string
          billing_term_id: string
          collection_route: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date: string
          generated_at?: string | null
          generation_source?: string | null
          id?: string
          invoice_number: string
          is_prorated?: boolean | null
          issue_date: string
          lease_id: string
          lease_term_id?: string | null
          lifecycle?: string
          management_fee_amount?: number | null
          management_fee_mode?: string | null
          management_fee_value?: number | null
          occupant_labels?: string[]
          organization_id: string
          property_id: string
          recipient_kind: string
          recipient_label: string
          recipient_person_id: string
          rent_policy_version_id?: string | null
          total_amount: number
          unit_id?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          base_rent_amount?: number | null
          billing_period_end?: string
          billing_period_start?: string
          billing_term_id?: string
          collection_route?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          due_date?: string
          generated_at?: string | null
          generation_source?: string | null
          id?: string
          invoice_number?: string
          is_prorated?: boolean | null
          issue_date?: string
          lease_id?: string
          lease_term_id?: string | null
          lifecycle?: string
          management_fee_amount?: number | null
          management_fee_mode?: string | null
          management_fee_value?: number | null
          occupant_labels?: string[]
          organization_id?: string
          property_id?: string
          recipient_kind?: string
          recipient_label?: string
          recipient_person_id?: string
          rent_policy_version_id?: string | null
          total_amount?: number
          unit_id?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_billing_term_fkey"
            columns: ["organization_id", "lease_id", "billing_term_id"]
            isOneToOne: false
            referencedRelation: "lease_billing_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_lease_term_fkey"
            columns: ["organization_id", "lease_id", "lease_term_id"]
            isOneToOne: false
            referencedRelation: "lease_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "tenant_invoices_recipient_fkey"
            columns: ["organization_id", "recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_rent_policy_fkey"
            columns: ["organization_id", "rent_policy_version_id"]
            isOneToOne: false
            referencedRelation: "rent_policy_versions"
            referencedColumns: ["organization_id", "id"]
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
            foreignKeyName: "tenant_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
            referencedRelation: "current_leases"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "timeline_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
      current_leases: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string | null
          created_by: string | null
          deposit_amount: number | null
          deposit_currency: Database["public"]["Enums"]["currency_code"] | null
          id: string | null
          lease_end_date: string | null
          lease_start_date: string | null
          lease_term_id: string | null
          monthly_rent_amount: number | null
          monthly_rent_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          organization_id: string | null
          primary_tenant_person_id: string | null
          property_id: string | null
          status: string | null
          tenant_name: string | null
          unit_id: string | null
          updated_at: string | null
          updated_by: string | null
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
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["property_id"]
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
      owner_invoice_balances: {
        Row: {
          balance_due: number | null
          billing_period_start: string | null
          created_at: string | null
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          due_date: string | null
          id: string | null
          idempotency_key: string | null
          invoice_number: string | null
          issue_date: string | null
          lifecycle: string | null
          organization_id: string | null
          owner_person_id: string | null
          paid_by_owner: number | null
          paid_from_held_cash: number | null
          payment_status: string | null
          property_id: string | null
          total_amount: number | null
          voided_at: string | null
          voided_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_invoices_owner_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      owner_opening_balance_known_authority_v1: {
        Row: {
          authority_state: string | null
          component:
            | Database["public"]["Enums"]["owner_balance_component"]
            | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          current_amount: number | null
          effective_date: string | null
          entry_count: number | null
          latest_entry_at: string | null
          organization_id: string | null
          owner_person_id: string | null
          property_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_opening_balance_entries_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_owner_person_fkey"
            columns: ["organization_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "owner_opening_balance_entries_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
        ]
      }
      property_account_entries: {
        Row: {
          amount: number | null
          balance_effect: number | null
          category: string | null
          created_at: string | null
          event_date: string | null
          label: string | null
          lease_id: string | null
          note: string | null
          organization_id: string | null
          property_id: string | null
          running_balance: number | null
          source_id: string | null
          source_type: string | null
          unit_id: string | null
        }
        Relationships: []
      }
      property_finance_positions: {
        Row: {
          available_withdrawal: number | null
          cash_held_by_ips: number | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          management_fee_expense: number | null
          organization_id: string | null
          owner_expense: number | null
          owner_owes_ips: number | null
          owner_person_id: string | null
          property_code: string | null
          property_id: string | null
          property_name: string | null
          rent_income: number | null
          running_balance: number | null
          withdrawals: number | null
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
      tenant_invoice_balances: {
        Row: {
          balance_due: number | null
          billing_period_end: string | null
          billing_period_start: string | null
          billing_term_id: string | null
          collected_by_owner: number | null
          collection_route: string | null
          created_at: string | null
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          issue_date: string | null
          lease_id: string | null
          lifecycle: string | null
          occupant_labels: string[] | null
          organization_id: string | null
          paid_through_ips: number | null
          payment_status: string | null
          property_id: string | null
          recipient_kind: string | null
          recipient_label: string | null
          recipient_person_id: string | null
          total_amount: number | null
          unit_id: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_billing_term_fkey"
            columns: ["organization_id", "lease_id", "billing_term_id"]
            isOneToOne: false
            referencedRelation: "lease_billing_terms"
            referencedColumns: ["organization_id", "lease_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "current_leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_lease_fkey"
            columns: ["organization_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoices_property_fkey"
            columns: ["organization_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_finance_positions"
            referencedColumns: ["organization_id", "property_id"]
          },
          {
            foreignKeyName: "tenant_invoices_recipient_fkey"
            columns: ["organization_id", "recipient_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      tenant_invoice_line_balances: {
        Row: {
          amount: number | null
          balance_due: number | null
          created_at: string | null
          created_by: string | null
          customer_label: string | null
          description: string | null
          id: string | null
          income_item_id: string | null
          internal_cost_amount: number | null
          internal_markup_amount: number | null
          invoice_id: string | null
          line_type: string | null
          organization_id: string | null
          sort_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoice_lines_income_fkey"
            columns: ["organization_id", "income_item_id"]
            isOneToOne: true
            referencedRelation: "finance_income_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoice_balances"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_invoice_fkey"
            columns: ["organization_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "tenant_invoices"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "tenant_invoice_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      approve_rent_policy_version: {
        Args: { p_organization_id: string; p_policy_id: string }
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
      archive_financial_reconciliation_source: {
        Args: { p_organization_id: string; p_source_id: string }
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
      commit_generic_import_run_internal: {
        Args: { p_import_run_id: string; p_organization_id: string }
        Returns: Json
      }
      commit_unit_import_run: {
        Args: { p_import_run_id: string; p_organization_id: string }
        Returns: Json
      }
      confirm_owner_collected_rent: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_confirmed_date: string
          p_idempotency_key: string
          p_invoice_id: string
          p_organization_id: string
          p_reference: string
        }
        Returns: string
      }
      confirm_owner_collected_rent_internal: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_confirmed_date: string
          p_idempotency_key: string
          p_invoice_id: string
          p_organization_id: string
          p_reference: string
        }
        Returns: string
      }
      correct_authoritative_lease_term: {
        Args: {
          p_end_date: string
          p_idempotency_key: string
          p_lease_id: string
          p_organization_id: string
          p_payment_frequency: string
          p_rent_amount: number
          p_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_rent_due_day: number
          p_start_date: string
          p_status: string
          p_term_id: string
        }
        Returns: string
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
      create_authoritative_lease_term: {
        Args: {
          p_end_date: string
          p_idempotency_key: string
          p_lease_id: string
          p_organization_id: string
          p_payment_frequency: string
          p_rent_amount: number
          p_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_rent_due_day: number
          p_start_date: string
          p_status: string
          p_supersedes_term_id: string
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
          p_content_sha256: string
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
      create_financial_reconciliation_source: {
        Args: {
          p_code: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_display_name: string
          p_masked_reference?: string
          p_organization_id: string
          p_property_id?: string
          p_scope_kind: string
          p_source_kind: string
        }
        Returns: string
      }
      create_lease_with_relationships: {
        Args: {
          p_deposit_amount: number
          p_deposit_currency: Database["public"]["Enums"]["currency_code"]
          p_idempotency_key: string
          p_lease_end_date: string
          p_lease_start_date: string
          p_lease_status: string
          p_organization_id: string
          p_payment_frequency: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_relationship_payload: Json
          p_rent_amount: number
          p_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_rent_due_day: number
          p_term_status: string
          p_unit_id: string
        }
        Returns: Json
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
          p_idempotency_key?: string
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
          p_owner_ownership_percent?: number
          p_owner_person_id?: string
          p_owner_started_on?: string
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      create_rent_policy_draft: {
        Args: {
          p_effective_from: string
          p_idempotency_key: string
          p_organization_id: string
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
      discard_unreferenced_document_upload: {
        Args: {
          p_content_sha256: string
          p_document_id: string
          p_organization_id: string
          p_storage_path: string
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
      fingerprint_document_content: {
        Args: {
          p_content_sha256: string
          p_document_id: string
          p_organization_id: string
        }
        Returns: string
      }
      get_expense_submission_evidence: {
        Args: { p_organization_id: string; p_submission_ids: string[] }
        Returns: {
          document_id: string
          file_name: string
          mime_type: string
          size_bytes: number
          storage_path: string
          submission_id: string
        }[]
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
      get_leases_with_effective_rent: {
        Args: { p_effective_date: string; p_organization_id: string }
        Returns: {
          archived_at: string
          deposit_amount: number
          deposit_currency: Database["public"]["Enums"]["currency_code"]
          id: string
          lease_end_date: string
          lease_start_date: string
          monthly_rent_amount: number
          monthly_rent_currency: Database["public"]["Enums"]["currency_code"]
          primary_tenant_person_id: string
          property_id: string
          status: string
          tenant_name: string
          unit_id: string
        }[]
      }
      get_maintenance_cost_statuses: {
        Args: { p_organization_id: string; p_task_ids: string[] }
        Returns: {
          review_reason: string
          status: string
          submission_id: string
          submitted_at: string
          task_id: string
        }[]
      }
      get_maintenance_execution_members: {
        Args: { p_organization_id: string }
        Returns: {
          branch_id: string
          person_id: string
        }[]
      }
      get_maintenance_task_documents: {
        Args: { p_organization_id: string; p_task_ids: string[] }
        Returns: {
          category: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          task_id: string
          uploaded_at: string
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
      get_owner_roster_readiness: {
        Args: { p_cutover_date: string; p_organization_id: string }
        Returns: {
          active_owner_count: number
          boundary_date: string
          canonical_roster: string
          issue_code: string
          next_boundary_date: string
          organization_id: string
          ownership_percent_total: number
          ownership_roster_hash: string
          property_id: string
          property_owner_ids: string[]
          setup_path: string
        }[]
      }
      get_property_cash_events_page: {
        Args: {
          p_after_event_date: string
          p_after_source_id: string
          p_after_source_type: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_organization_id: string
          p_page_size: number
          p_period_end: string
          p_period_start: string
          p_property_id: string
        }
        Returns: {
          amount: number
          category_code: string
          contract_version: string
          currency: Database["public"]["Enums"]["currency_code"]
          cursor_event_date: string
          cursor_source_id: string
          cursor_source_type: string
          deposit_liability_effect: number
          description: string
          economic_class: string
          event_date: string
          event_key: string
          is_reversal: boolean
          lease_id: string
          ledger_entry_id: string
          management_fee_effect: number
          obligation_id: string
          obligation_type: string
          operating_cash_effect: number
          organization_id: string
          owner_cash_effect: number
          owner_person_id: string
          period_start: string
          property_id: string
          reconciliation_source_id: string
          reference: string
          resolution_reason: string
          resolution_state: string
          reversal_source_id: string
          reversal_source_type: string
          source_id: string
          source_parent_id: string
          source_parent_type: string
          source_type: string
          task_id: string
          tenant_person_id: string
          unit_id: string
          vendor_person_id: string
        }[]
      }
      get_report_documents_snapshot: {
        Args: { p_organization_id: string }
        Returns: Json
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
      record_auth_password_credential_proof: {
        Args: { p_auth_user_id: string; p_proof_method: string }
        Returns: string
      }
      record_lease_deposit_event: {
        Args: {
          p_amount: number
          p_event_date: string
          p_event_type: string
          p_lease_deposit_id: string
          p_organization_id: string
          p_reference: string
        }
        Returns: string
      }
      record_owner_invoice_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_organization_id: string
          p_owner_invoice_id: string
          p_received_date: string
          p_reference: string
        }
        Returns: string
      }
      record_property_withdrawal: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_organization_id: string
          p_property_id: string
          p_reference: string
          p_withdrawal_date: string
        }
        Returns: string
      }
      record_tenant_invoice_payment: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_idempotency_key: string
          p_invoice_id: string
          p_organization_id: string
          p_received_date: string
          p_reconciliation_source_id: string
          p_reference: string
        }
        Returns: string
      }
      record_tenant_invoice_payment_internal: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_idempotency_key: string
          p_invoice_id: string
          p_organization_id: string
          p_received_date: string
          p_reconciliation_source_id: string
          p_reference: string
        }
        Returns: string
      }
      recover_lease_rent_period: {
        Args: {
          p_billing_period_start: string
          p_lease_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      recover_rent_generation_exception: {
        Args: { p_exception_id: string; p_organization_id: string }
        Returns: Json
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
      resolve_authoritative_lease_term: {
        Args: {
          p_effective_date: string
          p_lease_id: string
          p_organization_id: string
        }
        Returns: {
          blocker_code: string
          effective_range: unknown
          end_date: string
          lease_id: string
          organization_id: string
          payment_frequency: string
          property_id: string
          rent_amount: number
          rent_currency: Database["public"]["Enums"]["currency_code"]
          rent_due_day: number
          resolution_status: string
          start_date: string
          term_id: string
          term_sequence: number
          unit_id: string
        }[]
      }
      resolve_lease_billing_term: {
        Args: {
          p_effective_date: string
          p_lease_id: string
          p_organization_id: string
        }
        Returns: {
          archived_at: string | null
          archived_by: string | null
          billing_recipient_kind: string
          billing_recipient_person_id: string
          charge_management_fee_when_active: boolean
          collection_route: string
          confirmed_at: string
          confirmed_by: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_range: unknown
          effective_to: string
          final_period_prorated_amount: number | null
          first_period_prorated_amount: number | null
          full_management_fee_during_proration: boolean
          id: string
          lease_id: string
          management_fee_mode: string
          management_fee_value: number
          organization_id: string
          property_id: string
          superseded_at: string | null
          superseded_by: string | null
          supersedes_billing_term_id: string | null
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "lease_billing_terms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_lease_rent_readiness: {
        Args: {
          p_effective_date: string
          p_lease_id: string
          p_organization_id: string
        }
        Returns: {
          effective_date: string
          lease_id: string
          organization_id: string
          payment_frequency: string
          policy_id: string
          policy_version: number
          property_id: string
          readiness_status: string
          reason_code: string
          rent_amount: number
          rent_currency: Database["public"]["Enums"]["currency_code"]
          rent_due_day: number
          repair_context: Json
          term_id: string
          unit_id: string
        }[]
      }
      restore_document: {
        Args: { p_document_id: string; p_organization_id: string }
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
      reverse_expense: {
        Args: {
          p_idempotency_key: string
          p_organization_id: string
          p_reason: string
          p_reversal_date: string
          p_submission_id: string
        }
        Returns: Json
      }
      reverse_lease_deposit_event: {
        Args: {
          p_event_date: string
          p_event_id: string
          p_organization_id: string
          p_reference: string
        }
        Returns: string
      }
      reverse_owner_collection_confirmation: {
        Args: {
          p_confirmation_id: string
          p_idempotency_key: string
          p_organization_id: string
          p_reason: string
          p_reversal_date: string
        }
        Returns: string
      }
      reverse_tenant_invoice_payment: {
        Args: {
          p_idempotency_key: string
          p_organization_id: string
          p_payment_id: string
          p_reason: string
          p_reversal_date: string
        }
        Returns: string
      }
      review_expense: {
        Args: {
          p_decision: string
          p_idempotency_key: string
          p_organization_id: string
          p_reason: string
          p_reconciliation_source_id: string
          p_submission_id: string
        }
        Returns: Json
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
      schedule_authoritative_lease_term: {
        Args: {
          p_end_date: string
          p_idempotency_key: string
          p_lease_id: string
          p_organization_id: string
          p_payment_frequency: string
          p_rent_amount: number
          p_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_rent_due_day: number
          p_start_date: string
          p_supersedes_term_id: string
        }
        Returns: string
      }
      set_asset_photo_cover: {
        Args: { p_organization_id: string; p_photo_id: string }
        Returns: string
      }
      set_financial_month_lock: {
        Args: {
          p_locked: boolean
          p_month_start: string
          p_organization_id: string
          p_reason: string
        }
        Returns: string
      }
      set_lease_billing_term: {
        Args: {
          p_billing_recipient_kind: string
          p_billing_recipient_person_id: string
          p_charge_management_fee_when_active: boolean
          p_collection_route: string
          p_effective_from: string
          p_final_period_prorated_amount: number
          p_first_period_prorated_amount: number
          p_full_management_fee_during_proration: boolean
          p_idempotency_key: string
          p_lease_id: string
          p_management_fee_mode: string
          p_management_fee_value: number
          p_organization_id: string
          p_supersedes_billing_term_id: string
        }
        Returns: string
      }
      stage_import_run_v1: {
        Args: {
          p_headers: Json
          p_import_type: string
          p_mapping: Json
          p_organization_id: string
          p_rows: Json
          p_source_file_name: string
          p_source_file_size: number
          p_source_mime_type: string
        }
        Returns: Json
      }
      submit_expense: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_category: string
          p_expense_date: string
          p_idempotency_key: string
          p_internal_cost_amount: number
          p_internal_markup_amount: number
          p_organization_id: string
          p_property_id: string
          p_reconciliation_source_id: string
          p_reference: string
          p_responsibility: string
          p_source_id: string
          p_source_type: string
          p_supporting_document_id: string
          p_tenant_invoice_id: string
          p_unit_id: string
          p_vendor_label: string
          p_vendor_person_id: string
        }
        Returns: Json
      }
      submit_maintenance_cost: {
        Args: {
          p_expense_date: string
          p_idempotency_key: string
          p_organization_id: string
          p_reference: string
          p_supporting_document_id: string
          p_task_id: string
        }
        Returns: Json
      }
      update_document: {
        Args: {
          p_category: string
          p_document_id: string
          p_lease_id?: string
          p_organization_id: string
          p_property_id: string
          p_task_id?: string
          p_unit_id?: string
        }
        Returns: string
      }
      update_financial_reconciliation_source_label: {
        Args: {
          p_display_name: string
          p_masked_reference?: string
          p_organization_id: string
          p_source_id: string
        }
        Returns: string
      }
      update_lease_with_authoritative_term: {
        Args: {
          p_deposit_amount: number
          p_deposit_currency: Database["public"]["Enums"]["currency_code"]
          p_idempotency_key: string
          p_lease_end_date: string
          p_lease_id: string
          p_lease_start_date: string
          p_lease_status: string
          p_organization_id: string
          p_payment_frequency: string
          p_primary_tenant_person_id: string
          p_property_id: string
          p_rent_amount: number
          p_rent_currency: Database["public"]["Enums"]["currency_code"]
          p_rent_due_day: number
          p_term_status: string
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
      update_organization_appearance: {
        Args: {
          p_accent_preset: string
          p_accent_seed: string
          p_organization_id: string
          p_theme_mode: string
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
          p_owner_ownership_percent: number
          p_owner_person_id: string
          p_owner_started_on: string
          p_property_id: string
          p_property_type: string
          p_status: string
        }
        Returns: string
      }
      update_rent_policy_draft: {
        Args: {
          p_concessions_support_state: string
          p_due_day_source: string
          p_lease_end_proration_rule: string
          p_lease_start_proration_rule: string
          p_mid_period_rent_change_rule: string
          p_notice_period_charging_rule: string
          p_organization_id: string
          p_policy_default_due_day: number
          p_policy_id: string
          p_rent_calculation_timezone: string
          p_rent_free_support_state: string
          p_short_month_due_day_rule: string
          p_supported_frequencies: string[]
          p_waivers_support_state: string
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
      owner_balance_component:
        | "ips_held_owner_cash"
        | "owner_due_to_ips"
        | "ips_due_to_owner"
        | "security_deposit_custody"
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
      owner_balance_component: [
        "ips_held_owner_cash",
        "owner_due_to_ips",
        "ips_due_to_owner",
        "security_deposit_custody",
      ],
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
