// Texto de la tabla de cursos que recibe Alex. Lo usan el webhook y la batería de pruebas,
// para que las pruebas vean exactamente lo mismo que producción.

export function construirTablaCursos(cursosDb, hoyStr) {
  if (!cursosDb || cursosDb.length === 0) return "NO HAY CURSOS";
  return cursosDb
    .filter(c => {
      // Excluir cursos especiales vencidos
      if (c.es_especial && c.fecha_fin_vigencia && c.fecha_fin_vigencia < hoyStr) return false;
      return true;
    })
    .map((c) => {
      if (c.es_especial) {
        const vigencia = c.fecha_fin_vigencia
          ? `${c.fecha_inicio_vigencia || 'Ya disponible'} al ${c.fecha_fin_vigencia}`
          : 'Sin fecha de cierre';
        const edadRango = (c.edad_minima || c.edad_maxima)
          ? `${c.edad_minima || 0} a ${c.edad_maxima || 99} años`
          : 'Todas las edades';
        return `
🌟 CURSO ESPECIAL/TEMPORAL: ${c.nombre}
   MODO: DIRECTO — NO hagas el perfilamiento completo (no preguntes nivel, horarios, para quién es)
   Vigencia: ${vigencia}
   Para Edad: ${edadRango}
   Beneficios Condensados: ${c.beneficios || "Generales"}
   Precio Ancla: ${c.precio_ancla || (c.precio ? "$" + c.precio : "A Consultar")}
   Regalo (Gancho): ${c.regalo_gancho || "🎁 Clase Muestra"}
   Imagen Referencia: ${c.imagen_url || "null"}
            `;
      }
      return `
🎓 CURSO: ${c.nombre}
   Frase Espejo: ${c.frase_espejo || "¡Excelente elección!"}
   Beneficios Condensados: ${c.beneficios || "Generales"}
   Precio Ancla: ${c.precio_ancla || (c.precio ? "$" + c.precio : "A Consultar")}
   Regalo (Gancho): ${c.regalo_gancho || "🎁 Clase Muestra"}
   Para Edad/Nivel: ${c.nivel || "Todas"} | Edades: ${c.edad_minima || 0} - ${c.edad_maxima || 99} años
   Imagen Referencia: ${c.imagen_url || "null"}
          `;
    })
    .join("\n\n");
}
