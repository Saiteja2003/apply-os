export interface DiffToken {
  text: string;
  changed: boolean;
}

export interface WordDiff {
  original: DiffToken[];
  tailored: DiffToken[];
}

const normalize = (word: string): string =>
  word.toLowerCase().replace(/[.,;:()]/g, "");

/** Word-level diff via longest common subsequence. */
export function diffWords(original: string, tailored: string): WordDiff {
  const a = original.split(/\s+/).filter(Boolean);
  const b = tailored.split(/\s+/).filter(Boolean);
  const an = a.map(normalize);
  const bn = b.map(normalize);

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        an[i] === bn[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: WordDiff = { original: [], tailored: [] };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (an[i] === bn[j]) {
      result.original.push({ text: a[i++], changed: false });
      result.tailored.push({ text: b[j++], changed: false });
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.original.push({ text: a[i++], changed: true });
    } else {
      result.tailored.push({ text: b[j++], changed: true });
    }
  }
  while (i < a.length) result.original.push({ text: a[i++], changed: true });
  while (j < b.length) result.tailored.push({ text: b[j++], changed: true });

  return result;
}
