export type VoiceFieldKind = "text" | "measurement" | "quantity";

const numberWords: Record<string, string> = {
  null: "0", ein: "1", eins: "1", eine: "1", einen: "1", einer: "1",
  zwei: "2", drei: "3", vier: "4", fünf: "5", sechs: "6", sieben: "7",
  acht: "8", neun: "9", zehn: "10", elf: "11", zwölf: "12", dreizehn: "13",
  vierzehn: "14", fünfzehn: "15", sechzehn: "16", siebzehn: "17", achtzehn: "18",
  neunzehn: "19", zwanzig: "20", dreißig: "30", vierzig: "40", fünfzig: "50",
  sechzig: "60", siebzig: "70", achtzig: "80", neunzig: "90", hundert: "100",
};

const smallNumbers: Record<string, number> = Object.fromEntries(Object.entries(numberWords).map(([word, value]) => [word, Number(value)]));
const tensWords = ["zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];

function belowHundred(word: string): number | null {
  if (smallNumbers[word] !== undefined) return smallNumbers[word];
  for (const tensWord of tensWords) {
    if (!word.endsWith(tensWord)) continue;
    const prefix = word.slice(0, -tensWord.length);
    if (!prefix.endsWith("und")) return null;
    const unitWord = prefix.slice(0, -3);
    const unit = smallNumbers[unitWord];
    return unit !== undefined && unit > 0 && unit < 10 ? unit + smallNumbers[tensWord] : null;
  }
  return null;
}

function compoundNumber(word: string): number | null {
  const normalized = word.toLocaleLowerCase("de-DE");
  const direct = belowHundred(normalized);
  if (direct !== null) return direct;
  const hundredIndex = normalized.indexOf("hundert");
  if (hundredIndex < 0) return null;
  const hundredWord = normalized.slice(0, hundredIndex) || "ein";
  const hundreds = smallNumbers[hundredWord];
  if (hundreds === undefined || hundreds < 1 || hundreds > 9) return null;
  const remainderWord = normalized.slice(hundredIndex + "hundert".length);
  if (!remainderWord) return hundreds * 100;
  const remainder = belowHundred(remainderWord);
  return remainder === null ? null : hundreds * 100 + remainder;
}

function normalizeNumberWords(input: string) {
  let value = input.toLocaleLowerCase("de-DE").replace(/[–—]/g, "-").replace(/\b(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)mal\b/g, (_, word: string) => numberWords[word] ?? word);
  value = value.replace(/\b[\p{L}]+\b/gu, (word) => {
    const parsed = compoundNumber(word);
    return parsed === null ? word : String(parsed);
  });
  value = value.replace(/\b(\d+)\s+komma\s+(\d+)\b/gi, "$1.$2");
  return value.replace(/(\d)\s*,\s*(\d)/g, "$1.$2").replace(/\s+/g, " ").trim();
}

function decimalPart(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 3);
  if (!digits) return 0;
  return Number(digits) / 10 ** digits.length;
}

export function extractSpokenNumber(input: string, kind: Exclude<VoiceFieldKind, "text"> = "measurement") {
  const normalized = normalizeNumberWords(input);
  const metersWithPart = normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|meter)\s+(\d{1,3})\b/i);
  if (metersWithPart) {
    const value = Number(metersWithPart[1]) + decimalPart(metersWithPart[2]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (/\b(?:millimeter|millimetern|mm)\b/i.test(normalized)) value /= 1000;
  else if (/\b(?:zentimeter|zentimetern|cm)\b/i.test(normalized)) value /= 100;
  if (kind === "quantity") value = Math.max(1, Math.round(value));
  return value;
}

function germanNumber(value: number, kind: Exclude<VoiceFieldKind, "text">) {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: kind === "quantity" ? 0 : 3,
    useGrouping: false,
  });
}

export function normalizeVoiceFieldValue(input: string, kind: VoiceFieldKind) {
  const transcript = input.trim().replace(/\s+/g, " ");
  if (!transcript) return null;
  if (kind === "text") return transcript.charAt(0).toLocaleUpperCase("de-DE") + transcript.slice(1);
  const number = extractSpokenNumber(transcript, kind);
  return number === null ? null : germanNumber(number, kind);
}
