# 📋 AUDITORÍA COMPLETA - JUAN TRANING APP

## 1. RESUMEN EJECUTIVO

### 1.1 ¿Qué es la aplicación?

**Juan Traning** (también llamada "Cuti Traning") es una **Aplicación Web de Seguimiento de Entrenamientos** (Fitness/Gym Tracker) diseñada para funcionar **100% offline** en el navegador del usuario. Permite crear rutinas de gimnasio, registrar entrenamientos, monitorear progreso y establecer objetivos personales.

### 1.2 Meta de la Aplicación

La aplicación busca ser una herramienta **todo-en-uno** para el gimnasio que:

- Permita planificar y seguir rutinas de entrenamiento semanales
- Registre el progreso (peso, reps, volumen) de cada sesión
- Calcule automáticamente **Récords Personales (PRs)** y **1RM** estimado
- Muestre estadísticas de actividad muscular y consistencia
- Permita hacer seguimiento del peso corporal y metas
- Funcione sin conexión a internet (ideal para gyms con mala señal)

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Stack Tecnológico

| Tecnología       | Uso                             |
| ---------------- | ------------------------------- |
| **Next.js 14+**  | Framework React con App Router  |
| **TypeScript**   | Lenguaje tipado                 |
| **Dexie.js**     | Base de datos local (IndexedDB) |
| **Tailwind CSS** | Estilos CSS                     |
| **shadcn/ui**    | Componentes UI (Radix UI)       |
| **lucide-react** | Iconos                          |
| **date-fns**     | Manipulación de fechas          |
| **recharts**     | Gráficos estadísticos           |
| **next-themes**  | Tema claro/oscuro               |

### 2.2 Estructura del Proyecto

```
├── app/                          # Páginas Next.js (App Router)
│   ├── page.tsx                  # Dashboard (/)
│   ├── history/                  # Historial de entrenamientos
│   ├── routines/                 # Gestión de rutinas
│   ├── settings/                 # Configuración
│   ├── workout/[id]/             # Modo entrenamiento activo
│   ├── body-weight/              # Seguimiento de peso corporal
│   ├── personal-records/         # Récords personales
│   └── stats/                    # Estadísticas
│
├── components/                   # Componentes React
│   ├── dashboard/                # Dashboard principal
│   ├── workout/                  # Modo entrenamiento
│   ├── routines/                 # Crear/editar rutinas
│   ├── history/                  # Ver historial
│   ├── settings/                 # Configuración
│   ├── body-weight/              # Peso corporal
│   ├── personal-records/         # PRs
│   └── ui/                       # Componentes shadcn/ui
│
├── lib/                          # Lógica de negocio
│   ├── db.ts                     # Base de datos Dexie + funciones helpers
│   ├── base-routines.ts          # Rutinas precargadas por defecto
│   └── utils.ts                  # Utilidades
│
├── hooks/                        # Custom React hooks
├── public/                       # Archivos estáticos
│   ├── manifest.json             # Manifiesto PWA
│   └── icon-*.svg/png            # Iconos
```

### 2.3 Modelo de Datos (Base de Datos Local)

La aplicación usa **Dexie.js** (IndexedDB) con las siguientes tablas:

#### Tablas Principales:

| Tabla             | Descripción                                     |
| ----------------- | ----------------------------------------------- |
| `routines`        | Rutinas creadas por el usuario                  |
| `workoutLogs`     | Historial de entrenamientos completados         |
| `personalRecords` | Récords personales (peso, reps, 1RM)            |
| `userSettings`    | Configuración global (tema, descanso, unidades) |
| `bodyWeight`      | Registro de peso corporal                       |
| `weightGoals`     | Metas de peso                                   |
| `goals`           | Objetivos (frecuencia, peso, bodyweight)        |

---

## 3. FUNCIONALIDADES DETALLADAS

### 3.1 Dashboard (Inicio)

**Ubicación:** `/` - `components/dashboard/dashboard-content.tsx`

**Características:**

- ✅ Muestra la **rutina del día** basada en el día de la semana
- ✅ **Tiempo semanal**: Minutos entrenados en la semana actual
- ✅ **Consistencia**: Porcentaje de días entrenados vs días asignados
- ✅ **Peso corporal** actual con tendencia (↑/↓ kg)
- ✅ **Meta de peso**: Progreso hacia el objetivo de peso
- ✅ **Actividad muscular**: Gráfico de músculos trabajados en 7 días
- ✅ **Records Personales recientes**: Top 5 ejercicios con más peso

**Datos que calcula:**

- `weeklyVolume` = suma de totalVolume de la semana
- `weeklyDuration` = suma de duration de la semana
- `consistency` = (entrenamientos semana / días con rutina) \* 100

---

### 3.2 Creación de Rutinas

**Ubicación:** `/routines` - `components/routines/routines-content.tsx`

**Características:**

- ✅ Crear nuevas rutinas con nombre y día asignado
- ✅ Agregar ejercicios con:
  - Nombre del ejercicio
  - Grupo muscular (Pecho, Espalda, Piernas, etc.)
  - Número de series
  - Repeticiones (soporta rangos como "8-12")
  - Peso objetivo
  - Unidad (kg, lbs)
  - Descanso entre series (segundos)
- ✅ **Soporte para Súper Series**: Agrupa ejercicios consecutivos
- ✅ Editar ejercicios existentes
- ✅ Reordenar ejercicios (con move up/down)
- ✅ Eliminar ejercicios
- ✅ Guardar como peso base

---

### 3.3 Modo Entrenamiento ( workout-mode.tsx )

**Ubicación:** `/workout/[id]`

**Esta es la función más importante de la app.** Flujo completo:

#### Fase 1: Pre-Entrenamiento

- Muestra lista de ejercicios de la rutina
- Indica ejercicios que forman Súper Serie (etiqueta "SS")
- Botón grande para comenzar

#### Fase 2: Entrenamiento Activo

- **Timer**: Cronómetro de tiempo total
- **Navegación**: Flechas para mover entre ejercicios
- **Series**: Vista de cada set con:
  - Número de serie
  - Input de peso (carga último peso usado)
  - Input de reps
  - Botón "OK" para completar
- **Progreso**: Barra de progreso general
- **RPE**: (Opcional) Nivel de esfuerzo percibido

#### Fase 3: Funciones Especiales

- **Sustituir ejercicio**: Cambiar ejercicio "al vuelo" sin perder la rutina
- **Guardar peso base**: Actualizar peso objetivo para futuras sesiones
- **Cronómetro de descanso**: Pastilla flotante no bloqueante
- **Calculadora de discos**: Modal para calcular platos (25, 20, 15, 10, 5, 2.5 kg)
- **Notificaciones de PR**: Alerta cuando se establece nuevo récord

#### Fase 4: Finalización

- Pantalla de resumen con:
  - Duración total
  - Series completadas
  - Ejercicios realizados
- Guardado automático en historial

---

### 3.4 Historial

**Ubicación:** `/history` - `components/history/history-content.tsx`

**Características:**

- ✅ **Vista Calendario**:
  - Días del mes con puntos indicating entrenados
  - Navegación entre meses
  - Estadísticas del mes (entrenamientos, tiempo total)
- ✅ **Vista por Ejercicio**:
  - Selector de ejercicio
  - Gráfico de línea con progreso (peso y 1RM estimado)
- ✅ **Detalle de sesión**: Sheet con ejercicios realizados en cada día

---

### 3.5 Récords Personales

**Ubicación:** `/personal-records`

**Características:**

- ✅ Lista todos los PRs
- ✅ Tipos de PR:
  - **Peso máximo**: Mayor peso en una repetición
  - **Reps**: Mayor número de repeticiones
  - **1RM**: Estimación de repetición máxima calculada
- ✅Historial de cuando se logró cada PR
- ✅ Filtro por ejercicio

---

### 3.6 Peso Corporal

**Ubicación:** `/body-weight` - `components/body-weight/body-weight-content.tsx`

**Características:**

- ✅ Registrar peso con fecha
- ✅ Gráfico de tendencia de peso
- ✅ Meta de peso:
  - Definir peso objetivo
  - Seguimiento de progreso
  - Indicador faltante/logrado

---

### 3.7 Configuración

**Ubicación:** `/settings` - `components/settings/settings-content.tsx`

**Características:**

- ✅ **Tema**: Claro / Oscuro / Sistema
- ✅ **Tiempo de descanso por defecto**: Segundos
- ✅ **Unidad por defecto**: kg / lbs
- ✅ **Peso corporal**: Registro rápido
- ✅ **Datos**:
  - Exportar a JSON (backup)
  - Importar desde JSON (restaurar)
  - Eliminar todos los datos
- ✅ **Instalación PWA**: Instrucciones para instalar como app

---

## 4. ALGORITMOS Y CÁLCULOS IMPORTANTES

### 4.1 Cálculo de 1RM (Una Repetición Máxima)

La app implementa **6 fórmulas científicas** para mayor precisión:

```
typescript
// Fórmulas implementadas:
- Epley (1985): weight * (1 + reps / 30)
- Brzycki (1996): weight * (36 / (37 - reps))
- Lombardi (2010): weight * Math.pow(reps, 0.1)
- Mayhew (2005): (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps))
- O'Conner (1985): weight * (1 + reps / 40)
- Wathan (2002): (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * reps))

// Promedio = suma de todas / 6
// Fiabilidad = alta (<5 reps), media (6-12 reps), baja (>12 reps)
```

**Coeficientes por grupo muscular:**

- Piernas: 1.05
- Espalda: 1.02
- Pecho: 1.0
- Hombros: 0.98
- Brazos: 0.95
- Core: 0.92

### 4.2 Detección de PRs Automática

Cada vez que se completa una serie:

1. Compara peso máximo vs PR anterior
2. Compara reps máximas vs PR anterior
3. Calcula 1RM estimado y compara vs PR de 1RM
4. Si es mayor, actualiza automáticamente

---

## 5. RUTINAS PRECARGADAS

La app incluye 4 rutinas por defecto (`lib/base-routines.ts`):

### Lunes - Torso Completo

- Jalón unilateral neutro (Espalda)
- Press banca mancuernas (Pecho)
- Súper Serie: Remo + Press inclinado
- Elevación lateral + Extensión tríceps
- Curl inclinado + Encogimiento
- Curl araña + Extensión tríceps máquina

### Martes - Pierna + Core

- Aductor máquina
- Hack squat + Prensa
- Súper Serie: Curl femoral + Extensión
- Abducción + Gemelo
- Russian Twist + Crunch polea

### Jueves - Torso Variación

- Press militar máquina
- Súper Serie: Curl predicador + Extensión tríceps
- Remo T-bar + Face pull
- Press pecho máquina
- Jalón neutro + Aperturas

### Viernes - Pierna + Posterior

- Sentadilla libre
- Peso muerto rumano
- Bulgara
- Súper Serie: Curl femoral + Extensión cuádriceps
- Abducción + Gemelo
- Farmer walk

---

## 6. EXPERIENCIA DE USUARIO (UX)

### 6.1 PWA (Progressive Web App)

- ✅ Manifiesto configurado (`manifest.json`)
- ✅ Iconos para diferentes tamaños
- ✅ Instalable en móvil y escritorio

### 6.2 Tema Oscuro/Claro

- ✅ Soporte completo para ambos temas
- ✅ Tema del sistema por defecto

### 6.3 Diseño Mobile-First

- ✅ Optimizado para uso en celular durante el entrenamiento
- ✅ Botones grandes y accesibles
- ✅ Input de peso fácil de usar con teclado numérico
- ✅ Cronómetro flotante no bloqueante

### 6.4 Navegación

- ✅ Bottom Navigation Bar con 4 secciones:
  - Dashboard
  - Rutinas
  - Historial
  - Ajustes

---

## 7. ESTADO ACTUAL DE LA AUDITORÍA

### ✅ FASE 1 - LIMPIEZA (COMPLETADO)

| Tarea                       | Estado        |
| --------------------------- | ------------- |
| Eliminación de IPP y Fatiga | ✅ Completado |
| Remoción de Goals manual    | ✅ Completado |
| Simplificación de RPE       | ✅ Completado |

### ✅ FASE 2 - UX PREMIUM (COMPLETADO)

| Tarea                      | Estado          |
| -------------------------- | --------------- |
| Cronómetro flotante        | ✅ Implementado |
| Sustitución de ejercicios  | ✅ Implementado |
| Mapa de actividad muscular | ✅ Implementado |

### ✅ FASE 3 - ONBOARDING (COMPLETADO)

| Tarea                  | Estado                      |
| ---------------------- | --------------------------- |
| Exportar/Importar JSON | ✅ Implementado             |
| Plantillas precargadas | ✅ Implementado (4 rutinas) |

### ✅ FASE 4 - FUNCIONES AVANZADAS (IMPLEMENTADO)

| Tarea                 | Estado          |
| --------------------- | --------------- |
| Soporte Súper Series  | ✅ Implementado |
| Calculadora de Discos | ✅ Implementado |

---

## 8. MEJORAS RECOMENDADAS

### 8.1 Mejoras de Alto Impacto

1. **Sincronización en la Nube**
   - Implementar backend (Firebase/Supabase)
   - Sincronización automática entre dispositivos

2. **Compartir Rutinas**
   - Exportar rutinas como JSON
   - Importar rutinas de la comunidad

3. **Seguimiento de Progresión**
   - Programa de periodización automática
   - Sugerencias de aumento de peso

4. **Notas por Ejercicio**
   - Agregar notas a cada serie
   - Registrar sensaciones/fatiga

### 8.2 Mejoras de UX

1. **Sonidos**
   - Sonido al completar serie
   - Alarma de descanso

2. **Widget de Actividad Reciente**
   - Mostrar últimos 3 entrenamientos en dashboard

3. **Tutorial Onboarding**
   - Explicar funciones al primer uso

---

## 9. CONCLUSIONES

### Fortalezas de la App:

- ✅ **100% Offline**: Funciona sin internet
- ✅ **Cálculos científicos**: 1RM con múltiples fórmulas
- ✅ **Súper Series**: Soporte nativo
- ✅ **UX limpia**: Diseñada para uso en gimnasio
- ✅ **Datos locales**: Privacidad del usuario
- ✅ **PWA**: Instalable como app nativa

### Áreas de Mejora:

- ⚠️ Sin sincronización en la nube
- ⚠️ Sin autenticación de usuario
- ⚠️ Sin respaldo automático

---

## 10. INFORMACIÓN TÉCNICA ADICIONAL

### Dependencias principales:

```
json
{
  "dexie": "^4.x",
  "dexie-react-hooks": "^4.x",
  "recharts": "^2.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "next-themes": "^0.x"
}
```

### Configuración PWA:

- Nombre: Juan Traning
- Tema: #1a1a2e (dark)
- Iconos: 192x192, 512x512

### Base de Datos:

- Nombre: GymTrackerDB
- Versión: 2
- Almacenamiento: IndexedDB (navegador)

---

_Documento generado el 2024_
_Auditoría completa de la aplicación Juan Traning_
