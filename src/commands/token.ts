import { Command } from "@commander-js/extra-typings";
import { cliOutputConfig } from "@/lib/cli";
import { createTokenCommand } from "./token/create";

export function tokenCommand() {
  return new Command("token")
    .configureOutput(cliOutputConfig)
    .description("create, mint, and transfer tokens")
    .addCommand(createTokenCommand());
}
