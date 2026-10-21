fn main() {
    if let Err(err) = vanity_mint::server::serve() {
        eprintln!("reserve mint address failed: {err}");
        std::process::exit(1);
    }
}
