import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { TailoredEntry, TailoredResume } from "./merge";

/**
 * ATS-oriented resume template: one column, real text in reading order,
 * standard section headings, a built-in font, and no tables, images or
 * text boxes for a parser to trip over.
 */

export interface Density {
  fontSize: number;
  lineHeight: number;
  /** Page margin in points. */
  margin: number;
  /** Space above each section in points. */
  sectionGap: number;
}

/** Tried in order until the resume fits on one page. */
export const DENSITIES: Density[] = [
  { fontSize: 10.5, lineHeight: 1.4, margin: 46, sectionGap: 13 },
  { fontSize: 10, lineHeight: 1.35, margin: 42, sectionGap: 11 },
  { fontSize: 9.5, lineHeight: 1.32, margin: 38, sectionGap: 10 },
  { fontSize: 9, lineHeight: 1.28, margin: 34, sectionGap: 8 },
  { fontSize: 8.5, lineHeight: 1.24, margin: 30, sectionGap: 7 },
  { fontSize: 8, lineHeight: 1.2, margin: 26, sectionGap: 6 },
];

const INK = "#111111";
const MUTED = "#444444";
const RULE = "#9a9a9a";

function createStyles({ fontSize, lineHeight, margin, sectionGap }: Density) {
  return StyleSheet.create({
    page: {
      padding: margin,
      fontFamily: "Helvetica",
      fontSize,
      lineHeight,
      color: INK,
    },
    name: {
      fontFamily: "Helvetica-Bold",
      fontSize: fontSize * 2,
      lineHeight: 1.15,
    },
    headline: { fontSize: fontSize * 1.1, color: MUTED, marginTop: 2 },
    contact: { color: MUTED, marginTop: 3 },
    section: { marginTop: sectionGap },
    sectionTitle: {
      fontFamily: "Helvetica-Bold",
      fontSize: fontSize * 0.95,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      borderBottomWidth: 0.75,
      borderBottomColor: RULE,
      paddingBottom: 1.5,
      marginBottom: sectionGap * 0.45,
    },
    entry: { marginBottom: sectionGap * 0.55 },
    entryHeader: { flexDirection: "row", justifyContent: "space-between" },
    entryHeading: { fontFamily: "Helvetica-Bold", flexShrink: 1 },
    entryDates: { color: MUTED, marginLeft: 8 },
    entrySubheading: { color: MUTED, fontFamily: "Helvetica-Oblique" },
    bullet: { flexDirection: "row", marginTop: 1.5 },
    bulletMark: { width: fontSize },
    bulletText: { flex: 1 },
    skillCategory: { fontFamily: "Helvetica-Bold" },
  });
}

type Styles = ReturnType<typeof createStyles>;

function Entries({ entries, styles }: { entries: TailoredEntry[]; styles: Styles }) {
  return (
    <>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entry} wrap={false}>
          <View style={styles.entryHeader}>
            <Text style={styles.entryHeading}>{entry.heading}</Text>
            {entry.dateRange && (
              <Text style={styles.entryDates}>{entry.dateRange}</Text>
            )}
          </View>
          {entry.subheading && (
            <Text style={styles.entrySubheading}>{entry.subheading}</Text>
          )}
          {entry.bullets.map((bullet, index) => (
            <View key={index} style={styles.bullet}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

interface ResumeDocumentProps {
  resume: TailoredResume;
  density: Density;
}

export function ResumeDocument({ resume, density }: ResumeDocumentProps) {
  const styles = createStyles(density);

  return (
    <Document title={`${resume.name} - Resume`} author={resume.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{resume.name}</Text>
        {resume.headline && <Text style={styles.headline}>{resume.headline}</Text>}
        <Text style={styles.contact}>{resume.contact.join("  |  ")}</Text>

        {resume.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text>{resume.summary}</Text>
          </View>
        )}

        {resume.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {resume.skills.map((group) => (
              <Text key={group.category}>
                <Text style={styles.skillCategory}>{group.category}: </Text>
                {group.skills.join(", ")}
              </Text>
            ))}
          </View>
        )}

        {resume.experience.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            <Entries entries={resume.experience} styles={styles} />
          </View>
        )}

        {resume.projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            <Entries entries={resume.projects} styles={styles} />
          </View>
        )}

        {resume.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            <Entries entries={resume.education} styles={styles} />
          </View>
        )}

        {resume.custom.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Entries entries={section.entries} styles={styles} />
          </View>
        ))}
      </Page>
    </Document>
  );
}
