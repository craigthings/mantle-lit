import { html, render, type TemplateResult } from 'lit-html';
import { makeObservable, observable, computed, action, reaction, runInAction, autorun, type AnnotationsMap } from 'mobx';
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

// Re-export lit-html for convenience
export { html, svg, nothing } from 'lit-html';

// ─────────────────────────────────────────────────────────────────────────────
// Property Decorator (Lit-compatible signature for tooling)
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol to store property metadata on the class */
const PROPERTIES = Symbol('mantle:properties');

/** Symbol for storing property values on ViewModel instances */
const PROP_VALUES = Symbol('mantle:propValues');

/** Symbol to track if prop storage has been made observable */
const PROP_VALUES_OBSERVABLE = Symbol('mantle:propValuesObservable');

/**
 * Property declaration options (matches Lit's PropertyDeclaration interface)
 */
export interface PropertyDeclaration<Type = unknown, TypeHint = unknown> {
  /** When true, property is internal state (not a public prop) */
  readonly state?: boolean;
  /** Attribute handling: false = no attribute, true = lowercase name, string = custom name */
  readonly attribute?: boolean | string;
  /** Type hint for converters */
  readonly type?: TypeHint;
  /** Whether to reflect property to attribute */
  readonly reflect?: boolean;
  /** Custom change detection */
  hasChanged?(value: Type, oldValue: Type): boolean;
  /** Skip accessor generation */
  readonly noAccessor?: boolean;
}

/**
 * Property decorator that marks a field as a prop.
 * Compatible with Lit's @property() signature for IDE tooling (lit-analyzer).
 * 
 * At runtime, this stores metadata. createView() uses this metadata to
 * generate accessors on the custom element.
 * 
 * @example
 * ```ts
 * class TodoVM extends ViewModel {
 *   @property() title = '';
 *   @property() items: TodoItem[] = [];
 * }
 * ```
 */
export function property(options?: PropertyDeclaration): PropertyDecorator {
  return function(target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor): any {
    // Get or create the properties map on the class
    const ctor = target.constructor ?? target;
    if (!ctor[PROPERTIES]) {
      ctor[PROPERTIES] = new Map<string | symbol, PropertyDeclaration>();
    }
    ctor[PROPERTIES].set(propertyKey, options ?? {});
    
    // Return undefined to let the field initializer work normally
    return descriptor;
  } as PropertyDecorator;
}

/** Get property declarations for a class */
function getPropertyDeclarations(ctor: any): Map<string | symbol, PropertyDeclaration> {
  return ctor[PROPERTIES] ?? new Map();
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tagged template for CSS (creates a CSSStyleSheet or style string)
 */
export function css(strings: TemplateStringsArray, ...values: any[]): CSSResult {
  const cssText = strings.reduce((acc, str, i) => {
    const value = values[i];
    if (value instanceof CSSResult) {
      return acc + str + value.cssText;
    }
    return acc + str + (value ?? '');
  }, '');
  return new CSSResult(cssText);
}

/** Wrapper for CSS text that can be used with adoptedStyleSheets */
export class CSSResult {
  readonly cssText: string;
  private _styleSheet?: CSSStyleSheet;

  constructor(cssText: string) {
    this.cssText = cssText;
  }

  get styleSheet(): CSSStyleSheet {
    if (!this._styleSheet) {
      this._styleSheet = new CSSStyleSheet();
      this._styleSheet.replaceSync(this.cssText);
    }
    return this._styleSheet;
  }
}

export type CSSResultGroup = CSSResult | CSSResult[];

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel Base Class (Pure MobX - no HTMLElement)
// ─────────────────────────────────────────────────────────────────────────────

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
  '_mountCleanup',
  '_initialized',
  '_autoObservable',
]);

/**
 * Base class for ViewModels. Pure MobX state container with lifecycle hooks.
 * 
 * Use @property() decorator to define props for IDE tooling.
 * All fields are automatically MobX observable.
 * 
 * Can be used standalone (with external template) or with render() method.
 * 
 * @example
 * ```ts
 * // Combined: ViewModel with render method
 * class CounterView extends ViewModel {
 *   @property() initialCount = 0;
 *   count = 0;
 * 
 *   onCreate() {
 *     this.count = this.initialCount;
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
 * ```
 * 
 * @example
 * ```ts
 * // Separated: ViewModel + external template
 * class CounterVM extends ViewModel {
 *   @property() initialCount = 0;
 *   count = 0;
 * 
 *   onCreate() {
 *     this.count = this.initialCount;
 *   }
 * 
 *   increment() {
 *     this.count++;
 *   }
 * }
 * 
 * const counterTemplate = (vm: CounterVM) => html`
 *   <button @click=${vm.increment}>Count: ${vm.count}</button>
 * `;
 * 
 * export const Counter = createView(CounterVM, { 
 *   tag: 'x-counter',
 *   template: counterTemplate,
 * });
 * ```
 */
export class ViewModel {
  /** Static styles for the component (applied to shadow DOM) */
  static styles?: CSSResultGroup;

  /** @internal */
  private _behaviors?: BehaviorEntry[];

  /** @internal */
  private _watchDisposers?: (() => void)[];

  /** @internal - Cleanup function from onMount */
  private _mountCleanup?: () => void;

  /** @internal - Track if we've initialized MobX */
  private _initialized?: boolean;

  /** @internal - Whether to auto-observe */
  private _autoObservable?: boolean;

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
   * Optional render method. If provided, createView will use it.
   * If not provided, you must pass a template to createView.
   */
  render?(): TemplateResult | null;

  /**
   * Watch a reactive expression and run a callback when it changes.
   * Automatically disposed on unmount.
   */
  watch<T>(
    expr: () => T,
    callback: (value: T, prevValue: T | undefined) => void,
    options?: WatchOptions
  ): () => void {
    if (!this._watchDisposers) this._watchDisposers = [];
    
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

    return () => {
      dispose();
      const idx = this._watchDisposers!.indexOf(dispose);
      if (idx !== -1) this._watchDisposers!.splice(idx, 1);
    };
  }

  /** @internal */
  _disposeWatchers(): void {
    if (!this._watchDisposers) return;
    for (const dispose of this._watchDisposers) {
      dispose();
    }
    this._watchDisposers.length = 0;
  }

  /** @internal - Scan own properties for behavior instances */
  _collectBehaviors(): void {
    if (!this._behaviors) this._behaviors = [];
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
    if (!this._behaviors) return;
    for (const behavior of this._behaviors) {
      mountBehavior(behavior);
    }
  }

  /** @internal */
  _unmountBehaviors(): void {
    if (!this._behaviors) return;
    for (const behavior of this._behaviors) {
      unmountBehavior(behavior);
    }
  }

  /** @internal - Initialize MobX observability */
  _initMobX(autoObservable: boolean): void {
    if (this._initialized) return;
    this._initialized = true;
    this._autoObservable = autoObservable;

    // Make @property() storage observable
    this._makePropsObservable();

    // Collect behavior instances from properties (must happen before makeObservable)
    this._collectBehaviors();

    // Check for Mantle decorator annotations first
    const decoratorAnnotations = getAnnotations(this);

    if (decoratorAnnotations) {
      // Mantle decorators: use collected annotations
      const annotations = { ...decoratorAnnotations };

      // Walk prototype chain to auto-bind methods not explicitly decorated
      let proto = Object.getPrototypeOf(this);
      while (proto && proto !== ViewModel.prototype && proto !== Object.prototype) {
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
    } else if (autoObservable) {
      this._makeAutoObservable();
    } else {
      // For legacy decorator users: applies decorator metadata
      makeObservable(this);
    }
  }

  /** @internal - Make @property() storage observable */
  private _makePropsObservable(): void {
    const storage = (this as any)[PROP_VALUES];
    if (!storage) return;
    
    // Convert plain object to MobX observable, preserving existing values
    const observableStorage = observable.object(storage, {}, { deep: true });
    (this as any)[PROP_VALUES] = observableStorage;
    (this as any)[PROP_VALUES_OBSERVABLE] = true;
  }

  /** @internal - Make all properties observable automatically */
  private _makeAutoObservable(): void {
    const annotations: AnnotationsMap<this, never> = {} as AnnotationsMap<this, never>;

    // Get declared @property() fields - these have their own storage, skip them
    const declaredProps = getPropertyDeclarations(this.constructor);

    // Collect own properties → observable
    const ownKeys = new Set([
      ...Object.keys(this),
      ...Object.keys(Object.getPrototypeOf(this)),
    ]);

    for (const key of ownKeys) {
      if (BASE_EXCLUDES.has(key)) continue;
      if (key.startsWith('_')) continue;
      if (key in annotations) continue;
      // Skip @property() fields - they have their own observable storage
      if (declaredProps.has(key)) continue;

      const value = (this as any)[key];

      // Skip functions (handled in prototype walk)
      if (typeof value === 'function') continue;

      // Skip behavior instances (they're already observable)
      if (isBehavior(value)) {
        (annotations as any)[key] = observable.ref;
        continue;
      }

      (annotations as any)[key] = observable;
    }

    // Walk prototype chain up to (but not including) ViewModel
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== ViewModel.prototype && proto !== Object.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(proto);

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (BASE_EXCLUDES.has(key)) continue;
        if (key.startsWith('_')) continue;
        if (key in annotations) continue;
        // Skip @property() fields
        if (declaredProps.has(key)) continue;

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

  /** @internal - Call onMount lifecycle */
  _callOnMount(): void {
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

  /** @internal - Call onUnmount lifecycle */
  _callOnUnmount(): void {
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
  }
}

// Alias for backwards compatibility
export { ViewModel as View };

// ─────────────────────────────────────────────────────────────────────────────
// createView - Generates Custom Element from ViewModel
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateViewOptions<T extends typeof ViewModel = typeof ViewModel> {
  /** Custom element tag name (required, must contain a hyphen) */
  tag: string;
  /** Whether to automatically make ViewModel instances observable (default: true) */
  autoObservable?: boolean;
  /** Whether to use Shadow DOM (default: true). Set to false to render in light DOM. */
  shadow?: boolean;
  /** External template function (optional if ViewModel has render method) */
  template?: (vm: InstanceType<T>) => TemplateResult | null;
  /** Styles (optional, can also be defined on ViewModel.styles) */
  styles?: CSSResultGroup;
}

/**
 * Creates a custom element from a ViewModel class.
 * 
 * The ViewModel can either:
 * 1. Have a render() method (combined pattern)
 * 2. Use an external template function (separated pattern)
 * 
 * @example
 * ```ts
 * // Combined: render() in ViewModel
 * class CounterView extends ViewModel {
 *   count = 0;
 *   increment() { this.count++; }
 *   render() {
 *     return html`<button @click=${this.increment}>${this.count}</button>`;
 *   }
 * }
 * export const Counter = createView(CounterView, { tag: 'x-counter' });
 * 
 * // Separated: external template
 * class CounterVM extends ViewModel {
 *   count = 0;
 *   increment() { this.count++; }
 * }
 * export const Counter = createView(CounterVM, {
 *   tag: 'x-counter',
 *   template: (vm) => html`<button @click=${vm.increment}>${vm.count}</button>`,
 * });
 * ```
 */
export function createView<T extends typeof ViewModel>(
  VMClass: T,
  options: CreateViewOptions<T>
): { new(): HTMLElement & InstanceType<T> } & T {
  const { 
    tag, 
    autoObservable = globalConfig.autoObservable, 
    shadow = true,
    template,
    styles: optionStyles,
  } = options;

  // Check if VM has its own render method
  const hasRender = typeof VMClass.prototype.render === 'function';
  
  if (!hasRender && !template) {
    throw new Error(
      `[mantle-lit] ${VMClass.name}: Provide a render() method or pass a template option to createView()`
    );
  }

  // Get styles from options or VM class
  const styles = optionStyles ?? VMClass.styles;

  // Get declared properties from @property() decorator
  const declaredProps = getPropertyDeclarations(VMClass);

  /**
   * Generated custom element that wraps the ViewModel
   */
  class GeneratedElement extends HTMLElement {
    /** The ViewModel instance */
    private _vm: InstanceType<T>;

    /** Render target (shadow root or element itself) */
    private _renderRoot?: HTMLElement | ShadowRoot;

    /** MobX autorun disposer for rendering */
    private _renderDisposer?: () => void;

    constructor() {
      super();
      
      // Create ViewModel instance
      this._vm = new VMClass() as InstanceType<T>;
    }

    connectedCallback(): void {
      // Create render root
      this._renderRoot = this._createRenderRoot();

      // Initialize MobX on the ViewModel
      this._vm._initMobX(autoObservable);

      // Call onCreate before first render
      try {
        runInAction(() => this._vm.onCreate?.());
      } catch (e) {
        reportError(e, { phase: 'onCreate', name: VMClass.name, isBehavior: false });
      }

      // Set up autorun for reactive rendering
      this._renderDisposer = autorun(() => {
        const result = hasRender 
          ? this._vm.render!() 
          : template!(this._vm);
        if (result && this._renderRoot) {
          render(result, this._renderRoot);
        }
      });

      // Mount behaviors
      this._vm._mountBehaviors();

      // Call onMount
      this._vm._callOnMount();
    }

    disconnectedCallback(): void {
      // Dispose render autorun
      this._renderDisposer?.();

      // Call ViewModel cleanup
      this._vm._callOnUnmount();
    }

    private _createRenderRoot(): HTMLElement | ShadowRoot {
      if (!shadow) {
        return this;
      }
      
      const shadowRoot = this.attachShadow({ mode: 'open' });
      
      // Apply styles if defined
      if (styles) {
        const styleArray = Array.isArray(styles) ? styles : [styles];
        shadowRoot.adoptedStyleSheets = styleArray.map(s => s.styleSheet);
      }
      
      return shadowRoot;
    }
  }

  // Create prototype accessors on the element that delegate to the ViewModel
  // This allows <x-todo .title=${...}> to work and prevents HTMLElement property conflicts
  for (const [key] of declaredProps) {
    if (typeof key !== 'string') continue;
    
    Object.defineProperty(GeneratedElement.prototype, key, {
      get(this: GeneratedElement) {
        return (this as any)._vm[key];
      },
      set(this: GeneratedElement, value: any) {
        (this as any)._vm[key] = value;
      },
      enumerable: true,
      configurable: true,
    });
  }

  // Also need to set up prop storage on the ViewModel prototype
  // so class field initializers work correctly
  for (const [key] of declaredProps) {
    if (typeof key !== 'string') continue;
    
    Object.defineProperty(VMClass.prototype, key, {
      get() {
        const values = (this as any)[PROP_VALUES];
        return values ? values[key] : undefined;
      },
      set(value) {
        // Lazily create storage on first write
        if (!(this as any)[PROP_VALUES]) {
          (this as any)[PROP_VALUES] = {};
        }
        
        const storage = (this as any)[PROP_VALUES];
        const isObservable = (this as any)[PROP_VALUES_OBSERVABLE];
        
        if (isObservable) {
          runInAction(() => {
            storage[key] = value;
          });
        } else {
          storage[key] = value;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  // Register the custom element
  if (!customElements.get(tag)) {
    customElements.define(tag, GeneratedElement);
  }

  // Return the generated element class with ViewModel's type signature
  // This allows HTMLElementTagNameMap to work correctly
  return GeneratedElement as any;
}

/**
 * Mount a view to the DOM with props.
 */
export function mount<P extends object>(
  tag: string,
  props?: P,
  container?: Element | string
): HTMLElement & P {
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

// ─────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper type for defining props that will be passed as properties.
 */
export type Props<T> = T;

/**
 * Type helper for complex prop types.
 */
export interface PropType<T> {
  readonly __propType?: T;
  (...args: any[]): any;
}
