import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server Component용 클라이언트
export const createClient = () => {
  return createServerComponentClient({ cookies })
}

// Route Handler(API)용 클라이언트
export const createRouteClient = () => {
  return createRouteHandlerClient({ cookies })
}

// Service Role 클라이언트 (RLS 우회)
export const createServiceClient = () => {
  return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
