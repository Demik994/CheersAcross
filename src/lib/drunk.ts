/**
 * Pravila "pijanstva". Bez ovisnosti — koriste ih i real-time server (računanje)
 * i preglednik (efekti). Mjeri se u standardnim pićima (10 g alkohola), a ne po spolu lika.
 *
 * - Nakon svake runde nazdravljanja gost "popije" svoje trenutno piće.
 * - Nema trijeznjenja s vremenom; jedini lijek je limunada.
 */
import { DRINKS, normalizeDrinkId, standardDrinks } from "./drinks";

export const SOBERING_DRINK = "limunada";
/** Koliko standardnih pića skida jedna limunada */
export const SOBER_PER_LEMONADE = 5;

export type DrunkLevel = 0 | 1 | 2 | 3 | 4;

export const DRUNK_LEVELS: { min: number; label: string; emoji: string }[] = [
  { min: 0, label: "trijezan", emoji: "🙂" },
  { min: 3, label: "pripit", emoji: "😊" },
  { min: 5, label: "pijan", emoji: "🥴" },
  { min: 8, label: "jako pijan", emoji: "😵" },
  { min: 10, label: "povraća", emoji: "🤢" },
];

/** Od ove razine lik povraća nakon runde */
export const VOMIT_LEVEL: DrunkLevel = 4;

export function drunkLevel(standardDrinkCount: number): DrunkLevel {
  let level = 0;
  DRUNK_LEVELS.forEach((l, i) => {
    if (standardDrinkCount >= l.min) level = i;
  });
  return level as DrunkLevel;
}

/** Novo stanje nakon što gost popije jednu porciju */
export function afterDrinking(current: number, drinkId: unknown): number {
  const id = normalizeDrinkId(drinkId);
  if (id === SOBERING_DRINK) return Math.max(0, round(current - SOBER_PER_LEMONADE));
  return round(current + standardDrinks(DRINKS[id]));
}

const round = (value: number) => Math.round(value * 100) / 100;
