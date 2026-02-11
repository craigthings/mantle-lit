import { LitElement, type TemplateResult, type CSSResultGroup } from 'lit';
import { property } from 'lit/decorators.js';
import { makeObservable, observable, computed, action, reaction, runInAction, type AnnotationsMap } from 'mobx';
import {
  type BehaviorEntry,
  isBehavior,
  mountBehavior,
  unmountBehavior,
} from './behavior';
import { globalConfig, reportError, type WatchOptions } from './config';
import { getAnnotations } from './decorators';

// Re-export config utilities
export { configure, type MantleConfig, type MantleErrorContext, type WatchOptions } from './config';

// Re-export decorators for single-import convenience
export { observable, action, computed } from './decorators';

// Re-export from behavior module
export { createBehavior, Behavior } from './behavior';

// Re-export Lit's property decorator for convenience
export { property } from 'lit/decorators.js';

// ─────────────────────────────────────────────────────────────────────────────
// Props Type System
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type helper for complex prop types (arrays, functions, objects).
 * Use with `as PropType<T>` to specify the exact TypeScript type.
 * 
 * @example
 * ```ts
 * class TodoView extends View {
 *   @property({ type: Array })
 *   items: PropType<TodoItem[]>;
 * }
 * ```
 */
export interface PropType<T> {
  // Marker for type inference (not used at runtime)
  readonly __propType?: T;
  // Allow it to be assigned from constructors
  (...args: any[]): any;
}

// Base class members that should not be made observable
const BASE_EXCLUDES = new Set([
  'onCreate',
  'onMount',
  'onUnmount',
  'render',
  'watch',
  'constructor',
  '_behaviors',
  '_collectBehaviors',
  '_mountBehaviors',
  '_unmountBehaviors',
  '_watchDisposers',
  '_disposeWatchers',
  '_reactionDisposer',
  '_mountCleanup',
  '_initialized',
  // LitElement internals
  'connectedCallback',
  'disconnectedCallback',
  'attributeChangedCallback',
  'requestUpdate',
  'performUpdate',
  'shouldUpdate',
  'willUpdate',
  'update',
  'firstUpdated',
  'updated',
  'createRenderRoot',
  'renderRoot',
  'isUpdatePending',
  'hasUpdated',
  'updateComplete',
  'getUpdateComplete',
  'enableUpdating',
  'addController',
  'removeController',
  'scheduleUpdate',
]);

/**
 * Base class for Views. Extends LitElement directly.
 * 
 * Use Lit's @property() decorator to define props that will be
 * recognized by IDE tooling and web-component-analyzer.
 * 
 * @example
 * ```ts
 * import { View, createView, property } from 'mantle-lit';
 * import { html } from 'lit';
 * 
 * class CounterView extends View {
 *   @property({ type: Number })
 *   initial = 0;
 * 
 *   count = 0;
 * 
 *   onCreate() {
 *     this.count = this.initial;
 *   }
 * 
 *   increment() {
 *     this.count++;
 *   }
 * 
 *   render() {
 *     return html`
 *       <button @click=${this.increment}>
 *         Count: ${this.count}
 *       </button>
 *     `;
 *   }
 * }
 * 
 * export const Counter = createView(CounterView, { tag: 'x-counter' });
 * ```
 */
export class View extends LitElement {
  /** @internal */
  private _behaviors: BehaviorEntry[] = [];

  /** @internal */
  private _watchDisposers: (() => void)[] = [];

  /** @internal - MobX reaction disposer for auto-render */
  private _reactionDisposer?: () => void;

  /** @internal - Cleanup function from onMount */
  private _mountCleanup?: () => void;

  /** @internal - Track if we've initialized MobX */
  private _initialized = false;

  /** @internal - Options passed from createView */
  static _viewOptions?: { autoObservable: boolean; shadow: boolean };

  /**
   * Called when the component is created, before first render.
   * Props are available at this point.
   */
  onCreate?(): void;

  /**
   * Called when the component is connected to the DOM.
   * Return a cleanup function that will be called on disconnect.
   */
  onMount?(): void | (() => void);

  /**
   * Called when the component is disconnected from the DOM.
   */
  onUnmount?(): void;

  /**
   * Watch a reactive expression and run a callback when it changes.
   * Automatically disposed on unmount.
   * 
   * @param expr - Reactive expression (getter) to watch
   * @param callback - Called when the expression result changes
   * @param options - Optional configuration (delay, fireImmediately)
   * @returns Dispose function for early teardown
   * 
   * @example
   * ```ts
   * onCreate() {
   *   this.watch(
   *     () => this.query,
   *     async (query) => {
   *       if (query.length > 2) {
   *         this.results = await searchApi(query);
   *       }
   *     },
   *     { delay: 300 }
   *   );
   * }
   * ```
   */
  watch<T>(
    expr: () => T,
    callback: (value: T, prevValue: T | undefined) => void,
    options?: WatchOptions
  ): () => void {
    const dispose = reaction(
      expr,
      (value, prevValue) => {
        try {
          callback(value, prevValue);
        } catch (e) {
          reportError(e, { phase: 'watch', name: this.constructor.name, isBehavior: false });
        }
      },
      {
        delay: options?.delay,
        fireImmediately: options?.fireImmediately,
      }
    );

    this._watchDisposers.push(dispose);

    // Return a dispose function that also removes from the array
    return () => {
      dispose();
      const idx = this._watchDisposers.indexOf(dispose);
      if (idx !== -1) this._watchDisposers.splice(idx, 1);
    };
  }

  /** @internal */
  private _disposeWatchers(): void {
    for (const dispose of this._watchDisposers) {
      dispose();
    }
    this._watchDisposers.length = 0;
  }

  /** @internal - Scan own properties for behavior instances and register them */
  private _collectBehaviors(): void {
    for (const key of Object.keys(this)) {
      if (key.startsWith('_')) continue;
      const value = (this as any)[key];
      if (isBehavior(value)) {
        this._behaviors.push({ instance: value });
      }
    }
  }

  /** @internal */
  private _mountBehaviors(): void {
    for (const behavior of this._behaviors) {
      mountBehavior(behavior);
    }
  }

  /** @internal */
  private _unmountBehaviors(): void {
    for (const behavior of this._behaviors) {
      unmountBehavior(behavior);
    }
  }

  /** @internal - Initialize MobX observability */
  private _initMobX(): void {
    if (this._initialized) return;
    this._initialized = true;

    const ViewClass = this.constructor as typeof View;
    const options = ViewClass._viewOptions ?? { autoObservable: globalConfig.autoObservable, shadow: true };

    // Collect behavior instances from properties (must happen before makeObservable)
    this._collectBehaviors();

    // Check for Mantle decorator annotations first
    const decoratorAnnotations = getAnnotations(this);

    if (decoratorAnnotations) {
      // Mantle decorators: use collected annotations
      // Auto-bind all methods for stable `this` references
      const annotations = { ...decoratorAnnotations };

      // Walk prototype chain to auto-bind methods not explicitly decorated
      let proto = Object.getPrototypeOf(this);
      while (proto && proto !== View.prototype && proto !== LitElement.prototype) {
        const descriptors = Object.getOwnPropertyDescriptors(proto);
        for (const [key, descriptor] of Object.entries(descriptors)) {
          if (BASE_EXCLUDES.has(key)) continue;
          if (key in annotations) continue;
          if (typeof descriptor.value === 'function') {
            annotations[key] = action.bound;
          }
        }
        proto = Object.getPrototypeOf(proto);
      }

      makeObservable(this, annotations as AnnotationsMap<this, never>);
    } else if (options.autoObservable) {
      this._makeViewObservable();
    } else {
      // For legacy decorator users: applies decorator metadata
      makeObservable(this);
    }

    // Set up MobX reaction to trigger renders when observables change
    this._reactionDisposer = reaction(
      () => this.render(),
      () => this.requestUpdate(),
      { fireImmediately: false }
    );
  }

  /** @internal - Make all properties observable */
  private _makeViewObservable(): void {
    const annotations: AnnotationsMap<this, never> = {} as AnnotationsMap<this, never>;

    // Get the list of Lit-managed properties (from @property decorator or static properties)
    // Lit stores decorated properties in elementProperties (a Map)
    const ctor = this.constructor as typeof LitElement & { elementProperties?: Map<string, unknown> };
    const litProperties = new Set<string>([
      ...Object.keys((ctor as any).properties ?? {}),
      ...(ctor.elementProperties?.keys() ?? []),
    ]);

    // Collect own properties (instance state) → observable
    const ownKeys = new Set([
      ...Object.keys(this),
      ...Object.keys(Object.getPrototypeOf(this)),
    ]);

    for (const key of ownKeys) {
      if (BASE_EXCLUDES.has(key)) continue;
      if (key.startsWith('_')) continue;
      if (key in annotations) continue;
      // Skip Lit-managed properties - they have their own reactivity
      if (litProperties.has(key)) continue;

      const value = (this as any)[key];

      // Skip functions (these are handled in the prototype walk)
      if (typeof value === 'function') continue;

      // Skip behavior instances (they're already observable)
      if (isBehavior(value)) {
        (annotations as any)[key] = observable.ref;
        continue;
      }

      (annotations as any)[key] = observable;
    }

    // Walk prototype chain up to (but not including) View
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== View.prototype && proto !== LitElement.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(proto);

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (BASE_EXCLUDES.has(key)) continue;
        if (key.startsWith('_')) continue;
        if (key in annotations) continue;
        // Skip Lit-managed properties - they create getters/setters on prototype
        if (litProperties.has(key)) continue;

        if (descriptor.get) {
          // Getter → computed
          (annotations as any)[key] = computed;
        } else if (typeof descriptor.value === 'function') {
          // Method → action.bound
          (annotations as any)[key] = action.bound;
        }
      }

      proto = Object.getPrototypeOf(proto);
    }

    makeObservable(this, annotations);
  }

  // Override createRenderRoot to support shadow: false
  createRenderRoot(): HTMLElement | DocumentFragment {
    const ViewClass = this.constructor as typeof View;
    const options = ViewClass._viewOptions;
    if (options && !options.shadow) {
      return this;
    }
    return super.createRenderRoot();
  }

  connectedCallback(): void {
    // Initialize MobX before super.connectedCallback() triggers first render
    this._initMobX();

    // Call onCreate before first render (wrapped in action for MobX strict mode)
    try {
      runInAction(() => this.onCreate?.());
    } catch (e) {
      reportError(e, { phase: 'onCreate', name: this.constructor.name, isBehavior: false });
    }

    super.connectedCallback();

    // Mount behaviors
    this._mountBehaviors();

    // Call onMount
    try {
      const result = this.onMount?.();
      if (process.env.NODE_ENV !== 'production' && result instanceof Promise) {
        console.error(
          `[mantle-lit] ${this.constructor.name}.onMount() returned a Promise. ` +
          `Lifecycle methods must be synchronous. Use a sync onMount that ` +
          `calls an async method instead.`
        );
      }
      this._mountCleanup = result as (() => void) | undefined;
    } catch (e) {
      reportError(e, { phase: 'onMount', name: this.constructor.name, isBehavior: false });
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    // Call mount cleanup
    this._mountCleanup?.();

    // Call onUnmount
    try {
      this.onUnmount?.();
    } catch (e) {
      reportError(e, { phase: 'onUnmount', name: this.constructor.name, isBehavior: false });
    }

    // Dispose watchers
    this._disposeWatchers();

    // Unmount behaviors
    this._unmountBehaviors();

    // Dispose the render reaction
    this._reactionDisposer?.();
  }

  // Subclasses must implement render
  render(): TemplateResult | null {
    throw new Error(`[mantle-lit] ${this.constructor.name}: Missing render() method.`);
  }
}

/** Alias for View - use when separating ViewModel from template */
export const ViewModel = View;

export interface CreateViewOptions {
  /** Custom element tag name (required, must contain a hyphen) */
  tag: string;
  /** Whether to automatically make View instances observable (default: true) */
  autoObservable?: boolean;
  /** Whether to use Shadow DOM (default: true). Set to false to render in light DOM. */
  shadow?: boolean;
}

/**
 * Registers a View class as a custom element.
 * 
 * @param ViewClass - The View class to register
 * @param options - Configuration options including the tag name
 * @returns The View class (for chaining or type inference)
 * 
 * @example
 * ```ts
 * class CounterView extends View {
 *   @property({ type: Number })
 *   initial = 0;
 * 
 *   count = 0;
 *   
 *   onCreate() {
 *     this.count = this.initial;
 *   }
 *   
 *   increment() {
 *     this.count++;
 *   }
 *   
 *   render() {
 *     return html`<button @click=${this.increment}>Count: ${this.count}</button>`;
 *   }
 * }
 * 
 * export const Counter = createView(CounterView, { tag: 'x-counter' });
 * 
 * // Usage in HTML: <x-counter .initial=${5}></x-counter>
 * ```
 */
export function createView<T extends typeof View>(
  ViewClass: T,
  options: CreateViewOptions
): T {
  const { tag, autoObservable, shadow = true } = options;

  // Store options on the class for use in connectedCallback
  ViewClass._viewOptions = { 
    autoObservable: autoObservable ?? globalConfig.autoObservable, 
    shadow 
  };

  // Register the custom element
  if (!customElements.get(tag)) {
    customElements.define(tag, ViewClass);
  }

  return ViewClass;
}

/**
 * Helper type for defining props that will be passed as properties (not attributes).
 * Use with .prop=${value} syntax in Lit templates.
 */
export type Props<T> = T;

/**
 * Mount a view to the DOM with props.
 * 
 * @param tag - The custom element tag name
 * @param props - Props to pass to the component
 * @param container - DOM element or selector to mount into (default: document.body)
 * @returns The created element
 * 
 * @example
 * ```ts
 * import { mount } from 'mantle-lit';
 * import './Todo'; // registers x-todo
 * 
 * mount('x-todo', {
 *   title: 'My Tasks',
 *   initialTodos: [{ id: 1, text: 'Learn mantle', done: false }],
 *   onCountChange: (count) => console.log(count)
 * });
 * ```
 */
export function mount<P extends object>(
  tag: string,
  props?: P,
  container?: Element | string
): HTMLElement & P {
  // Verify the element is registered
  if (!customElements.get(tag)) {
    throw new Error(`[mantle-lit] mount: custom element "${tag}" is not registered. Make sure to import the component file first.`);
  }
  
  const el = document.createElement(tag) as HTMLElement & P;
  
  if (props) {
    Object.assign(el, props);
  }
  
  const target = typeof container === 'string' 
    ? document.querySelector(container) 
    : container ?? document.body;
    
  if (!target) {
    throw new Error(`[mantle-lit] mount: container "${container}" not found`);
  }
  
  target.appendChild(el);
  return el;
}
