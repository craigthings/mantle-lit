import { LitElement, type TemplateResult } from 'lit';
import { makeObservable, observable, computed, action, reaction, runInAction, type AnnotationsMap, type IObservableValue } from 'mobx';
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

// Base class members that should not be made observable
const BASE_EXCLUDES = new Set([
  'props',
  '_propsBox',
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
  '_requestRender',
]);

/**
 * Base class for Views. Extend this and use createView() to create a custom element.
 * 
 * @example
 * ```ts
 * import { View, createView } from 'mantle-lit';
 * import { html } from 'lit';
 * 
 * class CounterView extends View<{ initial: number }> {
 *   count = 0;
 * 
 *   onCreate() {
 *     this.count = this.props.initial;
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
export class View<P extends object = {}> {
  /** @internal */
  _propsBox!: IObservableValue<P>;

  /** Access current props (reactive) */
  get props(): P {
    return this._propsBox.get();
  }

  /** @internal — called by the element to update props */
  _syncProps(value: P) {
    runInAction(() => {
      this._propsBox.set(value);
    });
  }

  /** @internal */
  _behaviors: BehaviorEntry[] = [];

  /** @internal */
  _watchDisposers: (() => void)[] = [];

  /** @internal - MobX reaction disposer for auto-render */
  _reactionDisposer?: () => void;

  /** @internal - Callback to request a render from the element */
  _requestRender?: () => void;

  onCreate?(): void;
  onMount?(): void | (() => void);
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
  _disposeWatchers(): void {
    for (const dispose of this._watchDisposers) {
      dispose();
    }
    this._watchDisposers.length = 0;
  }

  /** @internal - Scan own properties for behavior instances and register them */
  _collectBehaviors(): void {
    for (const key of Object.keys(this)) {
      if (key.startsWith('_')) continue;
      const value = (this as any)[key];
      if (isBehavior(value)) {
        this._behaviors.push({ instance: value });
      }
    }
  }

  /** @internal */
  _mountBehaviors(): void {
    for (const behavior of this._behaviors) {
      mountBehavior(behavior);
    }
  }

  /** @internal */
  _unmountBehaviors(): void {
    for (const behavior of this._behaviors) {
      unmountBehavior(behavior);
    }
  }

  render?(): TemplateResult | null;
}

/** Alias for View - use when separating ViewModel from template */
export { View as ViewModel };

/**
 * Creates observable annotations for a View subclass instance.
 * This is needed because makeAutoObservable doesn't work with inheritance.
 */
function makeViewObservable<T extends View>(instance: T, autoBind: boolean) {
  const annotations: AnnotationsMap<T, never> = {} as AnnotationsMap<T, never>;

  // Collect own properties (instance state) → observable
  const ownKeys = new Set([
    ...Object.keys(instance),
    ...Object.keys(Object.getPrototypeOf(instance)),
  ]);

  for (const key of ownKeys) {
    if (BASE_EXCLUDES.has(key)) continue;
    if (key in annotations) continue;

    const value = (instance as any)[key];

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
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== View.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(proto);

    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (BASE_EXCLUDES.has(key)) continue;
      if (key in annotations) continue;

      if (descriptor.get) {
        // Getter → computed
        (annotations as any)[key] = computed;
      } else if (typeof descriptor.value === 'function') {
        // Method → action (optionally bound)
        (annotations as any)[key] = autoBind ? action.bound : action;
      }
    }

    proto = Object.getPrototypeOf(proto);
  }

  makeObservable(instance, annotations);
}

type PropsOf<V> = V extends View<infer P> ? P : object;

export interface CreateViewOptions {
  /** Custom element tag name (required, must contain a hyphen) */
  tag: string;
  /** Whether to automatically make View instances observable (default: true) */
  autoObservable?: boolean;
  /** Whether to use Shadow DOM (default: true). Set to false to render in light DOM. */
  shadow?: boolean;
}

/**
 * Creates a Lit custom element from a View class.
 * 
 * @param ViewClass - The View class to wrap
 * @param options - Configuration options including the tag name
 * @returns The custom element class (also registers it)
 * 
 * @example
 * ```ts
 * class CounterView extends View<{ initial: number }> {
 *   count = 0;
 *   
 *   onCreate() {
 *     this.count = this.props.initial;
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
export function createView<V extends View<any>>(
  ViewClass: new () => V,
  options: CreateViewOptions
): typeof LitElement {
  type P = PropsOf<V>;

  const { tag, autoObservable = globalConfig.autoObservable, shadow = true } = options;

  // Create the custom element class
  class MantleElement extends LitElement {
    private _vm: V | null = null;
    private _mountCleanup?: () => void;
    private _props: P = {} as P;

    // Lit will call this when any property changes
    static properties: Record<string, any> = {};

    // Pass through static styles from the View class
    static styles = (ViewClass as any).styles;

    constructor() {
      super();
    }

    // Disable Shadow DOM if shadow: false
    createRenderRoot() {
      return shadow ? super.createRenderRoot() : this;
    }

    private _initViewModel() {
      if (this._vm) return;

      // Capture any properties set on the element before connection
      // This handles imperative property setting: el.foo = value
      for (const key of Object.keys(this)) {
        if (key.startsWith('_')) continue;
        (this._props as any)[key] = (this as any)[key];
      }

      const instance = new ViewClass();

      // Props is always reactive via observable.box
      instance._propsBox = observable.box(this._props, { deep: false });

      // Collect behavior instances from properties (must happen before makeObservable)
      instance._collectBehaviors();

      // Check for Mantle decorator annotations first
      const decoratorAnnotations = getAnnotations(instance);

      if (decoratorAnnotations) {
        // Mantle decorators: use collected annotations
        // Auto-bind all methods for stable `this` references
        const annotations = { ...decoratorAnnotations };

        // Walk prototype chain to auto-bind methods not explicitly decorated
        let proto = Object.getPrototypeOf(instance);
        while (proto && proto !== View.prototype) {
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

        makeObservable(instance, annotations as AnnotationsMap<V, never>);
      } else if (autoObservable) {
        makeViewObservable(instance, true);
      } else {
        // For legacy decorator users: applies decorator metadata
        makeObservable(instance);
      }

      // Set up the render callback
      instance._requestRender = () => this.requestUpdate();

      // Set up MobX reaction to trigger renders when observables change
      instance._reactionDisposer = reaction(
        () => instance.render?.(),
        () => this.requestUpdate(),
        { fireImmediately: false }
      );

      // Call onCreate
      try {
        instance.onCreate?.();
      } catch (e) {
        reportError(e, { phase: 'onCreate', name: ViewClass.name, isBehavior: false });
      }

      this._vm = instance;
    }

    connectedCallback() {
      super.connectedCallback();
      
      this._initViewModel();
      
      if (this._vm) {
        // Mount behaviors
        this._vm._mountBehaviors();

        // Call onMount
        try {
          const result = this._vm.onMount?.();
          if (process.env.NODE_ENV !== 'production' && result instanceof Promise) {
            console.error(
              `[mantle-lit] ${ViewClass.name}.onMount() returned a Promise. ` +
              `Lifecycle methods must be synchronous. Use a sync onMount that ` +
              `calls an async method instead.`
            );
          }
          this._mountCleanup = result as (() => void) | undefined;
        } catch (e) {
          reportError(e, { phase: 'onMount', name: ViewClass.name, isBehavior: false });
        }
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      if (this._vm) {
        // Call mount cleanup
        this._mountCleanup?.();

        // Call onUnmount
        try {
          this._vm.onUnmount?.();
        } catch (e) {
          reportError(e, { phase: 'onUnmount', name: ViewClass.name, isBehavior: false });
        }

        // Dispose watchers
        this._vm._disposeWatchers();

        // Unmount behaviors
        this._vm._unmountBehaviors();

        // Dispose the render reaction
        this._vm._reactionDisposer?.();
      }
    }

    // Override to handle property updates
    requestUpdate(name?: PropertyKey, oldValue?: unknown) {
      if (name && this._vm) {
        // Update the props when a property changes
        (this._props as any)[name] = (this as any)[name];
        this._vm._syncProps(this._props);
      }
      return super.requestUpdate(name, oldValue);
    }

    render() {
      if (!this._vm) {
        this._initViewModel();
      }

      if (!this._vm?.render) {
        throw new Error(
          `[mantle-lit] ${ViewClass.name}: Missing render() method.`
        );
      }

      return this._vm.render();
    }
  }

  // Register the custom element
  if (!customElements.get(tag)) {
    customElements.define(tag, MantleElement);
  }

  return MantleElement;
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
