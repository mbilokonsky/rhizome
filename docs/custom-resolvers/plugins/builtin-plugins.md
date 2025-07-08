# Built-in Plugins

## Overview

The Custom Resolver system includes several built-in plugins that implement common resolution strategies. These can be used directly or as examples for creating custom plugins.

## Available Plugins

### Last Write Wins

Keeps the most recent value based on timestamp.

```typescript
const resolver = new CustomResolver(view, {
  myProperty: new LastWriteWinsPlugin()
});
```

### First Write Wins

Keeps the first non-null value seen.

```typescript
const resolver = new CustomResolver(view, {
  myProperty: new FirstWriteWinsPlugin()
});
```

### Concatenation

Combines string values with a separator.

```typescript
const resolver = new CustomResolver(view, {
  fullName: new ConcatenationPlugin({
    separator: ' ',
    sort: true  // Sort values before concatenation
  })
});
```

### Majority Vote

Selects the most common value.

```typescript
const resolver = new CustomResolver(view, {
  status: new MajorityVotePlugin({
    minVotes: 2  // Minimum votes required to select a winner
  })
});
```

### Minimum Value

Tracks the minimum numeric value.

```typescript
const resolver = new CustomResolver(view, {
  minPrice: new MinPlugin()
});
```

### Maximum Value

Tracks the maximum numeric value.

```typescript
const resolver = new CustomResolver(view, {
  maxScore: new MaxPlugin()
});
```

## Plugin Options

| Plugin | Options | Default | Description |
|--------|---------|---------|-------------|
| `ConcatenationPlugin` | `separator: string`<br>`sort: boolean` | `', '`<br>`false` | Separator between values and whether to sort |
| `MajorityVotePlugin` | `minVotes: number` | `1` | Minimum votes needed to select a winner |
| `LastWriteWins`<br>`FirstWriteWins`<br>`MinPlugin`<br>`MaxPlugin` | None | N/A | No configuration options |

## Choosing the Right Plugin

- Use `LastWriteWins` for simple timestamp-based resolution
- Use `FirstWriteWins` to preserve the initial value
- Use `ConcatenationPlugin` for combining string values
- Use `MajorityVote` for consensus-based resolution
- Use `MinPlugin`/`MaxPlugin` for numeric ranges
