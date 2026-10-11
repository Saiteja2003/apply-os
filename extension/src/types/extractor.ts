/**
 * Common data interfaces for ApplyOS deterministic scrapers.
 */

export interface ExtractedJob {
  companyName: string;
  roleTitle: string;
  location: string;
  description: string;
  jobUrl: string;
  source: 'linkedin' | 'greenhouse' | 'lever' | 'ashby' | 'generic';
  
  // Standard API payload aliases
  company: string;
  role: string;
  url: string;
  jobDescription: string;
}

export interface JobExtractor {
  name: ExtractedJob['source'];
  matches(url: string, hostname: string): boolean;
  extract(doc: Document, win: Window): Partial<ExtractedJob> | null;
}
