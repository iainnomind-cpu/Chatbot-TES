
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Applying DB constraints...");
  
  // No hay forma directa de ejecutar SQL arbitrario via client sin RPC
  // Pero podemos intentar deducir si existen o no.
  
  // Intentaremos un insert duplicado para ver si falla
  const testId = "test_duplicate_" + Date.now();
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: `
      ALTER TABLE mensajes ADD CONSTRAINT unique_mid UNIQUE (id_mensaje_meta);
      ALTER TABLE conversaciones ADD CONSTRAINT unique_id_plat UNIQUE (id_plataforma, plataforma);
    `});
    if (error) console.log("RPC Error (probablemente no existe exec_sql):", error.message);
    else console.log("Constraints applied successfully via RPC!");
  } catch (e) {
    console.log("Exception:", e.message);
  }
}

run();
