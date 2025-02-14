import { SolanaCluster } from "@/types/config";
import type { Commitment, createSolanaRpc } from "gill";

export type InspectorBaseArgs = {
  cluster: SolanaCluster;
  rpc: ReturnType<typeof createSolanaRpc>;
  commitment?: Commitment;
};
