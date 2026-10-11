/**
 * Detects quantified performance metrics (percentages, dollar amounts, multipliers,
 * scale indicators) inside ATS resume bullets in real time.
 */

const METRIC_PATTERNS = [
  // Percentages: 40%, 12.5%, etc.
  /\b\d+(\.\d+)?%/g,
  // Currency amounts: $50k, $1.2M, $45,000, etc.
  /\$[\d,]+(\.\d+)?([kKmMbB]|(k|m|b)illion)?\b/gi,
  // Multipliers: 2x, 10x, 3.5x
  /\b\d+(\.\d+)?x\b/gi,
  // High-value scaled metrics: 10,000+, 500k, 1M+
  /\b\d{1,3}(,\d{3})+\+?\b/g,
  // Quantified engineering impact: e.g. 15 services, 50k users, 250ms, 99.99% uptime
  /\b\d+\+?\s*(users|clients|customers|requests|queries|nodes|microservices|services|endpoints|engineers|teams|petabytes|terabytes|gb|tb|ms|seconds|minutes|hours)\b/gi,
];

export interface DetectedMetric {
  hasMetrics: boolean;
  matches: string[];
}

export function detectQuantifiedMetrics(text: string): DetectedMetric {
  if (!text || text.trim().length === 0) {
    return { hasMetrics: false, matches: [] };
  }

  const matchesSet = new Set<string>();

  for (const pattern of METRIC_PATTERNS) {
    const found = text.match(pattern);
    if (found) {
      found.forEach((m) => matchesSet.add(m.trim()));
    }
  }

  const matches = Array.from(matchesSet);
  return {
    hasMetrics: matches.length > 0,
    matches,
  };
}
