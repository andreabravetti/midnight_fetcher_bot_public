/// Difficulty validation using DUAL validation approach.
///
/// CRITICAL: The server uses BOTH validation methods:
/// 1. ShadowHarvester ((hash | mask) === mask) - Primary server-side validation
/// 2. Heist Engine (zero-bits counting) - Secondary validation
///
/// We must pass BOTH checks or the server will reject the solution.
///
/// Reference: lib/mining/difficulty.ts lines 79-131

/// Convert difficulty hex string to required zero bits count
/// Reference TypeScript: difficulty.ts difficultyToZeroBits() lines 19-46
fn difficulty_to_zero_bits(difficulty_hex: &str) -> Result<usize, String> {
    // Decode hex string to bytes
    let bytes = hex::decode(difficulty_hex)
        .map_err(|e| format!("Failed to decode difficulty hex: {}", e))?;

    let mut zero_bits = 0;
    for byte in bytes.iter() {
        if *byte == 0x00 {
            zero_bits += 8;
        } else {
            // Count leading zeros in this byte
            zero_bits += byte.leading_zeros() as usize;
            break; // Stop after first non-zero byte
        }
    }

    Ok(zero_bits)
}

/// Check if hash has required leading zero bits
/// Reference TypeScript: difficulty.ts hashStructureGood() lines 52-77
fn hash_structure_good(hash_bytes: &[u8], zero_bits: usize) -> bool {
    let full_bytes = zero_bits / 8;
    let remaining_bits = zero_bits % 8;

    // Check full zero bytes
    if hash_bytes.len() < full_bytes {
        return false;
    }

    for i in 0..full_bytes {
        if hash_bytes[i] != 0 {
            return false;
        }
    }

    if remaining_bits == 0 {
        return true;
    }

    if hash_bytes.len() > full_bytes {
        // Mask for the most significant bits
        let mask = 0xFF << (8 - remaining_bits);
        return (hash_bytes[full_bytes] & mask) == 0;
    }

    false
}

/// Main difficulty validation function
/// Reference TypeScript: difficulty.ts matchesDifficulty() lines 79-131
pub fn matches_difficulty(hash_hex: &str, difficulty_hex: &str) -> Result<bool, String> {
    // Validate inputs
    if hash_hex.len() < 8 {
        return Err(format!(
            "Invalid hash length: {}, expected at least 8 hex chars",
            hash_hex.len()
        ));
    }
    if difficulty_hex.len() != 8 {
        return Err(format!(
            "Invalid difficulty length: {}, expected exactly 8 hex chars",
            difficulty_hex.len()
        ));
    }

    // Convert hash hex to bytes
    let hash_bytes = hex::decode(hash_hex)
        .map_err(|e| format!("Failed to decode hash hex: {}", e))?;

    // Extract first 4 bytes (8 hex chars) for ShadowHarvester check
    let prefix_hex = &hash_hex[..8];
    let hash_prefix_be = u32::from_str_radix(prefix_hex, 16)
        .map_err(|e| format!("Failed to parse hash prefix: {}", e))?;
    let mask = u32::from_str_radix(difficulty_hex, 16)
        .map_err(|e| format!("Failed to parse difficulty mask: {}", e))?;

    // === CHECK 1: ShadowHarvester ((hash | mask) === mask) ===
    // Primary validation that server uses
    // Reference: shadowharvester/src/lib.rs:414-417
    let shadow_harvester_pass = (hash_prefix_be | mask) == mask;

    if !shadow_harvester_pass {
        return Ok(false);
    }

    // === CHECK 2: Heist Engine (zero-bits counting) ===
    // Secondary validation
    let required_zero_bits = difficulty_to_zero_bits(difficulty_hex)?;
    let heist_engine_pass = hash_structure_good(&hash_bytes, required_zero_bits);

    // BOTH checks must pass
    Ok(heist_engine_pass && shadow_harvester_pass)
}

/// Calculate expected number of hashes needed based on difficulty
/// Uses zero-bits counting (more restrictive of the two checks)
pub fn estimate_hashes_needed(difficulty_hex: &str) -> Result<u64, String> {
    let zero_bits = difficulty_to_zero_bits(difficulty_hex)?;

    // Cap at u64::MAX to avoid overflow
    if zero_bits >= 64 {
        return Ok(u64::MAX);
    }

    Ok(2u64.pow(zero_bits as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_difficulty_to_zero_bits() {
        // All zeros = 32 bits (4 bytes * 8)
        assert_eq!(difficulty_to_zero_bits("00000000").unwrap(), 32);

        // One byte of zeros = 8 bits
        assert_eq!(difficulty_to_zero_bits("00ffffff").unwrap(), 8);

        // Two bytes of zeros = 16 bits
        assert_eq!(difficulty_to_zero_bits("0000ffff").unwrap(), 16);

        // 0xFF = no leading zeros
        assert_eq!(difficulty_to_zero_bits("ffffffff").unwrap(), 0);

        // 0x7F = 1 leading zero bit (0111 1111)
        assert_eq!(difficulty_to_zero_bits("7fffffff").unwrap(), 1);

        // 0x3F = 2 leading zero bits (0011 1111)
        assert_eq!(difficulty_to_zero_bits("3fffffff").unwrap(), 2);

        // 0x1F = 3 leading zero bits (0001 1111)
        assert_eq!(difficulty_to_zero_bits("1fffffff").unwrap(), 3);
    }

    #[test]
    fn test_hash_structure_good() {
        // 8 zero bits = 1 zero byte
        let hash = hex::decode("00112233445566778899aabbccddeeff").unwrap();
        assert!(hash_structure_good(&hash, 8));
        assert!(!hash_structure_good(&hash, 9)); // One more bit required

        // 16 zero bits = 2 zero bytes
        let hash = hex::decode("0000112233445566778899aabbccddeeff").unwrap();
        assert!(hash_structure_good(&hash, 16));
        assert!(!hash_structure_good(&hash, 17));

        // 4 zero bits in first byte
        let hash = hex::decode("0f112233445566778899aabbccddeeff").unwrap();
        assert!(hash_structure_good(&hash, 4));
        assert!(!hash_structure_good(&hash, 5));

        // No zero bits
        let hash = hex::decode("ff112233445566778899aabbccddeeff").unwrap();
        assert!(hash_structure_good(&hash, 0));
        assert!(!hash_structure_good(&hash, 1));
    }

    #[test]
    fn test_matches_difficulty_shadow_harvester() {
        // Test ShadowHarvester check: (hash | mask) == mask

        // Difficulty: ffffffff (no requirements)
        // Any hash should pass
        let result = matches_difficulty(
            "0000000000000000000000000000000000000000000000000000000000000000",
            "ffffffff"
        );
        assert_eq!(result.unwrap(), true);

        // Difficulty: 00000000 (32 zero bits required)
        // Hash with 32 zero bits should pass both checks
        let result = matches_difficulty(
            "0000000011111111222222223333333344444444555555556666666677777777",
            "00000000"
        );
        assert_eq!(result.unwrap(), true);

        // Hash without enough zero bits should fail
        let result = matches_difficulty(
            "ff00000011111111222222223333333344444444555555556666666677777777",
            "00000000"
        );
        assert_eq!(result.unwrap(), false);
    }

    #[test]
    fn test_matches_difficulty_dual_check() {
        // Test that BOTH checks must pass

        // Difficulty with 1 leading zero bit: 0x7fffffff
        // This means the first bit of the hash must be 0

        // Hash: 0x00000000... (passes both checks)
        let result = matches_difficulty(
            "0000000011111111222222223333333344444444555555556666666677777777",
            "7fffffff"
        );
        assert_eq!(result.unwrap(), true);

        // Hash: 0x7fffffff... (should pass ShadowHarvester but has 1 zero bit)
        let result = matches_difficulty(
            "7fffffff11111111222222223333333344444444555555556666666677777777",
            "7fffffff"
        );
        assert_eq!(result.unwrap(), true);

        // Hash: 0x80000000... (fails ShadowHarvester check)
        let result = matches_difficulty(
            "8000000011111111222222223333333344444444555555556666666677777777",
            "7fffffff"
        );
        assert_eq!(result.unwrap(), false);
    }

    #[test]
    fn test_estimate_hashes_needed() {
        // 0 bits = 2^0 = 1 hash expected
        assert_eq!(estimate_hashes_needed("ffffffff").unwrap(), 1);

        // 8 bits = 2^8 = 256 hashes
        assert_eq!(estimate_hashes_needed("00ffffff").unwrap(), 256);

        // 16 bits = 2^16 = 65536 hashes
        assert_eq!(estimate_hashes_needed("0000ffff").unwrap(), 65536);

        // 20 bits = 2^20 = 1048576 hashes
        assert_eq!(estimate_hashes_needed("0000f0ff").unwrap(), 1048576);
    }

    #[test]
    fn test_invalid_inputs() {
        // Invalid hash length
        assert!(matches_difficulty("00", "ffffffff").is_err());

        // Invalid difficulty length
        assert!(matches_difficulty("0000000011111111", "ff").is_err());

        // Invalid hex characters
        assert!(matches_difficulty("gggggggg11111111", "ffffffff").is_err());
        assert!(matches_difficulty("0000000011111111", "gggggggg").is_err());
    }
}
