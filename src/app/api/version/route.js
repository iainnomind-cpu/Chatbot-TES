import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Identificador del despliegue actual. La app instalada lo consulta al volver al frente
// y se recarga si cambió, para que nadie se quede con una versión vieja.
export async function GET() {
  const version = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
  return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store' } })
}
