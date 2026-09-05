# Ownership & Borrowing

## The Rules

1. Each value has exactly one owner
2. When owner goes out of scope, value is dropped
3. Multiple immutable references OR one mutable reference at a time (not both)
4. References must not outlive their referents

## Common Patterns

```rust
// Shared ownership
use std::rc::Rc;         // single-threaded
use std::sync::Arc;      // multi-threaded

// Interior mutability
use std::cell::RefCell;  // single-threaded runtime borrow check
use std::sync::Mutex;    // multi-threaded

// Common combo
type Shared<T> = Arc<Mutex<T>>;
```

## Lifetime Annotations

```rust
// Explicit when compiler can't infer
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Struct holding references
struct Parser<'a> {
    input: &'a str,
    position: usize,
}
```

## Common Borrow Errors and Fixes

**Cannot borrow as mutable because it is also borrowed as immutable**:
```rust
// Problem
let first = &vec[0];
vec.push(item); // ERROR: vec is borrowed

// Fix: don't hold borrow across mutation
let first = vec[0].clone();
vec.push(item);
```

**Does not live long enough**:
Usually means: return owned data instead of references, or restructure lifetimes.

## Clone vs Copy

`Copy`: implicit copy, only for stack-only types (integers, bool, char, fixed arrays).
`Clone`: explicit `.clone()`, for heap data. Make it obvious — `.clone()` is a cost signal.