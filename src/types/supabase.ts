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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _rls_backup_2026_05_06: {
        Row: {
          cmd: string | null
          permissive: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Insert: {
          cmd?: string | null
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Update: {
          cmd?: string | null
          permissive?: string | null
          policyname?: unknown
          qual?: string | null
          roles?: unknown[] | null
          schemaname?: unknown
          tablename?: unknown
          with_check?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          resource: string
          resource_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource: string
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource?: string
          resource_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authorization_log: {
        Row: {
          amount: number | null
          authorizer_cargo: string | null
          authorizer_id: string | null
          authorizer_name: string | null
          cash_register_id: string | null
          cashier_id: string | null
          cashier_name: string | null
          created_at: string
          id: string
          invoice_id: string | null
          opening_id: string | null
          operation: string
          reason_code: string | null
          reason_text: string | null
          self_authorized: boolean
          tenant_id: string
        }
        Insert: {
          amount?: number | null
          authorizer_cargo?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          cash_register_id?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          opening_id?: string | null
          operation: string
          reason_code?: string | null
          reason_text?: string | null
          self_authorized?: boolean
          tenant_id: string
        }
        Update: {
          amount?: number | null
          authorizer_cargo?: string | null
          authorizer_id?: string | null
          authorizer_name?: string | null
          cash_register_id?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          opening_id?: string | null
          operation?: string
          reason_code?: string | null
          reason_text?: string | null
          self_authorized?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorization_log_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_log_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "cash_register_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          department: string | null
          district: string | null
          email: string | null
          id: string
          is_active: boolean
          is_main: boolean
          manager_id: string | null
          max_capacity: number | null
          name: string
          phone: string | null
          province: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          department?: string | null
          district?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          manager_id?: string | null
          max_capacity?: number | null
          name: string
          phone?: string | null
          province?: string | null
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          department?: string | null
          district?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          manager_id?: string | null
          max_capacity?: number | null
          name?: string
          phone?: string | null
          province?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          schedule_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          schedule_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "capacity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_group_members_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_groups: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          shared_capacity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          shared_capacity: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          shared_capacity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_arqueos: {
        Row: {
          branch_id: string | null
          cash_register_id: string
          cashier_id: string | null
          cashier_name: string | null
          cierre_opening_id: string | null
          counted_amount: number
          created_at: string
          created_by: string
          denomination_counts: Json
          difference: number
          expected_amount: number
          id: string
          movement_count: number
          notes: string | null
          opening_amount: number
          opening_id: string | null
          period_end: string | null
          period_start: string | null
          sale_count: number
          supervisor_id: string | null
          supervisor_name: string | null
          tenant_id: string
          total_expense: number
          total_income: number
          total_petty_cash: number
          total_refunds: number
          total_sales_card: number
          total_sales_cash: number
          total_sales_transfer: number
          type: string
        }
        Insert: {
          branch_id?: string | null
          cash_register_id: string
          cashier_id?: string | null
          cashier_name?: string | null
          cierre_opening_id?: string | null
          counted_amount: number
          created_at?: string
          created_by: string
          denomination_counts?: Json
          difference: number
          expected_amount: number
          id?: string
          movement_count?: number
          notes?: string | null
          opening_amount?: number
          opening_id?: string | null
          period_end?: string | null
          period_start?: string | null
          sale_count?: number
          supervisor_id?: string | null
          supervisor_name?: string | null
          tenant_id: string
          total_expense?: number
          total_income?: number
          total_petty_cash?: number
          total_refunds?: number
          total_sales_card?: number
          total_sales_cash?: number
          total_sales_transfer?: number
          type: string
        }
        Update: {
          branch_id?: string | null
          cash_register_id?: string
          cashier_id?: string | null
          cashier_name?: string | null
          cierre_opening_id?: string | null
          counted_amount?: number
          created_at?: string
          created_by?: string
          denomination_counts?: Json
          difference?: number
          expected_amount?: number
          id?: string
          movement_count?: number
          notes?: string | null
          opening_amount?: number
          opening_id?: string | null
          period_end?: string | null
          period_start?: string | null
          sale_count?: number
          supervisor_id?: string | null
          supervisor_name?: string | null
          tenant_id?: string
          total_expense?: number
          total_income?: number
          total_petty_cash?: number
          total_refunds?: number
          total_sales_card?: number
          total_sales_cash?: number
          total_sales_transfer?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_arqueos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_arqueos_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_arqueos_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "cash_register_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_arqueos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_movements: {
        Row: {
          amount: number
          authorized_by: string | null
          authorized_name: string | null
          cash_register_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_id: string | null
          opening_id: string
          payment_method: string | null
          reason: string | null
          receipt_number: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          amount: number
          authorized_by?: string | null
          authorized_name?: string | null
          cash_register_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          opening_id: string
          payment_method?: string | null
          reason?: string | null
          receipt_number?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          amount?: number
          authorized_by?: string | null
          authorized_name?: string | null
          cash_register_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          opening_id?: string
          payment_method?: string | null
          reason?: string | null
          receipt_number?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_movements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_movements_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "cash_register_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_openings: {
        Row: {
          cash_register_id: string
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          created_at: string
          deposit_amount: number
          device_id: string | null
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          status: string
          tenant_id: string
        }
        Insert: {
          cash_register_id: string
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          deposit_amount?: number
          device_id?: string | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
          tenant_id: string
        }
        Update: {
          cash_register_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          deposit_amount?: number
          device_id?: string | null
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_openings_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_openings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          active_device_id: string | null
          active_device_seen_at: string | null
          branch_id: string | null
          code: string
          created_at: string
          current_opening_id: string | null
          id: string
          is_active: boolean
          name: string
          petty_cash_amount: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active_device_id?: string | null
          active_device_seen_at?: string | null
          branch_id?: string | null
          code: string
          created_at?: string
          current_opening_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          petty_cash_amount?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active_device_id?: string | null
          active_device_seen_at?: string | null
          branch_id?: string | null
          code?: string
          created_at?: string
          current_opening_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          petty_cash_amount?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cash_registers_current_opening"
            columns: ["current_opening_id"]
            isOneToOne: false
            referencedRelation: "cash_register_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          document_number: string
          document_type: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string
          phone: string | null
          tenant_id: string
          trade_name: string | null
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          document_number: string
          document_type: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name: string
          phone?: string | null
          tenant_id: string
          trade_name?: string | null
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          document_number?: string
          document_type?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string
          phone?: string | null
          tenant_id?: string
          trade_name?: string | null
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_fund_movements: {
        Row: {
          amount: number
          authorized_by: string | null
          authorized_name: string | null
          cash_register_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reason: string | null
          receipt_number: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          amount: number
          authorized_by?: string | null
          authorized_name?: string | null
          cash_register_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          receipt_number?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          amount?: number
          authorized_by?: string | null
          authorized_name?: string | null
          cash_register_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          receipt_number?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_fund_movements_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_fund_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_fund_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_config: {
        Row: {
          api_token: string | null
          created_at: string
          departamento: string | null
          detraction_account: string | null
          direccion_fiscal: string | null
          distrito: string | null
          emit_free_lines: boolean
          id: string
          is_active: boolean
          is_production: boolean
          logo_url: string | null
          provider: string
          provincia: string | null
          razon_social: string
          ruc: string
          tenant_id: string
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          api_token?: string | null
          created_at?: string
          departamento?: string | null
          detraction_account?: string | null
          direccion_fiscal?: string | null
          distrito?: string | null
          emit_free_lines?: boolean
          id?: string
          is_active?: boolean
          is_production?: boolean
          logo_url?: string | null
          provider?: string
          provincia?: string | null
          razon_social: string
          ruc: string
          tenant_id: string
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          api_token?: string | null
          created_at?: string
          departamento?: string | null
          detraction_account?: string | null
          direccion_fiscal?: string | null
          distrito?: string | null
          emit_free_lines?: boolean
          id?: string
          is_active?: boolean
          is_production?: boolean
          logo_url?: string | null
          provider?: string
          provincia?: string | null
          razon_social?: string
          ruc?: string
          tenant_id?: string
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_user_assignments: {
        Row: {
          cash_register_id: string | null
          created_at: string
          id: string
          is_active: boolean
          pin_code: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          cash_register_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          pin_code?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          cash_register_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          pin_code?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_user_assignments_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_user_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_items: {
        Row: {
          audit_id: string
          cost_impact: number
          cost_price: number
          created_at: string
          difference: number
          entity_id: string
          entity_name: string
          entity_sku: string
          entity_type: string
          id: string
          physical_stock: number
          theoretical_stock: number
        }
        Insert: {
          audit_id: string
          cost_impact?: number
          cost_price?: number
          created_at?: string
          difference: number
          entity_id: string
          entity_name: string
          entity_sku: string
          entity_type: string
          id?: string
          physical_stock: number
          theoretical_stock: number
        }
        Update: {
          audit_id?: string
          cost_impact?: number
          cost_price?: number
          created_at?: string
          difference?: number
          entity_id?: string
          entity_name?: string
          entity_sku?: string
          entity_type?: string
          id?: string
          physical_stock?: number
          theoretical_stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "inventory_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audits: {
        Row: {
          audited_by: string | null
          branch_id: string
          created_at: string
          decided_at: string | null
          id: string
          items_adjusted: number
          items_audited: number
          notes: string | null
          status: string
          tenant_id: string
          total_discrepancy_value: number
        }
        Insert: {
          audited_by?: string | null
          branch_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          items_adjusted?: number
          items_audited?: number
          notes?: string | null
          status?: string
          tenant_id: string
          total_discrepancy_value?: number
        }
        Update: {
          audited_by?: string | null
          branch_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          items_adjusted?: number
          items_audited?: number
          notes?: string | null
          status?: string
          tenant_id?: string
          total_discrepancy_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          invoice_code: string | null
          invoice_id: string | null
          movement_type: string
          notes: string | null
          quantity: number
          reason: string | null
          supplier_ruc: string | null
          tenant_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          invoice_code?: string | null
          invoice_id?: string | null
          movement_type: string
          notes?: string | null
          quantity: number
          reason?: string | null
          supplier_ruc?: string | null
          tenant_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          invoice_code?: string | null
          invoice_id?: string | null
          movement_type?: string
          notes?: string | null
          quantity?: number
          reason?: string | null
          supplier_ruc?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cortesia_reason: string | null
          cost_price: number | null
          created_at: string
          description: string
          discount_amount: number | null
          discount_percentage: number | null
          icbper_amount: number | null
          id: string
          igv_amount: number
          igv_rate: number
          invoice_id: string
          is_cortesia: boolean
          isc_amount: number | null
          isc_rate: number | null
          original_unit_price: number | null
          product_id: string | null
          quantity: number
          sort_order: number
          subtotal: number
          supply_id: string | null
          tax_type: string
          total: number
          unit_of_measure: string
          unit_price: number
        }
        Insert: {
          cortesia_reason?: string | null
          cost_price?: number | null
          created_at?: string
          description: string
          discount_amount?: number | null
          discount_percentage?: number | null
          icbper_amount?: number | null
          id?: string
          igv_amount?: number
          igv_rate?: number
          invoice_id: string
          is_cortesia?: boolean
          isc_amount?: number | null
          isc_rate?: number | null
          original_unit_price?: number | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          subtotal?: number
          supply_id?: string | null
          tax_type?: string
          total?: number
          unit_of_measure?: string
          unit_price: number
        }
        Update: {
          cortesia_reason?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          icbper_amount?: number | null
          id?: string
          igv_amount?: number
          igv_rate?: number
          invoice_id?: string
          is_cortesia?: boolean
          isc_amount?: number | null
          isc_rate?: number | null
          original_unit_price?: number | null
          product_id?: string | null
          quantity?: number
          sort_order?: number
          subtotal?: number
          supply_id?: string | null
          tax_type?: string
          total?: number
          unit_of_measure?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          branch_id: string | null
          cash_register_id: string | null
          created_at: string
          current_correlative: number
          document_type: string
          id: string
          is_active: boolean
          series_code: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          cash_register_id?: string | null
          created_at?: string
          current_correlative?: number
          document_type: string
          id?: string
          is_active?: boolean
          series_code: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          cash_register_id?: string | null
          created_at?: string
          current_correlative?: number
          document_type?: string
          id?: string
          is_active?: boolean
          series_code?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          cash_register_id: string | null
          cashier_id: string | null
          cdr_url: string | null
          correlative_number: number
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_document_number: string | null
          customer_document_type: string | null
          customer_id: string | null
          customer_name: string | null
          detraction_amount: number | null
          detraction_code: string | null
          detraction_payment_method: string | null
          detraction_percentage: number | null
          discount_total: number
          document_type: string
          exchange_rate: number | null
          has_detraction: boolean
          hash_code: string | null
          icbper_total: number
          id: string
          igv_total: number
          isc_total: number
          issue_date: string
          notes: string | null
          op_exonerada: number
          op_gravada: number
          op_inafecta: number
          opening_id: string | null
          payment_method: string | null
          promotion_discount: number | null
          promotion_id: string | null
          promotion_uses: number
          reference_invoice_id: string | null
          reference_reason: string | null
          reissue_of_invoice_id: string | null
          series_id: string
          status: string
          sunat_attempts: number
          sunat_document_id: string | null
          sunat_response_code: string | null
          sunat_response_desc: string | null
          sunat_ticket_status: string | null
          tenant_id: string
          total: number
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          cash_register_id?: string | null
          cashier_id?: string | null
          cdr_url?: string | null
          correlative_number: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_document_number?: string | null
          customer_document_type?: string | null
          customer_id?: string | null
          customer_name?: string | null
          detraction_amount?: number | null
          detraction_code?: string | null
          detraction_payment_method?: string | null
          detraction_percentage?: number | null
          discount_total?: number
          document_type: string
          exchange_rate?: number | null
          has_detraction?: boolean
          hash_code?: string | null
          icbper_total?: number
          id?: string
          igv_total?: number
          isc_total?: number
          issue_date?: string
          notes?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          opening_id?: string | null
          payment_method?: string | null
          promotion_discount?: number | null
          promotion_id?: string | null
          promotion_uses?: number
          reference_invoice_id?: string | null
          reference_reason?: string | null
          reissue_of_invoice_id?: string | null
          series_id: string
          status?: string
          sunat_attempts?: number
          sunat_document_id?: string | null
          sunat_response_code?: string | null
          sunat_response_desc?: string | null
          sunat_ticket_status?: string | null
          tenant_id: string
          total?: number
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          cash_register_id?: string | null
          cashier_id?: string | null
          cdr_url?: string | null
          correlative_number?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_document_number?: string | null
          customer_document_type?: string | null
          customer_id?: string | null
          customer_name?: string | null
          detraction_amount?: number | null
          detraction_code?: string | null
          detraction_payment_method?: string | null
          detraction_percentage?: number | null
          discount_total?: number
          document_type?: string
          exchange_rate?: number | null
          has_detraction?: boolean
          hash_code?: string | null
          icbper_total?: number
          id?: string
          igv_total?: number
          isc_total?: number
          issue_date?: string
          notes?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          opening_id?: string | null
          payment_method?: string | null
          promotion_discount?: number | null
          promotion_id?: string | null
          promotion_uses?: number
          reference_invoice_id?: string | null
          reference_reason?: string | null
          reissue_of_invoice_id?: string | null
          series_id?: string
          status?: string
          sunat_attempts?: number
          sunat_document_id?: string | null
          sunat_response_code?: string | null
          sunat_response_desc?: string | null
          sunat_ticket_status?: string | null
          tenant_id?: string
          total?: number
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_opening_id_fkey"
            columns: ["opening_id"]
            isOneToOne: false
            referencedRelation: "cash_register_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_reference_invoice_id_fkey"
            columns: ["reference_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_reissue_of_invoice_id_fkey"
            columns: ["reissue_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_daily_snapshots: {
        Row: {
          attendance_entries: number
          attendance_entries_sold: number
          attendance_scans: number
          avg_ticket: number
          branch_id: string | null
          computed_at: string
          cortesia_amount: number
          cortesia_count: number
          created_at: string
          expense_count: number
          id: string
          inventory_shrinkage_value: number
          inventory_waste_value: number
          promotion_discount_total: number
          promotion_tx_count: number
          revenue_card: number
          revenue_cash: number
          revenue_credit: number
          revenue_mixed: number
          revenue_transfer: number
          snapshot_date: string
          tenant_id: string
          total_expenses: number
          total_revenue: number
          transaction_count: number
          voided_amount: number
          voided_count: number
        }
        Insert: {
          attendance_entries?: number
          attendance_entries_sold?: number
          attendance_scans?: number
          avg_ticket?: number
          branch_id?: string | null
          computed_at?: string
          cortesia_amount?: number
          cortesia_count?: number
          created_at?: string
          expense_count?: number
          id?: string
          inventory_shrinkage_value?: number
          inventory_waste_value?: number
          promotion_discount_total?: number
          promotion_tx_count?: number
          revenue_card?: number
          revenue_cash?: number
          revenue_credit?: number
          revenue_mixed?: number
          revenue_transfer?: number
          snapshot_date: string
          tenant_id: string
          total_expenses?: number
          total_revenue?: number
          transaction_count?: number
          voided_amount?: number
          voided_count?: number
        }
        Update: {
          attendance_entries?: number
          attendance_entries_sold?: number
          attendance_scans?: number
          avg_ticket?: number
          branch_id?: string | null
          computed_at?: string
          cortesia_amount?: number
          cortesia_count?: number
          created_at?: string
          expense_count?: number
          id?: string
          inventory_shrinkage_value?: number
          inventory_waste_value?: number
          promotion_discount_total?: number
          promotion_tx_count?: number
          revenue_card?: number
          revenue_cash?: number
          revenue_credit?: number
          revenue_mixed?: number
          revenue_transfer?: number
          snapshot_date?: string
          tenant_id?: string
          total_expenses?: number
          total_revenue?: number
          transaction_count?: number
          voided_amount?: number
          voided_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_daily_snapshots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_daily_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lector_user_assignments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lector_user_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lector_user_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          resource_id: string | null
          resource_type: string | null
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id: string
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          culqi_link_id: string | null
          culqi_link_url: string | null
          culqi_order_id: string | null
          currency: string
          customer_document_number: string | null
          customer_document_type: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          description: string | null
          expires_at: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          product_id: string | null
          quantity: number
          reservation_date: string | null
          reservation_id: string | null
          slot_end: string | null
          slot_start: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          culqi_link_id?: string | null
          culqi_link_url?: string | null
          culqi_order_id?: string | null
          currency?: string
          customer_document_number?: string | null
          customer_document_type?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          quantity?: number
          reservation_date?: string | null
          reservation_id?: string | null
          slot_end?: string | null
          slot_start?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          culqi_link_id?: string | null
          culqi_link_url?: string | null
          culqi_order_id?: string | null
          currency?: string
          customer_document_number?: string | null
          customer_document_type?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          product_id?: string | null
          quantity?: number
          reservation_date?: string | null
          reservation_id?: string | null
          slot_end?: string | null
          slot_start?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_assignments: {
        Row: {
          category_id: string
          id: string
          product_id: string
        }
        Insert: {
          category_id: string
          id?: string
          product_id: string
        }
        Update: {
          category_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tag_assignments: {
        Row: {
          id: string
          product_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          product_id: string
          tag_id: string
        }
        Update: {
          id?: string
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tag_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          category_id: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          category_id: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          category_id?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          branch_id: string | null
          cost_price: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          igv_rate: number
          image_url: string | null
          is_active: boolean
          is_schedulable: boolean
          min_stock: number | null
          name: string
          product_kind: string
          sku: string
          stock_quantity: number
          tax_type: string
          tenant_id: string
          type: string
          unit_of_measure: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          igv_rate?: number
          image_url?: string | null
          is_active?: boolean
          is_schedulable?: boolean
          min_stock?: number | null
          name: string
          product_kind?: string
          sku: string
          stock_quantity?: number
          tax_type?: string
          tenant_id: string
          type: string
          unit_of_measure?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          igv_rate?: number
          image_url?: string | null
          is_active?: boolean
          is_schedulable?: boolean
          min_stock?: number | null
          name?: string
          product_kind?: string
          sku?: string
          stock_quantity?: number
          tax_type?: string
          tenant_id?: string
          type?: string
          unit_of_measure?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string
          created_at: string
          email: string
          first_name: string
          full_name: string | null
          id: string
          is_active: boolean
          is_owner: boolean
          last_name: string
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string
          created_at?: string
          email: string
          first_name?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          is_owner?: boolean
          last_name?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cargo?: string
          created_at?: string
          email?: string
          first_name?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_owner?: boolean
          last_name?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_branch_filters: {
        Row: {
          branch_id: string
          id: string
          promotion_id: string
        }
        Insert: {
          branch_id: string
          id?: string
          promotion_id: string
        }
        Update: {
          branch_id?: string
          id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_branch_filters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_branch_filters_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_category_filters: {
        Row: {
          category_id: string
          id: string
          promotion_id: string
        }
        Insert: {
          category_id: string
          id?: string
          promotion_id: string
        }
        Update: {
          category_id?: string
          id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_category_filters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_category_filters_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_combo_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          promotion_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          promotion_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          promotion_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_combo_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_tag_filters: {
        Row: {
          id: string
          promotion_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          promotion_id: string
          tag_id: string
        }
        Update: {
          id?: string
          promotion_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_tag_filters_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_tag_filters_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_usage: {
        Row: {
          customer_id: string | null
          id: string
          invoice_id: string | null
          promotion_id: string
          tenant_id: string
          used_at: string
        }
        Insert: {
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          promotion_id: string
          tenant_id: string
          used_at?: string
        }
        Update: {
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          promotion_id?: string
          tenant_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_usage_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          applies_every: number
          applies_to: string
          code: string
          combo_price: number | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number | null
          id: string
          is_active: boolean
          is_combo: boolean
          max_discount_amount: number | null
          max_uses_per_customer: number | null
          min_purchase_amount: number | null
          min_quantity: number | null
          name: string
          restricted_hour_from: string | null
          restricted_hour_until: string | null
          stock: number | null
          tenant_id: string
          updated_at: string
          used_count: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_every?: number
          applies_to?: string
          code: string
          combo_price?: number | null
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value?: number | null
          id?: string
          is_active?: boolean
          is_combo?: boolean
          max_discount_amount?: number | null
          max_uses_per_customer?: number | null
          min_purchase_amount?: number | null
          min_quantity?: number | null
          name: string
          restricted_hour_from?: string | null
          restricted_hour_until?: string | null
          stock?: number | null
          tenant_id: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_every?: number
          applies_to?: string
          code?: string
          combo_price?: number | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number | null
          id?: string
          is_active?: boolean
          is_combo?: boolean
          max_discount_amount?: number | null
          max_uses_per_customer?: number | null
          min_purchase_amount?: number | null
          min_quantity?: number | null
          name?: string
          restricted_hour_from?: string | null
          restricted_hour_until?: string | null
          stock?: number | null
          tenant_id?: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity_needed: number
          sort_order: number
          supply_id: string
          unit_of_measure: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity_needed: number
          sort_order?: number
          supply_id: string
          unit_of_measure?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity_needed?: number
          sort_order?: number
          supply_id?: string
          unit_of_measure?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_entries: {
        Row: {
          entries_count: number
          id: string
          notes: string | null
          reservation_id: string
          scanned_at: string
          scanned_by: string | null
          tenant_id: string
        }
        Insert: {
          entries_count?: number
          id?: string
          notes?: string | null
          reservation_id: string
          scanned_at?: string
          scanned_by?: string | null
          tenant_id: string
        }
        Update: {
          entries_count?: number
          id?: string
          notes?: string | null
          reservation_id?: string
          scanned_at?: string
          scanned_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_entries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_slot_counts: {
        Row: {
          capacity: number
          id: string
          reserved_count: number
          schedule_id: string
          slot_date: string
          slot_end: string
          slot_start: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity: number
          id?: string
          reserved_count?: number
          schedule_id: string
          slot_date: string
          slot_end: string
          slot_start: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          id?: string
          reserved_count?: number
          schedule_id?: string
          slot_date?: string
          slot_end?: string
          slot_start?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_slot_counts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_slot_counts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          access_code: string | null
          branch_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          entries_used: number
          id: string
          invoice_id: string | null
          notes: string | null
          product_id: string
          quantity: number
          reservation_date: string
          schedule_id: string
          slot_end: string
          slot_start: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          branch_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          entries_used?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          reservation_date: string
          schedule_id: string
          slot_end: string
          slot_start: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          branch_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          entries_used?: number
          id?: string
          invoice_id?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          reservation_date?: string
          schedule_id?: string
          slot_end?: string
          slot_start?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_time_ranges: {
        Row: {
          capacity_override: number | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          schedule_id: string
          start_time: string
        }
        Insert: {
          capacity_override?: number | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          schedule_id: string
          start_time: string
        }
        Update: {
          capacity_override?: number | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          schedule_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_time_ranges_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          branch_id: string
          created_at: string
          default_capacity: number
          id: string
          interval_minutes: number
          is_active: boolean
          name: string | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          default_capacity?: number
          id?: string
          interval_minutes?: number
          is_active?: boolean
          name?: string | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          default_capacity?: number
          id?: string
          interval_minutes?: number
          is_active?: boolean
          name?: string | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sunat_summaries: {
        Row: {
          cdr_url: string | null
          correlative: number
          created_at: string
          created_by: string | null
          id: string
          poll_attempts: number
          reference_date: string
          response_code: string | null
          response_desc: string | null
          sent_at: string
          status: string
          summary_type: string
          tenant_id: string
          ticket: string | null
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          cdr_url?: string | null
          correlative: number
          created_at?: string
          created_by?: string | null
          id?: string
          poll_attempts?: number
          reference_date: string
          response_code?: string | null
          response_desc?: string | null
          sent_at?: string
          status?: string
          summary_type: string
          tenant_id: string
          ticket?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          cdr_url?: string | null
          correlative?: number
          created_at?: string
          created_by?: string | null
          id?: string
          poll_attempts?: number
          reference_date?: string
          response_code?: string | null
          response_desc?: string | null
          sent_at?: string
          status?: string
          summary_type?: string
          tenant_id?: string
          ticket?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sunat_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sunat_summary_counters: {
        Row: {
          last_correlative: number
          reference_date: string
          summary_type: string
          tenant_id: string
        }
        Insert: {
          last_correlative?: number
          reference_date: string
          summary_type: string
          tenant_id: string
        }
        Update: {
          last_correlative?: number
          reference_date?: string
          summary_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunat_summary_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sunat_summary_items: {
        Row: {
          created_at: string
          invoice_id: string
          summary_id: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          summary_id: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          summary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunat_summary_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sunat_summary_items_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "sunat_summaries"
            referencedColumns: ["id"]
          },
        ]
      }
      supplies: {
        Row: {
          available_in_pos: boolean
          barcode: string | null
          branch_id: string | null
          cost_price: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          min_stock: number | null
          name: string
          sku: string
          stock_quantity: number
          tenant_id: string
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          available_in_pos?: boolean
          barcode?: string | null
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number | null
          name: string
          sku: string
          stock_quantity?: number
          tenant_id: string
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          available_in_pos?: boolean
          barcode?: string | null
          branch_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number | null
          name?: string
          sku?: string
          stock_quantity?: number
          tenant_id?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_category_assignments: {
        Row: {
          category_id: string
          id: string
          supply_id: string
        }
        Insert: {
          category_id: string
          id?: string
          supply_id: string
        }
        Update: {
          category_id?: string
          id?: string
          supply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_category_assignments_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_tag_assignments: {
        Row: {
          id: string
          supply_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          supply_id: string
          tag_id: string
        }
        Update: {
          id?: string
          supply_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_tag_assignments_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          primary_color: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          razon_social: string | null
          ruc: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          razon_social?: string | null
          ruc?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          razon_social?: string | null
          ruc?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module_code: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_code: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_code?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          font_size: string
          id: string
          locale: string
          push_enabled: boolean
          quick_access: string[] | null
          tenant_id: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          font_size?: string
          id?: string
          locale?: string
          push_enabled?: boolean
          quick_access?: string[] | null
          tenant_id: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          font_size?: string
          id?: string
          locale?: string
          push_enabled?: boolean
          quick_access?: string[] | null
          tenant_id?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_calculate_composite_stock: {
        Args: { p_product_id: string }
        Returns: number
      }
      fn_calculate_composite_stocks_bulk: {
        Args: { p_product_ids: string[] }
        Returns: {
          product_id: string
          stock: number
        }[]
      }
      fn_cancel_reservation: {
        Args: {
          p_cancelled_by: string
          p_reason?: string
          p_reservation_id: string
        }
        Returns: undefined
      }
      fn_create_notification: {
        Args: {
          p_message: string
          p_resource_id?: string
          p_resource_type?: string
          p_tenant_id: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_user_id: string
        }
        Returns: string
      }
      fn_create_reservation: {
        Args: {
          p_access_code?: string
          p_branch_id: string
          p_created_by: string
          p_customer_id: string
          p_customer_name: string
          p_date: string
          p_invoice_id: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_slot_end: string
          p_slot_start: string
          p_tenant_id: string
        }
        Returns: string
      }
      fn_current_tenant_id: { Args: never; Returns: string }
      fn_decrement_composite_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      fn_decrement_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: number
      }
      fn_decrement_stock_checked: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: Json
      }
      fn_decrement_supply_stock: {
        Args: { p_quantity: number; p_supply_id: string }
        Returns: number
      }
      fn_decrement_supply_stock_checked: {
        Args: { p_quantity: number; p_supply_id: string }
        Returns: Json
      }
      fn_generate_access_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      fn_generate_branch_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      fn_generate_cash_register_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      fn_generate_daily_snapshot: {
        Args: { p_date?: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_generate_product_barcode: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      fn_generate_product_sku: {
        Args: { p_tenant_id: string; p_type: string }
        Returns: string
      }
      fn_generate_supply_sku: { Args: { p_tenant_id: string }; Returns: string }
      fn_get_available_slots: {
        Args: {
          p_branch_id: string
          p_date: string
          p_product_id: string
          p_tenant_id: string
        }
        Returns: {
          available: number
          capacity: number
          reserved_count: number
          slot_end: string
          slot_start: string
        }[]
      }
      fn_group_peak_occupancy: {
        Args: {
          p_date: string
          p_group_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: number
      }
      fn_increment_promotion_used_count: {
        Args: { p_count?: number; p_promotion_id: string }
        Returns: undefined
      }
      fn_increment_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: number
      }
      fn_increment_summary_polls: {
        Args: { p_summary_id: string }
        Returns: number
      }
      fn_increment_sunat_attempts: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      fn_increment_supply_stock: {
        Args: { p_quantity: number; p_supply_id: string }
        Returns: number
      }
      fn_kpi_attendance: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          active_sessions: number
          avg_dwell_minutes: number
          entries_sold: number
          no_show_rate: number
          prev_entries_sold: number
          prev_total_entries: number
          total_entries: number
          total_scans: number
          unique_reservations: number
        }[]
      }
      fn_kpi_daily_trend: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          avg_ticket: number
          cortesia_amount: number
          promotion_discount_total: number
          total_revenue: number
          transaction_count: number
          trend_date: string
          voided_amount: number
        }[]
      }
      fn_kpi_expenses_summary: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          expense_count: number
          prev_expense_amount: number
          prev_expense_count: number
          total_expense_amount: number
        }[]
      }
      fn_kpi_expenses_trend: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          expense_date: string
          movement_count: number
          total_amount: number
        }[]
      }
      fn_kpi_hourly_attendance: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          entries: number
          entries_sold: number
          hour_of_day: number
          occupancy_pct: number
          scan_count: number
        }[]
      }
      fn_kpi_hourly_product_sales: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_product_id?: string
          p_tenant_id: string
        }
        Returns: {
          hour_of_day: number
          quantity_sold: number
          revenue: number
        }[]
      }
      fn_kpi_hourly_sales: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          hour_of_day: number
          products_sold: number
          revenue: number
          tx_count: number
        }[]
      }
      fn_kpi_inventory_health: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          breakage_movements: number
          breakage_units: number
          breakage_value: number
          efficiency_pct: number
          items_audited: number
          items_with_discrepancy: number
          loss_pct_of_sales: number
          loss_pct_of_transactions: number
          shrinkage_movements: number
          shrinkage_units: number
          shrinkage_value: number
          staff_consumption_movements: number
          staff_consumption_units: number
          staff_consumption_value: number
          total_audits: number
          total_discrepancy_value: number
          total_loss_value: number
          waste_movements: number
          waste_units: number
          waste_value: number
        }[]
      }
      fn_kpi_operational_leaks: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          cortesia_amount: number
          cortesia_count: number
          cortesia_pct_revenue: number
          cortesia_pct_tx: number
          promo_discount_total: number
          promo_pct_revenue: number
          promo_pct_tx: number
          promo_tx_count: number
          total_revenue: number
          total_tx: number
          voided_amount: number
          voided_count: number
          voided_pct_revenue: number
          voided_pct_tx: number
        }[]
      }
      fn_kpi_product_ranking: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_order?: string
          p_tenant_id: string
        }
        Returns: {
          avg_unit_price: number
          cost_price: number
          margin: number
          pct_of_total: number
          product_id: string
          product_name: string
          product_sku: string
          total_revenue: number
          units_sold: number
        }[]
      }
      fn_kpi_sales_summary: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          avg_ticket: number
          boletas_count: number
          facturas_count: number
          revenue_card: number
          revenue_cash: number
          revenue_credit: number
          revenue_mixed: number
          revenue_transfer: number
          tickets_count: number
          total_revenue: number
          transaction_count: number
        }[]
      }
      fn_kpi_time_series: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_granularity?: string
          p_tenant_id: string
        }
        Returns: {
          avg_ticket: number
          entries_sold: number
          products_sold: number
          qr_entries: number
          revenue: number
          time_bucket: string
          tx_count: number
        }[]
      }
      fn_lookup_reservation: {
        Args: { p_access_code: string; p_tenant_id: string }
        Returns: Json
      }
      fn_next_correlative: { Args: { p_series_id: string }; Returns: number }
      fn_next_summary_correlative: {
        Args: {
          p_reference_date: string
          p_summary_type: string
          p_tenant_id: string
        }
        Returns: number
      }
      fn_refresh_composite_stock_for_supply: {
        Args: { p_supply_id: string }
        Returns: undefined
      }
      fn_register_entry: {
        Args: {
          p_access_code: string
          p_entries_count?: number
          p_scanned_by?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_register_exit: {
        Args: {
          p_access_code: string
          p_checkout_time?: string
          p_scanned_by?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_report_control_caja: {
        Args: {
          p_cash_register_id?: string
          p_date_from: string
          p_date_to: string
          p_tenant_id: string
        }
        Returns: {
          caja: string
          cajero_apertura: string
          cajero_cierre: string
          codigo_caja: string
          descuadre: number
          estado: string
          fecha: string
          hora_apertura: string
          hora_cierre: string
          monto_apertura: number
          monto_cierre_real: number
          monto_esperado: number
          notas: string
          sede: string
        }[]
      }
      fn_report_control_fugas: {
        Args: {
          p_branch_id?: string
          p_date_from: string
          p_date_to: string
          p_tenant_id: string
        }
        Returns: {
          cantidad: number
          costo_asumido: number
          fecha: string
          hora: string
          monto_perdido: number
          motivo: string
          producto_afectado: string
          tipo_evento: string
          usuario_responsable: string
        }[]
      }
      fn_report_inventario_valorizado: {
        Args: { p_branch_id?: string; p_tenant_id: string }
        Returns: {
          categoria: string
          costo_unitario: number
          estado_stock: string
          nombre: string
          sku: string
          stock_actual: number
          stock_minimo: number
          tipo: string
          valor_total: number
        }[]
      }
      fn_report_inventario_valorizado_v2: {
        Args: {
          p_branch_id?: string
          p_date_from?: string
          p_date_to?: string
          p_tenant_id: string
        }
        Returns: {
          cambio_neto: number
          categoria: string
          costo_unitario: number
          estado_stock: string
          fecha_ultimo_conteo: string
          nombre: string
          sku: string
          stock_actual: number
          stock_minimo: number
          stock_ultimo_conteo: number
          tipo: string
          total_ingresos: number
          total_salidas: number
          valor_total: number
        }[]
      }
      fn_report_kardex_inventario: {
        Args: {
          p_branch_id?: string
          p_date_from: string
          p_date_to: string
          p_entity_type?: string
          p_tenant_id: string
        }
        Returns: {
          categoria: string
          costo_unitario: number
          diferencia: number
          fecha_ultimo_conteo: string
          nombre: string
          qty_ajuste: number
          qty_consumo_staff: number
          qty_cortesia: number
          qty_ingreso: number
          qty_merma: number
          qty_nc_retorno: number
          qty_perdida: number
          qty_rotura: number
          qty_salida: number
          qty_transferencia: number
          qty_venta: number
          sku: string
          stock_fisico: number
          stock_teorico: number
          tipo: string
          total_movimientos: number
          valor_stock: number
        }[]
      }
      fn_report_rendimiento_catalogo: {
        Args: {
          p_branch_id?: string
          p_category_id?: string
          p_date_from: string
          p_date_to: string
          p_tenant_id: string
        }
        Returns: {
          categoria_producto: string
          costo_generado: number
          costo_unitario: number
          fecha: string
          ganancia_neta: number
          ingreso_generado: number
          nombre_producto: string
          precio_venta_unitario: number
          sku: string
          tipo_producto: string
          unidades_vendidas: number
        }[]
      }
      fn_report_rendimiento_promos: {
        Args: { p_date_from: string; p_date_to: string; p_tenant_id: string }
        Returns: {
          codigo_promo: string
          comprobante: string
          fecha: string
          hora: string
          ingreso_real: number
          monto_descontado: number
          nombre_promo: string
          tipo_descuento: string
          valor_descuento: number
        }[]
      }
      fn_report_sabana_ventas: {
        Args: {
          p_branch_id?: string
          p_date_from: string
          p_date_to: string
          p_payment_method?: string
          p_tenant_id: string
        }
        Returns: {
          caja: string
          cajero: string
          costo_total_tx: number
          dia_semana: string
          fecha: string
          hora: string
          id_transaccion: string
          margen_bruto: number
          metodo_pago: string
          monto_total_venta: number
          sede: string
          serie_correlativo: string
          tipo_comprobante: string
        }[]
      }
      fn_report_trafico_vs_entradas: {
        Args: {
          p_branch_id?: string
          p_date_from: string
          p_date_to: string
          p_tenant_id: string
        }
        Returns: {
          diferencia: number
          entradas_vendidas: number
          fecha: string
          hora: string
          qrs_escaneados: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      notification_type: "info" | "warning" | "success" | "error"
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
      notification_type: ["info", "warning", "success", "error"],
    },
  },
} as const
