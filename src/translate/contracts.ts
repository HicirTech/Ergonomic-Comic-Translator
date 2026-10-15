import { jsonContract } from "./contract.ts";
import type { ContractId, TranslationContract } from "./interfaces/index.ts";
import { sakuraContract } from "./sakura-contract.ts";

/** The contract behind each id, so a tier can name the one its model speaks. */
export const translationContracts: Record<ContractId, TranslationContract> = {
  json: jsonContract,
  sakura: sakuraContract,
};
