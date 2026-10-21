use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;

use crate::crypto::create2_address;

pub fn grind(
    factory: [u8; 20],
    init_hash: [u8; 32],
    prefix: &[u8],
    suffix: &[u8],
    threads: usize,
    attempts: &AtomicU64,
    stop: &AtomicBool,
) -> Option<([u8; 32], [u8; 20])> {
    let found: Mutex<Option<([u8; 32], [u8; 20])>> = Mutex::new(None);
    let threads = threads.max(1);
    let found_slot = &found;
    thread::scope(|scope| {
        for index in 0..threads {
            let prefix = prefix.to_vec();
            let suffix = suffix.to_vec();
            scope.spawn(move || {
                worker(
                    factory,
                    init_hash,
                    &prefix,
                    &suffix,
                    index as u64,
                    attempts,
                    stop,
                    found_slot,
                );
            });
        }
    });
    found.into_inner().unwrap_or(None)
}

fn worker(
    factory: [u8; 20],
    init_hash: [u8; 32],
    prefix: &[u8],
    suffix: &[u8],
    thread_index: u64,
    attempts: &AtomicU64,
    stop: &AtomicBool,
    found: &Mutex<Option<([u8; 32], [u8; 20])>>,
) {
    let mut salt = [0u8; 32];
    salt[..8].copy_from_slice(&thread_index.to_be_bytes());
    let mut counter: u64 = 0;
    let mut pending: u64 = 0;
    while !stop.load(Ordering::Relaxed) {
        salt[24..].copy_from_slice(&counter.to_be_bytes());
        counter = counter.wrapping_add(1);
        let address = create2_address(&factory, &salt, &init_hash);
        pending += 1;
        if address.starts_with(prefix) && address.ends_with(suffix) {
            attempts.fetch_add(pending, Ordering::Relaxed);
            stop.store(true, Ordering::Relaxed);
            if let Ok(mut slot) = found.lock() {
                if slot.is_none() {
                    *slot = Some((salt, address));
                }
            }
            return;
        }
        if pending == 4096 {
            attempts.fetch_add(pending, Ordering::Relaxed);
            pending = 0;
        }
    }
    if pending > 0 {
        attempts.fetch_add(pending, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::{create2_address, keccak256};

    #[test]
    fn finds_a_real_prefix_and_suffix() {
        let factory = [0x42u8; 20];
        let init_hash = keccak256(b"mint-reserve");
        let mut salt = [0u8; 32];
        salt[31] = 3;
        let target = create2_address(&factory, &salt, &init_hash);
        let prefix = &target[..1];
        let suffix = &target[19..];
        let attempts = AtomicU64::new(0);
        let stop = AtomicBool::new(false);
        let (found_salt, found_address) = grind(
            factory,
            init_hash,
            prefix,
            suffix,
            2,
            &attempts,
            &stop,
        )
        .expect("match");
        assert_eq!(
            found_address,
            create2_address(&factory, &found_salt, &init_hash)
        );
        assert!(found_address.starts_with(prefix));
        assert!(found_address.ends_with(suffix));
        assert!(attempts.load(Ordering::Relaxed) > 0);
    }
}
