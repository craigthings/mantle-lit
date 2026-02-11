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
 * At runtime, this stores metadata and creates prototype accessors.
 * MobX handles all reactivity.
 * 
 * @example
 * ```ts
 * class TodoView extends View {
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
// View Base Class
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
  '_renderDisposer',
  '_mountCleanup',
  '_initialized',
  '_renderRoot',
  // HTMLElement internals
  'connectedCallback',
  'disconnectedCallback',
  'attributeChangedCallback',
  'adoptedCallback',
]);

/**
 * Base class for Views. Extends HTMLElement with MobX reactivity and lit-html rendering.
 * 
 * Use @property() decorator to define props for IDE tooling.
 * All fields are automatically MobX observable.
 * 
 * @example
 * ```ts
 * import { View, createView, property, html, css } from 'mantle-lit';
 * 
 * class CounterView extends View {
 *   static styles = css`
 *     button { background: #6366f1; color: white; }
 *   `;
 * 
 *   @property({ attribute: false })
 *   initialCount = 0;
 * 
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
export class View extends HTMLElement {
  /** Static styles for the component (applied to shadow DOM) */
  static styles?: CSSResultGroup;

  /** @internal - Options passed from createView */
  static _viewOptions?: { autoObservable: boolean; shadow: boolean };

  /** @internal */
  private _behaviors?: BehaviorEntry[];

  /** @internal */
  private _watchDisposers?: (() => void)[];

  /** @internal - MobX autorun disposer for rendering */
  private _renderDisposer?: () => void;

  /** @internal - Cleanup function from onMount */
  private _mountCleanup?: () => void;

  /** @internal - Track if we've initialized MobX */
  private _initialized?: boolean;

  /** @internal - The render target (shadow root or element itself) */
  private _renderRoot?: HTMLElement | ShadowRoot;

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
  private _disposeWatchers(): void {
    if (!this._watchDisposers) return;
    for (const dispose of this._watchDisposers) {
      dispose();
    }
    this._watchDisposers.length = 0;
  }

  /** @internal - Scan own properties for behavior instances */
  private _collectBehaviors(): void {
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
  private _mountBehaviors(): void {
    if (!this._behaviors) return;
    for (const behavior of this._behaviors) {
      mountBehavior(behavior);
    }
  }

  /** @internal */
  private _unmountBehaviors(): void {
    if (!this._behaviors) return;
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

    // Make @property() storage observable
    // This enables watch() and reactive rendering for props
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
      while (proto && proto !== View.prototype && proto !== HTMLElement.prototype) {
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

    // Get declared @property() fields - these have prototype accessors, skip them
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
      // Skip @property() fields - they have prototype accessors
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

    // Walk prototype chain up to (but not including) View
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== View.prototype && proto !== HTMLElement.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(proto);

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (BASE_EXCLUDES.has(key)) continue;
        if (key.startsWith('_')) continue;
        if (key in annotations) continue;
        // Skip @property() fields - they have prototype accessors
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

  /** @internal - Create render root (shadow or light DOM) */
  private _createRenderRoot(): HTMLElement | ShadowRoot {
    const ViewClass = this.constructor as typeof View;
    const options = ViewClass._viewOptions;
    
    if (options && !options.shadow) {
      return this;
    }
    
    const shadowRoot = this.attachShadow({ mode: 'open' });
    
    // Apply styles if defined
    const styles = ViewClass.styles;
    if (styles) {
      const styleArray = Array.isArray(styles) ? styles : [styles];
      shadowRoot.adoptedStyleSheets = styleArray.map(s => s.styleSheet);
    }
    
    return shadowRoot;
  }

  connectedCallback(): void {
    // Create render root
    this._renderRoot = this._createRenderRoot();

    // Initialize MobX
    this._initMobX();

    // Call onCreate before first render
    try {
      runInAction(() => this.onCreate?.());
    } catch (e) {
      reportError(e, { phase: 'onCreate', name: this.constructor.name, isBehavior: false });
    }

    // Set up autorun for reactive rendering
    this._renderDisposer = autorun(() => {
      const template = this.render();
      if (template && this._renderRoot) {
        render(template, this._renderRoot);
      }
    });

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
    // Dispose render autorun
    this._renderDisposer?.();

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

  // Subclasses must implement render
  render(): TemplateResult | null {
    throw new Error(`[mantle-lit] ${this.constructor.name}: Missing render() method.`);
  }
}

/** Alias for View - use when separating ViewModel from template */
export const ViewModel = View;

// ─────────────────────────────────────────────────────────────────────────────
// createView and mount helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateViewOptions {
  /** Custom element tag name (required, must contain a hyphen) */
  tag: string;
  /** Whether to automatically make View instances observable (default: true) */
  autoObservable?: boolean;
  /** Whether to use Shadow DOM (default: true). Set to false to render in light DOM. */
  shadow?: boolean;
}

/** Symbol for storing property values on instances */
const PROP_VALUES = Symbol('mantle:propValues');

/** Symbol to track if prop storage has been made observable */
const PROP_VALUES_OBSERVABLE = Symbol('mantle:propValuesObservable');

/**
 * Registers a View class as a custom element.
 * Creates prototype accessors for @property() fields to prevent
 * class field initializers from setting native HTMLElement properties.
 */
export function createView<T extends typeof View>(
  ViewClass: T,
  options: CreateViewOptions
): T {
  const { tag, autoObservable, shadow = true } = options;

  // Store options on the class
  ViewClass._viewOptions = { 
    autoObservable: autoObservable ?? globalConfig.autoObservable, 
    shadow 
  };

  // Get declared properties from @property() decorator
  const declaredProps = getPropertyDeclarations(ViewClass);
  
  // Create prototype accessors for each declared property
  // This intercepts class field initializers before they hit native HTMLElement properties
  // Values are stored in a MobX observable object for reactivity
  for (const [key] of declaredProps) {
    if (typeof key !== 'string') continue;
    
    Object.defineProperty(ViewClass.prototype, key, {
      get() {
        const values = (this as any)[PROP_VALUES];
        return values ? values[key] : undefined;
      },
      set(value) {
        // Lazily create observable storage on first write
        if (!(this as any)[PROP_VALUES]) {
          (this as any)[PROP_VALUES] = {};
        }
        
        // Make storage observable once MobX is initialized
        // Before that, just store values normally (they'll be picked up later)
        const storage = (this as any)[PROP_VALUES];
        const isObservable = (this as any)[PROP_VALUES_OBSERVABLE];
        
        if (isObservable) {
          // Storage is already observable, use runInAction for MobX
          runInAction(() => {
            storage[key] = value;
          });
        } else {
          // Not yet observable, just store
          storage[key] = value;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  // Register the custom element
  if (!customElements.get(tag)) {
    customElements.define(tag, ViewClass);
  }

  return ViewClass;
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
