import { Argument, Command } from "@commander-js/extra-typings";
import { cliOutputConfig, loadSolanaCliConfig } from "@/lib/cli";
import {
  errorMessage,
  titleMessage,
  warningOutro,
  warnMessage,
} from "@/lib/logs";
import { COMMON_OPTIONS } from "@/const/commands";
import { inspectAddress, inspectSignature } from "@/lib/inspect";
import { getMonikerFromGenesisHash } from "@/lib/web3";
import { inspectBlock } from "@/lib/inspect/block";
import { numberStringToNumber } from "@/lib/utils";
import { parseRpcUrlOrMoniker } from "@/lib/solana";
import {
  getPublicSolanaRpcUrl,
  address,
  createSolanaRpc,
  isAddress,
  isSignature,
  isStringifiedNumber,
  signature,
} from "gill";

const helpText: string[] = [
  "Examples:",
  "  Account:",
  "    mucho inspect GQuioVe2yA6KZfstgmirAvugfUZBcdxSi7sHK7JGk3gk",
  "    mucho inspect --url devnet nicktrLHhYzLmoVbuZQzHUTicd2sfP571orwo9jfc8c",
  "  Transaction:",
  "    mucho inspect --url mainnet 5tb4d17U4ZsBa2gkNFEmVsrnaQ6wCzQ51i4iPkh2p9S2mnfZezcmWQUogVMK3mBZBtgMxKSqe242vAxuV6FyTYPf",
  "  Block:",
  "    mucho inspect 315667873",
  `    mucho inspect --url mainnet ${Intl.NumberFormat().format(
    315667873,
  )} (with your locale formatted numbers)`,
];

/**
 * Command: `inspect`
 *
 * Solana block explorer on the CLI, akin to https://explorer.solana.com/tx/inspector
 */
export function inspectCommand() {
  return new Command("inspect")
    .configureOutput(cliOutputConfig)
    .description("inspect transactions, accounts, etc (like a block explorer)")
    .addHelpText("after", helpText.join("\n"))
    .addArgument(
      new Argument(
        "<INPUT>",
        "transaction signature, account address, or block number to inspect",
      ).argRequired(),
    )
    .addOption(COMMON_OPTIONS.url)
    .addOption(COMMON_OPTIONS.config)
    .action(async (input, options) => {
      titleMessage("Inspector");

      // construct the rpc url endpoint to use based on the provided url option or the solana cli config.yml file
      const cliConfig = loadSolanaCliConfig();
      let clusterUrl = parseRpcUrlOrMoniker(
        options.url || cliConfig.json_rpc_url,
      );

      // when an explorer url is provided, attempt to parse this and strip away the noise
      if (input.match(/^https?:\/\//gi)) {
        try {
          const url = new URL(input);

          if (url.hostname.toLowerCase() != "explorer.solana.com") {
            return errorMessage(
              "Only the https://explorer.solana.com is supported",
            );
          }

          let clusterFromUrl = (
            url.searchParams.get("cluster") || "mainnet"
          ).toLowerCase();

          // accept custom rpc urls via the query param
          if (clusterFromUrl == "custom") {
            if (url.searchParams.has("customUrl")) {
              clusterFromUrl = url.searchParams.get("customUrl");
            } else clusterFromUrl = "localhost";
          }

          // auto detect the cluster selected via the url
          clusterUrl = parseRpcUrlOrMoniker(clusterFromUrl);

          if (url.pathname.match(/^\/address\//gi)) {
            input = url.pathname.match(/^\/address\/(.*)\/?/i)[1];
          } else if (url.pathname.match(/^\/(tx|transaction)\//gi)) {
            input = url.pathname.match(/^\/(tx|transaction)\/(.*)\/?/i)[2];
          } else if (url.pathname.match(/^\/(block)\//gi)) {
            input = url.pathname.match(/^\/block\/(.*)\/?/i)[1];
          } else {
            return warningOutro("Unsupported explorer URL");
          }
        } catch (err) {
          return errorMessage("Unable to parse inspector input as valid URL");
        }
      }

      clusterUrl = clusterUrl.startsWith("http")
        ? clusterUrl
        : getPublicSolanaRpcUrl(clusterUrl as any);
      const rpc = createSolanaRpc(clusterUrl);

      try {
        const selectedCluster = await getMonikerFromGenesisHash({ rpc });

        if (isAddress(input)) {
          await inspectAddress({
            rpc,
            cluster: selectedCluster,
            address: address(input),
          });
        } else if (isSignature(input)) {
          await inspectSignature({
            rpc,
            cluster: selectedCluster,
            signature: signature(input),
          });
        } else if (
          isStringifiedNumber(numberStringToNumber(input).toString())
        ) {
          await inspectBlock({
            rpc,
            cluster: selectedCluster,
            block: input,
          });
        } else {
          warnMessage(
            "Unable to determine your 'INPUT'. Check it's formatting and try again :)",
          );
        }
      } catch (err) {
        // node js fetch throws a TypeError for network errors (for some reason...)
        if (err instanceof TypeError) {
          warnMessage(
            "A network error occurred while connecting to your configured RPC endpoint." +
              "\nIs your RPC connection available at: " +
              clusterUrl,
          );
        } else {
          warnMessage(err);
        }
      }
    });
}
