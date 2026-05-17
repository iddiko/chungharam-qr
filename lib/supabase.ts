import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient()

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          parent_id: string | null
          name: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          parent_id?: string | null
          name: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          parent_id?: string | null
          name?: string
          type?: string
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          org_id: string
          role: string
          name: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          role: string
          name: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: string
          name?: string
          email?: string
          created_at?: string
        }
      }
      qr_codes: {
        Row: {
          id: string
          uuid: string
          parent_qr_id: string | null
          product_name: string
          owner_org_id: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          uuid: string
          parent_qr_id?: string | null
          product_name: string
          owner_org_id: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          uuid?: string
          parent_qr_id?: string | null
          product_name?: string
          owner_org_id?: string
          status?: string
          created_at?: string
        }
      }
      qr_transfer_requests: {
        Row: {
          id: string
          qr_id: string
          from_org_id: string
          to_org_id: string
          status: string
          requested_by: string
          requested_at: string
          approved_at: string | null
          approved_by: string | null
        }
        Insert: {
          id?: string
          qr_id: string
          from_org_id: string
          to_org_id: string
          status?: string
          requested_by: string
          requested_at?: string
          approved_at?: string | null
          approved_by?: string | null
        }
        Update: {
          id?: string
          qr_id?: string
          from_org_id?: string
          to_org_id?: string
          status?: string
          requested_by?: string
          requested_at?: string
          approved_at?: string | null
          approved_by?: string | null
        }
      }
      qr_timeline: {
        Row: {
          id: string
          qr_id: string
          action: string
          actor_id: string
          location: string | null
          created_at: string
        }
        Insert: {
          id?: string
          qr_id: string
          action: string
          actor_id: string
          location?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          qr_id?: string
          action?: string
          actor_id?: string
          location?: string | null
          created_at?: string
        }
      }
      installations: {
        Row: {
          id: string
          qr_id: string
          image_url: string
          latitude: number
          longitude: number
          installed_by: string
          installed_at: string
        }
        Insert: {
          id?: string
          qr_id: string
          image_url: string
          latitude: number
          longitude: number
          installed_by: string
          installed_at?: string
        }
        Update: {
          id?: string
          qr_id?: string
          image_url?: string
          latitude?: number
          longitude?: number
          installed_by?: string
          installed_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          org_id: string
          qr_id: string | null
          amount: number
          sale_date: string
          customer_name: string | null
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          qr_id?: string | null
          amount: number
          sale_date?: string
          customer_name?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          qr_id?: string | null
          amount?: number
          sale_date?: string
          customer_name?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
    }
  }
}
