import axios from 'axios';
import crypto from 'crypto';

// ⚠️ En un entorno de producción estricto, esto debería ir en variables de entorno (.env)
// Sin embargo, para que funcione inmediatamente sin reiniciar el servidor en Vercel, lo colocamos aquí.
const META_CAPI_TOKEN = 'EAATyZBWlsFy8BSbv1OIdvG2t8BXzIJ1o3FBhheBQFMBikESozParhaRt251AAhSnxZCnBLZAYDqfrwl2GdDzRNW22FkizAwbtKLsmZC2JZCOhRJcOlIrw3KkA8PYEta6MxgPsyo6fZCjYWOGNNJh9RHtu1tzLRlkbFnKkHkZCOS2s40EEybf1HBdrPg9mlGuAZDZD';
const META_DATASET_ID = '1745866309371033'; // Total English School Event Data

// Función para enviar eventos a Meta CAPI
// etapaFunnel: '3. Lead calificado', '4. DX / Cita agendada', '5. DX / Cita asistida', '6. Inscripción'
export async function sendMetaConversionEvent(prospecto, etapaFunnel) {
  if (!META_CAPI_TOKEN || !META_DATASET_ID) {
    console.warn('⚠️ No hay token de Meta CAPI configurado.');
    return;
  }

  // Mapear la etapa del CRM a un evento estándar de Meta
  let eventName = '';
  switch (etapaFunnel) {
    case '3. Lead calificado':
      eventName = 'Lead';
      break;
    case '4. DX / Cita agendada':
      eventName = 'Schedule';
      break;
    case '5. DX / Cita asistida':
    case '6. Inscripción':
      eventName = 'Purchase';
      break;
    default:
      // No mandamos eventos para etapas 1 y 2 a CAPI para no ensuciar el algoritmo con leads basura
      return;
  }

  // Limpiar y hashear el número de teléfono (Meta requiere SHA256)
  // El número debe estar en formato internacional sin el '+'. Ej: '5214431234567' -> '524431234567'
  let phone = (prospecto.telefono || '').replace(/\D/g, '');
  if (phone.startsWith('521') && phone.length === 13) {
    phone = '52' + phone.substring(3);
  }

  // Requerido por Meta: Si no se puede hashear correctamente el teléfono, es mejor no enviarlo vacío.
  if (!phone || phone.length < 10) {
    console.warn('⚠️ No se puede enviar evento a CAPI: Prospecto sin teléfono válido.', prospecto.id);
    return;
  }

  // Meta CAPI requiere los datos de usuario en SHA-256
  const hash = (str) => crypto.createHash('sha256').update(str).digest('hex');
  const hashedPhone = hash(phone);

  const eventTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const eventId = `${prospecto.id}_${eventName}_${eventTime}`; // Deduplicación

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        action_source: 'system_generated', // Evento desde CRM
        event_id: eventId,
        user_data: {
          ph: [hashedPhone]
        },
        custom_data: {
          currency: 'MXN',
          value: eventName === 'Purchase' ? 1000.00 : 0.00, // Puedes ajustar el valor de inscripción
          content_name: prospecto.curso_interes || 'Curso de Inglés',
        }
      }
    ]
  };

  try {
    const url = `https://graph.facebook.com/v19.0/${META_DATASET_ID}/events?access_token=${META_CAPI_TOKEN}`;
    const response = await axios.post(url, payload);
    console.log(`✅ [META CAPI] Evento '${eventName}' enviado para prospecto ${prospecto.id} (${phone}). FB Res:`, response.data);
  } catch (error) {
    console.error(`❌ [META CAPI] Error enviando evento '${eventName}' para prospecto ${prospecto.id}:`, error.response?.data || error.message);
  }
}
