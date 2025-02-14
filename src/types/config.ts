import { JsonAccountStruct } from "@/lib/shell/clone";
import { SolanaClusterMoniker } from "gill";

export type SolanaTomlWithConfigPath = Omit<SolanaToml, "configPath"> &
  NonNullable<{ configPath: SolanaToml["configPath"] }>;

export type SolanaCluster = SolanaClusterMoniker | "mainnet-beta" | "localhost";

export type SolanaToml = {
  configPath?: string;
  settings?: Partial<{
    /**
     * default cluster to use for all operations.
     * when not set, fallback to the Solana CLI cluster
     */
    cluster: SolanaCluster;
    /** local directory for the ledger */
    ledgerDir?: string;
    /** local directory path to store any cloned accounts */
    accountDir: string;
    /** path to the local authority keypair */
    keypair: string;
    /**
     * custom rpc urls for each network that will be used to override the default public endpoints
     */
    networks: Partial<{
      mainnet: string;
      devnet: string;
      testnet: string;
      localnet: string;
    }>;
  }>;
  programs?: ProgramsByClusterLabels;
  clone?: Partial<SolanaTomlClone>;
};

export type SolanaTomlCloneConfig = {
  address: string;
  filePath?: string;
  name?: string;
  cluster?: SolanaCluster | string;
  // default - `cached`
  frequency?: "cached" | "always";
};

export type SolanaTomlClone = {
  program: {
    [key: string]: SolanaTomlCloneConfig;
  };
  account: {
    [key: string]: SolanaTomlCloneConfig;
  };
  token: {
    [key: string]: SolanaTomlCloneConfig & {
      amount?: number;
      mintAuthority?: string;
      freezeAuthority?: string;
      holders?: Array<{
        owner: string;
        amount?: number;
      }>;
    };
  };
};

/**
 * Composite type of SolanaTomlClone["program"] but with the `filePath` required
 */
export type SolanaTomlCloneLocalProgram = {
  [K in keyof SolanaTomlClone["program"]]: Omit<
    SolanaTomlClone["program"][K],
    "filePath"
  > & { filePath: string };
};

export type CloneSettings = {
  autoClone?: boolean;
  force?: boolean;
  prompt?: boolean;
};

export type CloneAccountsFromConfigResult = {
  owners: Map<string, SolanaTomlCloneConfig["cluster"]>;
  changedAccounts: Map<string, JsonAccountStruct>;
};

export type ProgramsByClusterLabels = Partial<{
  localnet?: Record<string, string>;
  devnet?: Record<string, string>;
  testnet?: Record<string, string>;
  mainnet?: Record<string, string>;
}>;
