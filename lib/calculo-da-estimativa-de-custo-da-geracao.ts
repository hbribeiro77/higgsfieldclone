export type GenerationCostQuoteInput = {
  duration: number;
  resolution: string;
  aspectRatio: string;
  inputVideoSeconds: number;
  hasVideoReference: boolean;
};

const OUTPUT_HEIGHT: Record<string, number> = {
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "4k": 2160,
};

const ASPECT_WIDTH_OVER_HEIGHT: Record<string, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
  "21:9": 21 / 9,
};

export function quoteFromPricingDescription(description: string, input: GenerationCostQuoteInput): number | null {
  if (/video tokens/i.test(description)) return quoteTokenMeter(description, input);
  if (/per generated second/i.test(description)) return quotePerSecond(description, input);
  return null;
}

function quotePerSecond(description: string, input: GenerationCostQuoteInput): number | null {
  const rates = readResolutionRates(description);
  const rate = rates.get(normalizeResolution(input.resolution));
  if (rate === undefined || !Number.isFinite(input.duration) || input.duration <= 0) return null;
  return rate * input.duration;
}

function quoteTokenMeter(description: string, input: GenerationCostQuoteInput): number | null {
  const without = sectionRates(description, /without video input\s+[—–-]\s+([^;]+)/i);
  const withVideo = sectionRates(description, /with video input\s+[—–-]\s+(.+?)(?:\s+\(|$)/i);
  const rates = input.hasVideoReference ? withVideo : without;
  const ratePerThousand = rates?.get(normalizeResolution(input.resolution));
  const height = OUTPUT_HEIGHT[normalizeResolution(input.resolution)];
  const aspect = ASPECT_WIDTH_OVER_HEIGHT[input.aspectRatio];
  if (ratePerThousand === undefined || !height || !aspect) return null;
  const width = Math.round(height * aspect);
  const seconds = Math.max(0, input.inputVideoSeconds) + input.duration;
  const tokens = Math.ceil((seconds * width * height * 24) / 1024);
  return (tokens / 1000) * ratePerThousand;
}

function sectionRates(description: string, pattern: RegExp): Map<string, number> | null {
  const match = description.match(pattern);
  if (!match?.[1]) return null;
  return readGroupedRates(match[1]);
}

function readGroupedRates(section: string): Map<string, number> {
  const rates = new Map<string, number>();
  for (const match of section.matchAll(/((?:\d+p|4k)(?:\/(?:\d+p|4k))*)\s+\$(\d+(?:\.\d+)?)/gi)) {
    const price = Number(match[2]);
    if (!Number.isFinite(price)) continue;
    for (const name of match[1].split("/")) rates.set(normalizeResolution(name), price);
  }
  return rates;
}

function readResolutionRates(description: string): Map<string, number> {
  const rates = new Map<string, number>();
  for (const match of description.matchAll(/(\d+p|4k)\s+\$(\d+(?:\.\d+)?)/gi)) {
    const price = Number(match[2]);
    if (Number.isFinite(price)) rates.set(normalizeResolution(match[1]), price);
  }
  return rates;
}

function normalizeResolution(value: string): string {
  return value.trim().toLowerCase();
}
