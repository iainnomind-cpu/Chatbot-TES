import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { subscription, userId } = await request.json()

  if (!subscription || !userId) {
    return NextResponse.json({ error: 'subscription y userId requeridos' }, { status: 400 })
  }

  // Guardar la suscripción push en la base de datos
  // Nota: la tabla push_subscriptions se crea en Supabase con:
  //   id uuid primary key default gen_random_uuid()
  //   user_id text not null unique
  //   subscription jsonb not null
  //   updated_at timestamptz default now()
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('Error guardando push subscription:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
