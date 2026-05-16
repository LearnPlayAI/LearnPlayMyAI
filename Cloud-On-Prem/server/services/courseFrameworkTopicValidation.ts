const TOPIC_META_PATTERNS: RegExp[] = [
  /^course\s*title/i,
  /^course\s*description/i,
  /^course\s*title\s*and\s*description/i,
  /^title\s*and\s*description/i,
  /^overview(?:\s+of\s+course\s+content)?$/i,
  /^introduction$/i,
  /^summary$/i,
  /^key\s*takeaways?$/i,
  /^learning\s*outcomes?$/i,
  /^course\s*introduction$/i,
  /^by\s+the\s+end\s+of\s+(this|the)\s+(training|course)/i,
  /^learners?\s+should\s+be\s+able\s+to/i,
  /^objectives?$/i,
];

export function stripLessonPrefix(value: string): string {
  return value
    .replace(/^lesson\s*\d+\s*/i, '')
    .replace(/^module\s*\d+\s*/i, '')
    .replace(/^chapter\s*\d+\s*/i, '')
    .trim();
}

export function normalizeTopicLabel(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\-–—]\s*$/, '')
    .trim();
}

export function sanitizeTopicName(value: string): string {
  return normalizeTopicLabel(value)
    .replace(/^(lesson|module|chapter|topic)\s*\d+\s*[:\-–—]?\s*/i, '')
    .trim();
}

function isSpecificOutlineLabel(sanitized: string): boolean {
  const normalized = sanitized.toLowerCase();
  if (/^(overview|introduction|summary|key\s*takeaways?)\s*[:\-–—]\s+.{4,}$/i.test(sanitized)) {
    return true;
  }
  if (/^overview\s+/.test(normalized) && normalized.split(/\s+/).length >= 4) {
    return true;
  }
  return false;
}

export function validateTopicName(value: string, options: { allowDocumentOutlineLabels?: boolean } = {}): {
  valid: boolean;
  sanitized: string;
  reason?: string;
} {
  const raw = normalizeTopicLabel(value);
  const sanitized = sanitizeTopicName(raw);
  const normalized = sanitized.toLowerCase();

  if (!sanitized) {
    return { valid: false, sanitized, reason: 'empty_topic' };
  }
  if (TOPIC_META_PATTERNS.some(pattern => pattern.test(normalized))) {
    if (options.allowDocumentOutlineLabels && isSpecificOutlineLabel(sanitized)) {
      return { valid: true, sanitized };
    }
    return { valid: false, sanitized, reason: 'meta_topic' };
  }
  if (/^(lesson|module|chapter|topic)\s*\d*$/i.test(normalized)) {
    return { valid: false, sanitized, reason: 'generic_topic' };
  }
  if (sanitized.length < 4) {
    return { valid: false, sanitized, reason: 'too_short' };
  }
  return { valid: true, sanitized };
}
