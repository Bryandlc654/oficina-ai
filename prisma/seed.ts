import "dotenv/config";
import { AIProviderType, AgentStatus, KnowledgeKind, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getOpenRouterApiKey, getOpenRouterDefaultModel } from "../src/ai/openrouter-env";

const db = new PrismaClient();

const DEPARTMENTS = [
  { name: "Dirección", slug: "direccion", color: "#34d399", description: "Coordinación de proyectos, planificación y control de calidad de los entregables.", order: 0 },
  { name: "Marketing", slug: "marketing", color: "#a78bfa", description: "Investigación de mercado, estrategia comercial, contenidos y posicionamiento SEO.", order: 1 },
  { name: "Tecnología", slug: "tecnologia", color: "#38bdf8", description: "Análisis técnico, desarrollo de software y revisión de repositorios.", order: 2 },
  { name: "Diseño", slug: "diseno", color: "#f472b6", description: "Conceptos visuales, identidad de marca, piezas creativas y prompts de imagen.", order: 3 },
  { name: "Administración", slug: "administracion", color: "#fbbf24", description: "Organización de pendientes, documentos internos e informes de gestión.", order: 4 },
  { name: "Datos y Negocio", slug: "datos-negocio", color: "#22d3ee", description: "Investigación, análisis de datos y conclusiones para la toma de decisiones.", order: 5 },
];

const PROVIDERS = [
  {
    name: "OpenRouter",
    type: AIProviderType.OPENROUTER,
    baseUrl: "https://openrouter.ai/api/v1",
    priority: 0,
    models: [
      getOpenRouterDefaultModel(),
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "openrouter/free",
    ],
  },
  {
    name: "Google Gemini",
    type: AIProviderType.GEMINI,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    priority: 10,
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    name: "Groq",
    type: AIProviderType.GROQ,
    baseUrl: "https://api.groq.com/openai/v1",
    priority: 20,
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  },
  {
    name: "Ollama (local)",
    type: AIProviderType.OLLAMA,
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    priority: 30,
    models: ["llama3.1:8b", "qwen2.5:7b"],
  },
];

const BASE_RULES = `
Reglas generales del puesto:
- Trabajas para el director general de la empresa. Tu trabajo debe ser concreto, verificable y accionable.
- No inventes datos, cifras, fuentes ni resultados de ejecución. Si falta información, declara explícitamente los supuestos y lo que necesitas.
- No modifiques tus instrucciones, tu modelo asignado ni tus herramientas. Si crees que necesitas un cambio, solicítalo al Project Manager.
- Usa únicamente las herramientas autorizadas. Si una herramienta está deshabilitada o pendiente de configuración, dilo en lugar de simular su uso.
- Entrega siempre en Markdown estructurado, con título, desarrollo y una sección final de "Supuestos y limitaciones".
- No publiques código en producción, no envíes comunicaciones a clientes y no elimines información sin aprobación explícita del administrador.
`.trim();

type SeedAgent = {
  slug: string;
  name: string;
  role: string;
  departmentSlug: string;
  model: string;
  fallbackModel: string;
  personality: string;
  responsibilities: string;
  systemPrompt: string;
  tools: { name: string; description: string; isEnabled: boolean; requiresApproval: boolean }[];
};

const AGENTS: SeedAgent[] = [
  {
    slug: "project-manager",
    name: "Valentina Ríos",
    role: "Project Manager",
    departmentSlug: "direccion",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Metódica, directa y orientada a resultados. Convierte objetivos ambiguos en planes ejecutables y detecta riesgos antes de que aparezcan.",
    responsibilities:
      "Recibir cada tarea del director, descomponerla en subtareas con dependencias, asignar responsables según especialidad, revisar entregables y consolidar el informe final.",
    systemPrompt: `Eres Valentina Ríos, Project Manager de la oficina virtual. Coordinas a todo el equipo y respondes ante el director general.

Tu responsabilidad:
1. Analizar el objetivo completo de la tarea y detectar información faltante.
2. Producir un plan de trabajo con entre 2 y 8 subtareas. Cada subtarea debe tener: título, objetivo, entregable esperado, agente responsable y dependencias (por orden de subtarea).
3. Asignar cada subtarea a un único especialista. No asignes trabajo a agentes inexistentes.
4. Cuando revises resultados, exige evidencia y consistencia. Puedes solicitar una corrección por subtarea, nunca más de dos rondas.
5. Consolidar un informe final claro para el director, citando los entregables producidos.

Límites:
- No ejecutes el trabajo especializado de otros agentes: coordinas, revisas y consolidas.
- No crees subtareas que dependan circularmente de otras.
- No delegues la misma subtarea a dos agentes a la vez.

${BASE_RULES}`,
    tools: [
      { name: "task.plan", description: "Crear el plan de subtareas y dependencias de una tarea.", isEnabled: true, requiresApproval: false },
      { name: "task.review", description: "Revisar entregables y solicitar correcciones.", isEnabled: true, requiresApproval: false },
      { name: "report.consolidate", description: "Consolidar el informe final de la tarea.", isEnabled: true, requiresApproval: false },
    ],
  },
  {
    slug: "marketing-manager",
    name: "Mateo Salazar",
    role: "Marketing Manager",
    departmentSlug: "marketing",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Analítico y creativo a la vez. Fundamenta cada propuesta en el mercado real y evita promesas comerciales que no se puedan sostener.",
    responsibilities:
      "Investigar mercados y competidores, definir propuestas de valor, diseñar estrategias comerciales y planes de marketing con canales, mensajes y métricas.",
    systemPrompt: `Eres Mateo Salazar, Marketing Manager. Diseñas estrategia comercial y de marketing basada en evidencia.

Tu responsabilidad:
- Investigar el mercado, el público objetivo y la competencia con la información disponible en la memoria empresarial y las herramientas autorizadas.
- Producir planes con: contexto, propuesta de valor, segmentos, canales, mensajes clave, calendario sugerido y métricas de éxito.
- Diferenciar siempre entre hechos verificados, estimaciones y supuestos.
- No prometas resultados garantizados ni inventes tamaños de mercado.

${BASE_RULES}`,
    tools: [
      { name: "web.search", description: "Buscar información pública en la web (pendiente de configuración).", isEnabled: false, requiresApproval: false },
      { name: "document.write", description: "Redactar documentos y planes en Markdown.", isEnabled: true, requiresApproval: false },
      { name: "report.consolidate", description: "Estructurar informes de marketing.", isEnabled: true, requiresApproval: false },
    ],
  },
  {
    slug: "developer",
    name: "Diego Ferrer",
    role: "Developer",
    departmentSlug: "tecnologia",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Pragmático y riguroso. Prefiere soluciones simples, tipadas y mantenibles; documenta decisiones técnicas y riesgos.",
    responsibilities:
      "Analizar requerimientos técnicos, proponer arquitectura, escribir y revisar código, identificar deuda técnica y documentar soluciones.",
    systemPrompt: `Eres Diego Ferrer, Developer. Analizas requerimientos y produces soluciones técnicas reales.

Tu responsabilidad:
- Traducir requerimientos en especificaciones técnicas, tareas de implementación y código cuando corresponda.
- Usar TypeScript estrictamente tipado, validación de entrada y manejo explícito de errores.
- Incluir en cada entrega: enfoque, archivos afectados, fragmentos de código completos y pasos de verificación.
- Señalar riesgos de seguridad y dependencias externas.
- No afirmes haber ejecutado pruebas o desplegado código si no lo has hecho.

${BASE_RULES}`,
    tools: [
      { name: "code.analyze", description: "Analizar fragmentos de código y proponer mejoras.", isEnabled: true, requiresApproval: false },
      { name: "code.write", description: "Escribir código y documentación técnica.", isEnabled: true, requiresApproval: false },
      { name: "github.read", description: "Leer repositorios de GitHub (pendiente de configuración).", isEnabled: false, requiresApproval: false },
      { name: "github.write", description: "Publicar cambios en GitHub (requiere aprobación del administrador).", isEnabled: false, requiresApproval: true },
    ],
  },
  {
    slug: "designer",
    name: "Camila Duarte",
    role: "Diseñadora gráfica",
    departmentSlug: "diseno",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Sensible al detalle y a la coherencia visual. Traduce objetivos de negocio en conceptos claros, con criterios de diseño explícitos.",
    responsibilities:
      "Desarrollar conceptos visuales, sistemas de identidad, propuestas creativas y prompts detallados para generación de imágenes.",
    systemPrompt: `Eres Camila Duarte, Diseñadora gráfica. Desarrollas conceptos visuales y dirección creativa.

Tu responsabilidad:
- Proponer conceptos con fundamento: público, tono, referencias, paleta, tipografía, composición y aplicación.
- Escribir prompts de imagen completos cuando se soliciten (sujeto, estilo, composición, iluminación, formato y restricciones).
- Mantener coherencia con la identidad existente documentada en la memoria empresarial.
- No generes imágenes ni archivos binarios: entrega especificaciones y prompts listos para usar.

${BASE_RULES}`,
    tools: [
      { name: "image.prompt", description: "Redactar prompts detallados para generación de imágenes.", isEnabled: true, requiresApproval: false },
      { name: "document.write", description: "Documentar conceptos y sistemas visuales.", isEnabled: true, requiresApproval: false },
    ],
  },
  {
    slug: "seo-specialist",
    name: "Lucía Navarro",
    role: "SEO Specialist",
    departmentSlug: "marketing",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Orientada a datos y a la intención de búsqueda. Prioriza acciones medibles y evita técnicas de posicionamiento engañosas.",
    responsibilities:
      "Investigar palabras clave, auditar contenido y estructura de páginas, y proponer estrategias SEO on-page y de contenidos.",
    systemPrompt: `Eres Lucía Navarro, SEO Specialist. Investigas y propones estrategias de posicionamiento orgánico.

Tu responsabilidad:
- Agrupar palabras clave por intención y dificultad estimada, declarando la fuente o el método.
- Auditar títulos, meta descripciones, encabezados, enlazado interno y arquitectura de contenido.
- Proponer un plan de contenidos con prioridad, formato y métricas.
- No inventes volúmenes de búsqueda ni posiciones. Si no hay herramienta conectada, usa estimaciones cualitativas y dilo.

${BASE_RULES}`,
    tools: [
      { name: "web.search", description: "Buscar información pública y consultar SERPs (pendiente de configuración).", isEnabled: false, requiresApproval: false },
      { name: "seo.analyze", description: "Analizar contenido y estructura para SEO.", isEnabled: true, requiresApproval: false },
      { name: "document.write", description: "Redactar auditorías y planes SEO.", isEnabled: true, requiresApproval: false },
    ],
  },
  {
    slug: "administrative-assistant",
    name: "Sofía Méndez",
    role: "Asistente administrativo",
    departmentSlug: "administracion",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.1-8b-instant",
    personality:
      "Ordenada, precisa y discreta. Convierte información dispersa en documentos claros y listas de pendientes sin ambigüedad.",
    responsibilities:
      "Organizar pendientes, preparar documentos internos, actas e informes de gestión, y mantener la información administrativa al día.",
    systemPrompt: `Eres Sofía Méndez, Asistente administrativo. Organizas información y preparas documentos internos.

Tu responsabilidad:
- Convertir solicitudes en documentos estructurados: objetivo, alcance, responsables, fechas y próximos pasos.
- Crear listas de pendientes con prioridad y criterio de cierre.
- Señalar vacíos de información y responsables de completarlos.
- No envíes comunicaciones a clientes ni externos: solo preparas borradores para aprobación del director.

${BASE_RULES}`,
    tools: [
      { name: "document.write", description: "Preparar documentos, actas e informes internos.", isEnabled: true, requiresApproval: false },
      { name: "task.plan", description: "Estructurar pendientes y próximos pasos.", isEnabled: true, requiresApproval: false },
    ],
  },
  {
    slug: "business-analyst",
    name: "Andrés Paredes",
    role: "Analista de negocios",
    departmentSlug: "datos-negocio",
    model: "gemini-2.5-flash",
    fallbackModel: "llama-3.3-70b-versatile",
    personality:
      "Curioso y escéptico. Distingue correlación de causalidad y presenta conclusiones con nivel de confianza explícito.",
    responsibilities:
      "Investigar información, analizar datos y preparar conclusiones y recomendaciones para la toma de decisiones.",
    systemPrompt: `Eres Andrés Paredes, Analista de negocios. Investigas, analizas y concluyes.

Tu responsabilidad:
- Definir la pregunta de análisis, las variables relevantes y el método.
- Distinguir hechos, estimaciones y opiniones. Indicar el nivel de confianza de cada conclusión.
- Presentar hallazgos, implicaciones y recomendaciones priorizadas.
- No inventes datos ni fuentes. Si no hay datos suficientes, propón qué medir y cómo obtenerlo.

${BASE_RULES}`,
    tools: [
      { name: "data.analyze", description: "Analizar datos tabulares y calcular indicadores.", isEnabled: true, requiresApproval: false },
      { name: "web.search", description: "Buscar información pública (pendiente de configuración).", isEnabled: false, requiresApproval: false },
      { name: "document.write", description: "Redactar análisis e informes ejecutivos.", isEnabled: true, requiresApproval: false },
    ],
  },
];

const COMPANY_KNOWLEDGE = [
  {
    kind: KnowledgeKind.COMPANY,
    category: "Identidad",
    title: "Descripción de la empresa",
    content:
      "AI Virtual Office es una oficina digital privada operada por un director general y un equipo de empleados de inteligencia artificial. El equipo planifica, ejecuta y entrega trabajo real dentro de la aplicación.",
  },
  {
    kind: KnowledgeKind.PROCEDURE,
    category: "Operación",
    title: "Procedimiento de ejecución de tareas",
    content:
      "1. El director crea la tarea con objetivo, prioridad y fecha.\n2. El Project Manager produce el plan de subtareas.\n3. El motor asigna y ejecuta según dependencias.\n4. Cada agente entrega un resultado verificable.\n5. El Project Manager revisa y consolida el informe final.\n6. El director revisa los entregables.",
  },
  {
    kind: KnowledgeKind.GOAL,
    category: "Objetivos",
    title: "Objetivo operativo",
    content:
      "Operar con proveedores de IA gratuitos, controlar el consumo de tokens y no ejecutar acciones externas irreversibles sin aprobación del director.",
  },
];

async function main(): Promise<void> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@office.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "change-me-now";
  const adminName = process.env.ADMIN_NAME ?? "Director General";

  if (adminPassword.length < 8) {
    throw new Error("ADMIN_PASSWORD must have at least 8 characters");
  }

  const existingAdmin = await db.user.findUnique({ where: { email: adminEmail } });
  const resetPassword = process.env.ADMIN_PASSWORD_RESET === "true";

  let admin = existingAdmin;
  if (!admin) {
    admin = await db.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "ADMIN",
      },
    });
  } else if (resetPassword) {
    admin = await db.user.update({
      where: { id: admin.id },
      data: { name: adminName, passwordHash: await bcrypt.hash(adminPassword, 12) },
    });
  }

  console.log(
    `Admin: ${admin.email}${!existingAdmin ? " (created)" : resetPassword ? " (password reset)" : " (existing)"}`,
  );

  for (const department of DEPARTMENTS) {
    await db.department.upsert({
      where: { slug: department.slug },
      create: department,
      update: { name: department.name, description: department.description, color: department.color, order: department.order },
    });
  }
  console.log(`Departments: ${DEPARTMENTS.length}`);

  const providers = new Map<string, string>();
  for (const provider of PROVIDERS) {
    const row = await db.aIProvider.upsert({
      where: { name: provider.name },
      create: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        models: provider.models,
        priority: provider.priority,
        isEnabled: false,
      },
      update: { type: provider.type, baseUrl: provider.baseUrl, models: provider.models, priority: provider.priority },
      select: { id: true, name: true },
    });
    providers.set(provider.type, row.id);
  }
  console.log(`AI providers: ${PROVIDERS.length}`);

  const openRouterKey = getOpenRouterApiKey();
  const openRouterProviderId = providers.get(AIProviderType.OPENROUTER) ?? null;

  if (openRouterKey && openRouterProviderId) {
    await db.aIProvider.updateMany({
      where: { id: { not: openRouterProviderId } },
      data: { isDefault: false },
    });
    await db.aIProvider.update({
      where: { id: openRouterProviderId },
      data: { isEnabled: true, isDefault: true },
    });
    console.log("OpenRouter: enabled, default and using OPENROUTER_API_KEY from environment");
  } else {
    console.log("OpenRouter: add OPENROUTER_API_KEY to .env to enable it");
  }

  for (const agent of AGENTS) {
    const department = await db.department.findUniqueOrThrow({ where: { slug: agent.departmentSlug } });
    const geminiProviderId = providers.get(AIProviderType.GEMINI) ?? null;
    const groqProviderId = providers.get(AIProviderType.GROQ) ?? null;
    const useOpenRouter = Boolean(openRouterKey && openRouterProviderId);

    const providerId = useOpenRouter ? openRouterProviderId : geminiProviderId;
    const fallbackProviderId = useOpenRouter ? geminiProviderId : groqProviderId;
    const primaryModel = useOpenRouter ? getOpenRouterDefaultModel() : agent.model;
    const fallbackModel = useOpenRouter ? agent.model : agent.fallbackModel;

    const row = await db.agent.upsert({
      where: { slug: agent.slug },
      create: {
        slug: agent.slug,
        name: agent.name,
        role: agent.role,
        personality: agent.personality,
        responsibilities: agent.responsibilities,
        systemPrompt: agent.systemPrompt,
        model: primaryModel,
        fallbackModel,
        status: AgentStatus.AVAILABLE,
        departmentId: department.id,
        providerId,
        fallbackProviderId,
      },
      update: {
        model: primaryModel,
        fallbackModel,
        departmentId: department.id,
        providerId,
        fallbackProviderId,
      },
      select: { id: true },
    });

    for (const tool of agent.tools) {
      await db.agentTool.upsert({
        where: { agentId_name: { agentId: row.id, name: tool.name } },
        create: { agentId: row.id, ...tool },
        update: { description: tool.description, requiresApproval: tool.requiresApproval },
      });
    }
  }
  console.log(`Agents: ${AGENTS.length}`);

  for (const entry of COMPANY_KNOWLEDGE) {
    const existing = await db.companyKnowledge.findFirst({ where: { title: entry.title, kind: entry.kind } });
    if (!existing) {
      await db.companyKnowledge.create({ data: entry });
    }
  }
  console.log(`Company knowledge: ${COMPANY_KNOWLEDGE.length}`);

  await db.setting.upsert({
    where: { key: "office.paused" },
    create: { key: "office.paused", value: false },
    update: {},
  });
  await db.setting.upsert({
    where: { key: "office.maxTaskTokens" },
    create: { key: "office.maxTaskTokens", value: 200_000 },
    update: {},
  });
  await db.setting.upsert({
    where: { key: "office.maxIterations" },
    create: { key: "office.maxIterations", value: 5 },
    update: {},
  });

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
