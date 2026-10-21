use k256::ecdsa::SigningKey;
use rand::rngs::OsRng;
use tiny_keccak::{Hasher, Keccak};

pub const PATTERN_HEX_LEN: usize = 4;
const MAX_INIT_CODE: usize = 128 * 1024;

#[derive(Clone, Debug)]
pub struct SearchPlan {
    pub prefix: [u8; 2],
    pub suffix: [u8; 2],
    pub prefix_hex: String,
    pub suffix_hex: String,
    pub init_code: Vec<u8>,
    pub init_hash: [u8; 32],
    pub using_shell: bool,
}

#[derive(Clone, Debug)]
pub struct Deployer {
    pub private_key: [u8; 32],
    pub address: [u8; 20],
    pub factory: [u8; 20],
}

pub fn factory_bytecode() -> &'static [u8] {
    static CODE: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    CODE.get_or_init(|| {
        hex::decode(include_str!("../contracts/Create2Factory.bin").trim())
            .expect("factory bytecode")
    })
}

pub fn shell_bytecode() -> &'static [u8] {
    static CODE: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
    CODE.get_or_init(|| {
        hex::decode(include_str!("../contracts/MintShell.bin").trim()).expect("shell bytecode")
    })
}

#[inline]
pub fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(data);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

pub fn create2_address(factory: &[u8; 20], salt: &[u8; 32], init_hash: &[u8; 32]) -> [u8; 20] {
    let mut buf = [0u8; 85];
    buf[0] = 0xff;
    buf[1..21].copy_from_slice(factory);
    buf[21..53].copy_from_slice(salt);
    buf[53..85].copy_from_slice(init_hash);
    let hash = keccak256(&buf);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    address
}

/// Address of the contract created by `sender` at nonce 0.
pub fn create_address_nonce0(sender: &[u8; 20]) -> [u8; 20] {
    let mut buf = [0u8; 23];
    buf[0] = 0xd6;
    buf[1] = 0x94;
    buf[2..22].copy_from_slice(sender);
    buf[22] = 0x80;
    let hash = keccak256(&buf);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    address
}

pub fn address_from_key(key_bytes: &[u8; 32]) -> [u8; 20] {
    let key = SigningKey::from_slice(key_bytes).expect("private key");
    let point = key.verifying_key().to_encoded_point(false);
    let hash = keccak256(&point.as_bytes()[1..]);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    address
}

pub fn random_deployer() -> Deployer {
    let key = SigningKey::random(&mut OsRng);
    let mut private_key = [0u8; 32];
    let key_bytes = key.to_bytes();
    private_key.copy_from_slice(key_bytes.as_ref());
    let address = address_from_key(&private_key);
    let factory = create_address_nonce0(&address);
    Deployer {
        private_key,
        address,
        factory,
    }
}

pub fn to_checksum(address: &[u8; 20]) -> String {
    let lower = hex::encode(address);
    let hash = keccak256(lower.as_bytes());
    let mut out = String::with_capacity(42);
    out.push_str("0x");
    for (i, ch) in lower.chars().enumerate() {
        let nibble = if i % 2 == 0 {
            hash[i / 2] >> 4
        } else {
            hash[i / 2] & 0x0f
        };
        if nibble >= 8 {
            out.push(ch.to_ascii_uppercase());
        } else {
            out.push(ch);
        }
    }
    out
}

pub fn prepare_search(prefix: &str, suffix: &str, init_code: &str) -> Result<SearchPlan, String> {
    let (prefix_bytes, prefix_hex) = parse_pattern(prefix, "First 4")?;
    let (suffix_bytes, suffix_hex) = parse_pattern(suffix, "Last 4")?;
    let pasted = decode_init_code(init_code)?;
    let using_shell = pasted.is_empty();
    let init_code = if using_shell {
        shell_bytecode().to_vec()
    } else {
        pasted
    };
    if init_code.len() > MAX_INIT_CODE {
        return Err("Creation bytecode is too large (max 128 KB).".into());
    }
    Ok(SearchPlan {
        prefix: prefix_bytes,
        suffix: suffix_bytes,
        prefix_hex,
        suffix_hex,
        init_hash: keccak256(&init_code),
        init_code,
        using_shell,
    })
}

pub fn encode_deploy_calldata(salt: &[u8; 32], init_code: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + 96 + init_code.len() + 32);
    out.extend_from_slice(&hex::decode("cdcb760a").unwrap());
    out.extend_from_slice(salt);
    out.extend_from_slice(&[0u8; 31]);
    out.push(0x40);
    let mut len_word = [0u8; 32];
    len_word[24..].copy_from_slice(&(init_code.len() as u64).to_be_bytes());
    out.extend_from_slice(&len_word);
    out.extend_from_slice(init_code);
    let padded = init_code.len().div_ceil(32) * 32;
    out.resize(out.len() + (padded - init_code.len()), 0);
    out
}

fn parse_pattern(input: &str, label: &str) -> Result<([u8; 2], String), String> {
    let trimmed = input.trim();
    let body = if trimmed.len() >= 2 && trimmed[..2].eq_ignore_ascii_case("0x") {
        &trimmed[2..]
    } else {
        trimmed
    };
    let hexchars: String = body.chars().filter(|c| !c.is_whitespace()).collect();
    if hexchars.len() != PATTERN_HEX_LEN || !hexchars.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "{label} must be exactly 4 hex characters (0-9 or a-f). 0x is not counted."
        ));
    }
    let lower = hexchars.to_ascii_lowercase();
    let bytes = hex::decode(&lower).map_err(|_| format!("{label} is not hex."))?;
    Ok(([bytes[0], bytes[1]], lower))
}

fn decode_init_code(input: &str) -> Result<Vec<u8>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("0x") {
        return Ok(Vec::new());
    }
    let body = if trimmed.len() >= 2 && trimmed[..2].eq_ignore_ascii_case("0x") {
        &trimmed[2..]
    } else {
        trimmed
    };
    let hexchars: String = body.chars().filter(|c| !c.is_whitespace()).collect();
    if hexchars.is_empty() {
        return Ok(Vec::new());
    }
    if hexchars.len() % 2 != 0 || !hexchars.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(
            "Creation bytecode must be hex. Paste the compiler's creation bytecode, not source code."
                .into(),
        );
    }
    hex::decode(&hexchars).map_err(|_| "Creation bytecode must be hex.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_keccak_and_selector() {
        assert_eq!(
            hex::encode(keccak256(b"")),
            "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
        );
        assert_eq!(
            hex::encode(&keccak256(b"deploy(bytes32,bytes)")[..4]),
            "cdcb760a"
        );
    }

    #[test]
    fn key_one_and_factory_match_independent_vectors() {
        let mut key = [0u8; 32];
        key[31] = 1;
        let address = address_from_key(&key);
        assert_eq!(
            hex::encode(address),
            "7e5f4552091a69125d5dfcb7b8c2659029395bdf"
        );
        let factory = create_address_nonce0(&address);
        assert_eq!(
            hex::encode(factory),
            "f2e246bb76df876cef8b38ae84130f4f55de395b"
        );
        let mut salt = [0u8; 32];
        salt[31] = 7;
        let init_hash = keccak256(shell_bytecode());
        assert_eq!(
            hex::encode(init_hash),
            "4186f9b1dd04a79304823d6512bc45034a69b8d6851a8012be3dcfd36f9df268"
        );
        assert_eq!(
            hex::encode(create2_address(&factory, &salt, &init_hash)),
            "377ffe43573d8af4133060f52c48fd51e1965011"
        );
    }

    #[test]
    fn checksum_known_address() {
        let raw = hex::decode("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed").unwrap();
        let mut address = [0u8; 20];
        address.copy_from_slice(&raw);
        assert_eq!(
            to_checksum(&address),
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
        );
    }

    #[test]
    fn pattern_ignores_0x_and_rejects_short_or_non_hex() {
        let (bytes, text) = parse_pattern("0x3489", "First 4").unwrap();
        assert_eq!(text, "3489");
        assert_eq!(bytes, [0x34, 0x89]);
        assert!(parse_pattern("348", "First 4").is_err());
        assert!(parse_pattern("348g", "First 4").is_err());
        assert!(parse_pattern("0x", "Last 4").is_err());
    }

    #[test]
    fn empty_bytecode_uses_shell_and_calldata_starts_with_selector() {
        let plan = prepare_search("abcd", "8db4", "").unwrap();
        assert!(plan.using_shell);
        assert_eq!(plan.init_code, shell_bytecode());
        let salt = [9u8; 32];
        let data = encode_deploy_calldata(&salt, &plan.init_code);
        assert_eq!(&data[..4], &hex::decode("cdcb760a").unwrap()[..]);
        assert_eq!(&data[4..36], &salt);
    }
}
