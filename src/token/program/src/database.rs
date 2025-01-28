use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use borsh::{BorshSerialize, BorshDeserialize};

pub struct DatabaseService<'a> {
    pub storage_account: &'a AccountInfo<'a>,
    pub authority: &'a Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct StorageHeader {
    pub version: u8,
    pub total_entries: u32,
    pub last_compaction: i64,
    pub checksum: [u8; 32],
}

impl<'a> DatabaseService<'a> {
    pub fn new(storage_account: &'a AccountInfo<'a>, authority: &'a Pubkey) -> Self {
        Self {
            storage_account,
            authority,
        }
    }

    pub fn initialize(&self) -> Result<(), ProgramError> {
        let header = StorageHeader {
            version: 1,
            total_entries: 0,
            last_compaction: 0,
            checksum: [0; 32],
        };

        let mut data = self.storage_account.try_borrow_mut_data()?;
        header.serialize(&mut &mut data[..])?;
        Ok(())
    }

    pub fn get_header(&self) -> Result<StorageHeader, ProgramError> {
        let data = self.storage_account.try_borrow_data()?;
        StorageHeader::try_from_slice(&data[..])
            .map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn update_header(&self, header: &StorageHeader) -> Result<(), ProgramError> {
        let mut data = self.storage_account.try_borrow_mut_data()?;
        header.serialize(&mut &mut data[..])
            .map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn validate_authority(&self, provided_authority: &Pubkey) -> Result<(), ProgramError> {
        if provided_authority != self.authority {
            return Err(ProgramError::InvalidArgument);
        }
        Ok(())
    }
} 