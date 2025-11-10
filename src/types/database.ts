// src/types/database.ts
export type Database = {
    public: {
      Tables: {
        rooms: {
          Row:    { room_id: string; locked: boolean | null }
          Insert: { room_id: string; locked?: boolean | null }
          Update: { room_id?: string; locked?: boolean | null }
        }
        participants: {
          Row:    { room_id: string; name: string; code_hash: string; inserted_at?: string | null }
          Insert: { room_id: string; name: string; code_hash: string }
          Update: { room_id?: string; name?: string; code_hash?: string }
        }
        assignments: {
          Row:    { room_id: string; code_hash: string; target_name: string }
          Insert: { room_id: string; code_hash: string; target_name: string }
          Update: { room_id?: string; code_hash?: string; target_name?: string }
        }
      }
      Views: {}
      Functions: {}
      Enums: {}
    }
  }
  