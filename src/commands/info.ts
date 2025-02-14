import os from "node:os";
import { Command } from "@commander-js/extra-typings";
import { cliOutputConfig } from "@/lib/cli";
import { titleMessage } from "@/lib/logs";
import ora from "ora";

import { getCommandOutput } from "@/lib/shell";
import { checkInstalledTools } from "@/lib/setup";
import { getPlatformToolsVersions } from "@/lib/solana";
import { DEFAULT_CLI_YAML_PATH } from "@/const/solana";
import { doesFileExist } from "@/lib/utils";
import { DEFAULT_CLI_KEYPAIR_PATH } from "gill/node";

/**
 * Command: `info`
 *
 * Get loads of helpful troubleshooting info for the user's computer
 */
export function infoCommand() {
  return new Command("info")
    .configureOutput(cliOutputConfig)
    .description("gather helpful troubleshooting info about your setup")
    .action(async () => {
      titleMessage("Gather troubleshooting info");
      console.log();

      const spinner = ora("Gathering mucho info").start();

      const separator = "------------------------";

      const info: string[] = [];

      info.push("--- start mucho info ---");
      info.push(`System Info:`);
      const sysInfo = await getCommandOutput("uname -a");
      if (sysInfo) info.push(sysInfo.toString());
      else info.push(`platform: ${os.platform()}, arch: ${os.arch()}`);

      const tools = await checkInstalledTools();

      info.push(separator);
      info.push("Installed tooling:");
      for (const key in tools.status) {
        info.push("  " + key + ": " + tools.status[key]);
      }

      info.push(separator);
      info.push("Platform tools:");
      const solanaTools = getPlatformToolsVersions();
      for (const key in solanaTools) {
        info.push("  " + key + ": " + solanaTools[key]);
      }

      info.push(separator);
      info.push("Solana CLI info:");

      const solanaConfig =
        (await getCommandOutput("solana config get")) ||
        "Unable to get 'solana config'";

      info.push(
        solanaConfig
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
      );

      info.push(
        `Does CLI config.yml exist: ${await doesFileExist(
          DEFAULT_CLI_YAML_PATH,
        )}`,
      );

      const testValidatorChecker = await getCommandOutput(
        // lsof limits the program name character length
        `ps aux | awk '/solana-test-validator/ && !/grep/ {$1=$2=$3=$4=$5=$6=$7=$8=$9=$10=""; print substr($0,11)}'`,
      );

      // build the test validator port, with support for an manually defined one
      let localnetClusterUrl = "http://127.0.0.1:8899";
      if (
        !!testValidatorChecker &&
        testValidatorChecker.includes("--rpc-port")
      ) {
        localnetClusterUrl = `http://127.0.0.1:${
          testValidatorChecker.match(/--rpc-port\s+(\d+)/)[1] || 8899
        }`;
      }

      // only attempt to fetch the address and balances if the user has a local keypair created
      if (await doesFileExist(DEFAULT_CLI_KEYPAIR_PATH)) {
        const address = await getCommandOutput("solana address");
        info.push("Address: " + address);

        const balances = {
          devnet: (await getCommandOutput("solana balance -ud")) || false,
          mainnet: (await getCommandOutput("solana balance -um")) || false,
          testnet: (await getCommandOutput("solana balance -ut")) || false,
          localnet:
            (await getCommandOutput(
              `solana balance --url ${localnetClusterUrl}`,
            )) || false,
        };

        info.push("Balances for address:");
        for (const key in balances) {
          info.push("  " + key + ": " + balances[key]);
        }
      } else {
        info.push(
          `Default keypair file NOT found at: ${DEFAULT_CLI_KEYPAIR_PATH}`,
        );
      }

      info.push("Is test-validator running? " + !!testValidatorChecker);
      info.push("Localnet url: " + localnetClusterUrl);

      info.push("---- end mucho info ----");

      spinner.stop();

      console.log(info.join("\n"));
      // todo: add the ability to save to a file

      console.log();
      console.log(
        "Looking for troubleshooting help? Post a question on the Solana StackExchange:",
      );
      console.log("https://solana.stackexchange.com");
    });
}
