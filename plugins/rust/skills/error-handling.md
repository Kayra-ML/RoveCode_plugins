# Error Handling

## Result-First Design

All fallible operations return `Result<T, E>`. Use `?` for propagation:
```rust
fn load_config(path: &Path) -> Result<Config, ConfigError> {
    let text = fs::read_to_string(path)?;
    let config: Config = toml::from_str(&text)?;
    Ok(config)
}
```

## Custom Error Types (thiserror)

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Not found: {path}")]
    NotFound { path: PathBuf },
    
    #[error("Invalid input: {message}")]
    InvalidInput { message: String },
}
```

## Application Code (anyhow)

For binary/application code where error type flexibility matters more than structured handling:
```rust
use anyhow::{Context, Result};

fn run() -> Result<()> {
    let config = load_config()
        .context("Failed to load configuration")?;
    Ok(())
}
```

## Never Panic in Library Code

- No `unwrap()` in library functions (use `expect()` only for truly impossible states)
- No `panic!()` except for programmer errors (violated invariants)
- Validate inputs and return errors

## Panic vs Error

| Situation | Use |
|-----------|-----|
| Input can validly fail | `Result<T, E>` |
| Programmer error / invariant | `panic!` |
| Impossible state | `unreachable!` |
| Not yet implemented | `todo!` |