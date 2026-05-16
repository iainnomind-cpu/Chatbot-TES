export default function EliminacionDatosPage() {
  return (
    <div className="max-w-4xl mx-auto p-10 font-sans text-slate-800 leading-relaxed text-center">
      <h1 className="text-3xl font-bold mb-6 text-slate-900">Eliminación de Datos de Usuario</h1>
      <p className="text-lg mb-8">
        En Total English School respetamos su privacidad. Si desea eliminar su información personal y el historial de conversaciones de nuestra base de datos, siga estas instrucciones:
      </p>

      <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 inline-block text-left max-w-lg">
        <h2 className="font-semibold mb-4 text-xl">¿Cómo solicitar la eliminación?</h2>
        <ol className="list-decimal ml-6 space-y-4">
          <li>Envíe un correo electrónico a <strong>liliana.guzmangon@gmail.com</strong>.</li>
          <li>Incluya en el asunto: <strong>"Solicitud de Eliminación de Datos - Chatbot"</strong>.</li>
          <li>Indique su nombre completo y el número de teléfono o ID de usuario de Messenger/Instagram con el que interactuó.</li>
        </ol>
      </div>

      <p className="mt-8 text-slate-600">
        Una vez recibida la solicitud, nuestro equipo procesará la eliminación total de sus registros en un plazo máximo de 48 horas hábiles.
      </p>

      <div className="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-500">
        &copy; 2026 Total English School.
      </div>
    </div>
  )
}
