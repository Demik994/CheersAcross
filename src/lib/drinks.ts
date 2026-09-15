/**
 * Katalog pića. Svako piće ima čašu, izgled tekućine, ukrase i stvarnu porciju
 * (volumen + % alkohola) — iz toga se računa "standardno piće" (10 g alkohola),
 * što kasnije određuje koliko se tko napije.
 */

export type GlassType =
  | "wine"
  | "whiteWine"
  | "flute"
  | "dessert"
  | "beer"
  | "weizen"
  | "pint"
  | "tumbler"
  | "highball"
  | "martini"
  | "coupe"
  | "balloon"
  | "hurricane"
  | "shot"
  | "rocks";

export type Garnish =
  | "foam"
  | "bubbles"
  | "straw"
  | "ice"
  | "lime"
  | "lemon"
  | "orange"
  | "olive"
  | "mint"
  | "saltRim";

export type DrinkCategory = "wine" | "beer" | "juice" | "cocktail" | "spirit";

export type Drink = {
  label: string;
  category: DrinkCategory;
  glass: GlassType;
  liquidColor: string;
  liquidOpacity: number;
  /** Koliko je čaša puna, 0..1 visine posude */
  fill: number;
  garnish: Garnish[];
  foamColor?: string;
  volumeMl: number;
  /** postotak alkohola */
  abv: number;
};

export const DRINK_CATEGORIES: { id: DrinkCategory; label: string; emoji: string }[] = [
  { id: "wine", label: "Vina", emoji: "🍷" },
  { id: "beer", label: "Pive", emoji: "🍺" },
  { id: "juice", label: "Sokovi", emoji: "🧃" },
  { id: "cocktail", label: "Kokteli", emoji: "🍸" },
  { id: "spirit", label: "Žestice", emoji: "🥃" },
];

const catalog = {
  // ---------- vina ----------
  "crno-vino": { label: "Crno vino", category: "wine", glass: "wine", liquidColor: "#4a0616", liquidOpacity: 0.92, fill: 0.45, garnish: [], volumeMl: 150, abv: 13 },
  "bijelo-vino": { label: "Bijelo vino", category: "wine", glass: "whiteWine", liquidColor: "#eadc8f", liquidOpacity: 0.55, fill: 0.5, garnish: [], volumeMl: 150, abv: 12 },
  rose: { label: "Rosé", category: "wine", glass: "whiteWine", liquidColor: "#f3a0ad", liquidOpacity: 0.7, fill: 0.5, garnish: [], volumeMl: 150, abv: 12 },
  pjenusac: { label: "Pjenušac", category: "wine", glass: "flute", liquidColor: "#f0cf6e", liquidOpacity: 0.7, fill: 0.72, garnish: ["bubbles"], volumeMl: 150, abv: 11.5 },
  prosek: { label: "Prošek", category: "wine", glass: "dessert", liquidColor: "#8f3a10", liquidOpacity: 0.88, fill: 0.7, garnish: [], volumeMl: 100, abv: 15 },

  // ---------- pive ----------
  lager: { label: "Lager", category: "beer", glass: "beer", liquidColor: "#e0a21a", liquidOpacity: 0.85, fill: 0.78, garnish: ["foam"], foamColor: "#fff4dc", volumeMl: 500, abv: 5 },
  psenicno: { label: "Pšenično", category: "beer", glass: "weizen", liquidColor: "#e8b04a", liquidOpacity: 0.9, fill: 0.82, garnish: ["foam", "lemon"], foamColor: "#fffaf0", volumeMl: 500, abv: 5.4 },
  tamno: { label: "Tamno pivo", category: "beer", glass: "pint", liquidColor: "#241208", liquidOpacity: 0.96, fill: 0.84, garnish: ["foam"], foamColor: "#e8d2b0", volumeMl: 500, abv: 5.5 },
  ipa: { label: "IPA", category: "beer", glass: "pint", liquidColor: "#c9771a", liquidOpacity: 0.88, fill: 0.84, garnish: ["foam"], foamColor: "#fff1d6", volumeMl: 500, abv: 6.5 },
  radler: { label: "Radler", category: "beer", glass: "beer", liquidColor: "#f2c552", liquidOpacity: 0.78, fill: 0.78, garnish: ["foam", "lemon"], foamColor: "#fffbe8", volumeMl: 500, abv: 2 },

  // ---------- sokovi ----------
  "sok-naranca": { label: "Naranča", category: "juice", glass: "tumbler", liquidColor: "#ffb020", liquidOpacity: 0.95, fill: 0.7, garnish: ["straw"], volumeMl: 250, abv: 0 },
  "sok-jabuka": { label: "Jabuka", category: "juice", glass: "tumbler", liquidColor: "#d6b24c", liquidOpacity: 0.82, fill: 0.7, garnish: [], volumeMl: 250, abv: 0 },
  cola: { label: "Cola", category: "juice", glass: "highball", liquidColor: "#2a1006", liquidOpacity: 0.92, fill: 0.78, garnish: ["ice", "straw", "bubbles"], volumeMl: 330, abv: 0 },
  limunada: { label: "Limunada", category: "juice", glass: "highball", liquidColor: "#f1ecb2", liquidOpacity: 0.6, fill: 0.78, garnish: ["ice", "lemon", "straw"], volumeMl: 330, abv: 0 },
  voda: { label: "Voda", category: "juice", glass: "tumbler", liquidColor: "#cfe6ff", liquidOpacity: 0.25, fill: 0.72, garnish: ["lemon"], volumeMl: 250, abv: 0 },

  // ---------- kokteli ----------
  martini: { label: "Martini", category: "cocktail", glass: "martini", liquidColor: "#e6ecd0", liquidOpacity: 0.45, fill: 0.8, garnish: ["olive"], volumeMl: 90, abv: 28 },
  cosmopolitan: { label: "Cosmopolitan", category: "cocktail", glass: "martini", liquidColor: "#e0457b", liquidOpacity: 0.85, fill: 0.8, garnish: ["lime"], volumeMl: 120, abv: 20 },
  mojito: { label: "Mojito", category: "cocktail", glass: "highball", liquidColor: "#d6efbf", liquidOpacity: 0.5, fill: 0.8, garnish: ["ice", "mint", "lime", "straw"], volumeMl: 250, abv: 7 },
  margarita: { label: "Margarita", category: "cocktail", glass: "coupe", liquidColor: "#e4ef9a", liquidOpacity: 0.72, fill: 0.85, garnish: ["saltRim", "lime"], volumeMl: 150, abv: 18 },
  aperol: { label: "Aperol Spritz", category: "cocktail", glass: "balloon", liquidColor: "#ff6a13", liquidOpacity: 0.8, fill: 0.62, garnish: ["ice", "orange"], volumeMl: 200, abv: 8 },
  "pina-colada": { label: "Piña Colada", category: "cocktail", glass: "hurricane", liquidColor: "#fff3d2", liquidOpacity: 0.96, fill: 0.85, garnish: ["straw", "orange"], volumeMl: 250, abv: 9 },

  // ---------- žestice ----------
  sljivovica: { label: "Šljivovica", category: "spirit", glass: "shot", liquidColor: "#f1e3b0", liquidOpacity: 0.4, fill: 0.72, garnish: [], volumeMl: 50, abv: 45 },
  travarica: { label: "Travarica", category: "spirit", glass: "shot", liquidColor: "#c3d27e", liquidOpacity: 0.55, fill: 0.72, garnish: [], volumeMl: 50, abv: 40 },
  whiskey: { label: "Whiskey", category: "spirit", glass: "rocks", liquidColor: "#b25f1c", liquidOpacity: 0.78, fill: 0.5, garnish: ["ice"], volumeMl: 40, abv: 40 },
  vodka: { label: "Vodka", category: "spirit", glass: "shot", liquidColor: "#eef4ff", liquidOpacity: 0.22, fill: 0.6, garnish: [], volumeMl: 30, abv: 40 },
  tequila: { label: "Tequila", category: "spirit", glass: "shot", liquidColor: "#f0dc9c", liquidOpacity: 0.45, fill: 0.6, garnish: ["lime"], volumeMl: 30, abv: 38 },
  pelinkovac: { label: "Pelinkovac", category: "spirit", glass: "shot", liquidColor: "#3a220e", liquidOpacity: 0.9, fill: 0.6, garnish: [], volumeMl: 30, abv: 28 },
} satisfies Record<string, Drink>;

export type DrinkId = keyof typeof catalog;
export const DRINKS: Record<DrinkId, Drink> = catalog;
export const DRINK_IDS = Object.keys(catalog) as DrinkId[];
export const DEFAULT_DRINK: DrinkId = "crno-vino";

export function isDrinkId(value: unknown): value is DrinkId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(catalog, value);
}

/** Stari identifikatori iz prve verzije (sobe spremljene prije menija pića) */
const LEGACY_IDS: Record<string, DrinkId> = {
  wine: "crno-vino",
  beer: "lager",
  champagne: "pjenusac",
  juice: "sok-naranca",
  cocktail: "cosmopolitan",
  rakija: "sljivovica",
};

export function normalizeDrinkId(value: unknown): DrinkId {
  if (isDrinkId(value)) return value;
  if (typeof value === "string" && LEGACY_IDS[value]) return LEGACY_IDS[value];
  return DEFAULT_DRINK;
}

/** Standardna pića u jednoj porciji (1 = 10 g alkohola) */
export function standardDrinks(drink: Drink): number {
  return (drink.volumeMl * (drink.abv / 100) * 0.789) / 10;
}

/** "0,5 l · 5 %", "1,5 dl · 13 %", "5 cl · 45 %" (kao na cjeniku u kafiću) */
export function servingLabel(drink: Drink): string {
  const ml = drink.volumeMl;
  const volume =
    ml >= 500
      ? `${(ml / 1000).toLocaleString("hr")} l`
      : ml >= 100
        ? `${(ml / 100).toLocaleString("hr")} dl`
        : `${(ml / 10).toLocaleString("hr")} cl`;
  return drink.abv > 0 ? `${volume} · ${drink.abv.toLocaleString("hr")} %` : `${volume} · bez alkohola`;
}

export function categoryOf(id: DrinkId): DrinkCategory {
  return DRINKS[id].category;
}
