use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use borsh::BorshSerialize;
use glitch_shared::test_utils::id;

pub struct GlitchClient {
    rpc_client: RpcClient,
    program_id: Pubkey,
}

impl GlitchClient {
    pub fn new(rpc_url: String, program_id: Option<Pubkey>) -> Self {
        Self {
            rpc_client: RpcClient::new(rpc_url),
            program_id: program_id.unwrap_or_else(|| id()),
        }
    }

    pub async fn create_chaos_request(
        &self,
        signer: &Keypair,
        amount: u64,
        params: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let instruction = glitch_shared::instruction::GlitchInstruction::InitializeChaosRequest {
            amount,
            params,
        };

        let transaction = Transaction::new_signed_with_payer(
            &[solana_sdk::instruction::Instruction {
                program_id: self.program_id,
                accounts: vec![
                    solana_sdk::instruction::AccountMeta::new(signer.pubkey(), true),
                ],
                data: instruction.try_to_vec()?,
            }],
            Some(&signer.pubkey()),
            &[signer],
            self.rpc_client.get_latest_blockhash().await?,
        );

        self.rpc_client.send_and_confirm_transaction(&transaction).await?;
        Ok(())
    }

    pub async fn finalize_chaos_request(
        &self,
        signer: &Keypair,
        request_id: Pubkey,
        status: u8,
        result_ref: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let instruction = glitch_shared::instruction::GlitchInstruction::FinalizeChaosRequest {
            status,
            result_ref,
        };

        let transaction = Transaction::new_signed_with_payer(
            &[solana_sdk::instruction::Instruction {
                program_id: self.program_id,
                accounts: vec![
                    solana_sdk::instruction::AccountMeta::new(request_id, false),
                    solana_sdk::instruction::AccountMeta::new(signer.pubkey(), true),
                ],
                data: instruction.try_to_vec()?,
            }],
            Some(&signer.pubkey()),
            &[signer],
            self.rpc_client.get_latest_blockhash().await?,
        );

        self.rpc_client.send_and_confirm_transaction(&transaction).await?;
        Ok(())
    }
}
