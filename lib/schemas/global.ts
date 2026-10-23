import { z } from "@/lib/schemas/zod";

const zBaseUnit = z.string().regex(/^(0|[1-9]\d*)$/);
const zBps = z.union([z.number().int().nonnegative(), zBaseUnit]);

const zWeightBlock = z.object({
  current: zBaseUnit,
  projected: zBaseUnit,
});

const zRewardsBlock = z.object({
  current: zBaseUnit,
  projected: zBaseUnit,
  pps: zBaseUnit,
  apyBps: zBps,
});

const zAprBlock = z.object({
  weight: zBaseUnit,
  rewards: zBaseUnit,
  aprBps: zBps,
});

const zAprOnlyBlock = z.object({
  rewards: zBaseUnit,
  aprBps: zBps,
});

export const GlobalDataSchema = z.object({
  meta: z.object({
    version: z.number().int().min(2),
    timestamp: z.number().int(),
    epoch: z.number().int(),
    blockNumber: z.number().int(),
  }),
  global: z.object({
    maxBoostBps: zBps,
    yfi: z.object({
      totalSupply: zBaseUnit,
      priceCts: zBaseUnit,
      priceStale: z.boolean().optional(),
      priceStatus: z.string().optional(),
      priceUpdatedAt: z.number().int().nonnegative().optional(),
    }),
    veyfi: z.object({
      lockedYfi: zBaseUnit,
      migratedYfi: zBaseUnit,
      totalLlyfiStakedBps: zBps,
      inventory: z.object({
        availableYfi: zBaseUnit,
        feeBps: zBps,
      }),
      tokens: z.array(
        z.object({
          symbol: z.string().min(1),
          redemption: z.object({
            enabled: z.boolean(),
            capacity: zBaseUnit,
            used: zBaseUnit,
            inventory: zBaseUnit,
          }),
        })
      ),
    }),
    weight: zWeightBlock,
    rewards: zRewardsBlock,
  }),
  styfi: z.object({
    staked: zBaseUnit,
    unstaking: zBaseUnit,
    current: zAprBlock,
    projected: zAprBlock,
  }),
  styfix: z.object({
    staked: zBaseUnit,
    unstaking: zBaseUnit,
    current: zAprOnlyBlock,
    projected: zAprOnlyBlock,
  }),
  veyfi: z.object({
    current: z.object({
      weight: zBaseUnit,
      rewards: zBaseUnit,
    }),
    projected: z.object({
      weight: zBaseUnit,
      rewards: zBaseUnit,
    }),
  }),
  llyfi: z.array(
    z.object({
      symbol: z.string().min(1),
      staked: zBaseUnit,
      unstaking: zBaseUnit,
      current: zAprBlock,
      projected: zAprBlock,
    })
  ),
});

export type GlobalData = z.infer<typeof GlobalDataSchema>;
