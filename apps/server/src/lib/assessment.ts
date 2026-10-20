import type {
  AnswerValue,
  AssessmentVerdict,
  QuestionRole,
  UnknownBehaviour,
} from "@repo/constants/filter";
import type {
  CommunityLink,
  CommunityTier,
} from "@server/infrastructure/database/schemas";
import type { Community, Lead } from "@server/infrastructure/database/schemas";

interface AnsweredQuestion {
  role: QuestionRole;
  onUnknown: UnknownBehaviour;
  answer: AnswerValue;
}

/**
 * Competitor beats disqualified beats needs review beats qualified, so a lead is never
 * waved through because one answer was good.
 */
export const computeVerdict = (
  answered: AnsweredQuestion[],
): AssessmentVerdict => {
  const flagged = (role: QuestionRole) =>
    answered.some((item) => item.role === role && item.answer === "yes");

  if (flagged("competitor")) return "competitor";
  if (flagged("disqualifier")) return "disqualified";

  const requirements = answered.filter((item) => item.role === "requirement");

  if (requirements.some((item) => item.answer === "no")) return "disqualified";

  const unknown = answered.filter((item) => item.answer === "unknown");

  if (
    unknown.some(
      (item) => item.role === "requirement" && item.onUnknown === "disqualify",
    )
  ) {
    return "disqualified";
  }

  const evidenceMissing = answered.some(
    (item) => item.role === "evidence" && item.answer !== "yes",
  );

  if (
    evidenceMissing ||
    unknown.some(
      (item) =>
        item.role !== "evidence" &&
        item.role !== "signal" &&
        item.onUnknown === "review",
    )
  ) {
    return "needs_review";
  }

  return "qualified";
};

/** How many of the signal questions were answered yes: a higher count is a better lead, and nothing is removed for a low one */
export const signalScore = (
  answered: Pick<AnsweredQuestion, "role" | "answer">[],
) => {
  const signals = answered.filter((item) => item.role === "signal");

  return {
    yes: signals.filter((item) => item.answer === "yes").length,
    total: signals.length,
  };
};

const normalize = (text: string) =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/** A yes counts only when its quote really is in the text, so the AI cannot invent proof */
export const verifyEvidence = (
  facts: string,
  answer: { answer: AnswerValue; evidence: string | null },
): { answer: AnswerValue; evidence: string | null } => {
  if (answer.answer !== "yes") {
    return { answer: answer.answer, evidence: answer.evidence?.trim() || null };
  }

  const quote = answer.evidence?.trim();

  if (!quote || !normalize(facts).includes(normalize(quote))) {
    return { answer: "unknown", evidence: null };
  }

  return { answer: "yes", evidence: quote };
};

const MAX_TEXT = 3_000;

const clip = (text: string | null | undefined) =>
  text ? (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text) : null;

const line = (label: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? []
    : [`${label}: ${value}`];

const money = (community: Community) =>
  community.pricingType === "free"
    ? "free"
    : community.monthlyPriceUsd === null
      ? "paid, price unknown"
      : `${community.monthlyPriceUsd} USD per month`;

const tiersText = (tiers: CommunityTier[]) =>
  tiers
    .filter((tier) => tier.active)
    .map(
      (tier) =>
        `${tier.tier}${tier.benefits.length ? ` (${tier.benefits.join("; ")})` : ""}`,
    )
    .join(" | ");

const linksText = (links: CommunityLink[]) =>
  links.map((link) => `${link.label || "link"}: ${link.url}`).join("\n");

/** Everything we hold about the lead as plain text: the only thing the AI sees and quotes are checked against */
export const leadFactsText = (lead: Lead, communities: Community[]) => {
  const owner = [
    "OWNER",
    ...line("Name", lead.name),
    ...line("Skool username", lead.skoolUsername),
    ...line("Location", lead.location),
    ...line("Bio", clip(lead.bio)),
    ...line("Website", lead.website),
    ...line("LinkedIn", lead.linkedinUrl),
    ...line("Facebook", lead.facebookUrl),
    ...line("Instagram", lead.instagramUrl),
    ...line("Twitter", lead.twitterUrl),
    ...line("YouTube", lead.youtubeUrl),
    ...line("TikTok", lead.tiktokUrl),
    ...line("Emails", lead.emails.join(", ")),
    ...line("Followers", lead.followerCount),
  ];

  const sections = communities.map((community) =>
    [
      `COMMUNITY: ${community.displayName}`,
      ...line("Members", community.memberCount),
      ...line("Price", money(community)),
      ...line("Free trial", community.freeTrialEnabled ? "yes" : null),
      ...line("Description", clip(community.description)),
      ...line("About", clip(community.longDescription)),
      ...line("Free benefits", community.freeBenefits.join("; ")),
      ...line("Tiers", tiersText(community.tiers)),
      ...line("Links", linksText(community.links)),
      ...line(
        "Membership questions",
        community.membershipQuestions.map((item) => item.question).join(" | "),
      ),
    ].join("\n"),
  );

  return [owner.join("\n"), ...sections].join("\n\n");
};
