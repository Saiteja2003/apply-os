import "server-only";

import type { MasterResume, MasterResumeVersion } from "@/lib/types/resume";

import { getMasterResume, saveMasterResume } from "./master-resume";

/**
 * Sample profile saved as version 1 for a user who has no master resume yet,
 * so tailoring works before they have entered their own history. Replacing
 * it is just saving a new version.
 */
export const DEFAULT_MASTER_RESUME: MasterResume = {
  schemaVersion: 1,
  basics: {
    name: "Jordan Rivera",
    headline: "Senior Software Engineer",
    email: "jordan.rivera@example.com",
    phone: null,
    location: "Austin, TX",
    links: [
      { id: "link_01", label: "GitHub", url: "https://github.com/example" },
    ],
  },
  summary:
    "Software engineer with 7 years of experience building backend services and internal tools across logistics and SaaS.",
  experience: [
    {
      id: "exp_01",
      company: "Meridian Logistics",
      title: "Senior Software Engineer",
      location: "Austin, TX",
      startDate: "2022-03",
      endDate: null,
      bullets: [
        {
          id: "b_01",
          text: "Led migration of a monolithic order service to event-driven microservices, cutting p95 latency from 820ms to 190ms.",
        },
        {
          id: "b_02",
          text: "Built backend services processing 40k requests/min with PostgreSQL and Redis.",
        },
        {
          id: "b_03",
          text: "Mentored 4 junior engineers and introduced a design-review process adopted across 3 teams.",
        },
        {
          id: "b_04",
          text: "Created a Next.js internal dashboard used by 120 operations staff to track shipments in real time.",
        },
      ],
    },
    {
      id: "exp_02",
      company: "Brightpath Software",
      title: "Software Engineer",
      location: "Remote",
      startDate: "2019-07",
      endDate: "2022-02",
      bullets: [
        {
          id: "b_05",
          text: "Developed REST APIs in Python (FastAPI) serving 2M monthly users.",
        },
        {
          id: "b_06",
          text: "Automated CI/CD pipelines with GitHub Actions and Docker, reducing release time from 2 days to 30 minutes.",
        },
        {
          id: "b_07",
          text: "Wrote data pipelines to consolidate reporting from 6 sources into a single warehouse.",
        },
        {
          id: "b_08",
          text: "Improved test coverage from 45% to 86% across core services.",
        },
      ],
    },
  ],
  education: [
    {
      id: "edu_01",
      institution: "University of Texas at Austin",
      degree: "B.S.",
      field: "Computer Science",
      startDate: "2015-08",
      endDate: "2019-05",
      bullets: [],
    },
  ],
  projects: [],
  skills: [
    {
      id: "skill_01",
      category: "Languages",
      skills: ["Python", "TypeScript", "SQL", "Go"],
    },
    {
      id: "skill_02",
      category: "Infrastructure",
      skills: ["PostgreSQL", "Redis", "Docker", "GitHub Actions", "AWS"],
    },
    {
      id: "skill_03",
      category: "Frameworks",
      skills: ["FastAPI", "Next.js", "React"],
    },
  ],
  customSections: [],
};

/** The user's latest master resume, seeding the sample profile if none exists. */
export async function ensureMasterResume(
  userId: string,
): Promise<MasterResumeVersion> {
  const existing = await getMasterResume(userId);
  return existing ?? saveMasterResume(userId, DEFAULT_MASTER_RESUME);
}
