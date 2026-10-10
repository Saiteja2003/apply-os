import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ResumeBasics } from "@/lib/types/resume";

import { resumeFileName } from "./render";

/** Cover letter as a one-page letter that matches the resume's typography. */

const styles = StyleSheet.create({
  page: {
    padding: 64,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#111111",
  },
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.15 },
  contact: { color: "#444444", marginTop: 3 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: "#9a9a9a", marginTop: 10 },
  date: { marginTop: 22, color: "#444444" },
  recipient: { marginTop: 14 },
  greeting: { marginTop: 18 },
  paragraph: { marginTop: 10 },
  signOff: { marginTop: 22 },
  signature: { fontFamily: "Helvetica-Bold", marginTop: 4 },
});

export interface CoverLetterInput {
  basics: ResumeBasics;
  companyName: string;
  roleTitle: string;
  /** Body paragraphs separated by blank lines. No greeting, no signature. */
  content: string;
}

export async function renderCoverLetter({
  basics,
  companyName,
  roleTitle,
  content,
}: CoverLetterInput): Promise<{ blob: Blob; fileName: string }> {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const contact = [basics.email, basics.phone, basics.location].filter(Boolean);
  const today = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const blob = await pdf(
    <Document title={`${basics.name} - Cover letter - ${companyName}`} author={basics.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{basics.name}</Text>
        <Text style={styles.contact}>{contact.join("  |  ")}</Text>
        <View style={styles.rule} />

        <Text style={styles.date}>{today}</Text>
        <View style={styles.recipient}>
          <Text>Hiring Team</Text>
          <Text>{companyName}</Text>
          <Text>Re: {roleTitle}</Text>
        </View>

        <Text style={styles.greeting}>Dear Hiring Team,</Text>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <Text style={styles.signOff}>Sincerely,</Text>
        <Text style={styles.signature}>{basics.name}</Text>
      </Page>
    </Document>,
  ).toBlob();

  return {
    blob,
    fileName: resumeFileName(basics.name, companyName).replace(
      /_Resume\.pdf$/,
      "_Cover_Letter.pdf",
    ),
  };
}
