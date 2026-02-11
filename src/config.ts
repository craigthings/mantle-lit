/** Options for the watch method */
export interface WatchOptions {
  /** Debounce the callback by N milliseconds */
  delay?: number;
  /** Run callback immediately with current value */
  fireImmediately?: boolean;
}

/**
 * Error context passed to the onError handler
 */
export interface MantleErrorContext {
  /** The lifecycle phase where the error occurred */
  phase: 'onCreate' | 'onMount' | 'onUnmount' | 'watch';
  /** The View or Behavior class name */
  name: string;
  /** Whether the error came from a Behavior (true) or a View (false) */
  isBehavior: boolean;
}

/**
 * Global configuration options for @mantle/lit
 */
export interface MantleConfig {
  /** Whether to automatically make View/Behavior instances observable (default: true) */
  autoObservable?: boolean;
  /** Global error handler for lifecycle errors. Defaults to console.error. */
  onError?: (error: unknown, context: MantleErrorContext) => void;
}

export const globalConfig: MantleConfig = {
  autoObservable: true,
};

/** @internal Report a lifecycle error through the configured handler or console.error */
export function reportError(error: unknown, context: MantleErrorContext): void {
  if (globalConfig.onError) {
    globalConfig.onError(error, context);
  } else {
    console.error(
      `[@mantle/lit] Error in ${context.isBehavior ? 'behavior' : 'view'} ${context.name}.${context.phase}():`,
      error,
    );
  }
}

/**
 * Configure global defaults for @mantle/lit.
 * Settings can still be overridden per-view in createView options.
 */
export function configure(config: MantleConfig): void {
  Object.assign(globalConfig, config);
}
