export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      currency_code: "USD" | "KHR";
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
        | "General Note";
    };
    CompositeTypes: Record<string, never>;
  };
};
