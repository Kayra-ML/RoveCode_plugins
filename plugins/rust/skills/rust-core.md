# Rust Core

## Idiomatic Rust Style

Rust code should be expressive, not verbose. Prefer:
```rust
// Idiomatic
let doubled: Vec<_> = numbers.iter().map(|n| n * 2).collect();
let total: i32 = numbers.iter().sum();

// Avoid
let mut doubled = Vec::new();
for n in &numbers { doubled.push(n * 2); }
```

## Trait-First Design

Design around traits, not inheritance:
```rust
trait Processable {
    fn process(&self) -> Result<Output, ProcessError>;
    fn name(&self) -> &str;
}

// Implement for multiple types
impl Processable for FileInput { ... }
impl Processable for NetworkInput { ... }
```

## Pattern Matching

Exhaust variants explicitly:
```rust
match result {
    Ok(value) => handle_success(value),
    Err(ProcessError::NotFound(path)) => eprintln!("Not found: {path}"),
    Err(ProcessError::Permission(msg)) => eprintln!("Permission denied: {msg}"),
    Err(e) => return Err(e.into()),
}
```

## Common Idioms

```rust
// Option chaining
let name = config.user.as_ref().map(|u| u.name.as_str()).unwrap_or("anonymous");

// if let for single variant
if let Some(config) = maybe_config { use_config(config); }

// Struct update syntax
let new_config = Config { timeout: 30, ..config };

// Entry API for HashMap
map.entry(key).or_insert_with(|| default_value());
```