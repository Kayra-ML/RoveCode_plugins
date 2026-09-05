# Rust Performance

## Measure First

Profile before optimizing. Tools:
- `cargo flamegraph` for CPU profiling
- `heaptrack` for allocation profiling  
- `criterion` for micro-benchmarks
- `cargo bench` for integrated benchmarks

## Allocation Reduction

```rust
// Reuse buffers
let mut buf = Vec::with_capacity(expected_size);
for item in items { 
    buf.clear();
    write_to(&mut buf, item);
    process(&buf);
}

// Avoid small heap allocations in hot paths
// Use SmallVec or stack-allocated arrays for small collections
use smallvec::SmallVec;
let v: SmallVec<[u8; 32]> = SmallVec::new();
```

## Iterator Efficiency

Iterators are zero-cost abstractions — use them:
```rust
// This compiles to the same code as a manual loop
let sum: i64 = data.iter()
    .filter(|&&x| x > 0)
    .map(|&x| x as i64)
    .sum();
```

## Compiler Hints

```rust
#[inline]          // suggest inlining
#[inline(always)]  // force inlining (use sparingly)
#[cold]            // hint: this function is rarely called

// Release mode optimizations
// Cargo.toml
[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
```

## String Performance

```rust
// Avoid repeated allocations
let mut s = String::with_capacity(256);
for part in parts { s.push_str(part); }

// Cow for borrowed-or-owned
use std::borrow::Cow;
fn process(input: Cow<str>) -> String { ... }
```