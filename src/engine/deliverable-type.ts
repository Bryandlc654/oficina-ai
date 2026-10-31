export function deliverableKindForAgent(slug: string, content: string): "DOCUMENT" | "REPORT" | "STRATEGY" | "ANALYSIS" | "TEXT" | "CODE" | "ATTACHMENT" | "PROMPT" {
  switch (slug) {
    case "project-manager":
      return "REPORT";
    case "developer":
      return /```/.test(content) ? "CODE" : "DOCUMENT";
    case "designer":
      return "PROMPT";
    case "marketing-manager":
      return "STRATEGY";
    case "seo-specialist":
      return "ANALYSIS";
    case "business-analyst":
      return "ANALYSIS";
    case "administrative-assistant":
      return "DOCUMENT";
    default:
      return "TEXT";
  }
}
