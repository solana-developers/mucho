import { doesFileExist, loadJsonFile } from "@/lib/utils";
import { DEFAULT_KEYPAIR_PATH } from "@/const/solana";
import { ProgramsByClusterLabels, SolanaCluster } from "@/types/config";
import { warnMessage } from "@/lib/logs";
import { checkCommand, getCommandOutputSync, VERSION_REGEX } from "@/lib/shell";
import { PlatformToolsVersions } from "@/types";
import {
  address,
  Commitment,
  CompilableTransactionMessage,
  createKeyPairSignerFromBytes,
  getSignatureFromTransaction,
  isAddress,
  KeyPairSigner,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  signature,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionMessageWithBlockhashLifetime,
} from "@solana/web3.js";
import { getPublicSolanaRpcUrl } from "./web3";

type Client = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

export const signAndSendTransaction = async (
  client: Client,
  transactionMessage: CompilableTransactionMessage &
    TransactionMessageWithBlockhashLifetime,
  commitment: Commitment = "confirmed",
) => {
  const signedTransaction = await signTransactionMessageWithSigners(
    transactionMessage,
  );
  const signature = getSignatureFromTransaction(signedTransaction);
  await sendAndConfirmTransactionFactory(client)(signedTransaction, {
    commitment,
  });
  return signature;
};

export function loadKeypairFromFile(
  filePath: string = DEFAULT_KEYPAIR_PATH,
): Promise<KeyPairSigner> {
  if (!doesFileExist(filePath)) {
    throw Error(`Unable to locate keypair file: ${filePath}`);
  }
  const jsonBytes = loadJsonFile<Uint8Array>(filePath);
  return createKeyPairSignerFromBytes(Buffer.from(jsonBytes));
}

export async function getAddressFromStringOrFilePath(input: string) {
  if (isAddress(input)) return address(input);
  else {
    return (await loadKeypairFromFile(input)).address;
  }
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

export function getWebsocketUrl(cluster: SolanaCluster | string): URL {
  const rpcUrl = getPublicSolanaRpcUrl(cluster);
  const websocketUrl = new URL(rpcUrl);
  websocketUrl.protocol = "ws";
  return websocketUrl;
}
