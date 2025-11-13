use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ChallengeData {
    pub challenge_id: String,
    pub difficulty: String,
    pub no_pre_mine: String,
    pub latest_submission: String,
    pub no_pre_mine_hour: String,
}

/// Builds a preimage string from nonce, address, and challenge data
/// This matches the TypeScript implementation in lib/mining/preimage.ts
pub fn build_preimage(
    nonce_hex: &str,
    address: &str,
    challenge: &ChallengeData,
) -> String {
    format!(
        "{}{}{}{}{}{}{}",
        nonce_hex,
        address,
        challenge.challenge_id,
        challenge.difficulty,
        challenge.no_pre_mine,
        challenge.latest_submission,
        challenge.no_pre_mine_hour
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_preimage() {
        let challenge = ChallengeData {
            challenge_id: "**D07C10".to_string(),
            difficulty: "ffffffff".to_string(),
            no_pre_mine: "e8a195800b".to_string(),
            latest_submission: "abc123".to_string(),
            no_pre_mine_hour: "def456".to_string(),
        };

        let nonce = "0000000000000001";
        let address = "addr1test123";

        let preimage = build_preimage(nonce, address, &challenge);

        let expected = "0000000000000001addr1test123**D07C10ffffffffe8a195800babc123def456";
        assert_eq!(preimage, expected);
    }

    #[test]
    fn test_build_preimage_different_nonce() {
        let challenge = ChallengeData {
            challenge_id: "**D07C10".to_string(),
            difficulty: "fffffffe".to_string(),
            no_pre_mine: "123456789a".to_string(),
            latest_submission: "submit1".to_string(),
            no_pre_mine_hour: "hour1".to_string(),
        };

        let nonce = "00000000deadbeef";
        let address = "addr1xyz";

        let preimage = build_preimage(nonce, address, &challenge);

        assert!(preimage.starts_with(nonce));
        assert!(preimage.contains(address));
        assert!(preimage.contains(&challenge.challenge_id));
    }
}
