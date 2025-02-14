/**
 * Assorted helper functions and wrappers for working in the CLI
 */

import { join } from "path";
import { OutputConfiguration } from "@commander-js/extra-typings";
import {
  directoryExists,
  doesFileExist,
  findClosestFile,
  isInCurrentDir,
  loadTomlFile,
  loadYamlFile,
} from "@/lib/utils";
import { SolanaToml, SolanaTomlWithConfigPath } from "@/types/config";
import {
  DEFAULT_CLI_YAML_PATH,
  DEFAULT_CONFIG_FILE,
  DEFAULT_TEST_LEDGER_DIR,
} from "@/const/solana";
import { COMMON_OPTIONS } from "@/const/commands";
import { warningOutro, warnMessage } from "@/lib/logs";
import { SolanaCliYaml } from "@/types/solana";
import { DEFAULT_CLI_KEYPAIR_PATH } from "gill/node";

/**
 * Load the Solana CLI's config file
 */
export function loadSolanaCliConfig(
  filePath: string = DEFAULT_CLI_YAML_PATH,
): SolanaCliYaml {
  try {
    const cliConfig = loadYamlFile<SolanaCliYaml>(filePath);

    // auto convert the rpc url to the cluster moniker
    if (cliConfig?.json_rpc_url) {
      switch (cliConfig.json_rpc_url) {
        case "https://api.devnet.solana.com": {
          cliConfig.json_rpc_url = "devnet";
          break;
        }
        case "https://api.testnet.solana.com": {
          cliConfig.json_rpc_url = "testnet";
          break;
        }
        case "https://api.mainnet-beta.solana.com": {
          cliConfig.json_rpc_url = "mainnet";
          break;
        }
        case "http://localhost:8899": {
          cliConfig.json_rpc_url = "localhost";
          break;
        }
      }
    }

    return cliConfig;
  } catch (err) {
    return {
      keypair_path: DEFAULT_CLI_KEYPAIR_PATH,
    };
  }
}

/**
 * Load the Solana.toml config file and handle the default settings overrides
 */
export function loadConfigToml(
  configPath: string = DEFAULT_CONFIG_FILE,
  settings: object = {},
  isConfigRequired: boolean = false,
): SolanaTomlWithConfigPath {
  // allow the config path to be a directory, with a Solana.toml in it
  if (directoryExists(configPath)) {
    configPath = join(configPath, DEFAULT_CONFIG_FILE);
  }

  // attempt to locate the closest config file
  if (configPath === DEFAULT_CONFIG_FILE) {
    // accepts both `Solana.toml` and `solana.toml` (case insensitive)
    const newPath = findClosestFile({
      fileName: DEFAULT_CONFIG_FILE,
    });
    if (newPath) {
      configPath = newPath;
      if (!isInCurrentDir(newPath)) {
        // todo: should we prompt the user if they want to use this one?
        warnMessage(`Using Solana.toml located at: ${newPath}`);
      }
    }
  }

  let config: SolanaToml = { configPath };

  if (doesFileExist(configPath, true)) {
    config = loadTomlFile<SolanaToml>(configPath) || config;
  } else {
    if (isConfigRequired) {
      warningOutro(`No Solana.toml config file found. Operation canceled.`);
      process.exit();
    }
  }

  const defaultSettings: SolanaToml["settings"] = {
    cluster: COMMON_OPTIONS.url.defaultValue,
    accountDir: COMMON_OPTIONS.accountDir.defaultValue,
    keypair: COMMON_OPTIONS.keypair.defaultValue,
    ledgerDir: DEFAULT_TEST_LEDGER_DIR,
  };

  config.settings = Object.assign(defaultSettings, config.settings || {});

  config = deconflictSolanaTomlConfig(config, settings);

  config.configPath = configPath;
  return config as SolanaTomlWithConfigPath;
}

/**
 * Used to deconflict a Solana.toml's declarations with the provided input,
 * setting the desired priority of values
 */
export function deconflictSolanaTomlConfig(config: SolanaToml, args: any) {
  if (args?.url && args.url !== COMMON_OPTIONS.url.defaultValue) {
    config.settings.cluster = args.url;
  }
  if (
    args?.accountDir &&
    args.accountDir !== COMMON_OPTIONS.accountDir.defaultValue
  ) {
    config.settings.accountDir = args.accountDir;
  }

  if (args?.keypair && args.keypair !== COMMON_OPTIONS.keypair.defaultValue) {
    config.settings.keypair = args.keypair;
  }

  return config;
}

/**
 * Default Commander output configuration to be passed into `configureOutput()`
 */
export const cliOutputConfig: OutputConfiguration = {
  writeErr(str: string) {
    // log.error(str.trim() + "\n");
    console.log(str.trim() + "\n");
    // console.log();
  },
  writeOut(str: string) {
    // log.info(str.trim() + "\n");
    console.log(str.trim() + "\n");
    // console.log();
  },
};
