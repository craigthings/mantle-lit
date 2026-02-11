# Mantle Lit

A lightweight library for building web components with MobX reactivity and lit-html templating. Automatic observable state, computed getters, and bound actions.

## Installation

```bash
npm install mantle-lit lit mobx
```

Requires Lit 3+ and MobX 6+.

## Basic Example

```ts
import { View, createView, property, html } from 'mantle-lit';

class CounterView extends View {
  // Props
  @property() initialCount = 0;

  // Internal state - auto-observable
  count = 0;

  onCreate() {
    this.count = this.initialCount;
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

// Register type for IDE autocomplete in templates
declare global {
  interface HTMLElementTagNameMap {
    'x-counter': CounterView;
  }
}
```

**Usage in HTML (property binding with `.`):**
```html
<x-counter .initialCount=${5}></x-counter>
```

**Everything is reactive by default.** Internal state becomes observable, getters become computed, and methods become auto-bound actions. Props use the `@property()` decorator for IDE autocomplete.

## Defining Props

Use `@property()` for props:

```ts
import { View, createView, property, html } from 'mantle-lit';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  @property() title = '';
  @property() initialTodos: TodoItem[] = [];
  @property() onComplete?: (count: number) => void;

  // Internal state (auto-observable, no decorator needed)
  todos: TodoItem[] = [];
}

export const Todo = createView(TodoView, { tag: 'x-todo' });

declare global {
  interface HTMLElementTagNameMap {
    'x-todo': TodoView;
  }
}
```

Use property binding (`.prop=${value}`) to pass props in templates.

**No props?** Just extend `View` directly without any `@property()` decorators.

## Scoped Styles

Use `static styles` for component-scoped CSS:

```ts
import { View, createView, html, css } from 'mantle-lit';

class MyView extends View {
  static styles = css`
    :host {
      display: block;
      padding: 1rem;
    }
    
    button {
      background: #6366f1;
      color: white;
    }
  `;

  render() {
    return html`<button>Click me</button>`;
  }
}
```

For larger components, extract styles to a separate file:

```ts
// MyView.styles.ts
import { css } from 'mantle-lit';
export const styles = css`...`;

// MyView.ts
import { styles } from './MyView.styles';

class MyView extends View {
  static styles = styles;
  // ...
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
    () => this.filter,
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
class SearchView extends View {
  @property() placeholder = '';

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
  this.watch(() => this.filter, (filter) => this.applyFilter(filter));
  this.watch(() => this.sort, (sort) => this.applySort(sort));
  this.watch(() => this.page, (page) => this.fetchPage(page));
}
```

**Early disposal:**

```ts
onCreate() {
  const stop = this.watch(() => this.token, (token) => {
    this.authenticate(token);
    stop(); // only needed once
  });
}
```

`this.watch` wraps MobX's `reaction` with automatic lifecycle disposal. For advanced MobX patterns (`autorun`, `when`, custom schedulers), use `reaction` directly and return a dispose function from `onMount`.

## Mounting Components

Use the `mount` helper to imperatively create and mount components:

```ts
import { mount } from 'mantle-lit';
import './MyComponent';

// Mount with props
mount('x-my-component', {
  title: 'Hello',
  items: [1, 2, 3],
  onSelect: (item) => console.log(item),
}, document.body);

// Returns the created element
const el = mount('x-counter', { initialCount: 5 }, container);
```

## IDE Autocomplete

For IDE autocomplete in Lit templates, add `HTMLElementTagNameMap` declarations:

```ts
declare global {
  interface HTMLElementTagNameMap {
    'x-my-component': MyComponentView;
  }
}
```

Install the [lit-plugin](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin) VS Code extension for template type checking.

**CLI validation** (works reliably):
```bash
npx lit-analyzer "src/**/*.ts" --strict
```

Add to your `package.json`:
```json
{
  "scripts": {
    "lint:lit": "lit-analyzer \"src/**/*.ts\" --strict"
  }
}
```

## TypeScript Configuration

Enable experimental decorators:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

## Patterns

### Combined (default)

State, logic, and template in one class with a `render()` method:

```ts
import { View, createView, property, html } from 'mantle-lit';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  @property() initialTodos: TodoItem[] = [];

  todos: TodoItem[] = [];
  input = '';

  onCreate() {
    this.todos = this.initialTodos;
  }

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

declare global {
  interface HTMLElementTagNameMap {
    'x-todo': TodoView;
  }
}
```

### Separated

ViewModel (state/logic) and template as separate concerns. Pass the template to `createView`:

```ts
import { ViewModel, createView, property, html, css } from 'mantle-lit';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

// ViewModel: pure state and logic (no render method)
class TodoVM extends ViewModel {
  @property() initialTodos: TodoItem[] = [];

  todos: TodoItem[] = [];
  input = '';

  onCreate() {
    this.todos = this.initialTodos;
  }

  add() {
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  setInput(e: Event) {
    this.input = (e.target as HTMLInputElement).value;
  }
}

// Template: pure presentation
const template = (vm: TodoVM) => html`
  <div>
    <input .value=${vm.input} @input=${vm.setInput} />
    <button @click=${vm.add}>Add</button>
    <ul>${vm.todos.map(t => html`<li>${t.text}</li>`)}</ul>
  </div>
`;

const styles = css`
  button { background: #6366f1; color: white; }
`;

// createView wires them together
export const Todo = createView(TodoVM, { 
  tag: 'x-todo',
  template,
  styles,
});

declare global {
  interface HTMLElementTagNameMap {
    'x-todo': TodoVM;
  }
}
```

**Benefits of separation:**
- **Testable**: ViewModel is pure JS, unit test without DOM
- **Portable**: Same ViewModel could render to React, Vue, etc.
- **Cleaner**: State logic separate from presentation

## Decorators

For teams that prefer explicit annotations over auto-observable, Mantle provides its own decorators. These are lightweight metadata collectors. No `accessor` keyword required.

```ts
import { View, createView, property, observable, action, computed, html } from 'mantle-lit';

class TodoView extends View {
  @property() title = '';

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
import { View, createView, html } from 'mantle-lit';
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
import { View, createView, html } from 'mantle-lit';
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

### `View` / `ViewModel`

Base class for view components. Pure MobX state container—`createView()` generates the HTMLElement wrapper.

`View` and `ViewModel` are aliases. Use `View` for combined pattern (with `render()`), `ViewModel` for separated pattern (with external template).

| Property/Method | Description |
|-----------------|-------------|
| `onCreate()` | Called when instance created |
| `onMount()` | Called when connected to DOM, return cleanup (optional) |
| `onUnmount()` | Called when disconnected from DOM (optional) |
| `render()` | Optional. Return `TemplateResult`. If omitted, pass `template` to `createView()`. |
| `watch(expr, callback, options?)` | Watch reactive expression, auto-disposed on unmount |

### `mount(tag, props, container)`

Imperatively create and mount a custom element:

```ts
import { mount } from 'mantle-lit';

const element = mount('x-my-component', { title: 'Hello' }, document.body);
```

| Argument | Type | Description |
|----------|------|-------------|
| `tag` | `string` | Custom element tag name |
| `props` | `object` | Properties to set on the element |
| `container` | `Element \| string` | Container element or selector |

Returns the created element.

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

Creates a custom element from a ViewModel class.

```ts
// Combined pattern (ViewModel has render method)
createView(MyView, { tag: 'x-my-view' })

// Separated pattern (external template)
createView(MyVM, { 
  tag: 'x-my-view',
  template: (vm) => html`...`,
  styles: css`...`,
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `tag` | (required) | Custom element tag name (must contain a hyphen) |
| `template` | — | Template function `(vm) => TemplateResult`. Required if ViewModel has no `render()`. |
| `styles` | — | CSS styles (can also be defined on `ViewModel.styles`) |
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
