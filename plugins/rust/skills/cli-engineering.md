# CLI Engineering

## Clap Setup

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "tool", about = "Description", version)]
struct Cli {
    /// Global verbosity flag
    #[arg(short, long, global = true)]
    verbose: bool,
    
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the main operation
    Run {
        #[arg(short, long)]
        input: PathBuf,
        #[arg(short, long, default_value = "output")]
        output: PathBuf,
    },
    /// Show current configuration
    Config,
}
```

## Output Strategy

```rust
// Use eprintln! for status/progress (stderr)
eprintln!("[info] Processing {count} files...");

// Use println! for actual output (stdout)
println!("{}", serde_json::to_string_pretty(&result)?);

// Never mix data and status on the same stream
```

## Exit Codes

```rust
fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {e:#}");
        std::process::exit(1);
    }
}
```

## Configuration Priority

Highest to lowest: CLI flags → Environment variables → Config file → Defaults

```rust
let config = Config {
    timeout: cli.timeout
        .or_else(|| env::var("TOOL_TIMEOUT").ok().and_then(|v| v.parse().ok()))
        .unwrap_or(30),
};
```