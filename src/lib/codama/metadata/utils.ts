import {
  Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  KeyPairSigner,
} from "gill";
import { TOKEN_METADATA_PROGRAM_ADDRESS } from "./instructions";

/**
 * Derive the Token Metadata address from a token's Mint address
 *
 * @param `mint` - `Address` or `KeyPairSigner` of the token Mint
 */
export async function getTokenMetadataAddress(
  mint: Address | KeyPairSigner,
): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
      seeds: [
        Buffer.from("metadata"),
        getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ADDRESS),
        getAddressEncoder().encode("address" in mint ? mint.address : mint),
      ],
    })
  )[0];
}
