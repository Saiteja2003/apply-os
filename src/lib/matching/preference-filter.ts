import type {
  CandidatePreferences,
  DiscoveredJob,
  JobEligibilityResult,
} from "@/lib/types/discovery";

/**
 * Normalizes a company name or domain string for fuzzy equality and substring matching.
 * Strips protocol, www, common TLDs, legal entity suffixes, and non-alphanumeric chars.
 */
export function normalizeCompany(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/(.*)?$/, "")
    .replace(/\.(com|org|net|io|co|ai|tech|app|dev|biz|info|us|uk|ca|de)$/i, "")
    .replace(/\b(inc|corp|corporation|llc|ltd|limited|gmbh|co|technologies|tech|platforms|group|holdings)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Evaluates whether a discovered job satisfies all hard filters and preference constraints
 * established in the candidate's calibration profile.
 */
export function isJobEligibleForApplication(
  preferences: CandidatePreferences,
  job: DiscoveredJob,
): JobEligibilityResult {
  // 1. Strict Company Blocklist Check
  if (preferences.companyBlocklist && preferences.companyBlocklist.length > 0) {
    const jobCompanyNorm = normalizeCompany(job.company);
    const jobUrlLower = (job.url || "").toLowerCase();

    for (const blocked of preferences.companyBlocklist) {
      const blockedClean = blocked.trim().toLowerCase();
      if (!blockedClean) continue;

      const blockedNorm = normalizeCompany(blocked);

      // Check URL inclusion
      if (jobUrlLower.includes(blockedClean)) {
        return {
          eligible: false,
          reason: `Company URL matches blocklist entry "${blocked}"`,
        };
      }

      // Check raw company name inclusion
      if (job.company.toLowerCase().includes(blockedClean)) {
        return {
          eligible: false,
          reason: `Employer "${job.company}" is on your blocklist`,
        };
      }

      // Normalized match if string is long enough to avoid false positives
      if (blockedNorm.length >= 3 && jobCompanyNorm.length >= 3) {
        if (
          jobCompanyNorm === blockedNorm ||
          jobCompanyNorm.includes(blockedNorm) ||
          blockedNorm.includes(jobCompanyNorm)
        ) {
          return {
            eligible: false,
            reason: `Employer "${job.company}" matches blocklist entry "${blocked}"`,
          };
        }
      }
    }
  }

  // 2. Modality & Location Constraint
  const jobIsRemote =
    job.remote === true ||
    /\bremote\b/i.test(job.location) ||
    /\bremote\b/i.test(job.title);

  if (preferences.remoteOnly && !jobIsRemote) {
    return {
      eligible: false,
      reason: `Position is on-site/hybrid (${job.location || "Office"}), but your preference is Remote Only`,
    };
  }

  if (
    !preferences.remoteOnly &&
    preferences.locations &&
    preferences.locations.length > 0
  ) {
    if (!jobIsRemote) {
      const jobLocLower = (job.location || "").toLowerCase();
      const matchesAnyLocation = preferences.locations.some((loc) => {
        const target = loc.trim().toLowerCase();
        if (!target) return false;
        // Match city, state, or country
        return (
          jobLocLower.includes(target) ||
          target.includes(jobLocLower)
        );
      });

      if (!matchesAnyLocation) {
        return {
          eligible: false,
          reason: `Location "${job.location}" is outside your target locations (${preferences.locations.join(", ")})`,
        };
      }
    }
  }

  // 3. Salary Floor Constraint
  if (preferences.minSalaryFloor && preferences.minSalaryFloor > 0) {
    const floor = preferences.minSalaryFloor;

    if (job.salaryMax !== undefined && job.salaryMax > 0 && job.salaryMax < floor) {
      return {
        eligible: false,
        reason: `Maximum salary ($${job.salaryMax.toLocaleString()}) is below your floor of $${floor.toLocaleString()}`,
      };
    }

    if (
      job.salaryMin !== undefined &&
      job.salaryMin > 0 &&
      (!job.salaryMax || job.salaryMax === 0) &&
      job.salaryMin < floor
    ) {
      return {
        eligible: false,
        reason: `Stated compensation ($${job.salaryMin.toLocaleString()}) is below your floor of $${floor.toLocaleString()}`,
      };
    }
  }

  // 4. Legal Work Authorization & Sponsorship Check
  if (preferences.workAuthorization === "REQUIRES_SPONSORSHIP") {
    const textToCheck = `${job.title} ${job.description || ""}`;
    const noSponsorshipPatterns = [
      /\bno\s*(visa)?\s*sponsorship\b/i,
      /\bunable\s*to\s*sponsor\b/i,
      /\bwill\s*not\s*sponsor\b/i,
      /\bnot\s*sponsoring\b/i,
      /\bcannot\s*sponsor\b/i,
      /\bwithout\s*sponsorship\b/i,
      /\bu\.?s\.?\s*citizen(ship)?\s*required\b/i,
      /\bmust\s*be\s*a\s*u\.?s\.?\s*citizen\b/i,
      /\bsecurity\s*clearance\s*required\b/i,
      /\bactive\s*secret\s*clearance\b/i,
      /\brequires\s*u\.?s\.?\s*citizenship\b/i,
    ];

    for (const pattern of noSponsorshipPatterns) {
      if (pattern.test(textToCheck)) {
        return {
          eligible: false,
          reason:
            "Job posting specifies no visa sponsorship or requires existing citizenship/clearance",
        };
      }
    }
  }

  // 5. Target Roles Alignment
  if (preferences.targetRoles && preferences.targetRoles.length > 0) {
    const jobTitleLower = job.title.toLowerCase();

    // Check if any target role is represented in job title
    const matchesRole = preferences.targetRoles.some((role) => {
      const rLower = role.trim().toLowerCase();
      if (!rLower) return false;

      // Exact substring match
      if (jobTitleLower.includes(rLower)) return true;

      // Token overlap check (e.g., "Full Stack" & "Engineer" in "Senior Full Stack Software Engineer")
      const roleTokens = rLower.split(/\s+/).filter((w) => w.length > 2);
      if (roleTokens.length >= 2) {
        const matchesAll = roleTokens.every((token) => jobTitleLower.includes(token));
        if (matchesAll) return true;
      }

      return false;
    });

    if (!matchesRole) {
      return {
        eligible: false,
        reason: `Role "${job.title}" does not align with your target roles (${preferences.targetRoles.slice(0, 3).join(", ")})`,
      };
    }
  }

  return {
    eligible: true,
  };
}

/**
 * Standard known question patterns that can be answered from candidate profile or EEO data.
 */
const KNOWN_QUESTION_PATTERNS = [
  /full\s*name/i,
  /first\s*name/i,
  /last\s*name/i,
  /email/i,
  /phone/i,
  /linkedin/i,
  /github/i,
  /portfolio|website/i,
  /location|city|country/i,
  /work\s*auth(orization)?|legally\s*authorized/i,
  /sponsorship|visa/i,
  /gender/i,
  /race|ethnicity/i,
  /veteran/i,
  /disability/i,
  /salary|compensation\s*expectation/i,
  /years\s*of\s*experience/i,
];

export interface ApplicationQuestionAudit {
  canProceed: boolean;
  haltReason?: string;
  unknownQuestions: string[];
}

/**
 * Compliance Gate: Evaluates application questionnaire against candidate's profile.
 * HALTS execution immediately if an application presents unknown questions
 * outside the intake profile without explicit user guidance.
 */
export function evaluateApplicationQuestions(
  questions: string[],
  standardAnswers: Record<string, string | undefined> = {},
): ApplicationQuestionAudit {
  const unknownQuestions: string[] = [];

  for (const q of questions) {
    const qClean = q.trim();
    if (!qClean) continue;

    // Check if answered in standardAnswers
    const hasDirectAnswer = Object.keys(standardAnswers).some((key) => {
      const keyLower = key.toLowerCase();
      const qLower = qClean.toLowerCase();
      return (
        qLower.includes(keyLower) ||
        keyLower.includes(qLower) ||
        Boolean(standardAnswers[key]?.trim())
      );
    });

    if (hasDirectAnswer) continue;

    // Check if matched by known standard question pattern
    const isStandardPattern = KNOWN_QUESTION_PATTERNS.some((pat) =>
      pat.test(qClean),
    );

    if (!isStandardPattern) {
      unknownQuestions.push(qClean);
    }
  }

  if (unknownQuestions.length > 0) {
    return {
      canProceed: false,
      haltReason: `Halted: Application contains ${unknownQuestions.length} custom question(s) outside calibrated profile`,
      unknownQuestions,
    };
  }

  return {
    canProceed: true,
    unknownQuestions: [],
  };
}
