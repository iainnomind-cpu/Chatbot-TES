export default function PrivacidadPage() {
  return (
    <div className="max-w-4xl mx-auto p-10 font-sans text-slate-800 leading-relaxed">
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Política de Privacidad - Total English School</h1>
      <p className="mb-4 text-slate-500">Última actualización: 16 de mayo de 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Información que recopilamos</h2>
        <p>Nuestro chatbot recolecta información básica de contacto (nombre y teléfono) proporcionada voluntariamente por el usuario a través de Facebook Messenger, Instagram o WhatsApp, con el fin de brindar asesoría sobre nuestros diplomados de inglés.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Uso de la información</h2>
        <p>Los datos se utilizan exclusivamente para:</p>
        <ul className="list-disc ml-6 mt-2">
          <li>Personalizar la atención del asesor virtual (AlexIA).</li>
          <li>Agendar citas informativas en nuestras instalaciones.</li>
          <li>Enviar información relevante sobre cursos y promociones solicitadas por el usuario.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Protección de datos</h2>
        <p>No compartimos, vendemos ni transferimos su información personal a terceros. Los datos son almacenados de forma segura en nuestros sistemas internos de CRM.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Derechos del usuario</h2>
        <p>Usted puede solicitar la rectificación o eliminación de sus datos en cualquier momento enviando un correo a: <span className="font-semibold">liliana.guzmangon@gmail.com</span>.</p>
      </section>

      <div className="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-500">
        &copy; 2026 Total English School. Todos los derechos reservados.
      </div>
    </div>
  )
}
