// Generated from the Supabase project schema. Regenerate after migrations with:
//   npx supabase gen types typescript --project-id cwcyfktdrrpugtiptcex > src/lib/supabase/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      collections: {
        Row: {
          collapsed: boolean;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          position: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          collapsed?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          position?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          collapsed?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_tabs: {
        Row: {
          collection_id: string;
          created_at: string;
          description: string | null;
          favicon: string | null;
          favicon_url: string | null;
          id: string;
          normalized_url: string | null;
          original_created_at: number | null;
          position: number;
          tags: Json;
          title: string;
          updated_at: string;
          url: string;
          user_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          description?: string | null;
          favicon?: string | null;
          favicon_url?: string | null;
          id?: string;
          normalized_url?: string | null;
          original_created_at?: number | null;
          position?: number;
          tags?: Json;
          title?: string;
          updated_at?: string;
          url: string;
          user_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          description?: string | null;
          favicon?: string | null;
          favicon_url?: string | null;
          id?: string;
          normalized_url?: string | null;
          original_created_at?: number | null;
          position?: number;
          tags?: Json;
          title?: string;
          updated_at?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_tabs_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          double_shift_search: boolean;
          fuzzy_search: boolean;
          search_descriptions: boolean;
          search_tags: boolean;
          sidebar_open: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
          view_mode: string;
        };
        Insert: {
          created_at?: string;
          double_shift_search?: boolean;
          fuzzy_search?: boolean;
          search_descriptions?: boolean;
          search_tags?: boolean;
          sidebar_open?: boolean;
          theme?: string;
          updated_at?: string;
          user_id: string;
          view_mode?: string;
        };
        Update: {
          created_at?: string;
          double_shift_search?: boolean;
          fuzzy_search?: boolean;
          search_descriptions?: boolean;
          search_tags?: boolean;
          sidebar_open?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          view_mode?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_own_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
