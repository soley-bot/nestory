import type { Database as DatabaseGenerated, Json } from "./database.generated";

export { Constants } from "./database.generated";
export type { Json } from "./database.generated";

type PublicSchemaGenerated = DatabaseGenerated["public"];
type GeneratedFunctions = PublicSchemaGenerated["Functions"];
type CurrencyCode = PublicSchemaGenerated["Enums"]["currency_code"];
type TimelineEventType = PublicSchemaGenerated["Enums"]["timeline_event_type"];

type WithArgs<Name extends keyof GeneratedFunctions, Args> = Omit<
  GeneratedFunctions[Name],
  "Args"
> & {
  Args: Args;
};

type RpcFunctionOverrides = {
  execute_coordinated_maintenance_task: {
    Args: {
      p_action: string;
      p_note?: string | null;
      p_organization_id: string;
      p_task_id: string;
    };
    Returns: string;
  };
  get_maintenance_execution_members: {
    Args: {
      p_organization_id: string;
    };
    Returns: {
      branch_id: string | null;
      person_id: string;
    }[];
  };
  add_existing_organization_member: WithArgs<
    "add_existing_organization_member",
    {
      p_branch_id: string | null;
      p_email: string;
      p_organization_id: string;
      p_person_id: string | null;
      p_role: string;
    }
  >;
  assign_maintenance_task: WithArgs<
    "assign_maintenance_task",
    {
      p_assignee_person_id: string | null;
      p_branch_id: string | null;
      p_organization_id: string;
      p_task_id: string;
    }
  >;
  create_asset_photo: WithArgs<
    "create_asset_photo",
    {
      p_caption?: string | null;
      p_file_name: string;
      p_is_cover?: boolean;
      p_mime_type: string;
      p_organization_id: string;
      p_property_id: string;
      p_size_bytes: number;
      p_storage_path: string;
      p_taken_at?: string | null;
      p_unit_id?: string | null;
    }
  >;
  create_document: WithArgs<
    "create_document",
    {
      p_activity_action?: string;
      p_activity_entity_id?: string | null;
      p_activity_entity_type?: string;
      p_activity_new_values?: Json;
      p_category: string;
      p_file_name: string;
      p_lease_id?: string | null;
      p_ledger_entry_id?: string | null;
      p_mime_type: string;
      p_organization_id: string;
      p_property_id: string;
      p_size_bytes: number;
      p_storage_path: string;
      p_task_id?: string | null;
      p_tenant_request_id?: string | null;
      p_timeline_event_id?: string | null;
      p_unit_id?: string | null;
    }
  >;
  create_finance_expense_item: WithArgs<
    "create_finance_expense_item",
    {
      p_amount: number;
      p_category: string;
      p_company_loss_amount?: number;
      p_description: string | null;
      p_due_date: string | null;
      p_economic_scope?: string;
      p_expense_type: string;
      p_invoice_date: string;
      p_organization_id: string;
      p_owner_bill_status?: string;
      p_owner_reimbursable_amount?: number;
      p_owner_reimbursed_amount?: number;
      p_property_id: string;
      p_reference: string | null;
      p_task_id: string | null;
      p_unit_id: string | null;
      p_vendor_label: string;
      p_vendor_person_id: string | null;
    }
  >;
  create_finance_income_item: WithArgs<
    "create_finance_income_item",
    {
      p_amount_due: number;
      p_amount_received: number;
      p_description: string | null;
      p_due_date: string;
      p_income_type: string;
      p_lease_id: string | null;
      p_organization_id: string;
      p_payer_label: string;
      p_property_id: string;
      p_received_date: string | null;
      p_reference: string | null;
      p_unit_id: string | null;
    }
  >;
  get_finance_expense_workflow_summary: {
    Args: {
      p_invoice_before: string;
      p_invoice_from: string;
      p_organization_id: string;
      p_property_id: string | null;
      p_query: string | null;
      p_status: string | null;
      p_today: string;
      p_unit_id: string | null;
    };
    Returns: {
      approved_count: number;
      draft_count: number;
      overdue_count: number;
      posted_total: number;
      unposted_total: number;
    }[];
  };
  get_finance_income_workflow_summary: {
    Args: {
      p_due_before: string;
      p_due_from: string;
      p_organization_id: string;
      p_property_id: string | null;
      p_query: string | null;
      p_status: string | null;
      p_today: string;
      p_unit_id: string | null;
    };
    Returns: {
      open_count: number;
      overdue_count: number;
      receivable_total: number;
      received_total: number;
      unposted_count: number;
    }[];
  };
  create_ledger_entry: WithArgs<
    "create_ledger_entry",
    {
      p_amount: number;
      p_category: string;
      p_currency: CurrencyCode;
      p_description: string | null;
      p_direction: string;
      p_organization_id: string;
      p_property_id: string;
      p_transaction_date: string;
      p_unit_id: string | null;
    }
  >;
  create_petty_cash_account: WithArgs<
    "create_petty_cash_account",
    {
      p_account_number: string;
      p_custodian_person_id?: string | null;
      p_float_amount: number;
      p_name: string;
      p_organization_id: string;
    }
  >;
  create_petty_cash_entry: WithArgs<
    "create_petty_cash_entry",
    {
      p_account_id: string;
      p_amount: number;
      p_category: string;
      p_clear_date: string | null;
      p_description: string;
      p_entry_kind: string;
      p_invoice_date: string;
      p_organization_id: string;
      p_period_id: string;
      p_property_id: string | null;
      p_receipt_reference?: string | null;
      p_remark?: string | null;
      p_status: string;
      p_supplier: string | null;
      p_unit_id: string | null;
    }
  >;
  open_next_petty_cash_period: WithArgs<
    "open_next_petty_cash_period",
    {
      p_account_id: string;
      p_advance_amount?: number | null;
      p_organization_id: string;
      p_period_id: string;
    }
  >;
  create_lease: WithArgs<
    "create_lease",
    {
      p_deposit_amount: number | null;
      p_deposit_currency: CurrencyCode | null;
      p_lease_end_date: string;
      p_lease_start_date: string;
      p_monthly_rent_amount: number;
      p_monthly_rent_currency: CurrencyCode;
      p_organization_id: string;
      p_primary_tenant_person_id: string;
      p_property_id: string;
      p_status: string;
      p_unit_id: string | null;
    }
  >;
  create_maintenance_task: WithArgs<
    "create_maintenance_task",
    {
      p_assignee_person_id?: string | null;
      p_branch_id?: string | null;
      p_category: string;
      p_checklist: Json;
      p_cost_estimate_amount: number | null;
      p_cost_estimate_currency: CurrencyCode | null;
      p_description: string | null;
      p_due_date: string | null;
      p_due_time: string | null;
      p_organization_id: string;
      p_priority: string;
      p_property_id: string;
      p_recurrence_frequency: string;
      p_reminder_date: string | null;
      p_reminder_time: string | null;
      p_status: string;
      p_title: string;
      p_unit_id: string | null;
      p_vendor_person_id: string | null;
    }
  >;
  execute_assigned_maintenance_task: WithArgs<
    "execute_assigned_maintenance_task",
    {
      p_action: string;
      p_blocked_reason?: string | null;
      p_checklist_completed?: boolean | null;
      p_checklist_item_id?: string | null;
      p_organization_id: string;
      p_task_id: string;
    }
  >;
  create_organization_branch: WithArgs<
    "create_organization_branch",
    {
      p_address: string | null;
      p_code: string;
      p_name: string;
      p_organization_id: string;
    }
  >;
  create_organization_team: WithArgs<
    "create_organization_team",
    {
      p_branch_id: string | null;
      p_manager_person_id: string | null;
      p_name: string;
      p_organization_id: string;
    }
  >;
  create_person: WithArgs<
    "create_person",
    {
      p_display_name: string;
      p_legal_name: string | null;
      p_notes: string | null;
      p_organization_id: string;
      p_party_type: string;
      p_primary_email: string | null;
      p_primary_phone: string | null;
      p_roles: string[];
      p_tax_identifier: string | null;
    }
  >;
  create_property: WithArgs<
    "create_property",
    {
      p_acquisition_date: string | null;
      p_address: string | null;
      p_code: string;
      p_name: string;
      p_notes: string | null;
      p_organization_id: string;
      p_owner: string | null;
      p_owner_person_id?: string | null;
      p_property_type: string;
      p_status: string;
    }
  >;
  create_timeline_event: WithArgs<
    "create_timeline_event",
    {
      p_cost_amount: number | null;
      p_cost_currency: CurrencyCode | null;
      p_description: string | null;
      p_event_date: string;
      p_event_type: TimelineEventType;
      p_organization_id: string;
      p_property_id: string;
      p_title: string;
      p_unit_id: string | null;
    }
  >;
  create_unit: WithArgs<
    "create_unit",
    {
      p_current_rent_amount: number | null;
      p_current_rent_currency: CurrencyCode | null;
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_number: string;
    }
  >;
  post_finance_expense_item: WithArgs<
    "post_finance_expense_item",
    {
      p_expense_item_id: string;
      p_organization_id: string;
      p_paid_date?: string | null;
    }
  >;
  record_finance_income_payment: WithArgs<
    "record_finance_income_payment",
    {
      p_amount_received: number;
      p_income_item_id: string;
      p_organization_id: string;
      p_received_date: string;
      p_reference: string | null;
    }
  >;
  record_finance_payment: WithArgs<
    "record_finance_payment",
    {
      p_amount: number;
      p_expense_item_id: string;
      p_organization_id: string;
      p_paid_date: string;
      p_reference?: string | null;
    }
  >;
  record_finance_receipt: WithArgs<
    "record_finance_receipt",
    {
      p_amount: number;
      p_income_item_id: string;
      p_organization_id: string;
      p_received_date: string;
      p_reference?: string | null;
    }
  >;
  review_maintenance_task_completion: WithArgs<
    "review_maintenance_task_completion",
    {
      p_action: string;
      p_organization_id: string;
      p_review_note?: string | null;
      p_task_id: string;
    }
  >;
  reverse_finance_payment: WithArgs<
    "reverse_finance_payment",
    {
      p_organization_id: string;
      p_payment_id: string;
      p_reference?: string | null;
      p_reversal_date: string;
    }
  >;
  reverse_finance_receipt: WithArgs<
    "reverse_finance_receipt",
    {
      p_organization_id: string;
      p_receipt_id: string;
      p_reference?: string | null;
      p_reversal_date: string;
    }
  >;
  update_document: WithArgs<
    "update_document",
    {
      p_category: string;
      p_document_id: string;
      p_file_name?: string | null;
      p_lease_id?: string | null;
      p_mime_type?: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_bytes?: number | null;
      p_storage_path?: string | null;
      p_task_id?: string | null;
      p_unit_id?: string | null;
    }
  >;
  update_ledger_entry: WithArgs<
    "update_ledger_entry",
    {
      p_amount: number;
      p_category: string;
      p_currency: CurrencyCode;
      p_description: string | null;
      p_direction: string;
      p_entry_id: string;
      p_organization_id: string;
      p_property_id: string;
      p_transaction_date: string;
      p_unit_id: string | null;
    }
  >;
  update_lease: WithArgs<
    "update_lease",
    {
      p_deposit_amount: number | null;
      p_deposit_currency: CurrencyCode | null;
      p_lease_end_date: string;
      p_lease_id: string;
      p_lease_start_date: string;
      p_monthly_rent_amount: number;
      p_monthly_rent_currency: CurrencyCode;
      p_organization_id: string;
      p_primary_tenant_person_id: string;
      p_property_id: string;
      p_status: string;
      p_unit_id: string | null;
    }
  >;
  update_maintenance_task: WithArgs<
    "update_maintenance_task",
    {
      p_actual_cost_amount: number | null;
      p_actual_cost_currency: CurrencyCode | null;
      p_assignee_person_id?: string | null;
      p_branch_id?: string | null;
      p_category: string;
      p_checklist: Json;
      p_cost_estimate_amount: number | null;
      p_cost_estimate_currency: CurrencyCode | null;
      p_description: string | null;
      p_due_date: string | null;
      p_due_time: string | null;
      p_link_actual_cost_to_ledger: boolean;
      p_organization_id: string;
      p_priority: string;
      p_property_id: string;
      p_recurrence_frequency: string;
      p_reminder_date: string | null;
      p_reminder_time: string | null;
      p_status: string;
      p_task_id: string;
      p_title: string;
      p_unit_id: string | null;
      p_vendor_person_id: string | null;
    }
  >;
  update_organization_member_access: WithArgs<
    "update_organization_member_access",
    {
      p_branch_id: string | null;
      p_member_id: string;
      p_organization_id: string;
      p_person_id: string | null;
      p_role: string;
    }
  >;
  update_person: WithArgs<
    "update_person",
    {
      p_display_name: string;
      p_legal_name: string | null;
      p_notes: string | null;
      p_organization_id: string;
      p_party_type: string;
      p_person_id: string;
      p_primary_email: string | null;
      p_primary_phone: string | null;
      p_roles: string[];
      p_tax_identifier: string | null;
    }
  >;
  update_property: WithArgs<
    "update_property",
    {
      p_acquisition_date: string | null;
      p_address: string | null;
      p_code: string;
      p_name: string;
      p_notes: string | null;
      p_organization_id: string;
      p_owner: string | null;
      p_owner_person_id?: string | null;
      p_property_id: string;
      p_property_type: string;
      p_status: string;
    }
  >;
  update_timeline_event: WithArgs<
    "update_timeline_event",
    {
      p_cost_amount: number | null;
      p_cost_currency: CurrencyCode | null;
      p_description: string | null;
      p_event_date: string;
      p_event_id: string;
      p_event_type: TimelineEventType;
      p_organization_id: string;
      p_property_id: string;
      p_title: string;
      p_unit_id: string | null;
    }
  >;
  update_unit: WithArgs<
    "update_unit",
    {
      p_current_rent_amount: number | null;
      p_current_rent_currency: CurrencyCode | null;
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_id: string;
      p_unit_number: string;
    }
  >;
};

type PublicFunctions = Omit<
  GeneratedFunctions,
  keyof RpcFunctionOverrides
> &
  RpcFunctionOverrides;

export type Database = Omit<DatabaseGenerated, "public"> & {
  public: Omit<PublicSchemaGenerated, "Functions"> & {
    Functions: PublicFunctions;
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
