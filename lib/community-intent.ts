export type CommunitySignalType =
  | "looking_for_tool"
  | "asking_for_recommendation"
  | "describing_pain"
  | "actively_hiring"
  | "recently_launched"
  | "seeking_agency"
  | "general_discussion"
  | "promotional_post";

export type CommunityIntentInput = {
  text: string;
  mode: string;
  source: "hackernews" | "reddit" | "indiehackers" | "producthunt";
  postedAt?: string;
  hasExternalUrl?: boolean;
  engagement?: number;
};

export type CommunityIntent = {
  signal_type: CommunitySignalType;
  intent_score: number;
  intent_reason: string;
};

const INTENT_PHRASES = [
  "looking for",
  "need a tool",
  "any tool",
  "recommend",
  "recommendation",
  "alternative to",
  "how do i",
  "struggling with",
  "pain",
  "manual",
  "automate",
  "hiring",
  "agency",
  "lead gen",
  "leads",
  "sales",
];

function isRecent(value?: string) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000;
}

function inferSignalType(text: string, mode: string): CommunitySignalType {
  if (mode === "jobs" || mode === "who_is_hiring" || /\bhiring\b/i.test(text)) {
    return "actively_hiring";
  }

  if (mode === "show_hn") {
    return "recently_launched";
  }

  if (/\bagency\b/i.test(text)) {
    return "seeking_agency";
  }

  if (/\b(recommend|recommendation|alternative to)\b/i.test(text)) {
    return "asking_for_recommendation";
  }

  if (/\b(looking for|need a tool|any tool|automate)\b/i.test(text)) {
    return "looking_for_tool";
  }

  if (/\b(struggling with|pain|manual)\b/i.test(text)) {
    return "describing_pain";
  }

  if (/\b(launch|launched|show hn)\b/i.test(text)) {
    return "promotional_post";
  }

  return "general_discussion";
}

export function scoreCommunityIntent(input: CommunityIntentInput): CommunityIntent {
  const normalized = input.text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (INTENT_PHRASES.some((phrase) => normalized.includes(phrase))) {
    score += 30;
    reasons.push("matched intent keywords");
  }

  if (input.mode === "show_hn" || input.mode === "jobs" || input.mode === "who_is_hiring") {
    score += 20;
    reasons.push("source mode implies intent");
  }

  if (isRecent(input.postedAt)) {
    score += 20;
    reasons.push("recent post");
  }

  if (input.hasExternalUrl) {
    score += 10;
    reasons.push("external website present");
  }

  if ((input.engagement ?? 0) > 0) {
    score += 10;
    reasons.push("public engagement present");
  }

  return {
    signal_type: inferSignalType(input.text, input.mode),
    intent_score: Math.min(score, 100),
    intent_reason: reasons.length ? reasons.join("; ") : "no strong intent signals detected",
  };
}
