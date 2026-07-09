# 📸 Guía: Plantillas de WhatsApp con Imagen (header_handle)

## ¿Por qué es complicado?

Meta tiene **dos APIs distintas** para subir imágenes, con propósitos diferentes:

| API | Endpoint | Devuelve | Se usa para |
|-----|----------|----------|-------------|
| Media Upload API | `POST /{phone-number-id}/media` | `id` | Enviar mensajes con imagen |
| **Resumable Upload API** | `POST /{app-id}/uploads` | **`h` (handle)** | **Crear plantillas con imagen** |

> ⚠️ **Error común:** Si usas el `id` de la Media Upload como `header_handle` en una plantilla, Meta devuelve el error `131009 - Uploaded Media Handle Is Invalid`. El `header_handle` **solo** se obtiene con la Resumable Upload API.

---

## Variables de Entorno Requeridas

Configura estas variables en **Vercel → Settings → Environment Variables**:

| Variable | Descripción | Dónde encontrarla |
|----------|-------------|-------------------|
| `META_WHATSAPP_TOKEN` | Token de acceso permanente de tu app | Meta Business Suite → Configuración del Sistema → Tokens |
| `META_BUSINESS_ACCOUNT_ID` | ID de tu cuenta de WhatsApp Business | Meta Business Suite → Configuración de WhatsApp |
| `META_PHONE_NUMBER_ID` | ID del número de teléfono de WhatsApp | Meta for Developers → Tu App → WhatsApp → API Setup |
| `META_APP_ID` *(opcional)* | ID de tu Aplicación de Meta | developers.facebook.com → Tus Apps → App ID |

> 💡 `META_APP_ID` es opcional. Si no está configurada, el sistema lo detecta automáticamente usando el token. Sin embargo, configurarla acelera el proceso de subida y evita llamadas extra a Meta.

---

## Flujo Completo para Crear una Plantilla con Imagen

```
1. Usuario sube imagen en el ERP
        │
        ▼
2. POST /api/campanas/plantillas/subir-imagen
        │  (Crea sesión en /{app-id}/uploads)
        │  (Sube el binario a /{upload-session-id})
        │
        ▼
3. Meta devuelve un "handle" (campo h)
   Ejemplo: "4:abc123xyz..."
        │
        ▼
4. POST /api/campanas/plantillas/crear
        │  (Envía el handle como header_handle en el componente HEADER)
        │
        ▼
5. Meta recibe la plantilla → estado: PENDING
        │
        ▼
6. Meta revisa la plantilla (puede tardar minutos u horas)
        │
        ▼
7. Estado cambia a APPROVED o REJECTED
```

---

## Estructura del Payload para Crear la Plantilla

```json
{
  "name": "nombre_plantilla_en_minusculas",
  "category": "MARKETING",
  "language": "es_MX",
  "components": [
    {
      "type": "HEADER",
      "format": "IMAGE",
      "example": {
        "header_handle": ["4:abc123xyz..."]
      }
    },
    {
      "type": "BODY",
      "text": "Texto del mensaje con {{1}} variables",
      "example": {
        "body_text": [["valor de ejemplo"]]
      }
    },
    {
      "type": "FOOTER",
      "text": "Texto del pie de página (opcional)"
    }
  ]
}
```

---

## Cómo Obtener el META_APP_ID

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Inicia sesión con tu cuenta de Meta Business
3. Haz clic en **"Mis Apps"** en la esquina superior derecha
4. Selecciona la app que usas para WhatsApp Business
5. El **App ID** aparece en la parte superior de la página (número de 15-16 dígitos)

---

## Requisitos de la Imagen

| Parámetro | Valor |
|-----------|-------|
| Formatos permitidos | JPG, JPEG, PNG |
| Tamaño máximo | 5 MB |
| Tipo MIME | `image/jpeg` o `image/png` |

---

## Consideraciones Importantes

### Token de Acceso
- El `META_WHATSAPP_TOKEN` debe ser un **token de acceso permanente** (no de corto plazo).
- Los tokens de corto plazo expiran y causarán errores 401 en producción.
- Para generar uno permanente: Meta Business Suite → Configuración del Sistema → Tokens del sistema.

### Validez del handle
- El handle generado por la Resumable Upload API **expira después de cierto tiempo**.
- Se recomienda subir la imagen y crear la plantilla en la **misma sesión** sin demoras largas.
- Si la plantilla falla con error 131009 después de un tiempo, vuelve a subir la imagen para obtener un nuevo handle.

### Nombre de la Plantilla
- Solo puede contener **letras minúsculas, números y guiones bajos** (`_`).
- Ejemplo válido: `promocion_verano_2025`
- Ejemplo inválido: `Promoción Verano 2025`

### Estados de la Plantilla
| Estado | Descripción |
|--------|-------------|
| `PENDING` | En revisión por Meta |
| `APPROVED` | Aprobada, lista para usar en campañas |
| `REJECTED` | Rechazada (revisar política de contenido de Meta) |
| `PAUSED` | Pausada por Meta (baja calidad o reportes) |

---

## Solución de Problemas Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `131009 - Uploaded Media Handle Is Invalid` | Usando `id` de Media API en lugar del `handle` de Resumable Upload | El sistema ya usa la API correcta automáticamente |
| `Content-Type was not one of multipart/form-data` | El header `Content-Type: application/json` sobreescribía el FormData | Solucionado en `fetchAuth.js` (detecta FormData automáticamente) |
| `Faltan credenciales de Meta` | Variables de entorno no configuradas en Vercel | Agregar las 3 variables requeridas en Vercel |
| `OAuthException` al subir | Token inválido o expirado | Regenerar el token permanente en Meta Business Suite |
| `Parameter value is not valid` | Nombre de plantilla con caracteres inválidos | Usar solo minúsculas, números y guiones bajos |

---

## Archivos Clave del Sistema

| Archivo | Descripción |
|---------|-------------|
| `src/app/api/campanas/plantillas/subir-imagen/route.js` | API de subida de imagen (Resumable Upload API) |
| `src/app/api/campanas/plantillas/crear/route.js` | API de creación/envío a revisión de plantilla |
| `src/app/api/campanas/plantillas/route.js` | API de listado de plantillas desde Meta |
| `src/componentes/ConstructorPlantilla.js` | UI del constructor de plantillas en el ERP |
| `src/lib/fetchAuth.js` | Helper de fetch autenticado (detecta FormData para no romper multipart) |

---

*Última actualización: Julio 2025*
