export const CITY_SCAN_CATEGORY_GROUP_IDS = [
  "health",
  "home_services",
  "beauty",
  "real_estate",
  "professional",
  "restaurants",
  "automotive",
  "fitness",
  "education",
  "retail",
  "hospitality",
] as const;

export type CityScanCategoryGroupId = (typeof CITY_SCAN_CATEGORY_GROUP_IDS)[number];

export type CityScanCategoryGroup = {
  id: CityScanCategoryGroupId;
  label: string;
  types: readonly string[];
};

// These are current Google Places API (New) Table A types. Broad or unsupported
// phrases are deliberately omitted so a city scan cannot send invalid filters.
export const CITY_SCAN_CATEGORY_GROUPS: readonly CityScanCategoryGroup[] = [
  {
    id: "health",
    label: "Health and clinics",
    types: [
      "dental_clinic",
      "dentist",
      "doctor",
      "medical_clinic",
      "physiotherapist",
      "chiropractor",
      "skin_care_clinic",
      "veterinary_care",
    ],
  },
  {
    id: "home_services",
    label: "Home services",
    types: ["plumber", "electrician", "roofing_contractor", "painter", "locksmith"],
  },
  {
    id: "beauty",
    label: "Beauty and wellness",
    types: ["hair_salon", "beauty_salon", "barber_shop", "nail_salon", "spa"],
  },
  {
    id: "real_estate",
    label: "Real estate",
    types: ["real_estate_agency"],
  },
  {
    id: "professional",
    label: "Professional services",
    types: ["accounting", "consultant", "employment_agency", "insurance_agency", "lawyer", "marketing_consultant"],
  },
  {
    id: "restaurants",
    label: "Restaurants and cafes",
    types: ["restaurant", "cafe", "coffee_shop", "bakery", "fast_food_restaurant", "pizza_restaurant"],
  },
  {
    id: "automotive",
    label: "Automotive",
    types: ["car_repair", "car_wash", "tire_shop", "auto_parts_store", "car_dealer"],
  },
  {
    id: "fitness",
    label: "Fitness",
    types: ["gym", "fitness_center", "yoga_studio", "sports_school"],
  },
  {
    id: "education",
    label: "Education",
    types: ["educational_institution", "school", "preschool", "primary_school", "secondary_school", "university"],
  },
  {
    id: "retail",
    label: "Retail",
    types: ["furniture_store", "clothing_store", "electronics_store", "jewelry_store", "pet_store", "toy_store"],
  },
  {
    id: "hospitality",
    label: "Hospitality",
    types: ["hotel", "guest_house", "lodging", "event_venue", "travel_agency"],
  },
] as const;

const categoryGroupMap = new Map(CITY_SCAN_CATEGORY_GROUPS.map((group) => [group.id, group]));

export function parseCityScanCategoryGroups(value: unknown): CityScanCategoryGroupId[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value)].filter(
    (item): item is CityScanCategoryGroupId =>
      typeof item === "string" && CITY_SCAN_CATEGORY_GROUP_IDS.includes(item as CityScanCategoryGroupId),
  );
}

export function getCityScanCategoryGroups(ids: CityScanCategoryGroupId[]) {
  return ids.map((id) => categoryGroupMap.get(id)).filter((group): group is CityScanCategoryGroup => Boolean(group));
}

export function getCityScanTypePacks(ids: CityScanCategoryGroupId[], maxTypes = 50) {
  const selected = getCityScanCategoryGroups(ids);
  const entries = selected.flatMap((group) => group.types.map((type) => ({ type, groupId: group.id })));
  const unique = [...new Map(entries.map((entry) => [entry.type, entry])).values()];
  const packs: Array<{ types: string[]; groupIds: CityScanCategoryGroupId[] }> = [];

  for (let index = 0; index < unique.length; index += maxTypes) {
    const chunk = unique.slice(index, index + maxTypes);
    packs.push({
      types: chunk.map((entry) => entry.type),
      groupIds: [...new Set(chunk.map((entry) => entry.groupId))],
    });
  }

  return packs;
}
