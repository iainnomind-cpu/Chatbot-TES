


// === HELPER: Enviar push a todos los asesores suscritos ===
async function enviarPushAsesores({ title, body, url, tag }) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://erp-total-english.vercel.app';
    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, tag })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Push send error:', err);
    } else {
      const data = await res.json();
      console.log('Push enviado a suscriptores:', data.enviadas);
    }
  } catch (e) {
    console.error('Error enviando push:', e.message);
  }
}
