import { Command, Option } from "@commander-js/extra-typings";
import { cliOutputConfig, loadSolanaCliConfig } from "@/lib/cli";
import { COMMON_OPTIONS } from "@/const/commands";
import { errorOutro, titleMessage, warnMessage } from "@/lib/logs";
import ora from "ora";

import {
  getAddressFromStringOrFilePath,
  parseRpcUrlOrMoniker,
} from "@/lib/solana";
import { getCreateMetadataAccountV3Instruction } from "@/lib/codama/metadata/instructions/createMetadataAccountV3";
import { wordWithPlurality } from "@/lib/utils";
import {
  createSolanaClient,
  createTransaction,
  getMinimumBalanceForRentExemption,
  generateKeyPairSigner,
  isStringifiedNumber,
  signTransactionMessageWithSigners,
  getExplorerLink,
  getPublicSolanaRpcUrl,
} from "gill";
import { getCreateAccountInstruction } from "gill/programs";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "gill/programs/token";
import { loadKeypairSignerFromFile } from "gill/node";
import { getTokenMetadataAddress } from "@/lib/codama/metadata";

export function createTokenCommand() {
  return new Command("create")
    .configureOutput(cliOutputConfig)
    .description("create a new token")
    .usage("[options] [-- <CREATE_TOKEN_ARGS>...]")
    .addOption(
      new Option(
        "-n --name <NAME>",
        `the name of the token you want to create`,
      ),
    )
    .addOption(
      new Option(
        "-s --symbol <SYMBOL>",
        `symbol of the token you want to create`,
      ),
    )
    .addOption(
      new Option(
        "-d --decimals <DECIMALS>",
        `decimals of the token you want to create`,
      ),
    )
    .addOption(new Option("-a --amount <AMOUNT>", `amount of tokens to create`))
    .addOption(
      new Option(
        "-m --metadata <METADATA_URI>",
        `URI for additional metadata info for your token`,
      ),
    )
    .addOption(
      new Option(
        "--custom-mint <CUSTOM_MINT_FILEPATH>",
        `keypair file for a custom mint address (default: auto generated)`,
      ),
    )
    .addOption(
      new Option(
        "--freeze-authority <FREEZE_AUTHORITY_OR_FILEPATH>",
        `address or freeze authority for your token (default: same as --keypair)`,
      ),
    )
    .addOption(
      new Option(
        "--mint-authority <MINT_AUTHORITY_FILEPATH>",
        `keypair file for the mint authority (default: same as --keypair)`,
      ),
    )
    .addOption(COMMON_OPTIONS.keypair)
    .addOption(COMMON_OPTIONS.url)
    .action(async (options) => {
      titleMessage("Create a new token");

      let cliConfig = loadSolanaCliConfig();

      if (!options.name) {
        return errorOutro(
          "Please provide a name with -n <NAME>",
          "No name provided",
        );
      }

      if (!options.symbol) {
        return errorOutro(
          "Please provide a symbol with -s <SYMBOL>",
          "No symbol provided",
        );
      }

      if (!options.metadata) {
        return errorOutro(
          "Please provide a metadata URI with -m <METADATA_URI>",
          "No metadata URI provided",
        );
      }

      if (!options.decimals) {
        warnMessage("No decimals provided, setting default to 9");
        options.decimals = "9";
      }

      if (!isStringifiedNumber(options.decimals)) {
        return errorOutro(
          "Please provide valid decimals with -d <DECIMALS>",
          "Invalid value",
        );
      }

      let cluster;

      try {
        options.url = options.url.startsWith("http")
          ? new URL(options.url).toString()
          : parseRpcUrlOrMoniker(options.url || cliConfig.json_rpc_url);

        cluster = options.url;

        // convert monikers to public endpoints
        if (!options.url.startsWith("http")) {
          options.url = getPublicSolanaRpcUrl(options.url as any);
        }
      } catch (err) {
        return errorOutro(
          "Please provide a valid url with -u <URL_OR_MONIKER>",
          "Invalid value",
        );
      }

      // payer will always be used to pay the fees
      const payer = await loadKeypairSignerFromFile(options.keypair);

      // mint authority is required to sign in order to mint the initial tokens
      const mintAuthority = options.mintAuthority
        ? await loadKeypairSignerFromFile(options.mintAuthority)
        : payer;

      const freezeAuthority = await getAddressFromStringOrFilePath(
        options.freezeAuthority || payer.address,
      );

      const mint = options.customMint
        ? await loadKeypairSignerFromFile(options.customMint)
        : await generateKeyPairSigner();

      console.log(); // line spacer after the common "ExperimentalWarning for Ed25519 Web Crypto API"
      const spinner = ora("Preparing to create token").start();

      const { rpc, sendAndConfirmTransaction } = createSolanaClient({
        urlOrMoniker: options.url,
      });

      const space = BigInt(getMintSize());

      spinner.text = "Fetching the latest blockhash";
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const createMintTx = createTransaction({
        version: "legacy",
        feePayer: payer,
        latestBlockhash,
        instructions: [
          getCreateAccountInstruction({
            payer,
            newAccount: mint,
            lamports: getMinimumBalanceForRentExemption(space),
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
          }),
          getInitializeMintInstruction({
            mint: mint.address,
            decimals: Number(options.decimals),
            mintAuthority: mintAuthority.address,
            freezeAuthority,
          }),
        ],
      });

      spinner.text = "Creating token mint: " + mint.address;
      let signature = await sendAndConfirmTransaction(
        await signTransactionMessageWithSigners(createMintTx),
      );

      spinner.succeed("Token mint account created: " + mint.address);

      console.log(
        " ",
        getExplorerLink({
          cluster,
          transaction: signature,
        }).toString(),
        "\n",
      );

      spinner.start("Preparing to create metadata account");

      const metadataPda = await getTokenMetadataAddress(mint);

      const createMetadataTx = createTransaction({
        version: "legacy",
        feePayer: payer,
        latestBlockhash,
        instructions: [
          getCreateMetadataAccountV3Instruction({
            metadata: metadataPda,
            mint: mint.address,
            mintAuthority,
            payer,
            updateAuthority: mintAuthority,
            data: {
              name: options.name,
              symbol: options.symbol,
              uri: options.metadata,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          }),
        ],
      });

      spinner.text = "Creating metadata account: " + metadataPda;
      signature = await sendAndConfirmTransaction(
        await signTransactionMessageWithSigners(createMetadataTx),
      );
      spinner.succeed("Metadata account created: " + metadataPda);

      console.log(
        " ",
        getExplorerLink({
          cluster,
          transaction: signature,
        }).toString(),
        "\n",
      );

      if (!options.amount) {
        warnMessage(
          "No amount provided, skipping minting tokens to your account",
        );
        // warnMessage(
        //   "Please provide an amount to mint tokens to your account with -a <AMOUNT>",
        // );
        spinner.stop();
        return;
      }

      if (!isStringifiedNumber(options.amount)) {
        return errorOutro(
          "Please provide a valid amount with -a <AMOUNT>",
          "Invalid value",
        );
      }

      spinner.start(
        `Preparing to mint '${options.amount}' tokens to: ${payer.address}`,
      );

      const [ata] = await findAssociatedTokenPda({
        owner: payer.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint: mint.address,
      });

      const createTokensTx = createTransaction({
        version: "legacy",
        feePayer: payer,
        latestBlockhash,
        instructions: [
          await getCreateAssociatedTokenIdempotentInstructionAsync({
            mint: mint.address,
            payer,
            owner: payer.address,
          }),
          getMintToInstruction({
            mint: mint.address,
            token: ata,
            amount: BigInt(
              Number(options.amount) * 10 ** Number(options.decimals),
            ),
            mintAuthority,
          }),
        ],
      });

      const tokenPlurality = wordWithPlurality(
        options.amount,
        "token",
        "tokens",
      );

      spinner.text = `Minting '${options.amount}' ${tokenPlurality} to: ${payer.address}`;
      signature = await sendAndConfirmTransaction(
        await signTransactionMessageWithSigners(createTokensTx),
      );
      spinner.succeed(
        `Minted '${options.amount}' ${tokenPlurality} to: ${payer.address}`,
      );
      console.log(
        " ",
        getExplorerLink({
          cluster,
          transaction: signature,
        }).toString(),
      );
    });
}
