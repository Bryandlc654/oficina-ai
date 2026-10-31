# AI Virtual Office

Oficina virtual privada donde un director general dirige a un equipo de empleados de
inteligencia artificial. Los agentes reciben tareas, las planifican, se coordinan y
entregan resultados reales.

> **Estado de implementación:** Fases 1, 2, 3 y 4 completadas. Fase 1: estructura, base de datos,
> autenticación, dashboard, empleados y tareas. Fase 2: AI Provider Manager, worker BullMQ,
> planificación del Project Manager, ejecución autónoma con dependencias, revisión, entregables,
> pausa global y por tarea, cancelación y programación. Fase 3: memoria empresarial e individual
> con CRUD, recuperación selectiva por contexto, memoria de tareas, conversaciones persistentes y
> propuestas de memoria generadas por los agentes. Fase 4: oficina 3D con estados reales,
> selección de personajes, reuniones visuales y tiempo real autenticado mediante Socket.IO.
> La fase 5 (estadísticas avanzadas e integraciones) sigue pendiente y se muestra como tal.
>
> La ejecución real con IA requiere configurar una clave de proveedor en `/ai`. Sin clave, las
> tareas se registran y el motor falla con un error explícito; nunca se inventan resultados.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript estricto
- Tailwind CSS 4
- MySQL 8 + Prisma 6
- Redis + BullMQ (worker independiente)
- OpenRouter, Gemini, Groq y Ollama como proveedores de IA
- Three.js + React Three Fiber + Drei (oficina 3D)
- Socket.IO (tiempo real autenticado)
- Zod para validación
- Autenticación propia con JWT firmado (`jose`) y contraseñas con bcrypt
- Cifrado de secretos en reposo con AES-256-GCM (`node:crypto`)

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- MySQL 8 o superior
- Redis 6.2 o superior recomendado (BullMQ funciona con 5.0 pero muestra una advertencia)
- npm 10 o superior

## Instalación

```bash
# 1. Dependencias
npm install

# 2. Configuración
cp .env.example .env
```

Genera secretos reales para `.env`:

```bash
# AUTH_SECRET
openssl rand -base64 48

# ENCRYPTION_KEY (debe ser base64 de exactamente 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Crea la base de datos (o usa una existente):

```sql
CREATE DATABASE ai_virtual_office
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Aplica el esquema y carga los datos iniciales:

```bash
# Producción / base existente: aplica migraciones versionadas
npm run db:deploy

# Desarrollo: crea una migración nueva si cambias el schema
npm run db:migrate

# Datos iniciales: administrador, 6 departamentos, 7 empleados, proveedores y memoria
npm run db:seed
```

Arranca la aplicación y el worker en **dos terminales**:

```bash
# Terminal 1 · web
npm run dev

# Terminal 2 · worker (procesa la cola de tareas)
npm run worker:dev
```

- Web: http://localhost:3000
- API de salud: http://localhost:3000/api/health (MySQL, Redis y worker)

En producción:

```bash
npm run build
npm start        # terminal 1
npm run worker   # terminal 2
```

Inicia sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` (por defecto `admin@office.local` /
`change-me-now`). **Cambia la contraseña antes de desplegar:**

1. Define un nuevo `ADMIN_PASSWORD`.
2. Pon `ADMIN_PASSWORD_RESET=true`.
3. Ejecuta `npm run db:seed`.
4. Vuelve a dejar `ADMIN_PASSWORD_RESET=false`.

No existe registro público. El administrador solo se crea mediante el seed.

## Ejecución autónoma

1. **OpenRouter está preconfigurado** si existe `OPENROUTER_API_KEY` en el entorno: el seed lo
   habilita, lo marca como predeterminado y asigna a los empleados el modelo gratuito configurado
   en `OPENROUTER_DEFAULT_MODEL` (por defecto `cohere/north-mini-code:free`). También puedes
   guardar una clave cifrada desde `/ai`; la clave del panel tiene prioridad sobre la del entorno.
2. En **Inteligencia artificial** puedes habilitar proveedores, fijar el predeterminado y editar
   la URL base. En **Empleados**, asigna proveedor principal, alternativo, modelo y límite diario.
3. Crea una tarea en **Tareas**. El motor encola el trabajo en BullMQ; el worker planifica,
   ejecuta las subtareas respetando dependencias (en paralelo cuando son independientes),
   revisa los entregables y consolida el informe final.
4. Puedes pausar la oficina completa desde la barra superior, pausar/reanudar una tarea desde su
   detalle, cancelarla o reprogramarla. Todo el consumo real queda en **Consumo**.

Las tareas **no tienen un límite fijo de tokens**: el consumo real se registra para estadísticas,
pero no bloquea la ejecución. Si un proveedor o modelo agota su cuota (por ejemplo, un 429), el
motor prueba el siguiente modelo libre y después cualquier otro proveedor habilitado. Se aplican
un máximo de iteraciones y dos intentos por subtarea para errores transitorios. Sin proveedor
configurado, la tarea falla con un mensaje explícito; no se generan resultados ficticios.

### Entregables en Markdown

Los agentes entregan en Markdown y el panel lo renderiza con títulos, listas, tablas, citas y
bloques de código; ya no se muestra el texto plano. Cada entregable se puede descargar como `.md`.

El contrato de entrega pide: título, resumen ejecutivo, secciones claras, supuestos y limitaciones,
y próximos pasos. También pide responder en español y evitar relleno. El revisor evalúa claridad,
estructura y utilidad, y no rechaza por formatos binarios que el sistema aún no genera.

Actualmente no se producen PDF, DOCX ni archivos binarios. Si una tarea los pide, el contenido se
entrega en Markdown y se declara la limitación.

### OpenRouter y modelos gratuitos

- OpenRouter usa la API compatible con OpenAI (`https://openrouter.ai/api/v1`).
- El modelo predeterminado del seed es `cohere/north-mini-code:free`; el proveedor incluye además
  `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free` y `openrouter/free` como
  alternativas. Si un modelo devuelve 429 o falla, el motor prueba el siguiente modelo libre.
- Los modelos gratuitos comparten cuotas y pueden responder 429 o quedarse sin contenido. La
  aplicación lo registra como error real, reintenta y nunca inventa la respuesta.
- `openrouter/free` enruta dinámicamente entre modelos gratuitos y puede elegir modelos de
  razonamiento que consumen tokens sin devolver contenido; por eso no es el modelo principal.
- Puedes cambiar el modelo por empleado o el modelo por defecto con `OPENROUTER_DEFAULT_MODEL`.
  Después de cambiar el entorno, vuelve a ejecutar `npm run db:seed` para asignarlo a los agentes.

## Memoria

Tres niveles, todos persistidos en MySQL:

1. **Empresarial** (`/memory`): CRUD de conocimiento por tipo (empresa, servicio, producto,
   cliente, procedimiento, documentación, objetivo), con etiquetas, activación y auditoría.
2. **Individual** (ficha de cada empleado): el director puede crear, editar y eliminar
   conocimiento del empleado. Al completar una subtarea, el agente puede proponer hasta tres
   aprendizajes en una sección `## Memoria propuesta`; el motor los persiste con su fuente y
   nunca modifican el system prompt ni los permisos.
3. **Tareas**: objetivos, subtareas, resultados, entregables, correcciones del Project Manager y
   conversaciones quedan ligados a la tarea. Se consultan en el detalle de la tarea y en
   `/memory`.

La recuperación es selectiva: el motor puntúa títulos, categorías, contenido, etiquetas e
importancia frente al objetivo del trabajo y aplica un presupuesto de caracteres. No vuelca toda
la memoria en cada llamada.

## Oficina 3D y tiempo real

- `/office` renderiza una escena ligera con Three.js y React Three Fiber: una oficina amplia con
  paredes y ventanas, zonas por departamento, escritorios, monitores, sala de reuniones, zona de
  descanso y plantas.
- Los personajes **caminan** entre su escritorio, la mesa de reuniones y la zona de descanso según
  su estado real. Los empleados sin tarea descansan; cuando varios trabajan en la misma tarea se
  reúnen en la mesa y al terminar vuelven a descansar o a su escritorio.
- El estado de cada personaje se lee de MySQL. Un personaje solo muestra animación de trabajo si
  tiene una subtarea activa real. No hay actividad simulada por temporizadores.
- Al seleccionar un personaje se muestra su estado, departamento, tarea/subtarea actual y acceso
  a su ficha completa.
- La escena se carga de forma diferida (`ssr: false`), sin sombras dinámicas ni postprocesado, y
  adapta la cámara al tamaño del canvas. En móvil prioriza una vista utilizable y deja la
  experiencia completa para escritorio.
- `server.ts` monta Next.js y Socket.IO en el mismo proceso. El socket exige la cookie de sesión:
  las conexiones sin autenticar se rechazan.
- El worker publica eventos en el canal Redis `office:events`; el servidor web los distribuye a
  la sala `office`. Así los cambios del worker llegan al navegador sin acoplar procesos.
- Eventos: tarea creada/actualizada/programada, plan creado, estado de subtarea, estado de
  agente, entregable creado, revisión del PM y pausa global.
- El cliente muestra un indicador "En vivo" y notificaciones, y refresca los datos con debounce.
  Si Socket.IO no está disponible, la interfaz sigue funcionando con navegación/recarga manual.

`npm run dev` y `npm start` usan el servidor personalizado con Socket.IO. `dev:next` y
`start:next` son alternativas sin tiempo real para diagnóstico.

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor web + Socket.IO en desarrollo (`.next-dev`) |
| `npm run dev:next` | Solo Next.js, sin Socket.IO (alternativa) |
| `npm run clean` | Elimina `.next` y `.next-dev` |
| `npm run build` | Genera Prisma Client y compila Next.js (usa `.next`) |
| `npm start` | Servidor web + Socket.IO de producción |
| `npm start:next` | Solo Next.js en producción, sin Socket.IO (alternativa) |
| `npm run worker` | Worker BullMQ independiente |
| `npm run worker:dev` | Worker con recarga automática |
| `npm run typecheck` | Verificación estricta de TypeScript |
| `npm test` | Pruebas de flujos críticos (Vitest) |
| `npm run db:deploy` | Aplica migraciones pendientes |
| `npm run db:migrate` | Crea/aplica una migración en desarrollo |
| `npm run db:seed` | Datos iniciales idempotentes |
| `npm run db:studio` | Prisma Studio |
| `npm run db:validate` | Valida el schema Prisma |

## Estructura

```text
prisma/
  schema.prisma          # 20 entidades + enums y relaciones
  migrations/            # Migración inicial versionada
  seed.ts                # Administrador, equipo, proveedores y conocimiento
src/
  app/
    (app)/               # Área privada: dashboard, empleados, tareas, proyectos, oficina 3D...
    api/                 # Route handlers validados con Zod
    login/               # Acceso privado
  ai/                    # Adaptadores Gemini/Groq/Ollama y Provider Manager
  engine/                # Planificación, ejecución, revisión y orquestación
  queue/                 # Colas BullMQ, conexión Redis y programación
  realtime/              # Publicación de eventos hacia Socket.IO
  worker/                # Proceso worker independiente
  components/            # UI, shell y proveedor de tiempo real
  lib/
    auth/                # Sesión JWT, contraseñas
    services/            # Lógica de negocio (tareas, agentes, organización, memoria)
    validation/          # Esquemas Zod compartidos
    crypto.ts            # Cifrado AES-256-GCM de claves de API
    db.ts                # Cliente Prisma singleton
  middleware.ts          # Protección de rutas y APIs
server.ts                # Servidor Node personalizado con Next.js + Socket.IO
public/icon.svg          # Icono de la aplicación
docs/
  ARCHITECTURE.md        # Arquitectura, motor multiaagente y plan por fases
```

## Seguridad

- Todas las rutas y APIs (excepto `/login`, `/api/auth/*` y `/api/health`) requieren sesión.
- Cookie `httpOnly`, `sameSite=lax` y `secure` en producción.
- Validación Zod en el servidor para todas las mutaciones.
- Límite de intentos de login en memoria (8 intentos / 15 minutos por IP).
- Las claves de API no se exponen nunca al frontend; se cifran con AES-256-GCM.
- Los prompts de sistema de los agentes solo puede modificarlos el administrador.
- Cada acción relevante se registra en `activity_logs`; cada llamada a IA en `agent_runs` y `ai_usage`.
- Pausa global de ejecuciones desde la barra superior (almacenada en `settings`).
- Pausa, reanudación y cancelación por tarea.
- No se ejecutan cargos automáticos ni acciones externas irreversibles.
- Las herramientas de integración (web, GitHub, ClickUp) están deshabilitadas hasta la fase 5 y
  el motor instruye a los agentes a no simular su uso.

En despliegues con varias instancias, sustituye el limitador en memoria por uno
respaldado por Redis.

## Pruebas

```bash
npm test
npm run typecheck
```

Las pruebas cubren transiciones de estado, validación de entrada, hashing, cifrado de
secretos, esquema del plan y de la revisión, clasificación de entregables, adaptadores de
Gemini, Groq, Ollama y OpenRouter contra un servidor HTTP local, recuperación selectiva de
memoria y extracción de propuestas de memoria. Son 52 pruebas en total.

Verificación adicional de fase 4: conexión Socket.IO rechazada sin sesión, conexión autenticada,
eventos reales `task.created` / `task.scheduled` / `task.status` desde web y worker, y render de
la escena 3D en Chrome headless con WebGL activo.

## Despliegue en Render

Render no ofrece MySQL gestionado. Usa un MySQL externo (Aiven, Railway, PlanetScale u
otro) y crea en Render:

1. **Key Value (Redis)** para BullMQ.
2. **Web Service**:
   - Build: `npm ci && npm run build`
   - Pre-deploy: `npm run db:deploy`
   - Start: `npm start` (incluye Socket.IO; Render debe permitir WebSockets)
   - Variables: todas las de `.env.example`, con `NEXT_PUBLIC_APP_URL` apuntando al dominio
     público y `AUTH_SECRET`/`ENCRYPTION_KEY` únicos.
   - Si usas varias instancias web, todas comparten Redis pub/sub; no necesitas sticky sessions
     para eventos, pero sí mantener al menos una instancia para las conexiones activas.
3. **Background Worker**:
   - Build: `npm ci && npm run build`
   - Start: `npm run worker`
   - Mismas variables que el web service, incluida `REDIS_URL`.
   - No expongas el worker a Internet; solo necesita salida hacia MySQL, Redis y los
     proveedores de IA.

Consideraciones:

- `AUTH_SECRET` debe ser idéntico entre web y worker si el worker valida sesiones.
- `ENCRYPTION_KEY` debe ser idéntico entre procesos: si cambia, las claves guardadas dejan
  de poder descifrarse.
- Ejecuta `npm run db:seed` una vez contra la base de producción (con
  `ADMIN_PASSWORD_RESET=false`).
- Usa Redis 6.2+ si el proveedor lo permite; BullMQ 6 funciona con 5.0 pero avisa y algunas
  funciones de mantenimiento pueden no estar disponibles.
- Configura las API keys desde `/ai` después del despliegue; no las guardes en variables de
  entorno ni en el repositorio. La excepción es OpenRouter: `OPENROUTER_API_KEY` se usa como
  fallback de entorno y nunca se expone al navegador.

## Documentación

- [Arquitectura y plan de implementación](docs/ARCHITECTURE.md)
- Variables de entorno documentadas en [.env.example](.env.example)

## Solución de problemas

**`Cannot find module './XXXX.js'` al arrancar.** Ocurre cuando `next dev` y
`next start` comparten el mismo directorio `.next` y uno sobrescribe los chunks del otro.
El proyecto ya usa directorios separados (`.next` para producción y `.next-dev` para
desarrollo), pero si el error aparece tras una compilación interrumpida:

```bash
npm run clean
npm run build
npm start
```

No ejecutes `npm start` sobre un build de desarrollo: `npm start` requiere un
`npm run build` previo. Para desarrollo usa `npm run dev`.

**Error de conexión a MySQL.** Comprueba `DATABASE_URL`, que la base existe y que el
usuario remoto tiene permisos desde tu IP. La URL debe tener la contraseña codificada
(los caracteres `#`, `$`, `@`, `|` deben ir como `%23`, `%24`, `%40`, `%7C`).

**Las tablas no existen o faltan datos.** Ejecuta `npm run db:deploy` y después
`npm run db:seed`.

**El login siempre redirige a `/login`.** Verifica que `AUTH_SECRET` esté definido y que
no haya cambiado entre reinicios; al modificarlo se invalidan las sesiones existentes.

**Las tareas quedan en `PENDING` o `SCHEDULED`.** Comprueba que `/api/health` muestre
`worker: "up"`. Por defecto el servidor web arranca su propio worker (`EMBEDDED_WORKER=true`),
así que no hace falta un servicio aparte. Si tienes un worker dedicado (`npm run worker`), puedes
poner `EMBEDDED_WORKER=false` en la web; tenerlos ambos también es seguro.

**La tarea falla con "No hay proveedor de IA disponible".** Configura una clave en `/ai`,
habilita el proveedor y asígnalo al empleado (o marca uno como predeterminado). Revisa también
el límite diario de tokens del empleado, si lo has configurado.

**OpenRouter devuelve 429 o una respuesta vacía.** Los modelos gratuitos comparten cuota. Cambia
el modelo del empleado por otro de la lista, deja que el motor pruebe los modelos alternativos o
vuelve a intentarlo más tarde. Una respuesta vacía de un modelo de razonamiento se registra como
error; no se presenta como entregable.

**"Presupuesto insuficiente" en una tarea.** Ya no existe un límite fijo de tokens por tarea.
Si ves un error de cuota, procede del proveedor (429) o de un límite diario configurado en el
empleado; el motor intenta modelos y proveedores alternativos antes de fallar.

**Error de Redis / cola no disponible.** Verifica `REDIS_URL` y que Redis acepte conexiones.
Si Redis cae, la tarea se guarda igualmente y el fallo de programación queda visible en el
detalle de la tarea; vuelve a guardar la fecha para reintentar la programación.

**Una tarea pausada no se reanuda.** Pulsa "Reanudar tarea" en su detalle. Si el worker se
reinició mientras estaba pausada, la reanudación vuelve a encolarla.

**La memoria no parece influir en los resultados.** Comprueba que la entrada esté activa, que
tenga términos en común con el objetivo de la tarea y que el empleado asignado tenga memoria
individual. La recuperación es selectiva y con presupuesto: no se envía toda la base de
conocimiento.

**El indicador de tiempo real dice "Sin conexión".** Arranca con `npm run dev` o `npm start`
(servidor personalizado con Socket.IO), no con `dev:next`/`start:next`. Comprueba que el proxy o
hosting permita WebSockets y que la cookie de sesión llegue al handshake. Redis debe estar
disponible para recibir eventos del worker; sin Redis la web funciona, pero no hay eventos.

**La oficina 3D aparece vacía o en negro.** Verifica que el navegador tenga WebGL habilitado y
que no estés bloqueando el chunk diferido. La escena no usa datos ficticios: si no hay empleados
en MySQL, no hay personajes que mostrar.
