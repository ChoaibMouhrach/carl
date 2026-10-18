import {
  stageNumbers,
  type CampaignStatus,
  type LeadStatus,
  type StageNumber,
} from "@/lib/campaign";

export interface CampaignLead {
  leadId: number;
  name: string;
  skoolUsername: string;
  communityName: string;
  memberCount: number;
  stage: StageNumber;
  status: LeadStatus;
  updatedAt: string;
}

export interface CampaignRecord {
  campaignId: number;
  name: string;
  description: string | null;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  leads: CampaignLead[];
}

const firstNames = [
  "Ava",
  "Liam",
  "Noah",
  "Mia",
  "Ethan",
  "Zoe",
  "Lucas",
  "Ivy",
  "Owen",
  "Nora",
  "Leo",
  "Ella",
];

const lastNames = [
  "Brooks",
  "Carter",
  "Diaz",
  "Evans",
  "Foster",
  "Grant",
  "Hayes",
  "Ingram",
  "Jensen",
  "Keller",
  "Lopez",
  "Morgan",
];

const topics = [
  "Fitness",
  "Crypto",
  "Copywriting",
  "Agency",
  "Dropshipping",
  "Real Estate",
  "Coaching",
  "Design",
  "Trading",
  "Mindset",
];

const suffixes = ["Academy", "Club", "Hub", "Mastermind", "Collective"];

const dayMs = 24 * 60 * 60 * 1000;

const createRandom = (seed: number) => {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (items: string[], random: () => number) =>
  items[Math.floor(random() * items.length)] ?? "";

const pickStatus = (stage: StageNumber, random: () => number): LeadStatus => {
  const roll = random();

  if (stage === 1) {
    if (roll < 0.4) return "pending";
    if (roll < 0.5) return "running";
    if (roll < 0.9) return "done";
    return "failed";
  }

  if (roll < 0.05) return "pending";
  if (roll < 0.13) return "running";
  if (roll < 0.88) return "done";
  return "failed";
};

export const createLeads = (
  count: number,
  seed: number,
  firstLeadId: number,
  freshOnly = false,
): CampaignLead[] => {
  const random = createRandom(seed);

  return Array.from({ length: count }, (_, index) => {
    const firstName = pick(firstNames, random);
    const lastName = pick(lastNames, random);
    const stageIndex = Math.floor(random() ** 1.7 * stageNumbers.length);
    const stage = freshOnly ? 1 : (stageNumbers[stageIndex] ?? 1);
    const status = freshOnly ? "pending" : pickStatus(stage, random);

    return {
      leadId: firstLeadId + index,
      name: `${firstName} ${lastName}`,
      skoolUsername:
        `${firstName}-${lastName}-${Math.floor(random() * 900) + 100}`.toLowerCase(),
      communityName: `${pick(topics, random)} ${pick(suffixes, random)}`,
      memberCount: Math.floor(random() * 4800) + 120,
      stage,
      status,
      updatedAt: new Date(Date.now() - random() * 14 * dayMs).toISOString(),
    };
  });
};

const seedCampaign = (
  campaignId: number,
  name: string,
  description: string,
  status: CampaignStatus,
  leadCount: number,
  ageDays: number,
): CampaignRecord => ({
  campaignId,
  name,
  description,
  status,
  createdAt: new Date(Date.now() - ageDays * dayMs).toISOString(),
  updatedAt: new Date(Date.now() - (ageDays / 3) * dayMs).toISOString(),
  leads: createLeads(leadCount, campaignId * 7919, campaignId * 1000),
});

export const seedCampaigns = (): CampaignRecord[] => [
  seedCampaign(
    1,
    "Fitness coaches, Q4",
    "Paid fitness communities with 500+ members.",
    "active",
    96,
    30,
  ),
  seedCampaign(
    2,
    "Agency owners",
    "Owners running a Skool community next to an agency.",
    "active",
    64,
    18,
  ),
  seedCampaign(
    3,
    "Trading communities",
    "High-ticket trading and crypto groups.",
    "paused",
    48,
    45,
  ),
  seedCampaign(
    4,
    "Real estate pilot",
    "Small pilot to test the pipeline end to end.",
    "completed",
    24,
    60,
  ),
  seedCampaign(5, "Design communities", "Not started yet.", "draft", 0, 2),
];
