// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// .env.local
const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 🚩 1) 런타임 체크 (친절 로그)
//    * 실행은 계속되지만, 키가 없으면 API 호출 시 당연히 실패할 수 있음.
//    * 타입은 반드시 SupabaseClient<Database> '단일 타입'로 유지한다.
if (!url || !anon) {
  console.warn(
    '[Supabase] Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    '개발 서버 재시작, .env.local 위치/철자 확인 필요.'
  )
}

// 🚩 2) "항상 존재하는" 단일 타입으로 export
//    * url/anon이 undefined라도 타입은 고정 → from('rooms') 제네릭 추론이 정상 작동
export const supabase: SupabaseClient<Database> = createClient<Database>(
  (url as string)  ?? 'https://invalid-project.supabase.co',
  (anon as string) ?? 'invalid-anon-key'
)

// (선택) UI에서 보여줄 메세지가 필요하면 별도 함수 제공
export function getEnvError(): string | null {
  if (!url && !anon) return 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 둘 다 누락됨'
  if (!url)  return 'VITE_SUPABASE_URL 누락됨'
  if (!anon) return 'VITE_SUPABASE_ANON_KEY 누락됨'
  return null
}
