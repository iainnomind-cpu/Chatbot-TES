export const metadata = {
  title: 'Política de Privacidad | Total English',
  description: 'Política de Privacidad para la aplicación Total English CRM',
}

export default function PoliticaPrivacidad() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 border-b pb-4">Política de Privacidad</h1>
        
        <div className="space-y-6 text-gray-600 leading-relaxed">
          <section>
            <p className="text-sm text-gray-500 mb-4">Última actualización: Mayo 2026</p>
            <p>
              Bienvenido a la Política de Privacidad de la aplicación CRM de <strong>Total English</strong>. 
              Esta aplicación es de uso interno exclusivo para el personal y asesores de nuestra academia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Información que recopilamos</h2>
            <p>
              Nuestra aplicación se conecta a las APIs de Facebook e Instagram (Meta) para recibir y gestionar 
              los mensajes directos que los usuarios envían a nuestra página comercial oficial. Recopilamos y almacenamos 
              únicamente la información necesaria para responder a sus solicitudes de información, la cual incluye:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Nombre o seudónimo público de perfil del usuario.</li>
              <li>ID numérico de la plataforma (Scoped ID) proporcionado por Meta.</li>
              <li>El contenido de los mensajes enviados a nuestra página comercial.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Uso de la información</h2>
            <p>
              Los datos obtenidos a través de la API de Meta se utilizan <strong>exclusivamente</strong> para:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Brindar atención al cliente automatizada mediante nuestro asistente virtual.</li>
              <li>Permitir que nuestros asesores humanos den seguimiento a las consultas de los estudiantes o prospectos.</li>
              <li>Llevar un registro interno de las conversaciones para mejorar nuestro servicio educativo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Compartición de datos</h2>
            <p>
              <strong>Total English no vende, alquila ni comparte</strong> información personal ni el contenido de los mensajes 
              con terceros, anunciantes o empresas externas. Toda la información permanece estrictamente confidencial dentro 
              de nuestra base de datos en la nube y es accesible únicamente por personal autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Eliminación de datos</h2>
            <p>
              Cualquier usuario que haya interactuado con nuestras páginas de Facebook o Instagram y desee que su 
              información sea eliminada de nuestra base de datos, puede solicitarlo enviando un mensaje directo a nuestra 
              página oficial o contactándonos a través de nuestros canales oficiales. Al recibir la solicitud, eliminaremos 
              sus datos personales de nuestros registros en un plazo máximo de 7 días hábiles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Contacto</h2>
            <p>
              Si tienes preguntas sobre esta política de privacidad o sobre cómo manejamos tus datos a través de 
              nuestra integración con Meta, por favor contáctanos directamente a nuestra página oficial de Facebook o Instagram.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
