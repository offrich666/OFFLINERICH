use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::unix::fs::OpenOptionsExt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Deserialize;
use serde::Serialize;

use crate::crypto::{
    encode_deploy_calldata, factory_bytecode, prepare_search, random_deployer, to_checksum,
    Deployer, SearchPlan,
};
use crate::grind::grind;

const INDEX: &str = include_str!("../static/index.html");
const PORT: u16 = 4173;
const SEARCH_SPACE: f64 = 4_294_967_296.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReserveRequest {
    prefix: String,
    suffix: String,
    #[serde(default)]
    init_code: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reservation {
    address: String,
    salt: String,
    deployer_address: String,
    deployer_key: String,
    factory_address: String,
    factory_bytecode: String,
    init_code_hash: String,
    init_code_bytes: usize,
    using_shell: bool,
    deploy_calldata: String,
    attempts: u64,
    elapsed_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusBody {
    state: &'static str,
    id: Option<u64>,
    attempts: u64,
    elapsed_ms: u64,
    rate: f64,
    eta_seconds: Option<u64>,
    prefix: Option<String>,
    suffix: Option<String>,
    deployer_address: Option<String>,
    factory_address: Option<String>,
    using_shell: Option<bool>,
    init_code_hash: Option<String>,
    init_code_bytes: Option<usize>,
    result: Option<Reservation>,
}

struct Job {
    id: u64,
    stop: Arc<AtomicBool>,
    attempts: Arc<AtomicU64>,
    started: Instant,
    finished: AtomicBool,
    prefix: String,
    suffix: String,
    deployer_address: String,
    factory_address: String,
    using_shell: bool,
    init_code_hash: String,
    init_code_bytes: usize,
    result: Mutex<Option<Reservation>>,
}

struct Shared {
    next_id: AtomicU64,
    current: Mutex<Option<Arc<Job>>>,
    latest: Mutex<Option<Reservation>>,
}

pub fn serve() -> std::io::Result<()> {
    let state = Arc::new(Shared {
        next_id: AtomicU64::new(1),
        current: Mutex::new(None),
        latest: Mutex::new(load_latest()),
    });
    let listener = TcpListener::bind(("127.0.0.1", PORT))?;
    println!("Reserve mint address at http://127.0.0.1:{PORT}");
    for conn in listener.incoming() {
        let Ok(stream) = conn else { continue };
        let state = state.clone();
        std::thread::spawn(move || {
            if let Err(err) = handle(stream, state) {
                eprintln!("request error: {err}");
            }
        });
    }
    Ok(())
}

fn handle(mut stream: TcpStream, state: Arc<Shared>) -> std::io::Result<()> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(15)));
    let (header, body) = match read_http(&mut stream) {
        Ok(parts) => parts,
        Err(err) => {
            return write_bytes(&mut stream, "400 Bad Request", "text/plain", err.as_bytes());
        }
    };
    let mut lines = header.lines();
    let Some(request) = lines.next() else {
        return write_bytes(&mut stream, "400 Bad Request", "text/plain", b"empty request");
    };
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
    let response = route(method, path, &body, &state);
    write_bytes(&mut stream, response.status, response.content_type, &response.body)
}

struct HttpOut {
    status: &'static str,
    content_type: &'static str,
    body: Vec<u8>,
}

fn route(method: &str, path: &str, body: &[u8], state: &Arc<Shared>) -> HttpOut {
    match (method, path) {
        ("GET", "/") => HttpOut {
            status: "200 OK",
            content_type: "text/html; charset=utf-8",
            body: INDEX.as_bytes().to_vec(),
        },
        ("GET", "/health") => HttpOut {
            status: "200 OK",
            content_type: "text/plain",
            body: b"ok".to_vec(),
        },
        ("GET", "/api/status") => json_ok(&status_of(state)),
        ("POST", "/api/reserve") => match serde_json::from_slice::<ReserveRequest>(body) {
            Ok(req) => match start_job(state, req) {
                Ok(status) => json_ok(&status),
                Err(message) => json_err(&message),
            },
            Err(_) => json_err("Send prefix, suffix, and optional initCode as JSON."),
        },
        ("POST", "/api/stop") => {
            if let Some(job) = state.current.lock().unwrap().clone() {
                job.stop.store(true, Ordering::Relaxed);
            }
            json_ok(&status_of(state))
        }
        _ => HttpOut {
            status: "404 Not Found",
            content_type: "text/plain",
            body: b"not found".to_vec(),
        },
    }
}

fn start_job(state: &Arc<Shared>, req: ReserveRequest) -> Result<StatusBody, String> {
    let plan = prepare_search(&req.prefix, &req.suffix, &req.init_code)?;
    let deployer = random_deployer();
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(AtomicBool::new(false));
    let attempts = Arc::new(AtomicU64::new(0));
    let job = Arc::new(Job {
        id,
        stop: stop.clone(),
        attempts: attempts.clone(),
        started: Instant::now(),
        finished: AtomicBool::new(false),
        prefix: plan.prefix_hex.clone(),
        suffix: plan.suffix_hex.clone(),
        deployer_address: to_checksum(&deployer.address),
        factory_address: to_checksum(&deployer.factory),
        using_shell: plan.using_shell,
        init_code_hash: format!("0x{}", hex::encode(plan.init_hash)),
        init_code_bytes: plan.init_code.len(),
        result: Mutex::new(None),
    });
    {
        let mut current = state.current.lock().unwrap();
        if let Some(old) = current.take() {
            old.stop.store(true, Ordering::Relaxed);
        }
        *current = Some(job.clone());
    }
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let state_for_search = Arc::clone(state);
    std::thread::spawn(move || {
        let found = grind(
            deployer.factory,
            plan.init_hash,
            &plan.prefix,
            &plan.suffix,
            threads,
            &attempts,
            &stop,
        );
        if let Some((salt, address)) = found {
            let reservation = reservation_from(plan, deployer, salt, address, &job);
            save_reservation(&reservation);
            *job.result.lock().unwrap() = Some(reservation.clone());
            let still_current = state_for_search
                .current
                .lock()
                .unwrap()
                .as_ref()
                .map(|current| current.id)
                == Some(job.id);
            if still_current {
                *state_for_search.latest.lock().unwrap() = Some(reservation);
            }
        }
        job.finished.store(true, Ordering::Relaxed);
    });
    Ok(status_of(state))
}

fn reservation_from(
    plan: SearchPlan,
    deployer: Deployer,
    salt: [u8; 32],
    address: [u8; 20],
    job: &Job,
) -> Reservation {
    Reservation {
        address: to_checksum(&address),
        salt: format!("0x{}", hex::encode(salt)),
        deployer_address: to_checksum(&deployer.address),
        deployer_key: format!("0x{}", hex::encode(deployer.private_key)),
        factory_address: to_checksum(&deployer.factory),
        factory_bytecode: format!("0x{}", hex::encode(factory_bytecode())),
        init_code_hash: format!("0x{}", hex::encode(plan.init_hash)),
        init_code_bytes: plan.init_code.len(),
        using_shell: plan.using_shell,
        deploy_calldata: format!("0x{}", hex::encode(encode_deploy_calldata(&salt, &plan.init_code))),
        attempts: job.attempts.load(Ordering::Relaxed),
        elapsed_ms: job.started.elapsed().as_millis() as u64,
    }
}

fn status_of(state: &Shared) -> StatusBody {
    if let Some(job) = state.current.lock().unwrap().clone() {
        let running = !job.finished.load(Ordering::Relaxed);
        let found = job.result.lock().unwrap().is_some();
        if running || found || state.latest.lock().unwrap().is_none() {
            return job_status(&job);
        }
    }
    if let Some(result) = state.latest.lock().unwrap().clone() {
        return StatusBody {
            state: "found",
            id: None,
            attempts: result.attempts,
            elapsed_ms: result.elapsed_ms,
            rate: 0.0,
            eta_seconds: None,
            prefix: None,
            suffix: None,
            deployer_address: Some(result.deployer_address.clone()),
            factory_address: Some(result.factory_address.clone()),
            using_shell: Some(result.using_shell),
            init_code_hash: Some(result.init_code_hash.clone()),
            init_code_bytes: Some(result.init_code_bytes),
            result: Some(result),
        };
    }
    idle_status()
}

fn job_status(job: &Job) -> StatusBody {
    let attempts = job.attempts.load(Ordering::Relaxed);
    let elapsed_ms = job.started.elapsed().as_millis().max(1) as u64;
    let rate = attempts as f64 / (elapsed_ms as f64 / 1000.0);
    let result = job.result.lock().unwrap().clone();
    let state = if result.is_some() {
        "found"
    } else if job.finished.load(Ordering::Relaxed) {
        "stopped"
    } else {
        "running"
    };
    let eta_seconds = if state == "running" && rate > 1.0 {
        Some((SEARCH_SPACE / rate) as u64)
    } else {
        None
    };
    StatusBody {
        state,
        id: Some(job.id),
        attempts,
        elapsed_ms,
        rate,
        eta_seconds,
        prefix: Some(job.prefix.clone()),
        suffix: Some(job.suffix.clone()),
        deployer_address: Some(job.deployer_address.clone()),
        factory_address: Some(job.factory_address.clone()),
        using_shell: Some(job.using_shell),
        init_code_hash: Some(job.init_code_hash.clone()),
        init_code_bytes: Some(job.init_code_bytes),
        result,
    }
}

fn idle_status() -> StatusBody {
    StatusBody {
        state: "idle",
        id: None,
        attempts: 0,
        elapsed_ms: 0,
        rate: 0.0,
        eta_seconds: None,
        prefix: None,
        suffix: None,
        deployer_address: None,
        factory_address: None,
        using_shell: None,
        init_code_hash: None,
        init_code_bytes: None,
        result: None,
    }
}

fn load_latest() -> Option<Reservation> {
    let text = fs::read_to_string("reservations/latest.json").ok()?;
    serde_json::from_str(&text).ok()
}

fn save_reservation(reservation: &Reservation) {
    let dir = "reservations";
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let path = format!("{dir}/found.jsonl");
    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .open(path)
    else {
        return;
    };
    if let Ok(line) = serde_json::to_string(reservation) {
        let _ = writeln!(file, "{line}");
    }
    if let Ok(mut latest) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(format!("{dir}/latest.json"))
    {
        if let Ok(body) = serde_json::to_string_pretty(reservation) {
            let _ = latest.write_all(body.as_bytes());
        }
    }
}

fn json_ok<T: Serialize>(value: &T) -> HttpOut {
    HttpOut {
        status: "200 OK",
        content_type: "application/json",
        body: serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec()),
    }
}

fn json_err(message: &str) -> HttpOut {
    HttpOut {
        status: "400 Bad Request",
        content_type: "application/json",
        body: serde_json::to_vec(&serde_json::json!({ "error": message }))
            .unwrap_or_else(|_| b"{}".to_vec()),
    }
}

fn write_bytes(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    Ok(())
}

fn read_http(stream: &mut TcpStream) -> Result<(String, Vec<u8>), String> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 8192];
    loop {
        let n = stream.read(&mut tmp).map_err(|err| err.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.len() > 400_000 {
            return Err("request is too large".into());
        }
        if let Some(header_end) = find_header_end(&buf) {
            let header = String::from_utf8_lossy(&buf[..header_end]).into_owned();
            let length = content_length(&header);
            if buf.len() >= header_end + length {
                let body = buf[header_end..header_end + length].to_vec();
                return Ok((header, body));
            }
        }
    }
    Err("incomplete request".into())
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn content_length(header: &str) -> usize {
    header
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse().ok()
            } else {
                None
            }
        })
        .unwrap_or(0)
}
