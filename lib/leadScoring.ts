import type { Lead } from "@/lib/types";

export type LeadTemperature = "Hot" | "Warm" | "Cold";

export function getLeadScore(lead: Partial<Lead>) {
  let score = 0;

  if (lead.email) {
    score += 50;
  }
  if (lead.website) {
    score += 20;
  }
  if (lead.phone) {
    score += 10;
  }
  if (lead.founder_name) {
    score += 20;
  }

  return score;
}

export function getLeadTemperature(score: number): LeadTemperature {
  if (score >= 70) {
    return "Hot";
  }
  if (score >= 40) {
    return "Warm";
  }
  return "Cold";
}

export function getLeadBadge(lead: Partial<Lead>) {
  const score = getLeadScore(lead);
  const temperature = getLeadTemperature(score);

  if (temperature === "Hot") {
    return {
      score,
      temperature,
      label: "Hot",
      className: "badge-hot",
    };
  }

  if (temperature === "Warm") {
    return {
      score,
      temperature,
      label: "Warm",
      className: "badge-warm",
    };
  }

  return {
    score,
    temperature,
    label: "Cold",
    className: "badge-cold",
  };
}
