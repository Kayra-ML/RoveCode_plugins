# Async & Concurrency

## Tokio Basics

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let result = fetch_data().await?;
    println!("{result}");
    Ok(())
}

// Concurrent tasks
let (a, b) = tokio::join!(fetch_a(), fetch_b());

// Spawn independent task
let handle = tokio::spawn(async move {
    heavy_computation().await
});
let result = handle.await?;
```

## Channel Patterns

```rust
// mpsc: one sender, one receiver (or clone sender for multiple)
let (tx, mut rx) = tokio::sync::mpsc::channel::<Message>(32);

// oneshot: single response
let (tx, rx) = tokio::sync::oneshot::channel::<Response>();

// broadcast: multiple receivers
let (tx, _rx) = tokio::sync::broadcast::channel::<Event>(64);
```

## Avoiding Common Pitfalls

**Don't block in async**: Never use `std::thread::sleep`, `std::fs`, blocking I/O inside async fn.
```rust
// Wrong
tokio::spawn(async { std::thread::sleep(Duration::from_secs(1)); });

// Right
tokio::spawn(async { tokio::time::sleep(Duration::from_secs(1)).await; });
```

**CPU-bound work**: Offload to `tokio::task::spawn_blocking`:
```rust
let result = tokio::task::spawn_blocking(|| {
    heavy_cpu_computation()
}).await?;
```

## Select for Racing

```rust
tokio::select! {
    result = fetch() => handle(result),
    _ = tokio::time::sleep(timeout) => Err(anyhow!("Timed out")),
}
```