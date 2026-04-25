#![no_std]

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

#[cfg(test)]
mod test_lifecycle;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    IsPaused,
    Admin,
}

const SYS_PAUSE: Symbol = symbol_short!("sys_pause");
const SYS_UNPAUSE: Symbol = symbol_short!("sys_unp");

/// Initialize the lifecycle module with an admin address.
///
/// # Arguments
/// * `admin` - The address that will have pausing privileges.
pub fn initialize(e: &Env, admin: Address) {
    e.storage().persistent().set(&DataKey::Admin, &admin);
}

/// Get the stored admin address.
///
/// # Returns
/// The admin address if initialized, otherwise None.
pub fn get_admin(e: &Env) -> Option<Address> {
    e.storage().persistent().get(&DataKey::Admin)
}

/// Pauses the contract operations.
///
/// # Arguments
/// * `admin` - The address authorized to pause the contract.
///
/// # Authorization
/// Requires `admin` to authenticate AND be the stored admin.
///
/// # Panics
/// Panics if caller is not the stored admin.
pub fn pause(e: Env, admin: Address) {
    // Verify caller is the stored admin
    let stored_admin: Address = e.storage().persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("not initialized"));
    
    if admin != stored_admin {
        panic!("only admin can pause");
    }
    
    admin.require_auth();
    e.storage().persistent().set(&DataKey::IsPaused, &true);

    e.events().publish((SYS_PAUSE,), admin);
}

/// Unpauses the contract operations.
///
/// # Arguments
/// * `admin` - The address authorized to unpause the contract.
///
/// # Authorization
/// Requires `admin` to authenticate AND be the stored admin.
///
/// # Panics
/// Panics if caller is not the stored admin.
pub fn unpause(e: Env, admin: Address) {
    // Verify caller is the stored admin
    let stored_admin: Address = e.storage().persistent()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("not initialized"));
    
    if admin != stored_admin {
        panic!("only admin can unpause");
    }
    
    admin.require_auth();
    e.storage().persistent().set(&DataKey::IsPaused, &false);

    e.events().publish((SYS_UNPAUSE,), admin);
}

/// Checks if the contract is currently paused.
pub fn is_paused(e: &Env) -> bool {
    e.storage()
        .persistent()
        .get(&DataKey::IsPaused)
        .unwrap_or(false)
}

/// Asserts that the contract is NOT paused.
///
/// # Panics
/// Panics with "Contract is paused" if `is_paused` returns true.
pub fn require_not_paused(e: &Env) {
    if is_paused(e) {
        panic!("Contract is paused");
    }
}
