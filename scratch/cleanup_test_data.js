// Script para limpiar datos de prueba creados por los tests de diagnóstico
// IDs falsos usados: 5200000000, 99999999, 88888888

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan variables NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const IDS_FALSOS = ['5200000000', '99999999', '88888888']

async function limpiar() {
  console.log('🧹 Buscando conversaciones de prueba...')

  const { data: convs, error } = await supabase
    .from('conversaciones')
    .select('id, id_plataforma, plataforma')
    .in('id_plataforma', IDS_FALSOS)

  if (error) {
    console.error('Error buscando:', error.message)
    return
  }

  if (!convs || convs.length === 0) {
    console.log('✅ No se encontraron datos de prueba.')
    return
  }

  console.log(`📋 Encontradas ${convs.length} conversaciones de prueba:`)
  convs.forEach(c => console.log(`  - ${c.id} (${c.id_plataforma} / ${c.plataforma})`))

  for (const conv of convs) {
    // Borrar mensajes
    const { error: errMsg } = await supabase.from('mensajes').delete().eq('conversacion_id', conv.id)
    if (errMsg) console.error(`  ❌ Error borrando mensajes de ${conv.id}:`, errMsg.message)
    else console.log(`  🗑️ Mensajes de ${conv.id} eliminados`)

    // Borrar conversación
    const { error: errConv } = await supabase.from('conversaciones').delete().eq('id', conv.id)
    if (errConv) console.error(`  ❌ Error borrando conversación ${conv.id}:`, errConv.message)
    else console.log(`  🗑️ Conversación ${conv.id} eliminada`)
  }

  // Borrar prospectos falsos
  const { data: prosFalsos } = await supabase
    .from('prospectos')
    .select('id, nombre, telefono')
    .in('telefono', IDS_FALSOS)

  if (prosFalsos && prosFalsos.length > 0) {
    console.log(`📋 Encontrados ${prosFalsos.length} prospectos de prueba:`)
    for (const p of prosFalsos) {
      console.log(`  - ${p.id} (${p.nombre} / ${p.telefono})`)
      // Desvincular citas antes de borrar
      await supabase.from('citas').delete().eq('prospecto_id', p.id)
      const { error: errP } = await supabase.from('prospectos').delete().eq('id', p.id)
      if (errP) console.error(`  ❌ Error borrando prospecto:`, errP.message)
      else console.log(`  🗑️ Prospecto ${p.id} eliminado`)
    }
  }

  console.log('\n✅ Limpieza completada.')
}

limpiar()
