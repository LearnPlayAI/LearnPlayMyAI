const SAFE_TEXT_UTILITIES = new Set([
  "text-left",
  "text-right",
  "text-center",
  "text-justify",
  "text-start",
  "text-end",
  "text-ellipsis",
  "text-clip",
  "text-wrap",
  "text-nowrap",
  "text-balance",
  "text-pretty",
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "text-8xl",
  "text-9xl",
])

const SAFE_BORDER_UTILITIES = [
  /^border$/,
  /^border-[0248]$/,
  /^border-(x|y|t|r|b|l|s|e)$/,
  /^border-(x|y|t|r|b|l|s|e)-[0248]$/,
  /^border-(solid|dashed|dotted|double|none|hidden)$/,
  /^border-(collapse|separate)$/,
]

const VISUAL_PREFIXES = [
  "bg-",
  "ring",
  "shadow",
  "from-",
  "via-",
  "to-",
  "fill-",
  "stroke-",
  "placeholder:",
  "placeholder-",
  "accent-",
  "caret-",
  "divide-",
  "outline",
  "opacity-",
  "backdrop-",
]

const LEGACY_SEMANTIC_COLOR_WRAPPER =
  /(?:rgba?|hsla?)\(var\(--[A-Za-z0-9_-]+(?:\)|[\/,\s])/;

function getUtilityToken(token: string): string {
  const withoutImportant = token.startsWith("!") ? token.slice(1) : token
  let bracketDepth = 0
  let separatorIndex = -1

  for (let index = 0; index < withoutImportant.length; index += 1) {
    const character = withoutImportant[index]

    if (character === "[") {
      bracketDepth += 1
      continue
    }

    if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
      continue
    }

    if (character === ":" && bracketDepth === 0) {
      separatorIndex = index
    }
  }

  if (separatorIndex === -1) {
    return withoutImportant
  }

  return withoutImportant.slice(separatorIndex + 1)
}

function isVisualUtility(utility: string): boolean {
  if (!utility) {
    return false
  }

  if (utility.startsWith("text-") && !SAFE_TEXT_UTILITIES.has(utility)) {
    return true
  }

  if (utility === "text") {
    return true
  }

  if (utility.startsWith("border-")) {
    return !SAFE_BORDER_UTILITIES.some((pattern) => pattern.test(utility))
  }

  if (utility === "border") {
    return false
  }

  if (
    utility.startsWith("[") &&
    (utility.includes("background") ||
      utility.includes("color") ||
      utility.includes("border") ||
      utility.includes("shadow") ||
      utility.includes("ring") ||
      utility.includes("fill") ||
      utility.includes("stroke") ||
      utility.includes("opacity"))
  ) {
    return true
  }

  return VISUAL_PREFIXES.some((prefix) => utility.startsWith(prefix))
}

function containsLegacySemanticColorWrapper(token: string): boolean {
  return LEGACY_SEMANTIC_COLOR_WRAPPER.test(token)
}

export function sanitizePrimitiveClassName(className?: string): string | undefined {
  if (!className) {
    return className
  }

  const kept = className
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !containsLegacySemanticColorWrapper(token))
    .filter((token) => !isVisualUtility(getUtilityToken(token)))

  return kept.length > 0 ? kept.join(" ") : undefined
}

export function sanitizePrimitiveClassNameStrict(className?: string): string | undefined {
  return sanitizePrimitiveClassName(className)
}
