# Mantle Lit

A lightweight library for building Lit web components with a simpler class-based API and MobX reactivity built in.

## Installation

```bash
npm install mantle-lit
```

Requires Lit 3+ and MobX 6+.

## Basic Example

```ts
import { View, createView } from 'mantle-lit';
import { html } from 'lit';

interface CounterProps {
  initial: number;
}

class CounterView extends View<CounterProps> {
  count = 0;

  onCreate() {
    this.count = this.props.initial;
  }

  increment() {
    this.count++;
  }

  render() {
    return html`
      <button @click=${this.increment}>
        Count: ${this.count}
      </button>
    `;
  }
}

export const Counter = createView(CounterView, { tag: 'x-counter' });
```

**Usage in HTML (property binding with `.`):**
```html
<x-counter .initial=${5}></x-counter>
```

**Everything is reactive by default.** All properties become observable, getters become computed, and methods become auto-bound actions. No annotations needed.

> Want explicit control? See [Decorators](#decorators) below to opt into manual annotations.

## Property Binding

This library is designed for **property binding** (`.prop=${value}`) rather than attribute binding (`attr="value"`). This allows passing complex objects, arrays, and functions as props.

```ts
// Parent component
render() {
  return html`
    <x-todo-list 
      .items=${this.todos}
      .onDelete=${this.handleDelete}
    ></x-todo-list>
  `;
}
```

## What You Get

**Direct mutation:**
```ts
this.items.push(item);  // not [...items, item]
```

**Computed values via getters:**
```ts
get completed() {       // automatically memoized
  return this.items.filter(i => i.done);
}
```

**Stable methods (auto-bound):**
```ts
toggle(id: number) {    // automatically bound to this
  const item = this.items.find(i => i.id === id);
  if (item) item.done = !item.done;
}

// use directly, no wrapper needed
render() {
  return html`<button @click=${this.toggle}>Toggle</button>`;
}
```

**React to changes explicitly:**
```ts
onCreate() {
  this.watch(
    () => this.props.filter,
    (filter) => this.applyFilter(filter)
  );
}
```

## Lifecycle

| Method | When |
|--------|------|
| `onCreate()` | Instance created, props available |
| `onMount()` | Component connected to DOM. Return a cleanup function (optional). |
| `onUnmount()` | Component disconnected from DOM. Called after cleanups (optional). |
| `render()` | On mount and updates. Return Lit `TemplateResult`. |

### Watching State

Use `this.watch` to react to state changes. Watchers are automatically disposed on unmount.

```ts
this.watch(
  () => expr,           // reactive expression (getter)
  (value, prev) => {},  // callback when expression result changes
  options?              // optional: { delay, fireImmediately }
)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delay` | `number` | — | Debounce the callback by N milliseconds |
| `fireImmediately` | `boolean` | `false` | Run callback immediately with current value |

**Basic example:**

```ts
class SearchView extends View<Props> {
  query = '';
  results: string[] = [];

  onCreate() {
    this.watch(
      () => this.query,
      async (query) => {
        if (query.length > 2) {
          this.results = await searchApi(query);
        }
      },
      { delay: 300 }
    );
  }
}
```

**Multiple watchers:**

```ts
onCreate() {
  this.watch(() => this.props.filter, (filter) => this.applyFilter(filter));
  this.watch(() => this.props.sort, (sort) => this.applySort(sort));
  this.watch(() => this.props.page, (page) => this.fetchPage(page));
}
```

**Early disposal:**

```ts
onCreate() {
  const stop = this.watch(() => this.props.token, (token) => {
    this.authenticate(token);
    stop(); // only needed once
  });
}
```

`this.watch` wraps MobX's `reaction` with automatic lifecycle disposal. For advanced MobX patterns (`autorun`, `when`, custom schedulers), use `reaction` directly and return a dispose function from `onMount`.

### Props Reactivity

`this.props` is reactive: your component re-renders when accessed props change.

**Option 1: `this.watch`** — the recommended way to react to state changes:

```ts
onCreate() {
  this.watch(
    () => this.props.filter,
    (filter) => this.applyFilter(filter)
  );
}
```

Watchers are automatically disposed on unmount. No cleanup needed.

**Option 2: `reaction`** — for advanced MobX patterns (autorun, when, custom schedulers):

```ts
onMount() {
  return reaction(
    () => this.props.filter,
    (filter) => this.applyFilter(filter)
  );
}
```

Or access props directly in `render()` and MobX handles re-renders when they change.

## Patterns

### Combined (default)

State, logic, and template in one class:

```ts
import { View, createView } from 'mantle-lit';
import { html } from 'lit';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  todos: TodoItem[] = [];
  input = '';

  add() {
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  setInput(e: Event) {
    this.input = (e.target as HTMLInputElement).value;
  }

  render() {
    return html`
      <div>
        <input .value=${this.input} @input=${this.setInput} />
        <button @click=${this.add}>Add</button>
        <ul>${this.todos.map(t => html`<li>${t.text}</li>`)}</ul>
      </div>
    `;
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });
```

### Separated

ViewModel and template separate:

```ts
import { ViewModel, createView } from 'mantle-lit';
import { html } from 'lit';

class TodoViewModel extends ViewModel {
  todos: TodoItem[] = [];
  input = '';

  add() {
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  setInput(e: Event) {
    this.input = (e.target as HTMLInputElement).value;
  }
}

// Template as a separate function
const template = (vm: TodoViewModel) => html`
  <div>
    <input .value=${vm.input} @input=${vm.setInput} />
    <button @click=${vm.add}>Add</button>
    <ul>${vm.todos.map(t => html`<li>${t.text}</li>`)}</ul>
  </div>
`;

// Note: For separated templates, extend the View class with a render method
// that calls the template function
class TodoView extends TodoViewModel {
  render() {
    return template(this);
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });
```

## Decorators

For teams that prefer explicit annotations over auto-observable, Mantle provides its own decorators. These are lightweight metadata collectors. No `accessor` keyword required.

```ts
import { View, createView, observable, action, computed } from 'mantle-lit';
import { html } from 'lit';

class TodoView extends View {
  @observable todos: TodoItem[] = [];
  @observable input = '';

  @computed get remaining() {
    return this.todos.filter(t => !t.done).length;
  }

  @action add() {
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  render() {
    return html`<!-- ... -->`;
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });
```

**Key differences from auto-observable mode:**
- Only decorated fields are reactive (undecorated fields are inert)
- Methods are still auto-bound for stable `this` references

### Available Decorators

| Decorator | Purpose |
|-----------|---------|
| `@observable` | Deep observable field |
| `@observable.ref` | Reference-only observation |
| `@observable.shallow` | Shallow observation (add/remove only) |
| `@observable.struct` | Structural equality comparison |
| `@action` | Action method (auto-bound) |
| `@computed` | Computed getter (optional; getters are computed by default) |

### MobX Decorators (Legacy)

If you prefer using MobX's own decorators (requires `accessor` keyword for TC39):

```ts
import { observable, action } from 'mobx';
import { configure } from 'mantle-lit';

// Disable auto-observable globally
configure({ autoObservable: false });

class TodoView extends View {
  @observable accessor todos: TodoItem[] = [];  // note: accessor required
  @action add() { /* ... */ }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });
```

Note: `this.props` is always reactive regardless of decorator mode.

## Error Handling

Render errors propagate to the browser as usual. Lifecycle errors (`onMount`, `onUnmount`, `watch`) in both Views and Behaviors are caught and routed through a configurable handler.

By default, errors are logged to `console.error`. Configure a global handler to integrate with your error reporting:

```ts
import { configure } from 'mantle-lit';

configure({
  onError: (error, context) => {
    // context.phase: 'onCreate' | 'onMount' | 'onUnmount' | 'watch'
    // context.name: class name of the View or Behavior
    // context.isBehavior: true if the error came from a Behavior
    Sentry.captureException(error, {
      tags: { phase: context.phase, component: context.name },
    });
  },
});
```

Behavior errors are isolated. A failing Behavior won't prevent sibling Behaviors or the parent View from mounting.

## Behaviors (Experimental)

> ⚠️ **Experimental:** The Behaviors API is still evolving and may change in future releases.

Behaviors are reusable pieces of state and logic that can be shared across views. Define them as classes, wrap with `createBehavior()`, and use the resulting factory function in your Views.

### Defining a Behavior

```ts
import { Behavior, createBehavior } from 'mantle-lit';

class WindowSizeBehavior extends Behavior {
  width = window.innerWidth;
  height = window.innerHeight;
  breakpoint!: number;

  onCreate(breakpoint = 768) {
    this.breakpoint = breakpoint;
  }

  get isMobile() {
    return this.width < this.breakpoint;
  }

  handleResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  onMount() {
    window.addEventListener('resize', this.handleResize);
    return () => window.removeEventListener('resize', this.handleResize);
  }
}

export const withWindowSize = createBehavior(WindowSizeBehavior);
```

The naming convention:
- **Class**: PascalCase (`WindowSizeBehavior`)
- **Factory**: camelCase with `with` prefix (`withWindowSize`)

### Using Behaviors

Call the factory function (no `new` keyword) in your View. The `with` prefix signals that the View manages this behavior's lifecycle:

```ts
import { View, createView } from 'mantle-lit';
import { html } from 'lit';
import { withWindowSize } from './withWindowSize';

class ResponsiveView extends View {
  windowSize = withWindowSize(768);

  render() {
    return html`
      <div>
        ${this.windowSize.isMobile 
          ? html`<mobile-layout></mobile-layout>` 
          : html`<desktop-layout></desktop-layout>`}
        <p>Window: ${this.windowSize.width}x${this.windowSize.height}</p>
      </div>
    `;
  }
}

export const Responsive = createView(ResponsiveView, { tag: 'x-responsive' });
```

### Watching in Behaviors

Behaviors can use `this.watch` just like Views:

```ts
class FetchBehavior extends Behavior {
  url!: string;
  data: any[] = [];
  loading = false;

  onCreate(url: string) {
    this.url = url;
    this.watch(() => this.url, () => this.fetchData(), { fireImmediately: true });
  }

  async fetchData() {
    this.loading = true;
    this.data = await fetch(this.url).then(r => r.json());
    this.loading = false;
  }
}

export const withFetch = createBehavior(FetchBehavior);
```

### Multiple Behaviors

Behaviors compose naturally:

```ts
import { View, createView } from 'mantle-lit';
import { html } from 'lit';
import { withFetch } from './FetchBehavior';
import { withWindowSize } from './WindowSizeBehavior';

class DashboardView extends View {
  users = withFetch('/api/users');
  posts = withFetch('/api/posts');
  windowSize = withWindowSize(768);

  render() {
    return html`
      <div>
        ${this.users.loading ? 'Loading...' : `${this.users.data.length} users`}
        ${this.windowSize.isMobile ? html`<mobile-nav></mobile-nav>` : ''}
      </div>
    `;
  }
}

export const Dashboard = createView(DashboardView, { tag: 'x-dashboard' });
```

### Behavior Lifecycle

Behaviors support the same lifecycle methods as Views:

| Method | When |
|--------|------|
| `onCreate(...args)` | Called during construction with the factory arguments |
| `onMount()` | Called when parent View connects to DOM. Return cleanup (optional). |
| `onUnmount()` | Called when parent View disconnects from DOM. |


## API

### `configure(config)`

Set global defaults for all views. Settings can still be overridden per-view in `createView` options.

```ts
import { configure } from 'mantle-lit';

// Disable auto-observable globally (for decorator users)
configure({ autoObservable: false });
```

| Option | Default | Description |
|--------|---------|-------------|
| `autoObservable` | `true` | Whether to automatically make View instances observable |
| `onError` | `console.error` | Global error handler for lifecycle errors (see [Error Handling](#error-handling)) |

### `View<P>` / `ViewModel<P>`

Base class for view components. `ViewModel` is an alias for `View`. Use it when separating the ViewModel from the template for semantic clarity.

| Property/Method | Description |
|-----------------|-------------|
| `props` | Current props (reactive) |
| `onCreate()` | Called when instance created |
| `onMount()` | Called when connected to DOM, return cleanup (optional) |
| `onUnmount()` | Called when disconnected from DOM (optional) |
| `render()` | Return Lit `TemplateResult` |
| `watch(expr, callback, options?)` | Watch reactive expression, auto-disposed on unmount |

### `Behavior`

Base class for behaviors. Extend it and wrap with `createBehavior()`.

| Method | Description |
|--------|-------------|
| `onCreate(...args)` | Called during construction with constructor args |
| `onMount()` | Called when parent View mounts, return cleanup (optional) |
| `onUnmount()` | Called when parent View unmounts |
| `watch(expr, callback, options?)` | Watch reactive expression, auto-disposed on unmount |

### `createBehavior(Class)`

Creates a factory function from a behavior class. Returns a callable (no `new` needed).

```ts
class MyBehavior extends Behavior {
  onCreate(value: string) { /* ... */ }
}

export const withMyBehavior = createBehavior(MyBehavior);

// Usage: withMyBehavior('hello')
```

### `createView(ViewClass, options)`

Function that creates and registers a Lit custom element from a View class.

```ts
// Basic
createView(MyView, { tag: 'x-my-view' })

// With options
createView(MyView, { tag: 'x-my-view', autoObservable: false })
```

| Option | Default | Description |
|--------|---------|-------------|
| `tag` | (required) | Custom element tag name (must contain a hyphen) |
| `autoObservable` | `true` | Make all fields observable. Set to `false` when using decorators. |
| `shadow` | `true` | Use Shadow DOM. Set to `false` to render in light DOM (allows external CSS). |

## Who This Is For

- Teams using MobX for state management
- Developers who prefer class-based components
- Projects building standards-compliant web components
- Anyone integrating vanilla JS libraries
- Teams wanting to share components across frameworks

## License

MIT
