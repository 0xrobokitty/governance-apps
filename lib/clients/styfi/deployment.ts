import type { Address } from "viem";

// Mainnet governance deployment from styfi/deployment.json. These addresses
// are independent of the DAO write rollout configuration.
export const STYFI_GOVERNANCE = {
  voting: "0x543e8871562a8C53E8B6a26835aeEcB3a5A13070",
  voter: "0x5069BcE8C8e371A45aB113604b128BBdF5Ee5c11",
  weightMeasure: "0x67237108547aC7e2dABFB81EDd1b4CBCFFfc8D0c",
  weightAggregator: "0x6973CF85d479b9253E13E71F377E8CD2c2dfECd7",
  voteBoost: "0xA139250BCb3880A97C75fd4287D5bf2a6CAf98A3",
  delegatedMiddleware: "0xE05d0e9eaB8AD581fE5736d8EaA4224dED4Dac7E",
  delegatedRewardClaimer: "0x8A7A0Deb9F86d8D1aF2398C9efd063E26F66cA29",
} as const satisfies Record<string, Address>;
