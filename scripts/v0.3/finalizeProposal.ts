import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AutocratClient } from "@metadaoproject/futarchy/v0.3";

const provider = anchor.AnchorProvider.env();
const payer = provider.wallet["payer"];
const autocratClient = AutocratClient.createClient({ provider });

const PROPOSAL = new PublicKey("vEMYm3RaJjyuxXbD6EasE9wZpFdCNPGZi1VXt5i8cUb");


const main = async () => {
    const proposal = await autocratClient.finalizeProposal(PROPOSAL);
    console.log(proposal);
}

main();