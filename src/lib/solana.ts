import { doesFileExist, loadJsonFile } from "@/lib/utils";
import { DEFAULT_KEYPAIR_PATH } from "@/const/solana";
import { ProgramsByClusterLabels, SolanaCluster } from "@/types/config";
import { warnMessage } from "@/lib/logs";
import { checkCommand, getCommandOutputSync, VERSION_REGEX } from "@/lib/shell";
import { PlatformToolsVersions } from "@/types";
import { createKeyPairSignerFromBytes, KeyPairSigner } from "@solana/web3.js";

export function loadKeypairFromFile(
  filePath: string = DEFAULT_KEYPAIR_PATH,
): Promise<KeyPairSigner | null> {
  if (!doesFileExist(filePath)) return null;
  const jsonBytes = loadJsonFile<Uint8Array>(filePath);
  return createKeyPairSignerFromBytes(Buffer.from(jsonBytes));
}

/**
 * Parse the provided url to correct it into a valid moniker or rpc url
 */
export function parseRpcUrlOrMoniker(
  input: string,
  includeBetaLabel: boolean = true,
  allowUrl: boolean = true,
): SolanaCluster | string {
  if (allowUrl && input.match(/^http?s/i)) {
    try {
      return new URL(input).toString();
    } catch (err) {
      console.error("Unable to parse 'url':", input);
      process.exit(1);
    }
    return input;
  } else if (input.startsWith("local") || input.startsWith("l")) {
    return "localhost";
  } else if (input.startsWith("t")) {
    return "testnet";
  } else if (input.startsWith("d")) {
    return "devnet";
  } else if (input.startsWith("m")) {
    return includeBetaLabel ? "mainnet-beta" : "mainnet";
  } else {
    warnMessage("Unable to parse url or moniker. Falling back to mainnet");
    return includeBetaLabel ? "mainnet-beta" : "mainnet";
  }
}

/**
 * Validate and sanitize the provided cluster moniker
 */
export function getSafeClusterMoniker(
  cluster: SolanaCluster | string,
  labels?: ProgramsByClusterLabels,
): false | keyof ProgramsByClusterLabels {
  cluster = parseRpcUrlOrMoniker(cluster, true, false);

  if (!labels) {
    labels = {
      devnet: {},
      localnet: {},
      mainnet: {},
      testnet: {},
    };
  }

  // allow equivalent cluster names
  switch (cluster) {
    case "localhost":
    case "localnet": {
      cluster = "localnet";
      break;
    }
    case "mainnet":
    case "mainnet-beta": {
      cluster = "mainnet";
      break;
    }
    //  we do not need to handle these since there is not a common equivalent
    // case "devnet":
    // case "testnet":
    // default:
  }

  if (Object.hasOwn(labels, cluster)) {
    return cluster as keyof ProgramsByClusterLabels;
  } else return false;
}

/**
 * Get the listing of the user's platform tools versions
 */
export function getPlatformToolsVersions(): PlatformToolsVersions {
  const res = getCommandOutputSync("cargo build-sbf --version");
  const tools: PlatformToolsVersions = {};

  if (!res) return tools;

  res.split("\n").map((line) => {
    line = line.trim().toLowerCase();
    if (!line) return;

    const version = VERSION_REGEX.exec(line)?.[1];

    if (line.startsWith("rustc")) tools.rustc = version;
    if (line.startsWith("platform-tools")) tools["platform-tools"] = version;
    if (line.startsWith("solana-cargo-build-")) tools["build-sbf"] = version;
  });

  return tools;
}

/** Solana cluster moniker */
export type SolanaClusterMoniker =
  | "mainnet-beta"
  | "devnet"
  | "testnet"
  | "localnet";

/**
 * Get a public Solana RPC endpoint for a cluster based on its moniker
 *
 * Note: These RPC URLs are rate limited and not suitable for production applications.
 */
export function getPublicSolanaRpcUrl(cluster: SolanaClusterMoniker): string {
  switch (cluster) {
    case "devnet":
      return "https://api.devnet.solana.com";
    case "testnet":
      return "https://api.testnet.solana.com";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "localnet":
      return "http://127.0.0.1:8899";
    default:
      throw new Error("Invalid cluster moniker");
  }
}
