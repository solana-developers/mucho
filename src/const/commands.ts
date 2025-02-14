import { Option } from "@commander-js/extra-typings";
import { DEFAULT_ACCOUNTS_DIR, DEFAULT_CONFIG_FILE } from "./solana";
import { loadSolanaCliConfig } from "@/lib/cli";
import { join } from "path";
import { DEFAULT_CLI_KEYPAIR_PATH } from "gill/node";

export const cliConfig = loadSolanaCliConfig();

/**
 * Listing of the common and reusable command options
 */
export const COMMON_OPTIONS = {
  /**
   * path to the local Solana.toml config file
   *
   * note: this is a different config file than the solana cli's config file
   */
  config: new Option(
    "-C --config <PATH>",
    "path to a Solana.toml config file",
  ).default(DEFAULT_CONFIG_FILE),
  /**
   * path to the local authority keypair
   */
  keypair: new Option("--keypair <PATH>", "path to a keypair file").default(
    cliConfig?.keypair_path || DEFAULT_CLI_KEYPAIR_PATH,
  ),
  /**
   * rpc url or moniker to use
   */
  url: new Option(
    "-u --url <URL_OR_MONIKER>",
    "URL for Solana's JSON RPC or moniker",
  ),
  //.default(cliConfig.json_rpc_url || "mainnet"),
  outputOnly: new Option(
    "--output-only",
    "only output the generated command, do not execute it",
  ),
  /**
   * local directory path to store and load any cloned accounts
   */
  accountDir: new Option(
    "--account-dir <ACCOUNT_DIR>",
    "local directory path to store any cloned accounts",
  ).default(DEFAULT_ACCOUNTS_DIR),
  manifestPath: new Option(
    "--manifest-path <PATH>",
    "path to Cargo.toml",
  ).default(join(process.cwd(), "Cargo.toml")),
  /**
   * priority fee in micro-lamports to add to transactions
   */
  priorityFee: new Option(
    "--priority-fee <MICRO_LAMPORTS>",
    "priority fee in micro-lamports to add to transactions",
  ),
};
