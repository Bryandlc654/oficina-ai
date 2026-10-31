# Arquitectura y plan de implementación

## 1. Principios

1. **Trabajo real, no simulación.** Todo estado visible en la UI procede de MySQL. No se
   generan resultados, tokens ni ejecuciones ficticias.
2. **El motor controla; los agentes deciden.** El orquestador impone límites, permisos,
   dependencias y presupuesto. Los agentes deciden cómo resolver su subtarea.
3. **Un solo repositorio y un solo lenguaje.** Next.js para web/API, TypeScript para todo y
   un worker Node independiente que reutiliza los mismos módulos.
4. **Seguridad por defecto.** Acceso privado, validación en servidor, secretos cifrados,
   permisos por herramienta y aprobación humana para acciones irreversibles.
5. **Proveedores intercambiables.** Ningún agente conoce detalles de OpenRouter, Gemini, Groq u Ollama. Si un proveedor agota su cuota, se prueba el siguiente modelo o proveedor habilitado.

## 2. Topología de ejecución

```text
Navegador
   │  HTTP + Socket.IO
   ▼
Web (Next.js: RSC + API routes + socket gateway)
   │                         │
   │ Prisma                  │ publica eventos
   ▼                         ▼
MySQL 8  ◄──────────────  Redis
   ▲                         ▲
   │ Prisma                  │ BullMQ + pub/sub
   └──────────── Worker (Node) ────────┘
                  │
                  ├─ Orquestador
                  ├─ AI Provider Manager
                  └─ Herramientas
```

- **Web**: interfaz, autenticación, APIs de administración y lectura de estado.
- **Worker**: proceso independiente (`npm run worker`) que consume colas BullMQ. Nunca se
  importa desde el servidor web.
- **Redis**: colas, bloqueos de idempotencia, pub/sub para tiempo real y rate limiting
  distribuido.
- **MySQL**: fuente de verdad de tareas, ejecuciones, entregables, memoria y consumo.

## 3. Capas del código

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Presentación | `src/app`, `src/components` | RSC, formularios, dashboard, oficina 3D |
| API | `src/app/api` | Autenticación, validación Zod, autorización |
| Dominio | `src/lib/services` | Reglas de negocio y transacciones |
| Persistencia | `prisma/schema.prisma`, `src/lib/db.ts` | Modelo relacional e índices |
| Motor | `src/engine` | Planificación, DAG, ejecución, revisión |
| IA | `src/ai` | Adaptadores de proveedor, routing, cuotas |
| Worker | `src/worker` | Procesos BullMQ y arranque |
| Tiempo real | `src/realtime` (fase 4) | Eventos de ejecución y gateway |
| Integraciones | `src/integrations` (fase 5) | Adaptadores con estado de configuración |

## 4. Modelo de datos

Entidades principales (ya implementadas en la migración inicial):

- **Organización**: `User`, `Department`, `Agent`, `AgentTool`, `Project`.
- **Trabajo**: `Task`, `Subtask`, `TaskDependency`, `TaskAssignment`.
- **Ejecución**: `AgentRun`, `AgentMessage`, `Deliverable`, `ScheduledJob`.
- **Conocimiento**: `CompanyKnowledge`, `AgentMemory`.
- **IA**: `AIProvider`, `AIUsage`.
- **Observabilidad**: `ActivityLog`, `Setting`.

Decisiones relevantes:

- `TaskDependency` es una arista entre subtareas (`subtaskId → dependsOnId`) con índice
  único, lo que impide duplicar dependencias.
- `Subtask` tiene `order` único por tarea y `assignedAgentId` opcional (la asignación puede
  llegar con el plan).
- `AgentRun` guarda prompt, salida, tokens, latencia, intento e iteración para auditoría.
- `AIUsage` se agrega por empleado/proveedor y permite límites diarios sin recorrer runs.
- `AIProvider.apiKeyCipher` guarda el secreto cifrado con AES-256-GCM; nunca se serializa al
  cliente.
- `ActivityLog` es polimórfico por diseño (`actorType`, `entityType`, `entityId`).
- `ScheduledJob.jobId` es único para garantizar idempotencia frente a reintentos de BullMQ.

## 5. Motor multiaagente (fase 2)

### 5.1 Ciclo de vida de una tarea

```text
SCHEDULED → PENDING → PLANNING → RUNNING → REVIEW → COMPLETED
                 │         │          │        │
                 └─────────┴──────────┴────────┴──→ FAILED / CANCELLED
```

1. **Encolado.** Al crear o programar una tarea, el servicio de dominio escribe la tarea y
   registra un `ScheduledJob`. Si la fecha es futura, se usa un job retrasado de BullMQ; si
   no, se encola inmediatamente. La clave de idempotencia es `taskId + planVersion`.
2. **Planificación.** El worker carga la tarea, la memoria empresarial relevante, el
   historial y el catálogo real de agentes. El Project Manager devuelve un JSON validado con
   Zod (`subtasks[]`, dependencias por `order`, agente responsable, entregable esperado).
3. **Persistencia del plan.** En una transacción: se validan agentes y ciclos, se crean
   subtareas y dependencias, se registra `AgentRun` del PM como `SUCCEEDED` y se emite el
   evento `task.plan.created`.
4. **Programación del DAG.** El orquestador calcula el conjunto de subtareas listas (todas
   sus dependencias `COMPLETED`) y encola hasta `WORKER_CONCURRENCY` trabajos en paralelo.
   Cada job lleva `subtaskId`, `attempt` e `idempotencyKey`.
5. **Ejecución de agente.** El worker construye el contexto (system prompt, objetivo de la
   tarea, subtarea, resultados de dependencias, memoria seleccionada, herramientas permitidas),
   llama al AI Provider Manager y guarda `AgentRun` + `Deliverable`. El ejecutor impone un
   contrato de entrega en Markdown: título, resumen ejecutivo, secciones con títulos
   descriptivos, tablas cuando aporten, supuestos/limitaciones y próximos pasos. La interfaz
   renderiza ese Markdown; el contenido no se muestra como texto plano.
6. **Avance.** Al completarse una subtarea se recalculan las listas; si el grafo se bloquea
   (sin listas y sin ejecuciones activas) la tarea pasa a `REVIEW` o `FAILED`.
7. **Revisión.** El PM recibe todos los entregables y emite aprobación o correcciones.
   Máximo **2 rondas** de corrección por subtarea. Las correcciones crean una nueva
   `AgentRun` con `iteration + 1`; no se reabre el DAG indefinidamente.
8. **Informe final.** El PM consolida `Task.finalReport` y la tarea pasa a `COMPLETED`.
   Se emite `task.completed` y se actualizan los estados de los agentes.

### 5.2 Control de ciclos y duplicados

- Validación de ciclos con DFS/Kahn antes de persistir el plan.
- Límite duro de subtareas por tarea (8) y de profundidad de dependencias.
- `maxIterations` por agente y por subtarea; al agotarse, `FAILED` con motivo.
- Clave de idempotencia en Redis (`lock:subtask:{id}`) con TTL; BullMQ `jobId`
  determinista. Un job repetido no produce una segunda ejecución.
- Prohibido que un agente cree tareas o subtareas directamente: solo el PM propone el plan
  y el motor lo persiste.
- Las tareas **no tienen un límite fijo de tokens**. `Task.tokensUsed` registra el consumo real
  para estadísticas, pero no bloquea la ejecución. Si un proveedor o modelo agota su cuota, se
  prueba el siguiente modelo libre y luego cualquier otro proveedor habilitado.

### 5.3 Reintentos y errores

- Reintentos con backoff exponencial (máx. 3) solo para errores transitorios: timeout,
  HTTP 429/5xx y cuota temporal.
- Errores deterministas (validación, permisos, modelo inexistente) no se reintentan.
- Fallback de proveedor/modelo por agente antes de marcar la subtarea como fallida.
- Cada intento queda en `AgentRun` con `attempt`, `status` y `error`.

### 5.4 Pausa, reanudación y cancelación

- **Pausa global** (`settings["office.paused"]`): el worker comprueba la bandera antes de
  iniciar cada job y usa `queue.pause()`/`resume()` para las colas.
- **Pausa por tarea**: estado `PAUSED` lógico en `ScheduledJob`/cola; los jobs ya en vuelo
  terminan y no se encolan nuevos.
- **Cancelación**: transición a `CANCELLED`, eliminación de jobs pendientes y marcado de
  subtareas activas. Un `AbortController` corta la llamada HTTP en curso cuando el
  proveedor lo permite.
- Los jobs cancelados no vuelven a ejecutarse aunque Redis los reintente (comprobación de
  estado en la base de datos al inicio del handler).

### 5.5 Registro y trazabilidad

Todo cambio de estado emite: fila en `ActivityLog`, fila en `AgentRun` cuando hay llamada
al modelo y un evento de tiempo real. La UI nunca infiere actividad: la lee.

## 6. AI Provider Manager (fase 2)

Interfaz común:

```ts
type ChatRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
};

type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  raw?: unknown;
};
```

- **Adaptadores**: OpenRouter y Groq (API compatible OpenAI), Gemini (REST) y Ollama (local).
- **Selección**: proveedor/modelo del agente → fallback del agente → proveedor por defecto
  habilitado. Para OpenRouter se prueban además sus modelos libres alternativos antes de fallar.
  Nunca se usa un proveedor sin clave (excepto Ollama local).
- **Claves**: OpenRouter puede usar `OPENROUTER_API_KEY` del entorno cuando no hay clave cifrada
  en el panel. La clave guardada en MySQL tiene prioridad y el valor del entorno nunca se expone
  al navegador. `openrouter/free` se usa solo como último recurso porque puede enrutar a modelos
  de razonamiento que agotan el presupuesto sin devolver contenido.
- **Cuotas**: límite diario por agente y por proveedor; la comprobación usa `AIUsage`
  agregado y un contador Redis con TTL hasta medianoche.
- **Errores**: normalización de 401/403 (configuración), 429 (cuota), 5xx (transitorio) y
  timeout. El error original se conserva en `AgentRun.error`.
- **Consumo**: se registra entrada, salida, total, modelo, proveedor y latencia por
  ejecución. No se estiman costes de APIs gratuitas como si fueran de pago.
- **Claves**: se guardan cifradas desde el panel; el frontend solo recibe `hasKey` y una
  máscara. Las claves nunca se escriben en logs.

## 7. Memoria (fase 3)

| Nivel | Almacenamiento | Recuperación |
| --- | --- | --- |
| Empresa | `CompanyKnowledge` | Siempre activa: identidad, servicios, procedimientos y objetivos; selección por `kind`, `category`, tags y presupuesto de contexto |
| Individual | `AgentMemory` | Por agente, ordenada por importancia y recencia; límite de entradas por ejecución |
| Tarea | `AgentMessage`, `Subtask.result`, `Deliverable` | Solo del contexto de la tarea actual; los resultados de dependencias se incluyen siempre |

Reglas:

- Recuperación selectiva con presupuesto de caracteres/tokens, no volcado completo. La
  implementación puntúa coincidencias léxicas normalizadas (sin acentos ni palabras vacías),
  importancia y prioridad del tipo de conocimiento, y recorta al presupuesto configurado.
- Los agentes solo pueden **proponer** nuevas memorias mediante la sección `## Memoria
  propuesta`; el motor las persiste con origen y agente. No pueden editar su system prompt ni
  sus permisos.
- La memoria empresarial es editable solo por el administrador.
- Toda memoria tiene `source` y fecha para auditar su procedencia.

## 8. Tiempo real (fase 4)

- Socket.IO está montado en `server.ts`, un servidor Node personalizado que sirve Next.js y el
  socket en el mismo proceso y puerto. No hay microservicio adicional.
- El handshake exige la cookie `avo_session`; `verifySessionToken` valida el JWT y las
  conexiones sin sesión se rechazan con `unauthorized`.
- El worker y la web publican en el canal Redis `office:events`. El servidor web se suscribe y
  distribuye a la sala `office`; esto desacopla ambos procesos y permite varias instancias web.
- Eventos implementados: `task.created`, `task.updated`, `task.scheduled`,
  `task.schedule.failed`, `task.plan.created`, `task.reviewed`, `task.status`,
  `subtask.status`, `agent.status`, `deliverable.created` y `office.paused`.
- El cliente `RealtimeProvider` muestra el estado "En vivo", notificaciones y ejecuta
  `router.refresh()` con debounce para reconciliar con MySQL. El estado de los personajes 3D se
  actualiza con esas mismas props.
- Si Socket.IO o Redis no están disponibles, la UI sigue operativa con navegación/recarga manual;
  el indicador pasa a "Sin conexión". No se simulan actualizaciones.

## 9. Oficina 3D (fase 4)

- Three.js + React Three Fiber + Drei, cargada con `dynamic(..., { ssr: false })`.
- Presupuesto: una escena, geometría de baja poligonía, materiales estándar, sin sombras
  dinámicas ni postprocesado. DPR limitado a 1.5 y cámara adaptativa según el aspecto del canvas.
- Oficina amplia con paredes perimetrales, ventanas, zonas por departamento, escritorios,
  monitores, sala de reuniones, zona de descanso y plantas.
- Los personajes caminan con animación de piernas/brazos entre su escritorio, la mesa de
  reuniones y la zona de descanso. Los disponibles descansan; los que comparten tarea se reúnen.
- La animación de trabajo y el monitor encendido solo se activan si `Agent.status === WORKING`.
  Los disponibles tienen movimiento idle mínimo; los desconectados se atenúan.
- Si dos o más agentes `WORKING` comparten la misma tarea, caminan hasta la mesa de reuniones y la
  mesa se ilumina. No hay reuniones aleatorias.
- Selección de personaje/escritorio → ficha con estado, departamento, tarea y subtarea actual,
  enlace a la tarea y a la ficha completa del empleado.
- Responsive: la cámara se aleja en pantallas estrechas; la escena sigue siendo 3D. En móvil se
  prioriza una vista utilizable, no una experiencia pesada.

## 10. Plan por fases

### Fase 1 — Fundación (completada)

- [x] Proyecto Next.js + TypeScript estricto + Tailwind 4
- [x] Schema Prisma completo (20 entidades) y migración inicial
- [x] Seed idempotente: admin, 6 departamentos, 7 agentes, herramientas, proveedores,
      conocimiento empresarial y settings
- [x] Autenticación privada (JWT httpOnly, bcrypt, rate limit, middleware)
- [x] Shell del dashboard, resumen con datos reales, empleados y edición de system
      prompt/modelo/herramientas
- [x] Tareas: creación, prioridad, programación, asignación, Kanban, lista y calendario
- [x] Detalle de tarea, subtareas, entregables descargables, ejecuciones
- [x] Departamentos y proyectos con creación real
- [x] Actividad, memoria (lectura), proveedores (estado), consumo, configuración y pausa
- [x] Pruebas de transiciones, validación, contraseñas y cifrado
- [x] README, `.env.example` y documentación de arquitectura

**Criterio de aceptación:** `npm run typecheck`, `npm test` y `npm run build` pasan; login,
CRUD de tareas/empleados y pausa persisten en MySQL con auditoría.

### Fase 2 — IA y ejecución autónoma (completada)

- [x] AI Provider Manager con adaptadores OpenRouter, Gemini, Groq y Ollama; routing principal →
      alternativo → predeterminado; reintentos de errores transitorios; claves cifradas y
      fallback de OpenRouter desde `OPENROUTER_API_KEY`.
- [x] Panel `/ai` para guardar claves, habilitar proveedores, fijar el predeterminado y editar
      la URL base. La API solo devuelve `hasKey`, nunca el secreto.
- [x] Asignación por empleado de proveedor, fallback, modelo, límite diario e iteraciones.
- [x] Worker BullMQ independiente y cola `task-execution`, con heartbeat visible en
      `/api/health`, apagado ordenado y reintento por pausa global.
- [x] Project Manager: plan JSON validado (2-8 subtareas), dependencias por orden, validación
      de agentes, persistencia transaccional y `AgentRun` de planificación.
- [x] Orquestador con ejecución en paralelo de subtareas independientes, reintentos acotados,
      límite de ciclos, fallback de modelos/proveedores al agotar cuota y control de iteraciones.
- [x] Revisión del Project Manager con máximo dos rondas, correcciones persistentes y
      consolidación del informe final.
- [x] Entregables por subtarea e informe final, descargables desde la tarea.
- [x] Pausa/reanudación global y por tarea, cancelación y reprogramación.
- [x] Pruebas de adaptadores HTTP, esquema de plan/revisión, clasificación de entregables y
      validación. Verificación runtime con MySQL remoto, Redis local y worker real.

**Verificación realizada:** 52 pruebas pasan, `tsc` y `next build` pasan. Con MySQL y Redis
reales, una tarea con OpenRouter se planificó, ejecutó dos subtareas con el modelo gratuito,
generó cinco entregables y pasó por dos rondas de revisión con consumo real registrado. También
se verificó el fallo explícito sin proveedor configurado, el cifrado de claves y la pausa global.
Los modelos gratuitos pueden devolver 429; el motor prueba los modelos libres alternativos antes
de marcar la subtarea como fallida.

**Pendiente de la fase 2 original:** los eventos de tiempo real se trasladan a la fase 4 junto
con la oficina 3D, para no añadir un gateway Socket.IO sin la escena que lo consume. La UI
refleja el estado real al recargar y en cada navegación.

### Fase 3 — Memoria y colaboración (completada)

- [x] CRUD de memoria empresarial con tipos, categorías, etiquetas, activación y auditoría.
- [x] CRUD de memoria individual por empleado, incluyendo entradas creadas por el director y
      propuestas por el agente.
- [x] Extracción determinista de la sección `## Memoria propuesta`; el entregable se guarda sin
      esa sección y las propuestas se persisten con `source = subtask:<id>`.
- [x] Recuperación selectiva por relevancia léxica (título, categoría, contenido, etiquetas),
      importancia y presupuesto de caracteres, usada por planificador y ejecutor.
- [x] Memoria de tareas visible en el detalle: objetivos, subtareas, resultados, entregables,
      correcciones y respuestas de revisión.
- [x] UI de memoria en `/memory` y en la ficha de cada empleado.
- [x] Los agentes no pueden editar su system prompt ni sus permisos; la memoria es datos, no
      instrucciones.

**Verificación:** 52 pruebas, typecheck y build correctos. CRUD de conocimiento y memoria
probado por API contra MySQL; el aislamiento de secretos y los permisos de administrador se
mantienen. La recuperación selectiva se prueba unitariamente y se ejecutó con IA real mediante
OpenRouter.

### Fase 4 — Oficina 3D y tiempo real (completada)

- [x] Servidor Node personalizado con Next.js + Socket.IO (`server.ts`), autenticación por cookie.
- [x] Publicación desde web y worker a Redis; suscripción y distribución a la sala `office`.
- [x] Eventos de tarea, subtarea, agente, plan, revisión, entregables y pausa global.
- [x] Indicador "En vivo", notificaciones y refresco con debounce en el cliente.
- [x] Escena 3D ligera con paredes, ventanas, departamentos, escritorios, personajes, sala de
      reuniones, descanso y selección.
- [x] Animación de trabajo ligada a estados reales, desplazamiento caminando y reuniones por tarea compartida.
- [x] Cámara adaptativa, carga diferida y `dpr` limitado.
- [x] Verificación con Redis/worker reales y Chrome headless: WebGL activo, canvas renderizado,
  selección de personaje y eventos `task.created` → `task.scheduled` → `task.status` recibidos.

**Verificación:** 52 pruebas, typecheck y build correctos. Socket sin cookie rechazado; socket
autenticado recibe eventos generados por la web y por el worker. La escena 3D se comprobó con
captura headless (Chrome + SwiftShader), no solo por SSR.

### Fase 5 — Estadísticas, integraciones y optimización

Dashboards de consumo, límites y cuotas; adaptadores ClickUp/GitHub/almacenamiento con
estado "pendiente de configuración" cuando falten credenciales; optimización de consultas,
caché y rendimiento.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Cuotas gratuitas insuficientes o cambiantes | Fallback por agente, límites diarios, registro de consumo y alertas; nunca pago automático |
| Bucles de agentes | DAG validado, máximo de subtareas, iteraciones y rondas de revisión acotadas |
| Ejecuciones duplicadas por reintentos | `jobId` determinista por tarea, estado comprobado en base de datos al iniciar cada job y pausa/cancelación persistentes |
| Claves filtradas | Cifrado AES-GCM, nunca enviar al cliente, no registrar en logs |
| Escena 3D pesada | Presupuesto de rendimiento, carga diferida, geometría simple y fallback 2D |
| Worker y web desincronizados | Redis pub/sub + reconciliación con MySQL; la base de datos es la fuente de verdad |
| Render sin MySQL nativo | MySQL gestionado externo documentado; migraciones versionadas |
