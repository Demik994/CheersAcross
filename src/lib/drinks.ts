export type GlassType = "wine" | "beer" | "flute" | "tumbler" | "martini" | "rakija";

export type Drink = {
  id: DrinkId;
  label: string;
  emoji: string;
  glass: GlassType;
  liquidColor: string;
  liquidOpacity: number;
  /** Koliko je čaša puna, 0..1 visine posude */
  fill: number;
};

export const DRINK_IDS = ["wine", "beer", "champagne", "juice", "cocktail", "rakija"] as const;
export type DrinkId = (typeof DRINK_IDS)[number];

export const DRINKS: Record<DrinkId, Drink> = {
  wine: {
    id: "wine",
    label: "Vino",
    emoji: "🍷",
    glass: "wine",
    liquidColor: "#4a0616",
    liquidOpacity: 0.92,
    fill: 0.45,
  },
  beer: {
    id: "beer",
    label: "Pivo",
    emoji: "🍺",
    glass: "beer",
    liquidColor: "#d98a0b",
    liquidOpacity: 0.85,
    fill: 0.78,
  },
  champagne: {
    id: "champagne",
    label: "Pjenušac",
    emoji: "🥂",
    glass: "flute",
    liquidColor: "#f0cf6e",
    liquidOpacity: 0.7,
    fill: 0.72,
  },
  juice: {
    id: "juice",
    label: "Sok",
    emoji: "🧃",
    glass: "tumbler",
    liquidColor: "#ffb020",
    liquidOpacity: 0.95,
    fill: 0.7,
  },
  cocktail: {
    id: "cocktail",
    label: "Koktel",
    emoji: "🍸",
    glass: "martini",
    liquidColor: "#e0457b",
    liquidOpacity: 0.85,
    fill: 0.8,
  },
  rakija: {
    id: "rakija",
    label: "Rakija",
    emoji: "🥃",
    glass: "rakija",
    liquidColor: "#f3e3a0",
    liquidOpacity: 0.55,
    fill: 0.7,
  },
};

export const DEFAULT_DRINK: DrinkId = "wine";

export function isDrinkId(value: unknown): value is DrinkId {
  return typeof value === "string" && (DRINK_IDS as readonly string[]).includes(value);
}
