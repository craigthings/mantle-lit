import { html, render, type TemplateResult } from 'lit-html';
import { makeObservable, observable, computed, action, reaction, runInAction, autorun, type AnnotationsMap } from 'mobx';
import { type BehaviorEntry, isBehavior, mountBehavior, unmountBehavior } from './behavior';
import { globalConfig, reportError, type WatchOptions } from './config';
import { getAnnotations } from './decorators';

// Re-exports
export { configure, type MantleConfig, type MantleErrorContext, type WatchOptions } from './config';
export { observable, action, computed } from './decorators';
export { createBehavior, Behavior } from './behavior';
export { html, svg, nothing } from 'lit-html';

// ─────────────────────────────────────────────────────────────────────────────
// Property Decorator
// ─────────────────────────────────────────────────────────────────────────────

const PROPERTIES = Symbol('mantle:properties');
const PROP_VALUES = Symbol('mantle:propValues');

/** Lit-compatible property declaration options */
export interface PropertyDeclaration<Type = unknown, TypeHint = unknown> {
  readonly state?: boolean;
  readonly attribute?: boolean | string;
  readonly type?: TypeHint;
  readonly reflect?: boolean;
  hasChanged?(value: Type, oldValue: Type): boolean;
  readonly noAccessor?: boolean;
}

/**
 * Property decorator for props. Lit-compatible signature for IDE tooling.
 */
export function property(options?: PropertyDeclaration): PropertyDecorator {
  return (target: any, key: string | symbol) => {
    const ctor = target.constructor ?? target;
    if (!ctor[PROPERTIES]) ctor[PROPERTIES] = new Map();
    ctor[PROPERTIES].set(key, options ?? {});
  };
}

function getPropertyDeclarations(ctor: any): Map<string | symbol, PropertyDeclaration> {
  return ctor[PROPERTIES] ?? new Map();
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Support
// ─────────────────────────────────────────────────────────────────────────────

export function css(strings: TemplateStringsArray, ...values: any[]): CSSResult {
  const cssText = strings.reduce((acc, str, i) => {
    const v = values[i];
    return acc + str + (v instanceof CSSResult ? v.cssText : v ?? '');
  }, '');
  return new CSSResult(cssText);
}

export class CSSResult {
  readonly cssText: string;
  private _sheet?: CSSStyleSheet;
  constructor(cssText: string) { this.cssText = cssText; }
  get styleSheet(): CSSStyleSheet {
    if (!this._sheet) {
      this._sheet = new CSSStyleSheet();
      this._sheet.replaceSync(this.cssText);
    }
    return this._sheet;
  }
}

export type CSSResultGroup = CSSResult | CSSResult[];

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel Base Class
// ─────────────────────────────────────────────────────────────────────────────

const BASE_EXCLUDES = new Set([
  'onCreate', 'onMount', 'onUnmount', 'render', 'watch', 'constructor',
  '_behaviors', '_watchDisposers', '_mountCleanup', '_initialized',
]);

/**
 * Base class for ViewModels. Pure MobX state container with lifecycle hooks.
 */
export class ViewModel {
  static styles?: CSSResultGroup;

  /** @internal */ private _behaviors?: BehaviorEntry[];
  /** @internal */ private _watchDisposers?: (() => void)[];
  /** @internal */ private _mountCleanup?: () => void;
  /** @internal */ private _initialized?: boolean;

  onCreate?(): void;
  onMount?(): void | (() => void);
  onUnmount?(): void;
  render?(): TemplateResult | null;

  watch<T>(
    expr: () => T,
    callback: (value: T, prev: T | undefined) => void,
    options?: WatchOptions
  ): () => void {
    if (!this._watchDisposers) this._watchDisposers = [];
    const dispose = reaction(expr, (value, prev) => {
      try { callback(value, prev); }
      catch (e) { reportError(e, { phase: 'watch', name: this.constructor.name, isBehavior: false }); }
    }, { delay: options?.delay, fireImmediately: options?.fireImmediately });
    this._watchDisposers.push(dispose);
    return () => {
      dispose();
      const idx = this._watchDisposers!.indexOf(dispose);
      if (idx !== -1) this._watchDisposers!.splice(idx, 1);
    };
  }

  /** @internal */
  _initMobX(autoObservable: boolean, declaredProps: Map<string | symbol, PropertyDeclaration>): void {
    if (this._initialized) return;
    this._initialized = true;

    // Make @property() storage observable
    const storage = (this as any)[PROP_VALUES];
    if (storage) {
      (this as any)[PROP_VALUES] = observable.object(storage, {}, { deep: true });
    }

    // Collect behaviors
    if (!this._behaviors) this._behaviors = [];
    for (const key of Object.keys(this)) {
      if (!key.startsWith('_') && isBehavior((this as any)[key])) {
        this._behaviors.push({ instance: (this as any)[key] });
      }
    }

    // Check for explicit decorator annotations
    const decoratorAnnotations = getAnnotations(this);
    if (decoratorAnnotations) {
      const annotations = { ...decoratorAnnotations };
      let proto = Object.getPrototypeOf(this);
      while (proto && proto !== ViewModel.prototype) {
        for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
          if (!BASE_EXCLUDES.has(key) && !(key in annotations) && typeof desc.value === 'function') {
            annotations[key] = action.bound;
          }
        }
        proto = Object.getPrototypeOf(proto);
      }
      makeObservable(this, annotations as AnnotationsMap<this, never>);
    } else if (autoObservable) {
      this._makeAutoObservable(declaredProps);
    } else {
      makeObservable(this);
    }
  }

  private _makeAutoObservable(declaredProps: Map<string | symbol, PropertyDeclaration>): void {
    const annotations: Record<string, any> = {};

    // Own properties → observable (skip @property fields, they have their own storage)
    for (const key of Object.keys(this)) {
      if (BASE_EXCLUDES.has(key) || key.startsWith('_') || declaredProps.has(key)) continue;
      const value = (this as any)[key];
      if (typeof value === 'function') continue;
      annotations[key] = isBehavior(value) ? observable.ref : observable;
    }

    // Prototype: getters → computed, methods → action.bound
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== ViewModel.prototype) {
      for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
        if (BASE_EXCLUDES.has(key) || key.startsWith('_') || key in annotations || declaredProps.has(key)) continue;
        if (desc.get) annotations[key] = computed;
        else if (typeof desc.value === 'function') annotations[key] = action.bound;
      }
      proto = Object.getPrototypeOf(proto);
    }

    makeObservable(this, annotations as AnnotationsMap<this, never>);
  }

  /** @internal */
  _mountBehaviors(): void {
    for (const b of this._behaviors ?? []) mountBehavior(b);
  }

  /** @internal */
  _callOnMount(): void {
    try {
      const result = this.onMount?.();
      if (process.env.NODE_ENV !== 'production' && result instanceof Promise) {
        console.error(`[mantle-lit] ${this.constructor.name}.onMount() returned a Promise.`);
      }
      this._mountCleanup = result as (() => void) | undefined;
    } catch (e) {
      reportError(e, { phase: 'onMount', name: this.constructor.name, isBehavior: false });
    }
  }

  /** @internal */
  _cleanup(): void {
    this._mountCleanup?.();
    try { this.onUnmount?.(); }
    catch (e) { reportError(e, { phase: 'onUnmount', name: this.constructor.name, isBehavior: false }); }
    for (const d of this._watchDisposers ?? []) d();
    for (const b of this._behaviors ?? []) unmountBehavior(b);
  }
}

export { ViewModel as View };

// ─────────────────────────────────────────────────────────────────────────────
// createView
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateViewOptions<T extends typeof ViewModel = typeof ViewModel> {
  tag: string;
  autoObservable?: boolean;
  shadow?: boolean;
  template?: (vm: InstanceType<T>) => TemplateResult | null;
  styles?: CSSResultGroup;
}

/**
 * Creates a custom element from a ViewModel class.
 */
export function createView<T extends typeof ViewModel>(
  VMClass: T,
  options: CreateViewOptions<T>
): { new(): HTMLElement & InstanceType<T> } & T {
  const { tag, autoObservable = globalConfig.autoObservable, shadow = true, template, styles: optStyles } = options;
  const hasRender = typeof VMClass.prototype.render === 'function';
  
  if (!hasRender && !template) {
    throw new Error(`[mantle-lit] ${VMClass.name}: Provide render() or template option`);
  }

  const styles = optStyles ?? VMClass.styles;
  const declaredProps = getPropertyDeclarations(VMClass);

  // Set up ViewModel prototype accessors for @property() fields
  // This intercepts class field initializers before they create own properties
  for (const [key] of declaredProps) {
    if (typeof key !== 'string' || Object.getOwnPropertyDescriptor(VMClass.prototype, key)) continue;
    Object.defineProperty(VMClass.prototype, key, {
      get() { return (this as any)[PROP_VALUES]?.[key]; },
      set(value) {
        if (!(this as any)[PROP_VALUES]) (this as any)[PROP_VALUES] = {};
        const storage = (this as any)[PROP_VALUES];
        // After MobX init, storage is observable - wrap in action
        if ((this as any)._initialized) {
          runInAction(() => { storage[key] = value; });
        } else {
          storage[key] = value;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  class GeneratedElement extends HTMLElement {
    private _vm: InstanceType<T>;
    private _renderRoot?: HTMLElement | ShadowRoot;
    private _dispose?: () => void;

    constructor() {
      super();
      this._vm = new VMClass() as InstanceType<T>;
    }

    connectedCallback(): void {
      // Create render root
      if (shadow) {
        const root = this.attachShadow({ mode: 'open' });
        if (styles) {
          root.adoptedStyleSheets = (Array.isArray(styles) ? styles : [styles]).map(s => s.styleSheet);
        }
        this._renderRoot = root;
      } else {
        this._renderRoot = this;
      }

      // Initialize MobX
      this._vm._initMobX(autoObservable, declaredProps);

      // onCreate
      try { runInAction(() => this._vm.onCreate?.()); }
      catch (e) { reportError(e, { phase: 'onCreate', name: VMClass.name, isBehavior: false }); }

      // Reactive rendering
      this._dispose = autorun(() => {
        const result = hasRender ? this._vm.render!() : template!(this._vm);
        if (result && this._renderRoot) render(result, this._renderRoot);
      });

      // Mount
      this._vm._mountBehaviors();
      this._vm._callOnMount();
    }

    disconnectedCallback(): void {
      this._dispose?.();
      this._vm._cleanup();
    }
  }

  // Element accessors delegate to ViewModel (prevents HTMLElement.title conflicts)
  for (const [key] of declaredProps) {
    if (typeof key !== 'string') continue;
    Object.defineProperty(GeneratedElement.prototype, key, {
      get() { return (this as any)._vm[key]; },
      set(value) { (this as any)._vm[key] = value; },
      enumerable: true,
      configurable: true,
    });
  }

  if (!customElements.get(tag)) customElements.define(tag, GeneratedElement);
  return GeneratedElement as any;
}

/**
 * Mount a view to the DOM with props.
 */
export function mount<P extends object>(tag: string, props?: P, container?: Element | string): HTMLElement & P {
  if (!customElements.get(tag)) {
    throw new Error(`[mantle-lit] mount: "${tag}" not registered`);
  }
  const el = document.createElement(tag) as HTMLElement & P;
  if (props) Object.assign(el, props);
  const target = typeof container === 'string' ? document.querySelector(container) : container ?? document.body;
  if (!target) throw new Error(`[mantle-lit] mount: container not found`);
  target.appendChild(el);
  return el;
}

// Type helpers
export type Props<T> = T;
export interface PropType<T> { readonly __propType?: T; (...args: any[]): any; }
